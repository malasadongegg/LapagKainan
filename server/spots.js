import { db, now } from './db.js';
import { haversine, boundingBox } from './util.js';

export const PRICE_BANDS = ['under50', '50-100', '100-200', '200-500', '500+'];
const TIER = { under50: 1, '50-100': 1, '100-200': 2, '200-500': 3, '500+': 4 };
export const REASONS = ['fake_spot', 'wrong_location', 'duplicate', 'closed', 'fake_review', 'stolen_photo', 'spam',
  'offensive', 'promotional', 'incorrect_info', 'other'];

const CLOSE_THRESHOLD = 3;       // distinct "closed" signals to mark INACTIVE
const REOPEN_THRESHOLD = 2;      // distinct "still open" signals to restore
const ARCHIVE_AFTER_MS = 90 * 864e5;

const SELECT = `
SELECT s.*,
 (SELECT AVG(food) FROM reviews r WHERE r.spot_id=s.id AND r.hidden=0) avg_food,
 (SELECT AVG(value) FROM reviews r WHERE r.spot_id=s.id AND r.hidden=0) avg_value,
 (SELECT AVG(service) FROM reviews r WHERE r.spot_id=s.id AND r.hidden=0) avg_service,
 (SELECT AVG(cleanliness) FROM reviews r WHERE r.spot_id=s.id AND r.hidden=0) avg_clean,
 (SELECT AVG(overall) FROM reviews r WHERE r.spot_id=s.id AND r.hidden=0) avg_overall,
 (SELECT COUNT(*) FROM reviews r WHERE r.spot_id=s.id AND r.hidden=0) review_count,
 (SELECT COUNT(*) FROM visits v WHERE v.spot_id=s.id AND v.verified=1) visit_count,
 (SELECT COUNT(*) FROM likes l WHERE l.spot_id=s.id) like_count,
 (SELECT COUNT(*) FROM comments c WHERE c.spot_id=s.id AND c.hidden=0) comment_count,
 (SELECT id FROM photos p WHERE p.spot_id=s.id AND p.hidden=0 ORDER BY (p.kind IN ('food','meal')) DESC, p.id LIMIT 1) cover_photo,
 (SELECT group_concat(tag, '|') FROM spot_tags t WHERE t.spot_id=s.id) tags,
 (SELECT username FROM users u WHERE u.id=s.created_by) discoverer
FROM food_spots s`;

const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

export function card(row, origin) {
  return {
    id: row.id, name: row.name, lat: row.lat, lng: row.lng,
    municipality: row.municipality, province: row.province, description: row.description,
    priceBand: row.price_band, priceTier: TIER[row.price_band], hours: row.hours,
    status: row.status, tags: row.tags ? row.tags.split('|') : [],
    ratings: { food: r1(row.avg_food), value: r1(row.avg_value), service: r1(row.avg_service),
      cleanliness: r1(row.avg_clean), overall: r1(row.avg_overall) },
    reviewCount: row.review_count, verifiedVisits: row.visit_count,
    likes: row.like_count, comments: row.comment_count,
    coverPhoto: row.cover_photo, discoverer: row.discoverer,
    createdAt: row.created_at, lastActivityAt: row.last_activity_at,
    distanceM: origin ? Math.round(haversine(origin.lat, origin.lng, row.lat, row.lng)) : undefined,
  };
}

// Search synonyms so "cheap food" / "food near me" behave sensibly.
const BUDGET_WORDS = new Set(['cheap', 'budget', 'mura', 'tipid', 'affordable']);
const STOP = new Set(['food', 'near', 'me', 'nearby', 'malapit', 'the', 'in', 'at', 'sa']);

