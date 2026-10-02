import express from 'express';
import { db, now } from './db.js';
import { HttpError, clean } from './util.js';
import { setStatus } from './spots.js';

const audit = (adminId, action, target, detail = '') =>
  db.prepare('INSERT INTO audit_logs (admin_id,action,target,detail,created_at) VALUES (?,?,?,?,?)')
    .run(adminId, action, target, clean(detail, 500), now());

export function adminRouter(wrap, requireUser) {
  const r = express.Router();
  r.use((req, _res, next) => {
    const u = requireUser(req);
    if (u.role !== 'admin' || u.status !== 'active') return next(new HttpError(403, 'Admins only.'));
    next();
  });

  const count = (sql, ...a) => db.prepare(sql).get(...a).n;

  r.get('/overview', wrap((_req, res) => {
    res.json({
      totals: {
        users: count('SELECT COUNT(*) n FROM users'),
        spots: count(`SELECT COUNT(*) n FROM food_spots WHERE status!='archived'`),
        discoveries: count('SELECT COUNT(*) n FROM food_spots'),
        reviews: count('SELECT COUNT(*) n FROM reviews WHERE hidden=0'),
        verifiedVisits: count('SELECT COUNT(*) n FROM visits WHERE verified=1'),
        photos: count('SELECT COUNT(*) n FROM photos WHERE hidden=0'),
        activeReports: count(`SELECT COUNT(*) n FROM reports WHERE status='open'`),
        inactiveSpots: count(`SELECT COUNT(*) n FROM food_spots WHERE status='inactive'`),
        archivedSpots: count(`SELECT COUNT(*) n FROM food_spots WHERE status='archived'`),
      },
      byProvince: db.prepare(`SELECT COALESCE(NULLIF(province,''),'Unknown') name, COUNT(*) n FROM food_spots
        WHERE status!='archived' GROUP BY 1 ORDER BY n DESC LIMIT 15`).all(),
      byMunicipality: db.prepare(`SELECT COALESCE(NULLIF(municipality,''),'Unknown') name, COUNT(*) n FROM food_spots
        WHERE status!='archived' GROUP BY 1 ORDER BY n DESC LIMIT 15`).all(),
      byCategory: db.prepare(`SELECT tag name, COUNT(*) n FROM spot_tags t JOIN food_spots s ON s.id=t.spot_id
        WHERE s.status!='archived' GROUP BY tag ORDER BY n DESC LIMIT 15`).all(),
      points: db.prepare(`SELECT lat,lng FROM food_spots WHERE status!='archived' LIMIT 2000`).all(),
    });
  }));

  // ---- moderation ----
  r.get('/reports', wrap((req, res) => {
    const status = ['open', 'actioned', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
    const rows = db.prepare(`SELECT r.*, u.username reporter FROM reports r JOIN users u ON u.id=r.reporter_id
      WHERE r.status=? ORDER BY r.created_at DESC LIMIT 200`).all(status);
    const preview = {
      spot: db.prepare('SELECT name,status FROM food_spots WHERE id=?'),
      review: db.prepare('SELECT body,overall,hidden FROM reviews WHERE id=?'),
      photo: db.prepare('SELECT kind,hidden,spot_id FROM photos WHERE id=?'),
      comment: db.prepare('SELECT body,hidden FROM comments WHERE id=?'),
      user: db.prepare('SELECT username,status FROM users WHERE id=?'),
    };
    res.json({ reports: rows.map((x) => ({ ...x, target: preview[x.target_type].get(x.target_id) || null })) });
  }));

  function removeTarget(adminId, type, id, reason) {
    if (type === 'spot') setStatus(id, 'archived', `moderation: ${reason}`);
    else if (type === 'review') db.prepare('UPDATE reviews SET hidden=1 WHERE id=?').run(id);
    else if (type === 'photo') db.prepare('UPDATE photos SET hidden=1 WHERE id=?').run(id);
    else if (type === 'comment') db.prepare('UPDATE comments SET hidden=1 WHERE id=?').run(id);
    else if (type === 'user') db.prepare(`UPDATE users SET status='suspended' WHERE id=? AND role!='admin'`).run(id);
  }

  r.post('/reports/:id/resolve', wrap((req, res) => {
    const admin = requireUser(req);
    const rep = db.prepare('SELECT * FROM reports WHERE id=?').get(Number(req.params.id));
    if (!rep) throw new HttpError(404, 'Report not found.');
    const action = req.body.action;
    if (!['dismiss', 'remove'].includes(action)) throw new HttpError(400, 'action must be dismiss or remove');
    const t = now();
    if (action === 'remove') {
      removeTarget(admin.id, rep.target_type, rep.target_id, rep.reason);
      // Block further identical-reason reports so confirmed promo-abuse can't be re-triggered repeatedly.
      if (rep.reason === 'promotional') {
        db.prepare('INSERT OR IGNORE INTO moderation_blocks (target_type,target_id,reason,created_at) VALUES (?,?,?,?)')
          .run(rep.target_type, rep.target_id, rep.reason, t);
      }
    }
    // Resolve every open report for the same target+reason in one go.
    db.prepare(`UPDATE reports SET status=?, resolved_by=?, resolved_at=? WHERE status='open' AND target_type=? AND target_id=? AND reason=?`)
      .run(action === 'remove' ? 'actioned' : 'dismissed', admin.id, t, rep.target_type, rep.target_id, rep.reason);
    audit(admin.id, `report.${action}`, `${rep.target_type}:${rep.target_id}`, `${rep.reason} ${clean(req.body.note, 200)}`);
    res.json({ ok: true });
  }));

  // ---- food spot management ----
  r.get('/spots', wrap((req, res) => {
    const status = ['active', 'inactive', 'archived'].includes(req.query.status) ? req.query.status : null;
    const q = `%${clean(req.query.q, 60)}%`;
    const rows = db.prepare(`SELECT id,name,municipality,province,status,created_at,
        (SELECT username FROM users WHERE id=created_by) discoverer FROM food_spots
      WHERE (? IS NULL OR status=?) AND (name LIKE ? OR municipality LIKE ?) ORDER BY id DESC LIMIT 100`).all(status, status, q, q);
    res.json({ spots: rows });
  }));

  r.patch('/spots/:id', wrap((req, res) => {
    const admin = requireUser(req);
    const id = Number(req.params.id), b = req.body;
    const s = db.prepare('SELECT * FROM food_spots WHERE id=?').get(id);
    if (!s) throw new HttpError(404, 'Not found.');
    // Factual fields only. Reviews and ratings are never editable here.
    db.prepare('UPDATE food_spots SET name=?,municipality=?,province=?,hours=?,updated_at=? WHERE id=?')
      .run(clean(b.name, 80) || s.name, clean(b.municipality ?? s.municipality, 80), clean(b.province ?? s.province, 80),
        clean(b.hours ?? s.hours, 120), now(), id);
    audit(admin.id, 'spot.edit', `spot:${id}`, JSON.stringify({ name: b.name, municipality: b.municipality, province: b.province, hours: b.hours }));
    res.json({ ok: true });
  }));

  r.post('/spots/:id/archive', wrap((req, res) => {
    const admin = requireUser(req);
    setStatus(Number(req.params.id), 'archived', `admin: ${clean(req.body.reason, 100)}`);
    audit(admin.id, 'spot.archive', `spot:${req.params.id}`, req.body.reason);
    res.json({ ok: true });
  }));
  r.post('/spots/:id/restore', wrap((req, res) => {
    const admin = requireUser(req);
    setStatus(Number(req.params.id), 'active', 'admin restore');
    db.prepare('UPDATE food_spots SET last_activity_at=? WHERE id=?').run(now(), Number(req.params.id));
    audit(admin.id, 'spot.restore', `spot:${req.params.id}`);
    res.json({ ok: true });
  }));

  // Merge a duplicate into the canonical spot; the duplicate is archived (kept for history + duplicate detection).
  r.post('/spots/merge', wrap((req, res) => {
    const admin = requireUser(req);
    const from = Number(req.body.fromId), into = Number(req.body.intoId);
    if (!from || !into || from === into) throw new HttpError(400, 'Pick two different spots.');
    if (!db.prepare('SELECT 1 FROM food_spots WHERE id=?').get(from) || !db.prepare('SELECT 1 FROM food_spots WHERE id=?').get(into)) {
      throw new HttpError(404, 'Spot not found.');
    }
    db.exec('BEGIN');
    try {
      for (const t of ['photos', 'comments', 'price_reports', 'visits']) db.prepare(`UPDATE ${t} SET spot_id=? WHERE spot_id=?`).run(into, from);
      // Reviews/likes/saves are unique per user+spot: move only what doesn't collide, drop the rest of the duplicate's rows.
      db.prepare('UPDATE OR IGNORE reviews SET spot_id=? WHERE spot_id=?').run(into, from);
      db.prepare('UPDATE OR IGNORE likes SET spot_id=? WHERE spot_id=?').run(into, from);
      db.prepare('UPDATE OR IGNORE saves SET spot_id=? WHERE spot_id=?').run(into, from);
      db.prepare('UPDATE reviews SET hidden=1 WHERE spot_id=?').run(from);
      db.prepare('DELETE FROM likes WHERE spot_id=?').run(from);
      db.prepare('DELETE FROM saves WHERE spot_id=?').run(from);
      db.prepare('INSERT OR IGNORE INTO spot_tags (spot_id,tag) SELECT ?,tag FROM spot_tags WHERE spot_id=?').run(into, from);
      db.prepare('UPDATE food_spots SET merged_into=? WHERE id=?').run(into, from);
      setStatus(from, 'archived', `merged into #${into}`);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    audit(admin.id, 'spot.merge', `spot:${from}`, `into spot:${into}`);
    res.json({ ok: true });
  }));

  // ---- users ----
  r.get('/users', wrap((req, res) => {
    const q = `%${clean(req.query.q, 40)}%`;
    const rows = db.prepare(`SELECT id,username,email,role,status,created_at,
        (SELECT COUNT(*) FROM reports WHERE target_type='user' AND target_id=users.id) reports_against,
        (SELECT COUNT(*) FROM audit_logs WHERE target='user:'||users.id) mod_actions
      FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 100`).all(q, q);
    res.json({ users: rows });
  }));
  r.post('/users/:id/status', wrap((req, res) => {
    const admin = requireUser(req);
    const id = Number(req.params.id), status = req.body.status;
    if (!['active', 'suspended', 'banned'].includes(status)) throw new HttpError(400, 'Invalid status.');
    const u = db.prepare('SELECT role FROM users WHERE id=?').get(id);
    if (!u) throw new HttpError(404, 'Not found.');
    if (u.role === 'admin') throw new HttpError(403, 'Cannot moderate another admin.');
    db.prepare('UPDATE users SET status=? WHERE id=?').run(status, id);
    audit(admin.id, `user.${status}`, `user:${id}`, req.body.reason);
    res.json({ ok: true });
  }));

  r.get('/audit', wrap((_req, res) => {
    res.json({ logs: db.prepare(`SELECT a.*, u.username admin FROM audit_logs a JOIN users u ON u.id=a.admin_id
      ORDER BY a.id DESC LIMIT 200`).all() });
  }));

  return r;
}
