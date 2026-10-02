import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, now } from './db.js';
import {
  HttpError, clean, hashPassword, checkPassword, signToken, verifyToken, haversine,
  validCoord, parseImage, rateLimited,
} from './util.js';
import {
  PRICE_BANDS, REASONS, listSpots, getCard, nearbySpots, recordSignal, visitReactivates,
  touchSpot, archiveStale, badgesFor,
} from './spots.js';
import { adminRouter } from './admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERIFY_RADIUS_M = 150;       // how close "I'm here" must be to count as a verified visit
const VISIT_VALID_MS = 6 * 36e5;   // a verified visit can back a review for 6 hours
const DUP_RADIUS_M = 100;

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
  next();
});

const wrap = (fn) => (req, res, next) => { try { Promise.resolve(fn(req, res)).catch(next); } catch (e) { next(e); } };

// ---- auth middleware ----
app.use((req, _res, next) => {
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  const p = m && verifyToken(m[1]);
  if (p) {
    const u = db.prepare('SELECT id,username,email,role,status FROM users WHERE id=?').get(p.uid);
    if (u && u.status !== 'banned') req.user = u;
  }
  next();
});
export const requireUser = (req) => {
  if (!req.user) throw new HttpError(401, 'Mag-login muna.');
  return req.user;
};
const requireActive = (req) => {
  const u = requireUser(req);
  if (u.status !== 'active') throw new HttpError(403, 'Your account is suspended.');
  return u;
};
const limit = (req, action, max, windowMs) => {
  if (rateLimited(`${req.user?.id ?? req.ip}:${action}`, max, windowMs)) throw new HttpError(429, 'Dahan-dahan lang — too many requests. Try again later.');
};
const num = (v) => (v === undefined || v === '' ? NaN : Number(v));
const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role, status: u.status });

// ---- auth ----
app.post('/api/auth/register', wrap((req, res) => {
  limit(req, 'register', 10, 36e5);
  const username = clean(req.body.username, 24), email = clean(req.body.email, 120), pw = String(req.body.password || '');
  if (!/^[A-Za-z0-9_.]{3,24}$/.test(username)) throw new HttpError(400, 'Username: 3–24 letters, numbers, _ or .');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Invalid email.');
  if (pw.length < 8 || pw.length > 200) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE username=? OR email=?').get(username, email)) throw new HttpError(409, 'Username or email already taken.');
  const id = db.prepare('INSERT INTO users (username,email,pass_hash,created_at) VALUES (?,?,?,?)')
    .run(username, email, hashPassword(pw), now()).lastInsertRowid;
  res.json({ token: signToken(Number(id)), user: { id: Number(id), username, role: 'user', status: 'active' } });
}));

app.post('/api/auth/login', wrap((req, res) => {
  limit(req, 'login', 20, 15 * 6e4);
  const id = clean(req.body.login, 120), pw = String(req.body.password || '');
  const u = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(id, id);
  if (!u || !checkPassword(pw, u.pass_hash)) throw new HttpError(401, 'Wrong username/email or password.');
  if (u.status === 'banned') throw new HttpError(403, 'This account is banned.');
  res.json({ token: signToken(u.id), user: publicUser(u) });
}));

app.get('/api/me', wrap((req, res) => res.json({ user: req.user ? publicUser(req.user) : null })));

// ---- spots: list / search / duplicate check ----
function parseQuery(req) {
  const q = req.query;
  const bbox = q.bbox ? String(q.bbox).split(',').map(Number) : null;
  return {
    q: clean(q.q, 80), lat: num(q.lat), lng: num(q.lng), radius: num(q.radius) || 0,
    bbox: bbox && bbox.length === 4 && bbox.every(Number.isFinite) ? bbox : null,
    tags: q.tags ? String(q.tags).split(',').map((t) => clean(t, 40)).filter(Boolean) : [],
    price: q.price ? String(q.price).split(',').filter((p) => PRICE_BANDS.includes(p)) : [],
    verified: q.verified === '1', recent: q.recent === '1', sort: q.sort,
    minfood: num(q.minfood), minvalue: num(q.minvalue), minservice: num(q.minservice), mincleanliness: num(q.mincleanliness),
    includeInactive: q.inactive === '1', limit: num(q.limit) || 300,
  };
}

app.get('/api/spots', wrap((req, res) => res.json({ spots: listSpots(parseQuery(req), req.user?.id) })));

