const express = require('express');
const { Resend } = require('resend');
const db = require('./db');

const router = express.Router();
const isDev = process.env.NODE_ENV !== 'production';
const allowAllEmails = process.env.ALLOW_ALL_EMAILS === 'true';
const basePath = process.env.BASE_PATH || '';
const cookieName = process.env.COOKIE_NAME || 'session';
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

console.log('Auth config:', { isDev, allowAllEmails, basePath, cookieName, NODE_ENV: process.env.NODE_ENV, ALLOW_ALL_EMAILS: process.env.ALLOW_ALL_EMAILS });

// POST /auth/login - request a magic link
router.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const trimmed = email.trim().toLowerCase();

  if (!isDev && !allowAllEmails && !trimmed.endsWith('@anthropic.com')) {
    return res.status(403).json({ error: 'Only @anthropic.com emails are allowed' });
  }

  const token = db.createMagicLink(trimmed);
  const link = `${req.protocol}://${req.get('host')}${basePath}/auth/verify?token=${token}`;

  if (isDev) {
    console.log(`\n=== Magic Link for ${trimmed} ===`);
    console.log(link);
    console.log('================================\n');
    return res.json({ ok: true, message: 'Check your email for a login link' });
  }

  if (!resend) {
    console.error('No RESEND_API_KEY configured');
    return res.status(500).json({ error: 'Email sending not configured' });
  }

  try {
    await resend.emails.send({
      from: 'Donation Coordination <login@coordinatedonate.org>',
      to: trimmed,
      subject: 'Your login link',
      html: `<p>Click the link below to log in to the Donation Coordination platform:</p>
        <p><a href="${link}">${link}</a></p>
        <p>This link expires in 15 minutes.</p>`,
    });
  } catch (err) {
    console.error('Failed to send email:', err);
    return res.status(500).json({ error: 'Failed to send login email. Please try again.' });
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

  res.cookie(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: !isDev,
  });

  res.redirect(`${basePath}/app.html`);
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  const token = req.cookies[cookieName];
  if (token) {
    db.deleteSession(token);
  }
  res.clearCookie(cookieName);
  res.json({ ok: true });
});

// Middleware to require authentication
function requireAuth(req, res, next) {
  const token = req.cookies[cookieName];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = db.getSession(token);
  if (!session) {
    res.clearCookie(cookieName);
    return res.status(401).json({ error: 'Session expired' });
  }

  req.user = { id: session.user_id, email: session.email };
  next();
}

module.exports = { router, requireAuth };
