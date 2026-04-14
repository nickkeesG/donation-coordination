const express = require('express');
const db = require('./db');
const { addClient, broadcast } = require('./sse');
const { requireAuth } = require('./auth');

const router = express.Router();

// SSE endpoint (requires auth)
router.get('/events', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('\n');
  addClient(res);
});

// Get cause areas list
router.get('/cause-areas', (req, res) => {
  res.json(db.CAUSE_AREA_CATEGORIES);
});

// Get current user's allocation
router.get('/me', requireAuth, (req, res) => {
  const allocation = db.getAllocation(req.user.id);
  res.json(allocation || { email: req.user.email, donation_amount: 0, is_public: 0, items: [] });
});

// Save current user's allocation
router.put('/me', requireAuth, (req, res) => {
  const { donation_amount, is_public, display_name, items } = req.body;

  if (typeof donation_amount !== 'number' || donation_amount < 0) {
    return res.status(400).json({ error: 'Invalid donation amount' });
  }

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Items must be an array' });
  }

  // Validate items
  for (const item of items) {
    if (!db.CAUSE_AREAS.includes(item.cause_area)) {
      return res.status(400).json({ error: `Unknown cause area: ${item.cause_area}` });
    }
    if (typeof item.planned_pct !== 'number' || typeof item.ideal_pct !== 'number') {
      return res.status(400).json({ error: 'Percentages must be numbers' });
    }
  }

  // Validate percentages sum to ~100 (allow small floating point errors)
  const plannedSum = items.reduce((s, i) => s + i.planned_pct, 0);
  const idealSum = items.reduce((s, i) => s + i.ideal_pct, 0);
  if (Math.abs(plannedSum - 100) > 1 || Math.abs(idealSum - 100) > 1) {
    return res.status(400).json({ error: 'Percentages must sum to 100' });
  }

  db.saveAllocation(req.user.id, donation_amount, !!is_public, display_name || '', items);
  broadcast('update', { type: 'allocation_changed' });
  res.json({ ok: true });
});

// Get aggregate data
router.get('/aggregate', requireAuth, (req, res) => {
  res.json(db.getAggregate());
});

// Get public donations
router.get('/donations', requireAuth, (req, res) => {
  res.json(db.getPublicDonations());
});

module.exports = router;
