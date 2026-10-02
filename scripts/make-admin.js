import { db } from '../server/db.js';
const name = process.argv[2];
if (!name) { console.error('Usage: npm run make-admin <username>'); process.exit(1); }
const r = db.prepare(`UPDATE users SET role='admin' WHERE username=?`).run(name);
console.log(r.changes ? `✔ ${name} is now an admin` : `✖ no such user: ${name}`);
