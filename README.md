# 🍜 LapagKainan — *Hidden food exists somewhere.*

Community-powered Filipino food discovery map. No restaurant accounts, no paid placement, no ads.
This is the **MVP** (spec §37): web app + REST API. The same API is what the Android client will use.

## Run it
```bash
npm install
cp web/.env.example web/.env     # add VITE_CARTO_API_KEY (CARTO Voyager tiles)
npm run build                    # builds the React app into web/dist
npm start            # http://localhost:3000  (serves API + web/dist)
npm run dev:web      # optional: Vite dev server on :5173 (proxies /api to :3000)
npm run seed         # optional demo spots (login: demo / demo12345)
npm run make-admin <username>   # then open /admin.html
npm test             # end-to-end check of the spec's "final product test" (28 checks)
```
Requires Node ≥ 22.13 (uses built-in `node:sqlite`, so no native build step).

## Layout
| Path | What |
|---|---|
| `server/index.js` | REST API: auth, spots, duplicates, visits, reviews, comments, likes, saves, reports, discover, profiles |
| `server/spots.js` | Queries, search/filters, INACTIVE→ARCHIVED lifecycle, derived badges |
| `server/admin.js` | Admin API: overview, moderation queue, spot edit/archive/restore/merge, users, audit log |
| `server/db.js` | Schema (SQLite, FK + CHECK constraints + indexes) |
| `web/` | React + Vite + TypeScript PWA (react-leaflet, CARTO Voyager tiles, bottom-sheet map UI) |
| `web/public/admin.html` | Admin dashboard (plain HTML, served at `/admin.html`) |

## How the key rules are enforced
- **No paid exposure / owner accounts:** there is simply no such feature or role. Discover sections (`/api/discover`) are Near You, Recently Discovered, Community Favorites, Budget Finds, You Might Have Missed — no single "best" ranking; "missed" intentionally surfaces low-engagement spots.
- **Duplicates:** `POST /api/spots` checks 100 m around the pin (archived spots included) and returns `409` + matches unless the client confirms `confirmNew`.
- **Verified visit:** `POST /api/spots/:id/visits` needs GPS within 150 m **and** a photo. Only the *distance* is stored — never coordinates. A review can attach a verified visit for 6 h.
- **Closed spots:** 3 distinct "closed" signals → 🔴 INACTIVE; 2 "still open" signals or a verified visit → active again; inactive 90 days with no activity → ARCHIVED (hidden, never deleted, still used for duplicate detection).
- **Promo abuse:** once a moderator removes content for `promotional`, further promo reports on that target are refused (`moderation_blocks`).
- **Reviews are immutable to others:** one review per user per spot; only the author can resubmit; admins can hide via moderation but there is no edit path. Admins can only edit factual spot fields (name/area/hours).
- **Uploads:** JPEG/PNG/WebP only, validated by magic bytes, ≤ 3 MB, served with `nosniff` + restrictive CSP.
- **Security:** scrypt password hashes, HMAC-signed expiring tokens, per-user rate limits, suspended/banned enforcement on every request, admin routes gated server-side, all user text HTML-escaped in the client.
- **Badges** are computed from real activity (verified visits, distinct municipalities, verified photos), not from submission volume alone.

## Not yet built (V2/V3 per spec) / known gaps
Following + personalised feed, notifications, menu-item uploads & price history charts, business correction-request workflow, "open now" filter (hours are free text), Android wrapper (Capacitor/PWA), AI features.
Deliberate MVP simplifications: SQLite instead of PostgreSQL/PostGIS (schema is portable; geo queries use a bounding box + haversine), photos stored in the DB (move to object storage at scale), in-memory rate limiter (use Redis when running multiple instances), OSM tiles + Nominatim (swap for a paid provider before heavy traffic).
