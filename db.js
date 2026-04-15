const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbFile = process.env.DB_FILE || 'data.db';
const db = new Database(path.join(__dirname, dbFile));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Cause areas grouped by category
const CAUSE_AREA_CATEGORIES = [
  {
    category: 'Global Health & Development',
    funds: ['GiveWell (Unrestricted)', 'Lead Exposure Action'],
  },
  {
    category: 'Animal Welfare',
    funds: ['EA Animal Welfare', 'Navigation Cage-Free Accountability'],
  },
  {
    category: 'General / Multi-Cause',
    funds: ['Navigation General (Unrestricted)', 'Rethink Priorities Cross Cause'],
  },
  {
    category: 'Democracy',
    funds: ['Democracy Defense in Depth'],
  },
  {
    category: 'Catastrophic Risk (Non-AI)',
    funds: ['Longview Nuclear Weapons Policy', 'Sentinel Bio'],
  },
  {
    category: 'AI Safety',
    funds: ['Longview Frontier AI', 'AI Safety Tactical Opportunities Fund', 'Astralis Foundation'],
  },
];

// Flat list derived from categories (used for validation and sorting)
const CAUSE_AREAS = CAUSE_AREA_CATEGORIES.flatMap(c => c.funds);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS magic_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
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

// Migrations
try { db.exec('ALTER TABLE allocations ADD COLUMN display_name TEXT DEFAULT ""'); } catch (e) { /* column already exists */ }

// Prepared statements
const stmts = {
  createMagicLink: db.prepare(
    `INSERT INTO magic_links (token, email, expires_at) VALUES (?, ?, datetime('now', '+15 minutes'))`
  ),
  getMagicLink: db.prepare(
    `SELECT * FROM magic_links WHERE token = ? AND used = 0 AND expires_at > datetime('now')`
  ),
  useMagicLink: db.prepare(
    'UPDATE magic_links SET used = 1 WHERE id = ?'
  ),
  getOrCreateUser: db.prepare(
    'INSERT INTO users (email) VALUES (?) ON CONFLICT(email) DO UPDATE SET email = email RETURNING *'
  ),
  createSession: db.prepare(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))`
  ),
  getSession: db.prepare(
    `SELECT s.*, u.email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > datetime('now')`
  ),
  deleteSession: db.prepare(
    'DELETE FROM sessions WHERE token = ?'
  ),
  upsertAllocation: db.prepare(
    `INSERT INTO allocations (user_id, donation_amount, is_public, display_name, updated_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET donation_amount = excluded.donation_amount, is_public = excluded.is_public, display_name = excluded.display_name, updated_at = datetime('now') RETURNING *`
  ),
  deleteAllocationItems: db.prepare(
    'DELETE FROM allocation_items WHERE allocation_id = ?'
  ),
  insertAllocationItem: db.prepare(
    'INSERT INTO allocation_items (allocation_id, cause_area, planned_pct, ideal_pct) VALUES (?, ?, ?, ?)'
  ),
  getAllocation: db.prepare(`
    SELECT a.*, u.email FROM allocations a
    JOIN users u ON a.user_id = u.id
    WHERE a.user_id = ?
  `),
  getAllocationItems: db.prepare(
    'SELECT cause_area, planned_pct, ideal_pct FROM allocation_items WHERE allocation_id = ?'
  ),
  getAggregate: db.prepare(`
    SELECT
      ai.cause_area,
      SUM(a.donation_amount * ai.planned_pct / 100.0) as total_planned_amount,
      SUM(a.donation_amount * ai.ideal_pct / 100.0) as total_ideal_amount
    FROM allocations a
    JOIN allocation_items ai ON ai.allocation_id = a.id
    WHERE a.donation_amount > 0
    GROUP BY ai.cause_area
  `),
  getTotalDonations: db.prepare(
    'SELECT COALESCE(SUM(donation_amount), 0) as total, COUNT(*) as num_donors FROM allocations WHERE donation_amount > 0'
  ),
  getPublicDonations: db.prepare(`
    SELECT a.donation_amount, a.is_public, a.display_name, u.email, a.id as allocation_id
    FROM allocations a
    JOIN users u ON a.user_id = u.id
    WHERE a.donation_amount > 0
    ORDER BY a.donation_amount DESC
  `),
};

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createMagicLink(email) {
  const token = generateToken();
  stmts.createMagicLink.run(token, email);
  return token;
}

function verifyMagicLink(token) {
  const link = stmts.getMagicLink.get(token);
  if (!link) return null;
  stmts.useMagicLink.run(link.id);
  return link;
}

function createSession(userId) {
  const token = generateToken();
  stmts.createSession.run(token, userId);
  return token;
}

function getSession(token) {
  return stmts.getSession.get(token);
}

function deleteSession(token) {
  stmts.deleteSession.run(token);
}

function getOrCreateUser(email) {
  return stmts.getOrCreateUser.get(email);
}

const saveAllocation = db.transaction((userId, donationAmount, isPublic, displayName, items) => {
  const allocation = stmts.upsertAllocation.get(userId, donationAmount, isPublic ? 1 : 0, displayName || '');
  stmts.deleteAllocationItems.run(allocation.id);
  for (const item of items) {
    stmts.insertAllocationItem.run(allocation.id, item.cause_area, item.planned_pct, item.ideal_pct);
  }
  return allocation;
});

function getAllocation(userId) {
  const allocation = stmts.getAllocation.get(userId);
  if (!allocation) return null;
  const items = stmts.getAllocationItems.all(allocation.id);
  return { ...allocation, items };
}

function getAggregate() {
  const rows = stmts.getAggregate.all();
  const { total, num_donors } = stmts.getTotalDonations.get();
  // Convert to percentages
  const rowMap = Object.fromEntries(rows.map(r => [r.cause_area, r]));
  const result = CAUSE_AREAS.map(area => {
    const r = rowMap[area];
    return {
      cause_area: area,
      planned_pct: r && total > 0 ? (r.total_planned_amount / total) * 100 : 0,
      ideal_pct: r && total > 0 ? (r.total_ideal_amount / total) * 100 : 0,
      planned_amount: r ? r.total_planned_amount : 0,
      ideal_amount: r ? r.total_ideal_amount : 0,
    };
  });
  return { total, num_donors, items: result };
}

const MIN_ANONYMOUS_FOR_PUBLIC = 3;

function getPublicDonations() {
  const rows = stmts.getPublicDonations.all();
  const anonymousCount = rows.filter(r => !r.is_public).length;

  // If fewer than 3 anonymous donors, hide all identities to prevent deduction
  if (anonymousCount < MIN_ANONYMOUS_FOR_PUBLIC) {
    return { privacy_active: true, donations: [] };
  }

  // Only return public (non-anonymous) donations
  const publicRows = rows.filter(r => r.is_public);
  const donations = publicRows.map(r => {
    const items = stmts.getAllocationItems.all(r.allocation_id);
    items.sort((a, b) => CAUSE_AREAS.indexOf(a.cause_area) - CAUSE_AREAS.indexOf(b.cause_area));
    const label = r.display_name ? `${r.display_name} (${r.email})` : r.email;
    return {
      name: label,
      donation_amount: r.donation_amount,
      items,
    };
  });
  return { privacy_active: false, donations };
}

module.exports = {
  CAUSE_AREAS,
  CAUSE_AREA_CATEGORIES,
  createMagicLink,
  verifyMagicLink,
  createSession,
  getSession,
  deleteSession,
  getOrCreateUser,
  saveAllocation,
  getAllocation,
  getAggregate,
  getPublicDonations,
};