app.get('/api/spots/check', wrap((req, res) => {
  const lat = num(req.query.lat), lng = num(req.query.lng);
  if (!validCoord(lat, lng)) throw new HttpError(400, 'Invalid coordinates.');
  res.json({ matches: nearbySpots(lat, lng, DUP_RADIUS_M).map((s) => ({ ...s, description: undefined })) });
}));

app.post('/api/spots', wrap((req, res) => {
  const u = requireActive(req);
  limit(req, 'spot', 10, 864e5);
  const b = req.body;
  const name = clean(b.name, 80), lat = num(b.lat), lng = num(b.lng);
  if (name.length < 2) throw new HttpError(400, 'Kailangan ng pangalan ng food spot.');
  if (!validCoord(lat, lng)) throw new HttpError(400, 'Invalid location.');
  if (!PRICE_BANDS.includes(b.priceBand)) throw new HttpError(400, 'Pick a price range.');
  const tags = [...new Set((b.tags || []).map((t) => clean(t, 30)).filter(Boolean))].slice(0, 12);
  if (!tags.length) throw new HttpError(400, 'Add at least one category.');
  const photo = parseImage(b.photo);
  if (!photo) throw new HttpError(400, 'Add a photo (JPEG/PNG/WebP, max 3 MB).');

  // Physical location is the primary duplicate signal.
  const dupes = nearbySpots(lat, lng, DUP_RADIUS_M);
  if (dupes.length && !b.confirmNew) {
    throw new HttpError(409, 'Possible existing food spot nearby.', { matches: dupes.map((s) => ({ ...s, description: undefined })) });
  }
  const t = now();
  const info = db.prepare(`INSERT INTO food_spots (name,lat,lng,municipality,province,description,price_band,hours,
    status_since,created_by,created_at,updated_at,last_activity_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(name, lat, lng, clean(b.municipality, 80), clean(b.province, 80), clean(b.description, 1000),
      b.priceBand, clean(b.hours, 120), t, u.id, t, t, t);
  const id = Number(info.lastInsertRowid);
  const ins = db.prepare('INSERT OR IGNORE INTO spot_tags (spot_id,tag) VALUES (?,?)');
  tags.forEach((tag) => ins.run(id, tag));
  db.prepare('INSERT INTO photos (spot_id,user_id,kind,mime,data,created_at) VALUES (?,?,?,?,?,?)')
    .run(id, u.id, b.photoKind === 'exterior' ? 'exterior' : 'food', photo.mime, photo.buf, t);
  db.prepare(`INSERT INTO spot_status_history (spot_id,from_status,to_status,reason,created_at) VALUES (?,?,?,?,?)`)
    .run(id, null, 'active', 'discovered', t);
  res.status(201).json({ spot: getCard(id) });
}));

app.get('/api/spots/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const spot = getCard(id);
  if (!spot || (spot.status === 'archived' && req.user?.role !== 'admin')) throw new HttpError(404, 'Food spot not found.');
  const uid = req.user?.id ?? -1;
  const reviews = db.prepare(`SELECT r.id,r.food,r.value,r.service,r.cleanliness,r.overall,r.body,r.created_at,r.visit_id IS NOT NULL verified,
      u.username FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.spot_id=? AND r.hidden=0 ORDER BY r.created_at DESC LIMIT 50`).all(id)
    .map((r) => ({ ...r, verified: !!r.verified }));
  const comments = db.prepare(`SELECT c.id,c.body,c.created_at,u.username FROM comments c JOIN users u ON u.id=c.user_id
      WHERE c.spot_id=? AND c.hidden=0 ORDER BY c.created_at ASC LIMIT 100`).all(id);
  const photos = db.prepare(`SELECT p.id,p.kind,p.created_at,u.username FROM photos p JOIN users u ON u.id=p.user_id
      WHERE p.spot_id=? AND p.hidden=0 ORDER BY p.id DESC LIMIT 60`).all(id);
  const prices = db.prepare(`SELECT p.id,p.item,p.price,p.created_at,u.username FROM price_reports p JOIN users u ON u.id=p.user_id
      WHERE p.spot_id=? ORDER BY p.created_at DESC LIMIT 30`).all(id);
  const me = {
    liked: !!db.prepare('SELECT 1 FROM likes WHERE user_id=? AND spot_id=?').get(uid, id),
    saved: db.prepare('SELECT list_name FROM saves WHERE user_id=? AND spot_id=?').get(uid, id)?.list_name || null,
    reviewed: !!db.prepare('SELECT 1 FROM reviews WHERE user_id=? AND spot_id=?').get(uid, id),
    visitId: db.prepare(`SELECT id FROM visits WHERE user_id=? AND spot_id=? AND verified=1 AND created_at>? ORDER BY id DESC LIMIT 1`)
      .get(uid, id, now() - VISIT_VALID_MS)?.id || null,
    signal: db.prepare('SELECT kind FROM spot_signals WHERE user_id=? AND spot_id=?').get(uid, id)?.kind || null,
  };
  res.json({ spot, reviews, comments, photos, prices, me });
}));

// ---- contributions ----
app.post('/api/spots/:id/photos', wrap((req, res) => {
  const u = requireActive(req); limit(req, 'photo', 30, 36e5);
  const id = Number(req.params.id);
  const spot = getCard(id);
  if (!spot || spot.status === 'archived') throw new HttpError(404, 'Food spot not found.');
  const photo = parseImage(req.body.photo);
  if (!photo) throw new HttpError(400, 'Photo must be JPEG/PNG/WebP, max 3 MB.');
  const kind = ['food', 'exterior', 'menu', 'meal', 'interior'].includes(req.body.kind) ? req.body.kind : 'food';
  const pid = db.prepare('INSERT INTO photos (spot_id,user_id,kind,mime,data,created_at) VALUES (?,?,?,?,?,?)')
    .run(id, u.id, kind, photo.mime, photo.buf, now()).lastInsertRowid;
  touchSpot(id);
  res.status(201).json({ id: Number(pid) });
}));

app.get('/api/photos/:id', wrap((req, res) => {
  const p = db.prepare('SELECT mime,data,hidden FROM photos WHERE id=?').get(Number(req.params.id));
  if (!p || (p.hidden && req.user?.role !== 'admin')) throw new HttpError(404, 'Not found');
  res.set({ 'Content-Type': p.mime, 'Cache-Control': 'public, max-age=86400', 'Content-Security-Policy': "default-src 'none'" });
  res.end(Buffer.from(p.data));
}));

// "I'm here": verify proximity + a photo. Only distance is stored, never the coordinates.
app.post('/api/spots/:id/visits', wrap((req, res) => {
  const u = requireActive(req); limit(req, 'visit', 12, 864e5);
  const id = Number(req.params.id);
  const spot = getCard(id);
  if (!spot || spot.status === 'archived') throw new HttpError(404, 'Food spot not found.');
  const lat = num(req.body.lat), lng = num(req.body.lng);
  if (!validCoord(lat, lng)) throw new HttpError(400, 'Need your GPS location to verify the visit.');
  const photo = parseImage(req.body.photo);
  if (!photo) throw new HttpError(400, 'Take a photo of your meal or the place to verify your visit.');
  const dist = Math.round(haversine(lat, lng, spot.lat, spot.lng));
  if (dist > VERIFY_RADIUS_M) {
    throw new HttpError(422, `Parang malayo ka pa — you need to be within ${VERIFY_RADIUS_M} m of the food spot to verify.`);
  }
  const t = now();
  const vid = Number(db.prepare('INSERT INTO visits (spot_id,user_id,distance_m,verified,created_at) VALUES (?,?,?,1,?)')
    .run(id, u.id, dist, t).lastInsertRowid);
  db.prepare('INSERT INTO photos (spot_id,user_id,visit_id,kind,mime,data,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, u.id, vid, 'meal', photo.mime, photo.buf, t);
  touchSpot(id); visitReactivates(id);
  res.status(201).json({ visitId: vid, verified: true });
}));

const rating = (v, field) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new HttpError(400, `Rate ${field} from 1 to 5.`);
  return n;
};
app.post('/api/spots/:id/reviews', wrap((req, res) => {
  const u = requireActive(req); limit(req, 'review', 20, 864e5);
  const id = Number(req.params.id);
  const spot = getCard(id);
  if (!spot || spot.status === 'archived') throw new HttpError(404, 'Food spot not found.');
  const b = req.body;
  const r = { food: rating(b.food, 'food'), value: rating(b.value, 'value'), service: rating(b.service, 'service'),
    cleanliness: rating(b.cleanliness, 'cleanliness'), overall: rating(b.overall, 'overall') };
  let visitId = null;
  if (b.visitId) {
    const v = db.prepare('SELECT id FROM visits WHERE id=? AND user_id=? AND spot_id=? AND verified=1 AND created_at>?')
      .get(Number(b.visitId), u.id, id, now() - VISIT_VALID_MS);
    if (!v) throw new HttpError(400, 'That verified visit has expired. Tap "I\'m here" again.');
    visitId = v.id;
  }
  const t = now();
  // One review per user per spot; re-submitting edits your own review only.
  db.prepare(`INSERT INTO reviews (spot_id,user_id,visit_id,food,value,service,cleanliness,overall,body,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(spot_id,user_id) DO UPDATE SET food=excluded.food,value=excluded.value,service=excluded.service,
      cleanliness=excluded.cleanliness,overall=excluded.overall,body=excluded.body,
      visit_id=COALESCE(excluded.visit_id, reviews.visit_id), updated_at=excluded.updated_at`)
    .run(id, u.id, visitId, r.food, r.value, r.service, r.cleanliness, r.overall, clean(b.body, 2000), t, t);
  touchSpot(id);
  res.status(201).json({ ok: true, verified: !!visitId });
}));

app.post('/api/spots/:id/comments', wrap((req, res) => {
  const u = requireActive(req); limit(req, 'comment', 30, 36e5);
  const id = Number(req.params.id);
  if (!getCard(id)) throw new HttpError(404, 'Food spot not found.');
  const body = clean(req.body.body, 600);
  if (!body) throw new HttpError(400, 'Write something first.');
  db.prepare('INSERT INTO comments (spot_id,user_id,body,created_at) VALUES (?,?,?,?)').run(id, u.id, body, now());
  touchSpot(id);
  res.status(201).json({ ok: true });
}));

app.post('/api/spots/:id/prices', wrap((req, res) => {
  const u = requireActive(req); limit(req, 'price', 30, 36e5);
  const id = Number(req.params.id);
  if (!getCard(id)) throw new HttpError(404, 'Food spot not found.');
  const item = clean(req.body.item, 60), price = Number(req.body.price);
  if (!item || !Number.isFinite(price) || price < 0 || price > 100000) throw new HttpError(400, 'Enter an item and a valid price.');
  db.prepare('INSERT INTO price_reports (spot_id,user_id,item,price,created_at) VALUES (?,?,?,?,?)').run(id, u.id, item, price, now());
  touchSpot(id);
  res.status(201).json({ ok: true });
}));

app.post('/api/spots/:id/like', wrap((req, res) => {
  const u = requireActive(req); limit(req, 'like', 120, 36e5);
  if (!getCard(Number(req.params.id))) throw new HttpError(404, 'Food spot not found.');
  db.prepare('INSERT OR IGNORE INTO likes (user_id,spot_id,created_at) VALUES (?,?,?)').run(u.id, Number(req.params.id), now());
  res.json({ ok: true });
}));
app.delete('/api/spots/:id/like', wrap((req, res) => {
  const u = requireUser(req);
  db.prepare('DELETE FROM likes WHERE user_id=? AND spot_id=?').run(u.id, Number(req.params.id));
  res.json({ ok: true });
}));

app.put('/api/spots/:id/save', wrap((req, res) => {
  const u = requireActive(req); limit(req, 'save', 200, 36e5);
  const id = Number(req.params.id);
  if (!getCard(id)) throw new HttpError(404, 'Food spot not found.');
  const list = clean(req.body.list || 'Want to Try', 40) || 'Want to Try';
  db.prepare(`INSERT INTO saves (user_id,spot_id,list_name,created_at) VALUES (?,?,?,?)
    ON CONFLICT(user_id,spot_id) DO UPDATE SET list_name=excluded.list_name`).run(u.id, id, list, now());
  res.json({ ok: true });
}));
app.delete('/api/spots/:id/save', wrap((req, res) => {
  const u = requireUser(req);
  db.prepare('DELETE FROM saves WHERE user_id=? AND spot_id=?').run(u.id, Number(req.params.id));
  res.json({ ok: true });
}));

// "Appears closed" / "Still open" community signals drive the INACTIVE lifecycle.
app.post('/api/spots/:id/signal', wrap((req, res) => {
  const u = requireActive(req); limit(req, 'signal', 40, 864e5);
  const id = Number(req.params.id);
  const kind = req.body.kind;
  if (!['closed', 'open'].includes(kind)) throw new HttpError(400, 'Invalid signal.');
  const spot = getCard(id);
  if (!spot || spot.status === 'archived') throw new HttpError(404, 'Food spot not found.');
  res.json({ status: recordSignal(id, u.id, kind) });
}));

// ---- reports ----
const TARGETS = {
  spot: 'SELECT 1 FROM food_spots WHERE id=?', review: 'SELECT 1 FROM reviews WHERE id=?',
  photo: 'SELECT 1 FROM photos WHERE id=?', comment: 'SELECT 1 FROM comments WHERE id=?', user: 'SELECT 1 FROM users WHERE id=?',
};
app.post('/api/reports', wrap((req, res) => {
  const u = requireActive(req); limit(req, 'report', 20, 864e5);
  const { targetType, reason } = req.body, targetId = Number(req.body.targetId);
  if (!TARGETS[targetType] || !REASONS.includes(reason)) throw new HttpError(400, 'Invalid report.');
  if (!db.prepare(TARGETS[targetType]).get(targetId)) throw new HttpError(404, 'Target not found.');
  if (db.prepare('SELECT 1 FROM moderation_blocks WHERE target_type=? AND target_id=? AND reason=?').get(targetType, targetId, reason)) {
    throw new HttpError(409, 'Moderators already reviewed and acted on this. Salamat!');
  }
  if (reason === 'closed' && targetType === 'spot') recordSignal(targetId, u.id, 'closed');
  const r = db.prepare('INSERT OR IGNORE INTO reports (reporter_id,target_type,target_id,reason,note,created_at) VALUES (?,?,?,?,?,?)')
    .run(u.id, targetType, targetId, reason, clean(req.body.note, 500), now());
  res.status(201).json({ ok: true, duplicate: r.changes === 0 });
}));

// ---- discover, profile, saved ----
app.get('/api/discover', wrap((req, res) => {
  const lat = num(req.query.lat), lng = num(req.query.lng);
  const origin = Number.isFinite(lat) && Number.isFinite(lng);
  const area = clean(req.query.area, 80);
  const base = { limit: 500, lat: origin ? lat : NaN, lng: origin ? lng : NaN };
  const all = listSpots(area ? { ...base, q: area } : base, req.user?.id);
  const pick = (arr, n) => arr.slice(0, n);
  // Community favorites weigh engagement, not review volume alone. "Missed" surfaces quiet, newer-than-popular spots.
  const engagement = (s) => s.likes * 2 + s.comments + s.verifiedVisits * 3 + s.reviewCount;
  const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  res.json({
    near: origin ? pick(listSpots({ lat, lng, radius: 5000, limit: 20 }, req.user?.id), 10) : [],
    recent: pick([...all].sort((a, b) => b.createdAt - a.createdAt), 10),
    favorites: pick([...all].filter((s) => engagement(s) > 0).sort((a, b) => engagement(b) - engagement(a)), 10),
    budget: pick(shuffle(all.filter((s) => ['under50', '50-100'].includes(s.priceBand))), 10),
    missed: pick(shuffle(all.filter((s) => engagement(s) <= 3)), 10),
  });
}));

app.get('/api/users/:username', wrap((req, res) => {
  const u = db.prepare('SELECT id,username,created_at FROM users WHERE username=? AND status!=?').get(req.params.username, 'banned');
  if (!u) throw new HttpError(404, 'User not found.');
  const n = (sql) => db.prepare(sql).get(u.id).n;
  const spots = listSpots({ mine: true, limit: 60 }, u.id);
  res.json({
    user: { username: u.username, joinedAt: u.created_at },
    stats: {
      discoveries: n(`SELECT COUNT(*) n FROM food_spots WHERE created_by=? AND status!='archived'`),
      verifiedVisits: n('SELECT COUNT(*) n FROM visits WHERE user_id=? AND verified=1'),
      reviews: n('SELECT COUNT(*) n FROM reviews WHERE user_id=? AND hidden=0'),
      likesReceived: n('SELECT COUNT(*) n FROM likes WHERE spot_id IN (SELECT id FROM food_spots WHERE created_by=?)'),
    },
    badges: badgesFor(u.id),
    spots,
    reviews: db.prepare(`SELECT r.id,r.overall,r.body,r.created_at,r.visit_id IS NOT NULL verified,s.id spot_id,s.name spot_name
      FROM reviews r JOIN food_spots s ON s.id=r.spot_id WHERE r.user_id=? AND r.hidden=0 AND s.status!='archived'
      ORDER BY r.created_at DESC LIMIT 30`).all(u.id).map((r) => ({ ...r, verified: !!r.verified })),
  });
}));

app.get('/api/me/saves', wrap((req, res) => {
  const u = requireUser(req);
  const ids = db.prepare('SELECT spot_id,list_name FROM saves WHERE user_id=? ORDER BY created_at DESC').all(u.id);
  const lists = {};
  for (const { spot_id, list_name } of ids) {
    const c = getCard(spot_id);
    if (c && c.status !== 'archived') (lists[list_name] ||= []).push(c);
  }
  res.json({ lists });
}));

app.use('/api/admin', adminRouter(wrap, requireUser));

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Upload too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

archiveStale();
setInterval(archiveStale, 36e5).unref();

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`🍜 LapagKainan running → http://localhost:${port}`));
}
