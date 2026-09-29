import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";
import { db } from "./lib/db.js";
import { authenticate, requireStaffCsrf } from "./lib/auth.js";
import { purgeOldAuditLogs } from "./jobs/auditRetention.js";
import { checkOverdueBookings } from "./jobs/overdueCheck.js";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import bookingsRoutes from "./routes/bookings.js";
import reportsRoutes from "./routes/reports.js";
import inventoryRoutes from "./routes/inventory.js";
import calendarRoutes from "./routes/calendar.js";
import invoiceBrandingRoutes from "./routes/invoiceBranding.js";
import paymentsRoutes from "./routes/payments.js";
import customersRoutes from "./routes/customers.js";
import maintenanceRoutes from "./routes/maintenance.js";
import settingsRoutes from "./routes/settings.js";
import notificationsRoutes from "./routes/notifications.js";

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = String(process.env.APP_ORIGINS || process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",").map(x => x.trim()).filter(Boolean);

if (isProduction) {
  if ((process.env.JWT_SECRET || "").length < 64) throw new Error("JWT_SECRET must be at least 64 characters in production.");
  if ((process.env.CSRF_SECRET || "").length < 64) throw new Error("CSRF_SECRET must be at least 64 characters in production.");
  if (!allowedOrigins.length || allowedOrigins.some(x => !x.startsWith("https://"))) {
    throw new Error("Production APP_ORIGINS must use HTTPS.");
  }
}

app.disable("x-powered-by");
app.set("trust proxy", Number(process.env.TRUST_PROXY || (isProduction ? 1 : 0)));
app.use(helmet({
  crossOriginResourcePolicy: { policy: "same-site" },
  referrerPolicy: { policy: "no-referrer" },
  // Rental item images are pasted in as external URLs, so allow images from any
  // HTTPS host (plus same-origin and data: URIs). Everything else keeps helmet's
  // strict defaults: scripts/styles/fetch stay locked to 'self'.
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "img-src": ["'self'", "data:", "blob:", "https:"]
    }
  }
}));
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Vite moves to 5174, 5175... when 5173 is busy, so in development accept
    // any localhost port instead of failing with "Cannot reach the server".
    if (!isProduction && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET","POST","PATCH","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","X-CSRF-Token"]
}));
app.use(compression());
app.use(cookieParser());
app.use(express.json({limit:"200kb"}));

// An object `message` makes express-rate-limit reply with JSON, so the client
// can surface the real reason instead of a generic "Request failed".
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_GLOBAL || (isProduction ? 1200 : 5000)),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many requests from this device. Please wait a minute and try again." }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_AUTH || 10),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many sign-in attempts. Wait 15 minutes, then try again." }
});

app.use("/api", globalLimiter);
app.use("/api/auth/login", authLimiter);

app.get("/api/health", async (_req,res) => {
  await db.query("SELECT 1");
  db.query("DELETE FROM revoked_tokens WHERE expires_at<=NOW()").catch(()=>{});
  res.json({ok:true});
});

app.use(authRoutes);

app.use("/api/users", authenticate, requireStaffCsrf);
app.use("/api/access", authenticate, requireStaffCsrf);
app.use("/api/admin", authenticate, requireStaffCsrf);
app.use("/api/notifications", authenticate, requireStaffCsrf);

app.use(usersRoutes);
app.use(bookingsRoutes);
app.use(reportsRoutes);
app.use(inventoryRoutes);
app.use(calendarRoutes);
app.use(invoiceBrandingRoutes);
app.use(paymentsRoutes);
app.use(customersRoutes);
app.use(maintenanceRoutes);
app.use(settingsRoutes);
app.use(notificationsRoutes);

setInterval(checkOverdueBookings, 60 * 60 * 1000);
setTimeout(checkOverdueBookings, 5000);

setInterval(purgeOldAuditLogs, 24 * 60 * 60 * 1000);
setTimeout(purgeOldAuditLogs, 15000);

// Unknown /api path -> JSON 404 (not Express's default HTML, which the client
// cannot parse and reports as "Request failed").
app.use("/api", (req,res) => {
  res.status(404).json({message:`No such endpoint: ${req.method} ${req.originalUrl}`});
});

// Serve the built SPA and fall back to index.html for client-side routes
// (/admin, /account, /rentals/:id ...) so deep links and refreshes work.
// Skipped automatically when ../dist has not been built (e.g. API-only deploys).
const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (fs.existsSync(path.join(clientDist, "index.html"))) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Error handler must be registered last so every route is covered.
app.use((err,req,res,_next) => {
  const requestId=crypto.randomUUID();
  console.error(`[${requestId}]`,err);
  const status=Number(err.statusCode||err.status)||500;
  const message=status<500 ? (err.message||"Request could not be completed.") : "Internal server error.";
  res.status(status).json({message,request_id:requestId});
});

const port = Number(process.env.PORT || 4000);
const httpServer=app.listen(port,()=>console.log(`Bloom&Borrow API running on port ${port} (${process.env.NODE_ENV || "development"})`));

async function shutdown(signal){
  console.log(`${signal}: shutting down safely...`);
  httpServer.close(async ()=>{
    try{await db.end()}catch{}
    process.exit(0);
  });
  setTimeout(()=>process.exit(1),10000).unref();
}
process.on("SIGTERM",()=>shutdown("SIGTERM"));
process.on("SIGINT",()=>shutdown("SIGINT"));
