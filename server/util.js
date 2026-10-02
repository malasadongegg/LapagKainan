import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

// ---- geo ----
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export function boundingBox(lat, lng, meters) {
  const dLat = meters / 111320;
  const dLng = meters / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
export const validCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// ---- passwords + tokens (no external deps) ----
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
export function checkPassword(pw, stored) {
  const [s, h] = stored.split(':');
  const hash = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(h, 'hex'));
}
function secret() {
  if (process.env.LK_SECRET) return process.env.LK_SECRET;
  const f = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8');
}
const SECRET = secret();
const b64 = (b) => Buffer.from(b).toString('base64url');
export function signToken(uid, days = 30) {
  const body = b64(JSON.stringify({ uid, exp: Date.now() + days * 864e5 }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verifyToken(tok) {
  if (typeof tok !== 'string') return null;
  const [body, sig] = tok.split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

// ---- images: validate by magic bytes, never trust the client-declared type ----
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export function parseImage(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  let mime = null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) mime = 'image/jpeg';
  else if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) mime = 'image/png';
  else if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') mime = 'image/webp';
  return mime ? { mime, buf } : null;
}

// ---- rate limiting (in-memory; swap for Redis when scaling horizontally) ----
const hits = new Map();
export function rateLimited(key, max, windowMs) {
  const t = Date.now();
  const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(t); hits.set(key, arr);
  return false;
}
setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (!v.some((x) => t - x < 36e5)) hits.delete(k); }, 6e5).unref();

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const clean = (s, max = 500) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
