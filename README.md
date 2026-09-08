# Bloom&Borrow — Complete Rental Management System

This build completes the end-to-end rental workflow using React + Express + MySQL.

## Customer Website
- Browse live rental inventory from MySQL
- Guest checkout (no account required)
- Date + quantity availability engine
- Overbooking protection with MySQL transaction/row lock
- Delivery or pickup
- Cash / GCash selection
- Automatic booking number
- Booking tracking by booking number + email

## Admin
- Live dashboard
- Full inventory CRUD
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
Copy `server/.env.example` to `server/.env`.

Set:
```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=YOUR_MYSQL_USER
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=bloom_borrow
JWT_SECRET=use-a-long-random-secret-at-least-32-characters
JWT_EXPIRES_IN=8h
```

### 2. Create a local database and start the API
```bash
cd server
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
`http://localhost:5173/access/login`

Seeded Admin:
- Local-development sign-in details printed once by `npm run seed`

Save the printed password immediately. Later seed runs preserve the existing admin password. Do not use seed data in production.

## Recommended test flow
1. Admin creates/edits inventory.
2. Customer browses `/rentals`.
3. Customer adds an item and completes Guest Checkout.
4. Admin opens `/admin/bookings`.
5. Approve → Ready.
6. Admin records payments.
7. Record return inspection.
8. Enter damage/late charges if needed.
9. Complete rental and record deposit refund.
10. Review reports and maintenance.

## Production notes
This is a complete functional foundation. Before a public production launch, add your real payment gateway, email/SMS provider, persistent image storage, HTTPS deployment secrets, automated backups, and integration tests.


## App.jsx hotfix
Fixed the malformed multiline JavaScript string in the Admin Booking Management functions.


## Customer Account Fix
The previous "Create account" and "Sign in" buttons were UI placeholders only. This build adds a real optional customer account module.

New endpoints:
- `POST /api/customer-auth/register`
- `POST /api/customer-auth/login`
- `GET /api/customer-account/me`
- saved-address and favorites endpoints

New tables:
- `customer_accounts`
- `customer_saved_addresses`
- `customer_favorites`

For local development, run `npm run seed` again from `server` so the new tables are created. Do not run it in production.


# Production release

For real operation, do not run `npm run seed`.

Use:

```bash
cd server
npm ci
npm run security:check
npm run migrate
npm run bootstrap-admin
npm run preflight
npm run start:production
```

Read [SECURITY.md](SECURITY.md) and [DEPLOYMENT.md](DEPLOYMENT.md) before launch. The frontend must also be built with a production `VITE_API_URL`; see the deployment guide.
