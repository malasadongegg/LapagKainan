// End-to-end check of the "final product test" scenario from the spec. Uses a throwaway DB.
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.LK_DB = path.join(os.tmpdir(), `lk-test-${Date.now()}.db`);
process.env.LK_SECRET = 'test-secret';
const { app } = await import('../server/index.js');
const { db } = await import('../server/db.js');

const srv = app.listen(0);
const base = `http://127.0.0.1:${srv.address().port}/api`;
const JPG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]).toString('base64');
async function call(method, url, body, token) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
}
const reg = async (u) => (await call('POST', '/auth/register', { username: u, email: `${u}@x.ph`, password: 'password123' })).token;
let n = 0; const ok = (m) => console.log(`OK ${++n}. ${m}`);

const ana = await reg('ana'), ben = await reg('ben'), cy = await reg('cyrus'), dee = await reg('dee'), admin = await reg('boss');
db.prepare(`UPDATE users SET role='admin' WHERE username='boss'`).run();

// Not on the map yet -> Lapag
const lat = 14.7983, lng = 120.9275;
assert.equal((await call('GET', `/spots?lat=${lat}&lng=${lng}&radius=1000`)).spots.length, 0); ok('area starts empty');
assert.equal((await call('POST', '/spots', {}, null)).status, 401); ok('submission requires login');
const body = { name: "Aling Nena's Pares", lat, lng, municipality: 'Bocaue', province: 'Bulacan', description: 'Found while waiting for the jeep',
  priceBand: '50-100', tags: ['Pares', 'Carinderia', 'Filipino', 'Budget'], photo: JPG };
const bad = await call('POST', '/spots', { ...body, photo: 'data:image/jpeg;base64,AAAA' }, ana);
assert.equal(bad.status, 400); ok('fake image rejected by magic-byte check');
const created = await call('POST', '/spots', body, ana);
assert.equal(created.status, 201); const id = created.spot.id; ok('spot created');
assert.equal((await call('GET', `/spots?lat=${lat}&lng=${lng}&radius=500`)).spots[0].id, id); ok('appears on the map');
assert.equal((await call('GET', '/spots?q=pares')).spots.length, 1);
assert.equal((await call('GET', '/spots?q=cheap+food')).spots.length, 1);
assert.equal((await call('GET', '/spots?q=bulacan')).spots.length, 1);
assert.equal((await call('GET', '/spots?q=samgyup')).spots.length, 0); ok('search: name / cheap / province / no-match');

// Duplicate detection
const dup = await call('POST', '/spots', { ...body, name: 'Nena Pares', lat: lat + 0.0005 }, ben);
assert.equal(dup.status, 409); assert.equal(dup.matches[0].id, id); ok('duplicate nearby -> 409 with match');
assert.equal((await call('POST', '/spots', { ...body, name: 'Different stall', lat: lat + 0.0005, confirmNew: true }, ben)).status, 201); ok('user can confirm create-new');

// Verified visit
const far = await call('POST', `/spots/${id}/visits`, { lat: lat + 0.01, lng, photo: JPG }, cy);
assert.equal(far.status, 422); ok('far away -> not verified');
assert.equal((await call('POST', `/spots/${id}/visits`, { lat, lng }, cy)).status, 400); ok('visit requires photo');
const visit = await call('POST', `/spots/${id}/visits`, { lat: lat + 0.0003, lng, photo: JPG }, cy);
assert.equal(visit.status, 201); ok('I am here -> verified');
const row = db.prepare('SELECT * FROM visits WHERE id=?').get(visit.visitId);
assert.ok(!('lat' in row) && !('lng' in row)); ok('visit stores no coordinates (privacy)');

// Review
const rv = { food: 5, value: 5, service: 4, cleanliness: 4, overall: 5, body: 'Solid!', visitId: visit.visitId };
assert.equal((await call('POST', `/spots/${id}/reviews`, { ...rv, food: 9 }, cy)).status, 400);
assert.equal((await call('POST', `/spots/${id}/reviews`, { ...rv, visitId: visit.visitId }, ben)).status, 400); ok("can't use someone else's verified visit");
assert.equal((await call('POST', `/spots/${id}/reviews`, rv, cy)).verified, true);
let d = await call('GET', `/spots/${id}`, null, cy);
assert.equal(d.reviews[0].verified, true); assert.equal(d.spot.ratings.food, 5); assert.equal(d.spot.verifiedVisits, 1); ok('review shows Verified Visit + ratings');

