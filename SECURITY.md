# Security checklist

## Before deployment

- Keep `.env`, `.env.production`, database backups, and API keys outside version control.
- Use different, randomly generated `JWT_SECRET` and `CSRF_SECRET` values of at least 64 characters.
- Use a dedicated MySQL user; do not use `root` in production.
- Limit that MySQL user's permissions to the Bloom&Borrow database.
- Set `DB_SSL=true` for a remote MySQL database and use its CA certificate when your provider supplies one.
- Set `APP_ORIGINS` and `CLIENT_ORIGIN` to the exact HTTPS customer-site URL. Do not use a wildcard.
- Set `TRUST_PROXY=1` only when the API is behind one trusted reverse proxy.
- Run `npm run bootstrap-admin` once, then remove every `INITIAL_ADMIN_*` environment value.
- Rotate any password or secret that was ever committed, copied into chat, or shared outside your deployment host.

## Operational controls

- Enable automatic daily database backups and regularly test a restore.
- Use HTTPS for both the customer site and API.
- Monitor the API health endpoint at `/api/health`.
- Restrict access to the database network so only the API host can connect.
- Apply dependency updates regularly and run `npm audit --omit=dev` for both the client and server.

## Included safeguards

The API uses security headers, CORS origin allowlisting, rate limits, bcrypt password hashing, HTTP-only secure cookies in production, CSRF checks for state-changing authenticated requests, and database transactions for guest booking availability.
