# Bloom&Borrow — Inventory Management System

An admin-only inventory and rental management system built with React + Express + MySQL.
There is no public customer website: every page requires an admin sign-in, and
bookings are entered by staff from **Add Booking**.

## Admin
- Live dashboard
- Full inventory CRUD
- Manual booking entry with date + quantity availability check
- Overbooking protection with MySQL transaction/row lock
- Booking approval / rejection / cancellation
- Reschedule / extend booking
- Ready / Rented / Returned / Completed workflow
- Payment recording
- Return inspection
- Late fee + damage charge
- Deposit refund calculation
- Customer management
- Reports
- Maintenance
- Business settings
- Admin access management

## Project structure

```
BloomnBorrow/
├── index.html, package.json      Frontend (Vite + React) entry and dependencies
├── src/
│   ├── main.jsx                  Mounts the app
│   ├── App.jsx                   All routes (which page each URL shows, and who may open it)
│   ├── pages/                    One file per screen: Dashboard, Inventory, Bookings, AddBooking,
│   │                             Customers, Payments, Calendar, Maintenance, Reports, Settings,
│   │                             AccessManagement, AuditLog, AccountSettings, Login
│   ├── components/               Shared UI (Kpi, SortControls, ViewToggle, ProtectedRoute, ...)
│   │   └── layout/               Admin shell: sidebar, top bar search, notifications, profile menu
│   ├── hooks/                    useSort, useViewMode
│   ├── lib/                      api.js (server calls), format.js, invoice.js, roles.js
│   ├── assets/                   logo.png
│   └── styles.css
├── backend/
│   ├── server.js                 API entry: security middleware, mounts routes/, starts jobs/
│   ├── routes/                   One file per area: auth, users, bookings, inventory, customers,
│   │                             payments, calendar, maintenance, reports, settings, notifications
│   ├── lib/                      db, auth, validate, audit, dates, bookings, settings, ...
│   ├── jobs/                     Background tasks: overdue check (hourly), audit-log cleanup (daily)
│   ├── scripts/                  Command-line tools run with npm (migrate, seed, reset-password, ...)
│   ├── migrations/               Database changes, applied in order by `npm run migrate`
│   └── schema.sql                Base database schema
└── docs/                         DEPLOYMENT.md, SECURITY.md, brand/ (full-size logo)
```

Useful server commands (run inside `backend/`):

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API and restart it on file changes |
| `npm run migrate` | Create/update database tables (safe to re-run) |
| `npm run reset-password -- <email> <newPassword>` | Set a new password for a staff/admin account and clear any lock |

## Tests

```bash
npm test          # from the project root: frontend helpers + server unit tests (no database needed)
```

The API test suite runs the real workflow (bookings, late fees, payments/voids, staff vs admin
permissions) against a running server and database. It is skipped unless you give it an admin login,
and it deletes everything it creates (all test records use `e2e-*@example.com` emails):

```bash
cd backend
BB_TEST_ADMIN_EMAIL=you@example.com BB_TEST_ADMIN_PASSWORD='...' npm run test:api
```

## Main database tables
- users
- rental_items
- customers
- bookings
- booking_items
- booking_status_history
- payments
- return_inspections
- maintenance_records
- notifications
- business_settings
- access_audit_logs

## Setup

### 1. Backend environment
Copy `backend/.env.example` to `backend/.env`.

Set:
```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
APP_ORIGINS=http://localhost:5173
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=YOUR_MYSQL_USER
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=bloom_borrow
JWT_SECRET=use-a-long-random-secret-at-least-32-characters
CSRF_SECRET=use-a-different-long-random-secret-at-least-32-characters
BOOKING_LINK_SECRET=use-a-third-different-long-random-secret-at-least-32-characters
BOOKING_LINK_TTL_HOURS=168
JWT_EXPIRES_IN=8h
```

`BOOKING_LINK_SECRET` encrypts the private booking links sent by email. Links expire
after `BOOKING_LINK_TTL_HOURS` (seven days by default). Never commit real secrets.

To send automatic booking-status updates, payment-review decisions, invoices, and approved GCash payment instructions, also set:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-business-account@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM_NAME=Bloom & Borrow
```
`SMTP_HOST`/`SMTP_PORT` default to Gmail's SMTP server if left unset, so with a Gmail
address you only need `SMTP_USER`/`SMTP_PASS`. `SMTP_PASS` is not your Gmail login
password — turn on 2-Step Verification on the Gmail account, then generate an App
Password at https://myaccount.google.com/apppasswords and use that instead. To send
through a different provider (SendGrid, Amazon SES, a relay, ...), set `SMTP_HOST`/
`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` to that provider's values. Without `SMTP_USER`/
`SMTP_PASS` set, booking changes still succeed, but automatic emails are logged as failed and Admin sees a warning. Manual invoice and GCash email actions return an error instead of sending mail.

### 2. Create a local database and start the API
```bash
cd backend
npm install
npm run seed
npm run dev
```

### 3. Frontend
Open a second terminal:
```bash
npm install
npm run dev
```

### 4. Login
`http://localhost:5173` (redirects to the sign-in page)

Seeded Admin:
- Local-development sign-in details printed once by `npm run seed`

Save the printed password immediately. Later seed runs preserve the existing admin password. Do not use seed data in production.

## Recommended test flow
1. Admin creates/edits inventory.
2. Admin opens **Add Booking** (`/admin/bookings/new`) and enters the customer's booking.
3. Admin opens `/admin/bookings`.
4. Approve → Ready.
5. Admin records payments.
6. Record return inspection.
7. Enter damage/late charges if needed.
8. Complete rental and record deposit refund.
9. Review reports and maintenance.

## Production notes
This is a complete functional foundation. Before a public production launch, add your real payment gateway, email/SMS provider, persistent image storage, HTTPS deployment secrets, automated backups, and integration tests.


# Production release

For real operation, do not run `npm run seed`.

Use:

```bash
cd backend
npm ci
npm run security:check
npm run migrate
npm run bootstrap-admin
npm run preflight
npm run start:production
```

Read [docs/SECURITY.md](docs/SECURITY.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before launch. The frontend must also be built with a production `VITE_API_URL`; see the deployment guide.