// Social
await call('POST', `/spots/${id}/like`, null, ben); await call('POST', `/spots/${id}/like`, null, ben);
await call('POST', `/spots/${id}/comments`, { body: 'Closed every Sunday btw' }, ben);
await call('PUT', `/spots/${id}/save`, { list: 'Bulacan Food Trip' }, ben);
await call('POST', `/spots/${id}/prices`, { item: 'Pares', price: 80 }, ben);
d = await call('GET', `/spots/${id}`, null, ben);
assert.equal(d.spot.likes, 1); assert.equal(d.comments.length, 1); assert.equal(d.me.saved, 'Bulacan Food Trip'); assert.equal(d.prices[0].price, 80);
assert.ok((await call('GET', '/me/saves', null, ben)).lists['Bulacan Food Trip']); ok('like (idempotent) / comment / save / price report');

// Reviews can't be touched by others
assert.equal((await call('POST', `/spots/${id}/reviews`, { ...rv, overall: 1, body: 'edit?', visitId: undefined }, dee)).status, 201);
d = await call('GET', `/spots/${id}`, null);
assert.equal(d.reviews.find((r) => r.username === 'cyrus').overall, 5); ok("one user's review never overwrites another's");

// Closed -> INACTIVE -> community can restore
for (const t of [ana, ben, dee]) await call('POST', '/reports', { targetType: 'spot', targetId: id, reason: 'closed' }, t);
assert.equal((await call('GET', `/spots/${id}`)).spot.status, 'inactive'); ok('3 closed reports -> INACTIVE');
assert.equal((await call('GET', '/spots?q=Aling')).spots.length, 0); ok('inactive hidden from default map');
await call('POST', `/spots/${id}/signal`, { kind: 'open' }, ana); await call('POST', `/spots/${id}/signal`, { kind: 'open' }, ben);
assert.equal((await call('GET', `/spots/${id}`)).spot.status, 'active'); ok('2 still-open signals -> ACTIVE again');

// Archive after 3 months
for (const t of [ana, ben, dee]) await call('POST', `/spots/${id}/signal`, { kind: 'closed' }, t);
assert.equal((await call('GET', `/spots/${id}`)).spot.status, 'inactive');
const old = Date.now() - 100 * 864e5;
db.prepare('UPDATE food_spots SET status_since=?, last_activity_at=? WHERE id=?').run(old, old, id);
const { archiveStale } = await import('../server/spots.js');
assert.equal(archiveStale(), 1);
assert.equal((await call('GET', `/spots/${id}`)).status, 404); ok('stale inactive spot archived (hidden, not deleted)');
assert.equal((await call('GET', `/spots/${id}`, null, admin)).spot.status, 'archived'); ok('archived spot still visible to admins');
assert.equal((await call('GET', `/spots/check?lat=${lat}&lng=${lng}`)).matches.length >= 1, true); ok('archived spot still used for duplicate detection');

// Moderation
assert.equal((await call('GET', '/admin/overview', null, ana)).status, 403); ok('admin endpoints protected');
const s2 = (await call('POST', '/spots', { ...body, name: 'Promo Place', lat: 15.1, lng: 120.5 }, ana)).spot.id;
await call('POST', '/reports', { targetType: 'spot', targetId: s2, reason: 'promotional' }, ben);
const reps = await call('GET', '/admin/reports', null, admin); reps.reports = reps.reports.filter((r) => r.reason === 'promotional');
assert.equal(reps.reports.length, 1);
await call('POST', `/admin/reports/${reps.reports[0].id}/resolve`, { action: 'remove' }, admin);
assert.equal((await call('POST', '/reports', { targetType: 'spot', targetId: s2, reason: 'promotional' }, dee)).status, 409); ok('promo removal blocks repeat promo reports');
assert.ok((await call('GET', '/admin/audit', null, admin)).logs.length >= 1); ok('audit log written');
const ov = await call('GET', '/admin/overview', null, admin); assert.ok(ov.totals.users >= 5); ok('admin overview');
const deeId = (await call('GET', '/admin/users?q=dee', null, admin)).users[0].id;
assert.equal((await call('POST', `/admin/users/${deeId}/status`, { status: 'suspended' }, admin)).ok, true);
assert.equal((await call('POST', `/spots/${s2}/comments`, { body: 'hi' }, dee)).status, 403); ok('suspended users cannot contribute');

// Discover
const disc = await call('GET', `/discover?lat=${lat}&lng=${lng}`); assert.ok(Array.isArray(disc.recent)); ok('discover sections');

srv.close(); db.close();
console.log(`\nAll ${n} checks passed`);
process.exit(0);
