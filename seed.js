/**
 * Seed script to populate the database with mock data.
 * Usage: node seed.js              (uses .env)
 *        node seed.js .env.dev     (uses .env.dev)
 *
 * WARNING: This deletes all existing data before seeding.
 */

const envFile = process.argv[2] || '.env';
require('dotenv').config({ path: envFile });
const Database = require('better-sqlite3');
const path = require('path');

const dbFile = process.env.DB_FILE || 'data.db';
const db = new Database(path.join(__dirname, dbFile));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Must match CAUSE_AREA_CATEGORIES in db.js
const FUNDS = [
  'GiveWell (Unrestricted)',
  'Lead Exposure Action',
  'EA Animal Welfare',
  'Navigation Cage-Free Accountability',
  'Navigation General (Unrestricted)',
  'Rethink Priorities Cross Cause',
  'Democracy Defense in Depth',
  'Longview Nuclear Weapons Policy',
  'Sentinel Bio',
  'Longview Frontier AI',
  'AI Safety Tactical Opportunities Fund',
  'Astralis Foundation',
];

// Animal welfare fund indices (planned gets reduced, ideal gets boosted)
const ANIMAL_WELFARE_INDICES = [
  FUNDS.indexOf('EA Animal Welfare'),
  FUNDS.indexOf('Navigation Cage-Free Accountability'),
];

const MOCK_USERS = [
  { email: 'alice@anthropic.com', name: 'Alice Chen', public: true, amount: 15000 },
  { email: 'bob@anthropic.com', name: 'Bob Smith', public: true, amount: 8000 },
  { email: 'carol@anthropic.com', name: 'Carol Davis', public: true, amount: 22000 },
  { email: 'dave@anthropic.com', name: '', public: false, amount: 5000 },
  { email: 'eve@anthropic.com', name: 'Eve Johnson', public: true, amount: 12000 },
  { email: 'frank@anthropic.com', name: '', public: false, amount: 3500 },
  { email: 'grace@anthropic.com', name: 'Grace Lee', public: true, amount: 18000 },
  { email: 'hank@anthropic.com', name: '', public: false, amount: 7500 },
  { email: 'iris@anthropic.com', name: 'Iris Park', public: true, amount: 25000 },
  { email: 'jack@anthropic.com', name: '', public: false, amount: 4000 },
  { email: 'kate@anthropic.com', name: 'Kate Wilson', public: true, amount: 10000 },
  { email: 'leo@anthropic.com', name: 'Leo Garcia', public: true, amount: 6000 },
  { email: 'mia@anthropic.com', name: '', public: false, amount: 9000 },
  { email: 'nick@anthropic.com', name: 'Nick Brown', public: true, amount: 14000 },
  { email: 'olivia@anthropic.com', name: '', public: false, amount: 2000 },
  { email: 'paul@anthropic.com', name: 'Paul Taylor', public: true, amount: 20000 },
  { email: 'quinn@anthropic.com', name: 'Quinn Nguyen', public: true, amount: 11000 },
  { email: 'rose@anthropic.com', name: '', public: false, amount: 8500 },
];

// Generate a random allocation that sums to 100
// biases: optional object mapping fund index to a multiplier (e.g., 0.3 to reduce, 2.0 to boost)
function randomAllocation(biases) {
  const weights = FUNDS.map((_, i) => {
    let w = Math.random() * Math.random(); // skew toward 0 for sparsity
    if (biases && biases[i] !== undefined) w *= biases[i];
    return w;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  const pcts = weights.map(w => Math.round((w / total) * 100));

  // Fix rounding to hit exactly 100
  let sum = pcts.reduce((s, p) => s + p, 0);
  while (sum !== 100) {
    const idx = Math.floor(Math.random() * FUNDS.length);
    if (sum > 100 && pcts[idx] > 0) { pcts[idx]--; sum--; }
    if (sum < 100) { pcts[idx]++; sum++; }
  }

  return pcts;
}

// Seed
console.log(`Seeding database: ${dbFile}`);

// Ensure tables exist (in case running on fresh db)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
    donation_amount REAL DEFAULT 0,
    is_public INTEGER DEFAULT 0,
    display_name TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS allocation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    allocation_id INTEGER NOT NULL REFERENCES allocations(id),
    cause_area TEXT NOT NULL,
    planned_pct REAL DEFAULT 0,
    ideal_pct REAL DEFAULT 0,
    UNIQUE(allocation_id, cause_area)
  );
`);

// Clear existing allocation data but keep users and sessions
db.exec('DELETE FROM allocation_items');
db.exec('DELETE FROM allocations');

const insertUser = db.prepare('INSERT INTO users (email) VALUES (?) ON CONFLICT(email) DO UPDATE SET email = email RETURNING *');
const insertAlloc = db.prepare(
  `INSERT INTO allocations (user_id, donation_amount, is_public, display_name, updated_at)
   VALUES (?, ?, ?, ?, datetime('now')) RETURNING *`
);
const insertItem = db.prepare(
  'INSERT INTO allocation_items (allocation_id, cause_area, planned_pct, ideal_pct) VALUES (?, ?, ?, ?)'
);

const seed = db.transaction(() => {
  for (const u of MOCK_USERS) {
    const user = insertUser.get(u.email);
    const alloc = insertAlloc.get(user.id, u.amount, u.public ? 1 : 0, u.name);

    // Animal welfare: low in planned, high in ideal
    const plannedBias = {};
    const idealBias = {};
    for (const idx of ANIMAL_WELFARE_INDICES) {
      plannedBias[idx] = 0.5;
      idealBias[idx] = 1.5;
    }
    const planned = randomAllocation(plannedBias);
    const ideal = randomAllocation(idealBias);

    for (let i = 0; i < FUNDS.length; i++) {
      insertItem.run(alloc.id, FUNDS[i], planned[i], ideal[i]);
    }
  }
});

seed();

console.log(`Seeded ${MOCK_USERS.length} users with allocations across ${FUNDS.length} funds.`);
db.close();
