import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

export const STAFF_COOKIE = "bloom_borrow_staff_session";
export const STAFF_CSRF_COOKIE = "bloom_borrow_staff_csrf";

function secret() {
  const value = process.env.JWT_SECRET;
  const minimum = process.env.NODE_ENV === "production" ? 64 : 32;
  if (!value || value.length < minimum) {
    throw new Error(`JWT_SECRET must be at least ${minimum} characters.`);
  }
  return value;
}

function csrfSecret() {
  const value = process.env.CSRF_SECRET || process.env.JWT_SECRET;
  const minimum = process.env.NODE_ENV === "production" ? 64 : 32;
  if (!value || value.length < minimum) {
    throw new Error(`CSRF_SECRET must be at least ${minimum} characters.`);
  }
  return value;
}

export function signToken(user) {
  const jti = crypto.randomUUID();
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, type: "staff" },
    secret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || "1h", jwtid: jti }
  );
}

export function csrfForJti(jti) {
  const mac = crypto.createHmac("sha256", csrfSecret()).update(jti).digest("hex");
  return `${jti}.${mac}`;
}

export function verifyCsrfValue(value, jti) {
  if (!value || !jti) return false;
  const expected = csrfForJti(jti);
  const a = Buffer.from(String(value));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function setStaffSession(res, token) {
  const payload = jwt.decode(token);
  const secure = process.env.NODE_ENV === "production";
  res.cookie(STAFF_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(1, payload.exp * 1000 - Date.now())
  });
  res.cookie(STAFF_CSRF_COOKIE, csrfForJti(payload.jti), {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(1, payload.exp * 1000 - Date.now())
  });
}

export function clearStaffSession(res) {
  const secure = process.env.NODE_ENV === "production";
  for (const name of [STAFF_COOKIE, STAFF_CSRF_COOKIE]) {
    res.clearCookie(name, { secure, sameSite: "lax", path: "/" });
  }
}

function tokenHash(jti) {
  return crypto.createHash("sha256").update(String(jti)).digest("hex");
}

export async function revokeJti(jti, exp) {
  if (!jti || !exp) return;
  await db.query(
    `INSERT INTO revoked_tokens(token_hash, expires_at)
     VALUES(?, FROM_UNIXTIME(?))
     ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at)`,
    [tokenHash(jti), exp]
  );
}

async function isRevoked(jti) {
  const [[row]] = await db.query(
    "SELECT id FROM revoked_tokens WHERE token_hash=? AND expires_at>NOW() LIMIT 1",
    [tokenHash(jti)]
  );
  return Boolean(row);
}

export async function authenticate(req, res, next) {
  try {
    const cookieToken = req.cookies?.[STAFF_COOKIE];
    const raw = req.headers.authorization || "";
    const bearer = raw.startsWith("Bearer ") ? raw.slice(7) : null;
    const allowBearer = process.env.NODE_ENV !== "production";
    const token = cookieToken || (allowBearer ? bearer : null);

    if (!token) return res.status(401).json({ message: "Authentication required." });

    const payload = jwt.verify(token, secret(), { algorithms: ["HS256"] });
    if (payload.type !== "staff" || await isRevoked(payload.jti)) {
      return res.status(401).json({ message: "Session is no longer valid." });
    }

    const [rows] = await db.query(
      "SELECT id, full_name, email, phone, role, status FROM users WHERE id=? LIMIT 1",
      [payload.sub]
    );
    const user = rows[0];
    if (!user || user.status !== "active") {
      return res.status(401).json({ message: "Account is unavailable." });
    }

    req.user = user;
    req.authPayload = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session." });
  }
}

export function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(req.user?.role)
      ? next()
      : res.status(403).json({ message: "You do not have permission to access this resource." });
}

export function requireStaffCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const value = req.get("x-csrf-token");
  if (!verifyCsrfValue(value, req.authPayload?.jti)) {
    return res.status(403).json({ message: "Security token validation failed. Refresh and try again." });
  }
  next();
}