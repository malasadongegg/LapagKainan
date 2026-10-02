import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
fs.mkdirSync(dir, { recursive: true });

export const db = new DatabaseSync(process.env.LK_DB || path.join(dir, 'lapagkainan.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Timestamps are epoch milliseconds. Precise visit coordinates are never stored:
// a visit keeps only the computed distance and a verified flag (privacy).
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS food_spots (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL,
  municipality TEXT NOT NULL DEFAULT '',
  province TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price_band TEXT NOT NULL CHECK (price_band IN ('under50','50-100','100-200','200-500','500+')),
  hours TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  status_since INTEGER NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  merged_into INTEGER REFERENCES food_spots(id)
);
CREATE INDEX IF NOT EXISTS idx_spots_geo ON food_spots(lat, lng);
CREATE INDEX IF NOT EXISTS idx_spots_status ON food_spots(status);
CREATE INDEX IF NOT EXISTS idx_spots_muni ON food_spots(province, municipality);

CREATE TABLE IF NOT EXISTS spot_tags (
  spot_id INTEGER NOT NULL REFERENCES food_spots(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (spot_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON spot_tags(tag);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  spot_id INTEGER NOT NULL REFERENCES food_spots(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  distance_m INTEGER NOT NULL,
  verified INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visits_spot ON visits(spot_id, verified);
CREATE INDEX IF NOT EXISTS idx_visits_user ON visits(user_id);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  spot_id INTEGER NOT NULL REFERENCES food_spots(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  visit_id INTEGER REFERENCES visits(id),
  kind TEXT NOT NULL DEFAULT 'food' CHECK (kind IN ('food','exterior','menu','meal','interior')),
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_spot ON photos(spot_id, hidden);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  spot_id INTEGER NOT NULL REFERENCES food_spots(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  visit_id INTEGER REFERENCES visits(id),
  food INTEGER NOT NULL CHECK (food BETWEEN 1 AND 5),
  value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
  service INTEGER NOT NULL CHECK (service BETWEEN 1 AND 5),
  cleanliness INTEGER NOT NULL CHECK (cleanliness BETWEEN 1 AND 5),
  overall INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (spot_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  spot_id INTEGER NOT NULL REFERENCES food_spots(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_spot ON comments(spot_id);

CREATE TABLE IF NOT EXISTS price_reports (
  id INTEGER PRIMARY KEY,
  spot_id INTEGER NOT NULL REFERENCES food_spots(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  item TEXT NOT NULL,
  price REAL NOT NULL CHECK (price >= 0),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prices_spot ON price_reports(spot_id, created_at);

CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL REFERENCES users(id),
  spot_id INTEGER NOT NULL REFERENCES food_spots(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, spot_id)
);

CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER NOT NULL REFERENCES users(id),
  spot_id INTEGER NOT NULL REFERENCES food_spots(id),
  list_name TEXT NOT NULL DEFAULT 'Want to Try',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, spot_id)
);

-- "Still open" / "appears closed" community signals. One per user per spot; reset on status change.
CREATE TABLE IF NOT EXISTS spot_signals (
  spot_id INTEGER NOT NULL REFERENCES food_spots(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('closed','open')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (spot_id, user_id)
);

CREATE TABLE IF NOT EXISTS spot_status_history (
  id INTEGER PRIMARY KEY,
  spot_id INTEGER NOT NULL REFERENCES food_spots(id),
  from_status TEXT, to_status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('spot','review','photo','comment','user')),
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  resolved_by INTEGER REFERENCES users(id),
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (reporter_id, target_type, target_id, reason)
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- After a confirmed promotional-abuse removal, further promo reports on the same target are refused.
CREATE TABLE IF NOT EXISTS moderation_blocks (
  target_type TEXT NOT NULL, target_id INTEGER NOT NULL, reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (target_type, target_id, reason)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`);

export const now = () => Date.now();
