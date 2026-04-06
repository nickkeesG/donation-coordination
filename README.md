# Donation Coordination Platform

A real-time tool for coordinating charitable donations among Anthropic employees. Users log in, share their planned donation amounts and allocation across cause areas, and provide their ideal overall allocation. The platform aggregates all donations in real time so participants can compare actual vs. ideal distributions.

## Architecture

- **Backend**: Node.js + Express
- **Database**: SQLite (via better-sqlite3) - single file, no setup needed
- **Auth**: Magic link email authentication (via Resend)
- **Real-time**: Server-Sent Events (SSE) for live updates
- **Frontend**: Vanilla HTML/CSS/JS, no build step

### File structure

```
server.js          Entry point - Express app, static files, route mounting
db.js              SQLite schema, queries, data layer, cause area list
auth.js            Magic link login/verify/logout, session middleware
routes.js          API endpoints (GET/PUT /api/me, /api/aggregate, /api/donations, /api/events)
sse.js             SSE client tracking and broadcast
nginx.conf         Nginx reverse proxy config (production + /dev instance)
setup.sh           Server setup script (nginx, HTTPS via certbot)
public/
  index.html       Login page
  app.html         Main app page
  app.js           Frontend logic (inputs, save, SSE, aggregate display)
  style.css        Styling (Anthropic-inspired aesthetic)
```

## Local development

```bash
npm install
npm start
```

Server runs at `http://localhost:3000`. In dev mode (default), any email is accepted and magic links are printed to the terminal instead of emailed.

## Environment variables

Configured via `.env` file (loaded by dotenv). Use `ENV_FILE` env var to specify an alternate file (e.g. `ENV_FILE=.env.dev`).

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` for real email sending and @anthropic.com restriction |
| `PORT` | `3000` | Server port |
| `RESEND_API_KEY` | - | Resend API key for sending magic link emails |
| `DB_FILE` | `data.db` | SQLite database filename |
| `BASE_PATH` | `` | URL base path (e.g. `/dev`) - used for magic link URLs and redirects |
| `ALLOW_ALL_EMAILS` | `false` | Set to `true` to accept any email domain (overrides @anthropic.com restriction) |
| `COOKIE_NAME` | `session` | Session cookie name (use different names for separate instances) |

## Production deployment

Deployed on a Digital Ocean droplet at `coordinatedonate.org`.

### Setup

1. Clone repo to `/opt/donation-coordination`
2. `npm install`
3. Create `.env` with production config (see table above)
4. Run `bash setup.sh your@email.com` (sets up nginx + HTTPS)
5. `pm2 start server.js --name prod`
6. `pm2 save && pm2 startup`

### Test instance

A separate test instance runs at `/dev/` with its own database and relaxed email restrictions.

1. Create `.env.dev` with `PORT=3001`, `DB_FILE=data-dev.db`, `ALLOW_ALL_EMAILS=true`, `BASE_PATH=/dev`, `COOKIE_NAME=session_dev`
2. `ENV_FILE=.env.dev pm2 start server.js --name dev`

### Updating

```bash
cd /opt/donation-coordination
git pull
npm install
pm2 restart all
```

If nginx.conf changed, also run:
```bash
cp nginx.conf /etc/nginx/sites-available/coordinatedonate.org
nginx -t && systemctl reload nginx
```

## Privacy

- Users choose to be public or anonymous
- Individual donations are only shown when at least 3 users have opted for anonymity (prevents identification by process of elimination)
- Anonymous donations never appear in the individual list
- Aggregate data always includes all donations regardless of privacy setting

## Cause areas

Currently fixed in `db.js`: Global Health, Animal Welfare, Global Catastrophic Risk, Other. Changing the list requires updating the `CAUSE_AREAS` array and deleting the database to start fresh.
