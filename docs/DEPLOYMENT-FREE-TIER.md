# Deploying Bloom&Borrow on free tiers (Vercel + Render + TiDB + Supabase)

(The existing [DEPLOYMENT.md](DEPLOYMENT.md) covers the Railway route. This guide is the free-tier route.)

## Architecture

```
Browser ──HTTPS──> Vercel (static React build, dist/)
                     │  /api/*  (rewrite in vercel.json, same-origin so cookies work)
                     ▼
                   Render web service (Express API, backend/)
                     ├──> TiDB Cloud Serverless  (MySQL-compatible database, TLS)
                     └──> Supabase Storage       (private bucket: ID documents, payment proofs)
```

| Part | Service | Config file |
|---|---|---|
| Frontend | Vercel Hobby | [vercel.json](../vercel.json) |
| API | Render free web service | [render.yaml](../render.yaml) |
| Database | TiDB Cloud Serverless (free) | env vars `DB_*` |
| Uploads | Supabase Storage (free) | env vars `SUPABASE_*`, code in `backend/lib/upload.js` |

Free-tier limits change; confirm on each provider's pricing page. Vercel Hobby is for non-commercial use.

## 1. Generate secrets (run locally, once)

```
node -e "const c=require('crypto');for(const n of ['JWT_SECRET','CSRF_SECRET','BOOKING_LINK_SECRET'])console.log(n+'='+c.randomBytes(48).toString('hex'))"
```
All three must be different and 64+ characters. Keep them in a password manager. Never commit them.

## 2. Database (TiDB Cloud)
1. Create a free **Serverless** cluster. Note host, port (4000), and region.
2. Create a database `bloom_borrow` and a **non-root** SQL user with all privileges on it.
3. Use these values: `DB_HOST`, `DB_PORT=4000`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=bloom_borrow`, `DB_SSL=true`.
4. Test locally against it before deploying: put the values in `backend/.env.production`, then
   `cd backend && npm run migrate && npm run preflight`. Fix any migration errors here, not on Render.

## 3. Uploads (Supabase Storage)
1. Create a project. Storage → New bucket → name `bloom-uploads`, **Public OFF**.
2. Settings → API: copy the Project URL (`SUPABASE_URL`) and the **service_role** key (`SUPABASE_SERVICE_ROLE_KEY`).
   The service-role key is a server secret: Render only, never Vercel/frontend.

## 4. Backend (Render)
1. Push the repo to GitHub. In Render: New → **Blueprint**, pick the repo (it reads `render.yaml`).
2. Fill the `sync: false` variables: `APP_ORIGINS` (`https://<project>.vercel.app`, HTTPS, no trailing slash),
   `PUBLIC_APP_URL` (same), the three secrets, `DB_*`, `SUPABASE_*`, `SMTP_*`.
3. Deploy. Start command runs `npm run migrate` then `npm run start:production`.
4. Note the URL, e.g. `https://bloom-and-borrow-api.onrender.com`.

## 5. Frontend (Vercel)
1. In `vercel.json` replace `YOUR-BACKEND-HOST` with the Render host (no `https://` duplication: the full destination is
   `https://bloom-and-borrow-api.onrender.com/api/:path*`).
2. Vercel → Add New Project → import the repo. Framework Vite, build `npm run build`, output `dist`.
3. Environment variable: `VITE_API_URL=/api`. Deploy.
4. If the Vercel URL differs from what you put in `APP_ORIGINS`, update it in Render and redeploy.

## 6. First admin account (one time)
Render's free tier has no shell, so run this locally against the production database:
```
cd backend
INITIAL_ADMIN_NAME="Your Name" INITIAL_ADMIN_EMAIL="you@example.com" INITIAL_ADMIN_PASSWORD="<strong password>" npm run bootstrap-admin
```
(PowerShell: set `$env:INITIAL_ADMIN_...` first.) It skips if an admin already exists. Do not leave the password in any env file.

## 7. Keep-alive (needed for the hourly overdue job)
Render free sleeps after ~15 min idle, which pauses the `setInterval` jobs in `server.js`.
Create a free monitor (UptimeRobot / cron-job.org) hitting `https://<render-host>/api/health` every 10 minutes.
This reduces but does not eliminate cold starts, and Render's free monthly hours are limited. A $7/mo paid instance removes the issue.

## 8. Verify
- `https://<render-host>/api/health` → `{"ok":true}` (if it hangs ~30s, it was waking up).
- Open the Vercel URL; Browse/Home loads and items appear (proves the `/api` proxy and DB).
- Log in as the admin (proves cookies/CSRF work through the proxy).
- Submit a test booking with an ID upload; in Supabase Storage the file appears under `id-documents/`;
  as admin, open the booking and download the ID (proves private streaming works).
- Check the booking confirmation email arrives (SMTP).
- Delete the test booking/customer; the storage objects should disappear.

## 9. Monitoring
- Render dashboard → Logs / Metrics. Vercel → Deployments / Logs.
- UptimeRobot email alerts on `/api/health`.
- App-level audit log is in the admin UI; old entries are purged daily by `purgeOldAuditLogs`.

## 10. Security notes
- Secrets only in Render's env, never in git (`.env*` is gitignored).
- Uploads bucket is private; files are served only through authenticated admin routes.
- The service-role key bypasses Supabase row security: keep it server-side and rotate it if leaked.
- DB uses a non-root user and TLS; the API refuses to start in production otherwise.
- `TRUST_PROXY=2` is required (Vercel + Render) so rate limiting sees real client IPs.
- Cookies are `SameSite=lax`; that is why the API is proxied through the Vercel domain instead of called cross-site.
- Remove `INITIAL_ADMIN_*` after bootstrapping.

## 11. Maintenance, backups, updates, rollback
- **Updates:** push to `main`; Vercel and Render auto-deploy. Migrations run on each Render start (they must be idempotent).
- **Rollback:** Vercel → Deployments → previous build → Promote. Render → Deploys → Rollback. Database migrations are not
  auto-reverted: write a down-fix migration if a schema change must be undone.
- **Database backups:** TiDB free tier backups are limited; also dump regularly with `mysqldump` (needs TLS flags) or TiDB's
  export, and store off-site. Test a restore at least once.
- **Upload backups:** Supabase free tier has no guaranteed backups; periodically download the bucket.
- **Secret rotation:** changing `JWT_SECRET` logs everyone out; changing `BOOKING_LINK_SECRET` invalidates emailed booking links.

## 12. Troubleshooting
| Symptom | Likely cause / fix |
|---|---|
| Render crashes at boot with "must be at least 64 characters" / "HTTPS" / "DB_SSL" | Env var missing or wrong; the guards in `server.js` and `lib/db.js` name it. |
| Site loads, API calls 404/HTML | `vercel.json` destination still the placeholder, or `VITE_API_URL` not `/api`. |
| Login works then immediately logs out / 403 CSRF | `APP_ORIGINS` doesn't exactly match the Vercel origin, or the API is being called cross-site instead of via `/api`. |
| Everyone rate-limited together | `TRUST_PROXY` not 2. |
| First request very slow | Render cold start; see keep-alive. |
| Upload fails with "Upload storage failed (4xx)" | Wrong bucket name, URL, or key; bucket must exist. 413 → file over 5 MB. |
| `ER_...` errors during migrate | TiDB/MySQL syntax difference; run migrations locally against TiDB first (step 2.4). |
| Emails not sending | Check `SMTP_*`; many hosts block port 25; use 587/465 with an app password. |