export function listSpots(q, userId) {
  const where = [`s.status IN ('active','inactive')`];
  const args = [];
  const origin = Number.isFinite(q.lat) && Number.isFinite(q.lng) ? { lat: q.lat, lng: q.lng } : null;

  if (origin && q.radius > 0) {
    const b = boundingBox(origin.lat, origin.lng, q.radius);
    where.push('s.lat BETWEEN ? AND ? AND s.lng BETWEEN ? AND ?');
    args.push(b.minLat, b.maxLat, b.minLng, b.maxLng);
  }
  if (q.bbox) {
    where.push('s.lat BETWEEN ? AND ? AND s.lng BETWEEN ? AND ?');
    args.push(q.bbox[0], q.bbox[2], q.bbox[1], q.bbox[3]);
  }
  if (q.q) {
    for (const w of q.q.toLowerCase().split(/\s+/).filter(Boolean)) {
      if (STOP.has(w)) continue;
      if (BUDGET_WORDS.has(w)) { where.push(`s.price_band IN ('under50','50-100')`); continue; }
      const like = `%${w.replace(/[%_]/g, '')}%`;
      where.push(`(s.name LIKE ? OR s.municipality LIKE ? OR s.province LIKE ? OR s.description LIKE ?
        OR EXISTS (SELECT 1 FROM spot_tags t WHERE t.spot_id=s.id AND t.tag LIKE ?))`);
      args.push(like, like, like, like, like);
    }
  }
  for (const tag of q.tags || []) {
    where.push('EXISTS (SELECT 1 FROM spot_tags t WHERE t.spot_id=s.id AND t.tag = ? COLLATE NOCASE)');
    args.push(tag);
  }
  if (q.price?.length) {
    where.push(`s.price_band IN (${q.price.map(() => '?').join(',')})`);
    args.push(...q.price);
  }
  if (q.verified) where.push('EXISTS (SELECT 1 FROM visits v WHERE v.spot_id=s.id AND v.verified=1)');
  if (q.recent) { where.push('s.created_at > ?'); args.push(now() - 14 * 864e5); }
  if (!q.includeInactive) where.push(`s.status = 'active'`);
  if (q.mine && userId) { where.push('s.created_by = ?'); args.push(userId); }

  let rows = db.prepare(`${SELECT} WHERE ${where.join(' AND ')} LIMIT 1500`).all(...args).map((r) => card(r, origin));
  if (q.radius > 0 && origin) rows = rows.filter((r) => r.distanceM <= q.radius);
  for (const dim of ['food', 'value', 'service', 'cleanliness']) {
    const min = q['min' + dim];
    if (min > 0) rows = rows.filter((r) => (r.ratings[dim] ?? 0) >= min);
  }
  if (q.sort === 'recent') rows.sort((a, b) => b.createdAt - a.createdAt);
  else if (origin) rows.sort((a, b) => a.distanceM - b.distanceM);
  else rows.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  return rows.slice(0, Math.min(q.limit || 300, 500));
}

export function getCard(id) {
  const row = db.prepare(`${SELECT} WHERE s.id = ?`).get(id);
  return row ? card(row) : null;
}

export function nearbySpots(lat, lng, meters) {
  const b = boundingBox(lat, lng, meters);
  return db.prepare(`${SELECT} WHERE s.status != 'archived' AND s.lat BETWEEN ? AND ? AND s.lng BETWEEN ? AND ?`)
    .all(b.minLat, b.maxLat, b.minLng, b.maxLng)
    .map((r) => card(r, { lat, lng }))
    .filter((r) => r.distanceM <= meters)
    .sort((a, b2) => a.distanceM - b2.distanceM);
}

// ---- status lifecycle ----
export function setStatus(spotId, to, reason) {
  const s = db.prepare('SELECT status FROM food_spots WHERE id=?').get(spotId);
  if (!s || s.status === to) return;
  const t = now();
  db.prepare('UPDATE food_spots SET status=?, status_since=?, updated_at=? WHERE id=?').run(to, t, t, spotId);
  db.prepare('INSERT INTO spot_status_history (spot_id,from_status,to_status,reason,created_at) VALUES (?,?,?,?,?)')
    .run(spotId, s.status, to, reason, t);
  db.prepare('DELETE FROM spot_signals WHERE spot_id=?').run(spotId);
}

