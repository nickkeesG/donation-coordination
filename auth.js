const express = require('express');
const db = require('./db');

const router = express.Router();
const isDev = process.env.NODE_ENV !== 'production';

// POST /auth/login - request a magic link
router.post('/login', (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const trimmed = email.trim().toLowerCase();

  if (!isDev && !trimmed.endsWith('@anthropic.com')) {
    return res.status(403).json({ error: 'Only @anthropic.com emails are allowed' });
  }

  const token = db.createMagicLink(trimmed);
  const link = `${req.protocol}://${req.get('host')}/auth/verify?token=${token}`;

  if (isDev) {
    console.log(`\n=== Magic Link for ${trimmed} ===`);
    console.log(link);
    console.log('================================\n');
  } else {
    // TODO: send email in production
    console.log('Production email sending not yet implemented');
  }

  res.json({ ok: true, message: 'Check your email for a login link' });
});

// GET /auth/verify - verify magic link token
router.get('/verify', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send('Invalid link');
  }

  const link = db.verifyMagicLink(token);
  if (!link) {
    return res.status(400).send('Link is invalid or expired. Please request a new one.');
  }

  const user = db.getOrCreateUser(link.email);
  const sessionToken = db.createSession(user.id);

  res.cookie('session', sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: !isDev,
  });

  res.redirect('/app.html');
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  const token = req.cookies.session;
  if (token) {
    db.deleteSession(token);
  }
  res.clearCookie('session');
  res.json({ ok: true });
});

// Middleware to require authentication
function requireAuth(req, res, next) {
  const token = req.cookies.session;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = db.getSession(token);
  if (!session) {
    res.clearCookie('session');
    return res.status(401).json({ error: 'Session expired' });
  }

  req.user = { id: session.user_id, email: session.email };
  next();
}

module.exports = { router, requireAuth };
