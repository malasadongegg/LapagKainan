// Optional demo data so the map isn't empty on first run:  npm run seed
import { db, now } from '../server/db.js';
import { hashPassword } from '../server/util.js';

const t = now();
let u = db.prepare('SELECT id FROM users WHERE username=?').get('demo');
if (!u) u = { id: Number(db.prepare('INSERT INTO users (username,email,pass_hash,created_at) VALUES (?,?,?,?)').run('demo', 'demo@lapagkainan.local', hashPassword('demo12345'), t).lastInsertRowid) };

// Placeholder photo (1x1 JPEG) so seeded spots have a photo row.
const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const spots = [
  ["Aling Nena's Pares", 14.7983, 120.9275, 'Bocaue', 'Bulacan', '50-100', ['Pares', 'Carinderia', 'Filipino', 'Budget']],
  ['Mang Tomas Lugawan', 14.8527, 120.8116, 'Malolos', 'Bulacan', 'under50', ['Lugaw', 'Street Food', 'Open late', 'Budget']],
  ['Kuya Jun Ihaw-Ihaw', 14.5995, 120.9842, 'Manila', 'Metro Manila', '50-100', ['Ihaw-Ihaw', 'BBQ', 'Filipino', 'Hidden gem']],
  ['Baguio Sulit Silog', 16.4023, 120.596, 'Baguio City', 'Benguet', '50-100', ['Silog', 'Student-friendly', 'Budget']],
  ['Lola Ason Halo-Halo', 14.2756, 120.8626, 'Tanza', 'Cavite', '50-100', ['Halo-Halo', 'Filipino', 'Family-friendly']],
];
for (const [name, lat, lng, municipality, province, band, tags] of spots) {
  if (db.prepare('SELECT 1 FROM food_spots WHERE name=?').get(name)) continue;
  const id = Number(db.prepare(`INSERT INTO food_spots (name,lat,lng,municipality,province,description,price_band,status_since,created_by,created_at,updated_at,last_activity_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(name, lat, lng, municipality, province, 'Demo discovery.', band, t, u.id, t, t, t).lastInsertRowid);
  tags.forEach((g) => db.prepare('INSERT INTO spot_tags (spot_id,tag) VALUES (?,?)').run(id, g));
  db.prepare('INSERT INTO photos (spot_id,user_id,mime,data,created_at) VALUES (?,?,?,?,?)').run(id, u.id, 'image/jpeg', jpg, t);
}
console.log('Seeded demo spots (login: demo / demo12345)');
