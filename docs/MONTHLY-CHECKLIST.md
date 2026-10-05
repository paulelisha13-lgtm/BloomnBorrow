# Bloom&Borrow monthly checklist (free-plan setup)

About 10 minutes. Do this on the same day each month, for example the 1st.

## 1. Is the system up? (1 minute)
- [ ] Open https://bloomn-borrow.vercel.app (admin site: shows the staff login).
- [ ] Open https://bloom-and-borrow.vercel.app (customer site): it should show the shop, items load, and `/admin` or `/access/login` there redirects to `/shop`. (Rules live in `vercel.json`; only `bloomn-borrow.vercel.app` is treated as the admin host.)
- [ ] Open https://bloom-and-borrow-api.onrender.com/api/health. It should show `{"ok":true}`.
- [ ] UptimeRobot dashboard: the monitor shows **Up**, and you got no down-alert emails.

## 2. Usage limits (3 minutes)
- [ ] **Render** -> Billing / Usage: instance hours under 750. It should rise about 24 per day.
- [ ] **TiDB** -> your cluster -> Overview -> Capacity used this month: well under the free limit. Spend shows **Free**.
- [ ] **Supabase** -> project is **Active, not Paused** (Storage -> bucket `bloom-uploads` opens). If paused, click **Restore project**.
- [ ] **Brevo** -> Statistics: emails sent today and this month are under the daily limit; no blocked or bounced senders.

## 3. Backups (3 minutes)
- [ ] **Database:** export the `bloom_borrow` database from TiDB Cloud (Export / Backup) and save the file somewhere safe off this computer.
- [ ] **Uploads:** Supabase -> Storage -> `bloom-uploads` -> download the folders `id-documents` and `payment-proofs`. These contain customer IDs: store them privately and delete old copies. Do this before the 30-day cleanup removes files of finished bookings (the server does it daily; see `UPLOAD_RETENTION_DAYS`).

## 4. Security (2 minutes)
- [ ] Admin -> Access Management: remove anyone who no longer works with you.
- [ ] Nobody has the admin password who shouldn't. Change it if unsure.
- [ ] Render -> Environment: no secrets were changed or added by someone else.

## 5. Dates to remember
- [ ] **Brevo API key** expires **Oct 5, 2027** (and after 90 days of no use). Renew in Brevo, then update `BREVO_API_KEY` in Render.
- [ ] If the system gets no bookings for ~3 months, test email sending.

## If something is wrong
| Problem | First thing to try |
|---|---|
| Site very slow on first visit | Server was asleep. Check that UptimeRobot is Up. |
| "Internal server error" | Render -> Logs. Copy the last lines and the `request_id`. |
| Customers cannot upload ID or proof | Supabase project paused: restore it. |
| Emails not arriving | Check spam; Brevo -> Logs; key or sender problem. |
| Can't sign in | Wait 15 minutes if you hit 5 wrong tries; otherwise reset the admin password. |

## Time to upgrade? (any of these)
- Render hours near 750, or customers complain about slow loading -> Render Starter (about $7/month).
- Supabase keeps pausing -> Supabase Pro.
- Emails land in spam -> buy a domain and authenticate it in Brevo.
- Real paying business on Vercel Hobby -> Vercel Pro (Hobby is non-commercial).