export function touchSpot(spotId) {
  db.prepare('UPDATE food_spots SET last_activity_at=? WHERE id=?').run(now(), spotId);
}

export function recordSignal(spotId, userId, kind) {
  db.prepare(`INSERT INTO spot_signals (spot_id,user_id,kind,created_at) VALUES (?,?,?,?)
    ON CONFLICT(spot_id,user_id) DO UPDATE SET kind=excluded.kind, created_at=excluded.created_at`)
    .run(spotId, userId, kind, now());
  const count = (k) => db.prepare('SELECT COUNT(*) n FROM spot_signals WHERE spot_id=? AND kind=?').get(spotId, k).n;
  const st = db.prepare('SELECT status FROM food_spots WHERE id=?').get(spotId)?.status;
  if (st === 'active' && count('closed') >= CLOSE_THRESHOLD && count('closed') > count('open')) {
    setStatus(spotId, 'inactive', 'community reports: closed');
  } else if (st === 'inactive' && count('open') >= REOPEN_THRESHOLD) {
    setStatus(spotId, 'active', 'community confirmed: still open');
  }
  if (kind === 'open') touchSpot(spotId);
  return db.prepare('SELECT status FROM food_spots WHERE id=?').get(spotId).status;
}

// A verified visit is strong evidence the place is open: restore it immediately.
export function visitReactivates(spotId) {
  if (db.prepare('SELECT status FROM food_spots WHERE id=?').get(spotId)?.status === 'inactive') {
    setStatus(spotId, 'active', 'verified visit');
  }
}

// Archive (never delete) spots that stayed inactive with no meaningful update for ~3 months.
export function archiveStale() {
  const cutoff = now() - ARCHIVE_AFTER_MS;
  const rows = db.prepare(`SELECT id FROM food_spots WHERE status='inactive' AND status_since < ? AND last_activity_at < ?`)
    .all(cutoff, cutoff);
  for (const r of rows) setStatus(r.id, 'archived', 'inactive for 3 months with no update');
  return rows.length;
}

// ---- badges: derived from real activity, so they can't be farmed via low-quality spam ----
export function badgesFor(userId) {
  const n = (sql) => db.prepare(sql).get(userId).n;
  const spots = n(`SELECT COUNT(*) n FROM food_spots WHERE created_by=? AND status!='archived'`);
  const visited = n(`SELECT COUNT(DISTINCT spot_id) n FROM visits WHERE user_id=? AND verified=1`);
  const munis = n(`SELECT COUNT(DISTINCT municipality||province) n FROM food_spots WHERE created_by=? AND status!='archived' AND municipality!=''`);
  const photos = n(`SELECT COUNT(*) n FROM photos WHERE user_id=? AND hidden=0 AND visit_id IN (SELECT id FROM visits WHERE verified=1)`);
  return [
    { id: 'first-lapag', icon: '🥢', name: 'First Lapag', desc: 'Submitted your first discovery', earned: spots >= 1 },
    { id: 'explorer', icon: '🗺️', name: 'Explorer', desc: 'Verified visits at 10 food spots', earned: visited >= 10, progress: `${visited}/10` },
    { id: 'gem-hunter', icon: '🔥', name: 'Hidden Gem Hunter', desc: '25 discoveries', earned: spots >= 25, progress: `${spots}/25` },
    { id: 'local-foodie', icon: '🇵🇭', name: 'Local Foodie', desc: 'Discovered food in 5 municipalities', earned: munis >= 5, progress: `${munis}/5` },
    { id: 'documentarian', icon: '📸', name: 'Food Documentarian', desc: '50 photos from verified visits', earned: photos >= 50, progress: `${photos}/50` },
  ];
}
