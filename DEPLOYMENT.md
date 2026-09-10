# Deploying Bloom&Borrow to Railway

This app deploys as **one Railway service**: the Express server serves the REST API
under `/api` *and* the built React app for everything else (so `/admin`, `/account`,
deep links and refreshes all work). It talks to a **Railway MySQL** database on the
private network.

```
Browser ──HTTPS──▶ Railway service (Express :PORT)
                     ├─ /api/*        REST API
                     └─ /*            built SPA (dist/)
                          │
                          └──private network──▶ Railway MySQL
```

Estimated time: ~15 minutes.

---

## 0. Prerequisites

- The repository pushed to GitHub.
- A [Railway](https://railway.com) account.
- Node 20+ locally (only needed to generate secrets in step 5).

**Before you start — remove the stray pnpm files.** The repo tracks both
`package-lock.json` *and* `pnpm-lock.yaml`, plus a placeholder `pnpm-workspace.yaml`.
Two lockfiles make Railway's build guess the wrong package manager. This project uses
npm, so delete the pnpm ones and commit:

```bash
git rm pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "Drop unused pnpm lockfiles; standardise on npm"
git push
```

---

## 1. Create the project

1. Railway dashboard → **New Project** → **Deploy from GitHub repo** → pick this repo.
2. Railway creates one service from the repo. Open it; you'll configure it in step 4.

---

## 2. Add the database

In the project canvas: **New** → **Database** → **Add MySQL**.

---

## 3. Create the app database and a non-root user

The server **refuses to run as `root` in production**, so create a dedicated user.

Open the **MySQL** service → **Data** tab → run these in the query box (or connect with
the `mysql` CLI using the service's *public* connection string):

```sql
CREATE DATABASE IF NOT EXISTS bloom_borrow
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'bloom_app'@'%' IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON bloom_borrow.* TO 'bloom_app'@'%';
FLUSH PRIVILEGES;
```

Keep that password for step 5.

---

## 4. Configure the app service (Settings tab)

| Setting | Value |
| --- | --- |
| **Root Directory** | *(leave empty — repo root)* |
| **Build Command** | `npm ci && npm --prefix server ci && npm run build` |
| **Pre-Deploy Command** | `npm --prefix server run migrate` |
| **Start Command** | `node server/server.js` |
| **Healthcheck Path** | `/api/health` |

- `vite build` writes `dist/` at the repo root; the server serves `../dist` from `server/`.
- The pre-deploy command runs the schema + `server/migrations/*.sql` before each release.
  Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`), so re-running is safe.

---

## 5. Set environment variables (Variables tab → Raw Editor)

```ini
NODE_ENV=production
VITE_API_URL=/api
APP_ORIGINS=https://REPLACE_WITH_YOUR_DOMAIN
CLIENT_ORIGIN=https://REPLACE_WITH_YOUR_DOMAIN

DB_HOST=${{MySQL.RAILWAY_PRIVATE_DOMAIN}}
DB_PORT=3306
DB_USER=bloom_app
DB_PASSWORD=the-password-from-step-3
DB_NAME=bloom_borrow
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false

JWT_SECRET=REPLACE_64_PLUS_RANDOM_CHARS
CSRF_SECRET=REPLACE_DIFFERENT_64_PLUS_RANDOM_CHARS
JWT_EXPIRES_IN=8h
TRUST_PROXY=1
```

Notes:

- **`PORT`** — don't set it; Railway injects one and `server.js` reads `process.env.PORT`.
- **`${{MySQL.RAILWAY_PRIVATE_DOMAIN}}`** is a reference variable. If your database
  service isn't named `MySQL`, change the prefix to match.
- **`DB_SSL_REJECT_UNAUTHORIZED=false`** is needed because Railway MySQL uses a
  self-signed internal certificate. Traffic still stays on the private network.
- Generate the two secrets locally (run twice, use different values):
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```
- `APP_ORIGINS` **must** be `https://` and must not be localhost, or the server
  will refuse to start. You'll fill in the real domain in the next step.

---

## 6. Generate the domain, then redeploy

1. App service → **Settings** → **Networking** → **Generate Domain**.
2. Copy the `xxxx.up.railway.app` address into **`APP_ORIGINS`** and **`CLIENT_ORIGIN`**
   (with the `https://` prefix).
3. **Deployments → ⋮ → Redeploy.** A rebuild is required because `VITE_API_URL` and the
   origins are baked into the frontend bundle at build time.

---

## 7. Create the first admin account (one time only)

1. Add three temporary variables:
   ```ini
   INITIAL_ADMIN_NAME=Your Name
   INITIAL_ADMIN_EMAIL=you@example.com
   INITIAL_ADMIN_PASSWORD=At-Least-14-Chars-With-Upper-lower-1-!
   ```
2. Temporarily change the **Pre-Deploy Command** to:
   ```
   npm --prefix server run migrate && npm --prefix server run bootstrap-admin
   ```
3. Redeploy. Watch the deploy logs for `Initial Admin created successfully`.
4. **Revert:** delete the three `INITIAL_ADMIN_*` variables and set the Pre-Deploy
   Command back to `npm --prefix server run migrate`.

`bootstrap-admin` skips itself once an admin exists, so a stray run is harmless — but
don't leave the password variable lying around.

---

## 8. Verify

| Check | Expected |
| --- | --- |
| `https://your-domain/api/health` | `{"ok":true}` |
| `https://your-domain/` | storefront loads, rental catalogue appears |
| `https://your-domain/access/login` | sign in with the admin → lands on `/admin` |
| Refresh while on `/admin/bookings` | page still loads (SPA fallback works) |
| Submit a guest booking, then approve it in `/admin/bookings` | status moves `pending → confirmed` |

---

## 9. Ongoing deploys

Push to the tracked branch → Railway rebuilds and redeploys automatically. The
pre-deploy command applies any new `server/migrations/*.sql` files. No manual steps.

---

## Custom domain (optional)

App service → **Settings** → **Networking** → **Custom Domain** → add
`rent.yourdomain.com` and create the CNAME record it shows you. Then update
`APP_ORIGINS` / `CLIENT_ORIGIN` (comma-separate if you want to keep the
`.up.railway.app` address working too) and redeploy.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Deploy build succeeds but the service **crashes on start** | Check Deploy Logs. Almost always: `APP_ORIGINS` missing or not `https://`, `JWT_SECRET`/`CSRF_SECRET` under 64 chars or equal to each other, or `DB_USER=root`. |
| `Refusing to start: DB_SSL=true is required for a remote production MySQL server` | Set `DB_SSL=true` and `DB_SSL_REJECT_UNAUTHORIZED=false`. |
| `getaddrinfo ENOTFOUND` / `ECONNREFUSED` on the DB | Wrong `DB_HOST`. Use `${{MySQL.RAILWAY_PRIVATE_DOMAIN}}` and confirm both services are in the same project **and** environment. |
| Pre-deploy fails: `Production migrations must not use the MySQL root account` | `DB_USER` is still `root`; switch it to `bloom_app` (step 3). |
| Login succeeds, then every request is `401` / "session is no longer valid" | The session cookie isn't sticking. Confirm the site is `https://` and `TRUST_PROXY=1` is set. |
| Blank page or `404` when refreshing `/admin` | `dist/` wasn't built, or the Start Command isn't `node server/server.js`. Check the build logs for `vite build`. |
| Every request returns `429` | Rate limit tripped. Wait 15 minutes, or raise `RATE_LIMIT_GLOBAL` (see `server/server.js`). |
| Want a stricter pre-launch check | Run the bundled preflight: `railway run --service <app-service> "npm --prefix server run preflight"`. It verifies secrets, SSL, tables, and that a real admin (not the demo account) exists. |

---

For local development, see [README.md](README.md).
