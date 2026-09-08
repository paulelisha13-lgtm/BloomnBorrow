# Deployment guide

## 1. Prepare services

Deploy the React customer site as static files and deploy the Express API on a server that can reach MySQL. Assign HTTPS domains, for example:

- Customer site: `https://rent.example.com`
- API: `https://api.example.com`

Create a production MySQL database and a non-root application user with a strong password. Enable automated backups and SSL.

## 2. Configure the API

On the API host, copy `server/.env.production.example` to `server/.env` and replace every example value. Set `APP_ORIGINS` and `CLIENT_ORIGIN` to your customer-site URL. Do not commit this file.

From the `server` directory, run:

```bash
npm ci
npm run security:check
npm run migrate
npm run bootstrap-admin
npm run preflight
npm run start:production
```

`bootstrap-admin` is interactive unless the initial-admin variables are supplied. Remove those variables after it completes. Use a process manager or your platform's service configuration to keep the API running.

## 3. Configure and deploy the customer site

Create a root `.env.production` file using `.env.production.example` as a template:

```env
VITE_API_URL=https://api.example.com/api
```

Then build and deploy the generated `dist` folder:

```bash
npm ci
npm run build
```

If the frontend and API use different domains, the API's `APP_ORIGINS` value must exactly match the frontend origin.

## 4. Go-live verification

1. Open `https://api.example.com/api/health`; it must return `{"ok":true}`.
2. Open the customer site and verify rental inventory loads.
3. Test a guest booking with cash and GCash.
4. Confirm an admin can log in, approve the booking, and record a payment.
5. Confirm MySQL backups and monitoring are active.
