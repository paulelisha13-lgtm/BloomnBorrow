import crypto from "crypto";

const DEFAULT_TTL_HOURS = 7 * 24;
const MAX_TTL_HOURS = 30 * 24;

function linkSecret() {
  const value = process.env.BOOKING_LINK_SECRET || (process.env.NODE_ENV === "production" ? "" : process.env.JWT_SECRET);
  const minimum = process.env.NODE_ENV === "production" ? 64 : 32;
  if (!value || value.length < minimum) {
    throw new Error(`BOOKING_LINK_SECRET must be at least ${minimum} characters.`);
  }
  return crypto.createHash("sha256").update(`booking-link:${value}`).digest();
}

function ttlHours() {
  const configured = Number(process.env.BOOKING_LINK_TTL_HOURS || DEFAULT_TTL_HOURS);
  if (!Number.isFinite(configured)) return DEFAULT_TTL_HOURS;
  return Math.min(MAX_TTL_HOURS, Math.max(1, configured));
}

// AES-GCM keeps the booking id private and authenticates the entire payload.
// A changed, truncated, or fabricated token will always fail verification.
export function createBookingAccessToken(bookingId, now = Date.now()) {
  const id = Number(bookingId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("A valid booking ID is required.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", linkSecret(), iv);
  const payload = JSON.stringify({ booking_id:id, expires_at:now + ttlHours() * 60 * 60 * 1000 });
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return [iv, encrypted, cipher.getAuthTag()].map(value => value.toString("base64url")).join(".");
}

export function verifyBookingAccessToken(token, now = Date.now()) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    if (parts.some(value => !/^[A-Za-z0-9_-]+$/.test(value))) return null;
    const decoded = parts.map(value => Buffer.from(value, "base64url"));
    // Node's decoder accepts non-canonical Base64URL aliases. Re-encoding each
    // segment ensures that even a changed unused trailing bit is rejected.
    if (decoded.some((value, index) => value.toString("base64url") !== parts[index])) return null;
    const [iv, encrypted, tag] = decoded;
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", linkSecret(), iv);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
    const bookingId = Number(payload.booking_id);
    if (!Number.isInteger(bookingId) || bookingId <= 0 || !Number.isFinite(payload.expires_at) || payload.expires_at <= now) return null;
    return { bookingId, expiresAt:payload.expires_at };
  } catch {
    return null;
  }
}

export function bookingStatusUrl(bookingId) {
  const origin = String(process.env.PUBLIC_APP_URL || process.env.CLIENT_ORIGIN || process.env.APP_ORIGINS || "")
    .split(",")[0].trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(origin)) return "";
  // Keep the token in the URL fragment. Browsers do not send fragments in
  // HTTP requests, so the hosting server and ordinary access logs never see it.
  return `${origin}/shop/status#access=${encodeURIComponent(createBookingAccessToken(bookingId))}`;
}
