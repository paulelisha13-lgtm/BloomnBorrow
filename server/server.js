import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "dotenv/config";
import { db } from "./db.js";
import { authenticate, requireRole, signToken, setStaffSession, clearStaffSession, revokeJti, requireStaffCsrf, csrfForJti, verifyCsrfValue } from "./auth.js";
import { schemas, parseBody } from "./validate.js";

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
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_BOOKING || 30),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many booking submissions from this network. Please try again later." }
});

app.use("/api", globalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/bookings/guest", bookingLimiter);

async function audit(req, action, targetUserId=null, details=null) {
  try {
    await db.query(
      "INSERT INTO access_audit_logs(user_id,action,target_user_id,ip_address,user_agent,details) VALUES(?,?,?,?,?,?)",
      [req.user?.id || null, action, targetUserId, req.ip, req.get("user-agent")?.slice(0,255) || null, details ? JSON.stringify(details) : null]
    );
  } catch {}
}

app.get("/api/health", async (_req,res) => {
  await db.query("SELECT 1");
  db.query("DELETE FROM revoked_tokens WHERE expires_at<=NOW()").catch(()=>{});
  res.json({ok:true});
});

app.get("/api/settings/public", async (_req,res) => {
  const deliveryFee = Number(await getSetting("delivery_fee", "300"));
  const lateFeePerDay = Number(await getSetting("late_fee_per_day", "250"));
  res.json({delivery_fee:deliveryFee,late_fee_per_day:lateFeePerDay});
});

app.post("/api/auth/login", parseBody(schemas.staffLogin), async (req,res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const [rows] = await db.query("SELECT * FROM users WHERE email=? LIMIT 1",[email]);
  const user = rows[0];
  if (!user) return res.status(401).json({message:"Invalid email or password."});
  if (user.status !== "active") return res.status(403).json({message:"This account is disabled."});
  if (user.locked_until && new Date(user.locked_until) > new Date()) return res.status(423).json({message:"Account is temporarily locked. Try again later."});

  const ok = await bcrypt.compare(password,user.password_hash);
  if (!ok) {
    const attempts = Number(user.failed_login_attempts || 0) + 1;
    if (attempts >= 5) {
      await db.query("UPDATE users SET failed_login_attempts=0,locked_until=DATE_ADD(NOW(),INTERVAL 15 MINUTE) WHERE id=?",[user.id]);
      return res.status(423).json({message:"Too many failed attempts. Account locked for 15 minutes."});
    }
    await db.query("UPDATE users SET failed_login_attempts=? WHERE id=?",[attempts,user.id]);
    return res.status(401).json({message:"Invalid email or password."});
  }

  await db.query("UPDATE users SET failed_login_attempts=0,locked_until=NULL,last_login_at=NOW() WHERE id=?",[user.id]);
  const token = signToken(user);
  setStaffSession(res, token);
  req.user = user;
  await audit(req,"LOGIN_SUCCESS");
  res.json({user:{id:user.id,full_name:user.full_name,email:user.email,phone:user.phone,role:user.role,status:user.status}});
});

app.get("/api/auth/me", authenticate, async (req,res) => res.json({user:req.user}));

app.patch("/api/auth/profile", authenticate, requireStaffCsrf, parseBody(schemas.updateProfile), async (req,res) => {
  const fullName = req.body.full_name;
  const email = req.body.email;
  const phone = req.body.phone;
  const [duplicate] = await db.query("SELECT id FROM users WHERE email=? AND id<>? LIMIT 1",[email,req.user.id]);
  if (duplicate.length) return res.status(409).json({message:"That email address is already assigned to another staff account."});
  await db.query("UPDATE users SET full_name=?,email=?,phone=? WHERE id=?",[fullName,email,phone||null,req.user.id]);
  const [[user]] = await db.query("SELECT id,full_name,email,phone,role,status FROM users WHERE id=?",[req.user.id]);
  await audit(req,"UPDATE_OWN_PROFILE");
  res.json({user});
});

app.use("/api/users", authenticate, requireStaffCsrf);
app.use("/api/access", authenticate, requireStaffCsrf);
app.use("/api/admin", authenticate, requireStaffCsrf);
app.use("/api/notifications", authenticate, requireStaffCsrf);

app.post("/api/auth/logout", authenticate, requireStaffCsrf, async (req,res) => {
  await revokeJti(req.authPayload?.jti, req.authPayload?.exp);
  clearStaffSession(res);
  await audit(req,"LOGOUT");
  res.json({ok:true});
});

app.patch("/api/auth/change-password", authenticate, requireStaffCsrf, parseBody(schemas.changePassword), async (req,res) => {
  const current = req.body.current_password;
  const next = req.body.new_password;
  const [[row]] = await db.query("SELECT password_hash FROM users WHERE id=?",[req.user.id]);
  if (!await bcrypt.compare(current,row.password_hash)) return res.status(400).json({message:"Current password is incorrect."});
  const hash = await bcrypt.hash(next,12);
  await db.query("UPDATE users SET password_hash=?,password_changed_at=NOW() WHERE id=?",[hash,req.user.id]);
  await audit(req,"CHANGE_PASSWORD");
  res.json({ok:true});
});

app.get("/api/users", authenticate, requireRole("admin"), async (req,res) => {
  const [users] = await db.query("SELECT id,full_name,email,phone,role,status,last_login_at,created_at FROM users ORDER BY created_at DESC");
  res.json({users});
});

app.post("/api/users", authenticate, requireRole("admin"), parseBody(schemas.createUser), async (req,res) => {
  const {full_name,phone,role} = req.body;
  const email = req.body.email;
  const password = req.body.password;
  const hash = await bcrypt.hash(password,12);
  try {
    const [result] = await db.query("INSERT INTO users(full_name,email,phone,password_hash,role,status,password_changed_at) VALUES(?,?,?,?,?,'active',NOW())",[full_name,email,phone||null,hash,role]);
    await audit(req,"CREATE_USER",result.insertId,{role,email});
    res.status(201).json({id:result.insertId});
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({message:"That email address is already in use."});
    throw e;
  }
});

app.patch("/api/users/:id/status", authenticate, requireRole("admin"), async (req,res) => {
  const id = Number(req.params.id);
  const status = req.body.status;
  if (!["active","disabled"].includes(status)) return res.status(400).json({message:"Invalid status."});
  if (id === req.user.id && status === "disabled") return res.status(400).json({message:"You cannot disable your own account."});
  await db.query("UPDATE users SET status=? WHERE id=?",[status,id]);
  await audit(req,"CHANGE_USER_STATUS",id,{status});
  res.json({ok:true});
});

app.patch("/api/users/:id/reset-password", authenticate, requireRole("admin"), async (req,res) => {
  const id = Number(req.params.id);
  const password = String(req.body.password || "");
  if (password.length < 8) return res.status(400).json({message:"Password must be at least 8 characters."});
  const hash = await bcrypt.hash(password,12);
  await db.query("UPDATE users SET password_hash=?,password_changed_at=NOW(),failed_login_attempts=0,locked_until=NULL WHERE id=?",[hash,id]);
  await audit(req,"RESET_PASSWORD",id);
  res.json({ok:true});
});

app.get("/api/access/audit", authenticate, requireRole("admin"), async (_req,res) => {
  const [logs] = await db.query(`
    SELECT l.id,l.action,l.target_user_id,l.ip_address,l.created_at,u.full_name AS actor_name
    FROM access_audit_logs l LEFT JOIN users u ON u.id=l.user_id
    ORDER BY l.created_at DESC LIMIT 200
  `);
  res.json({logs});
});


function parseDateOnly(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rentalDays(startDate, endDate) {
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
}

async function getAvailability(conn, itemId, startDate, endDate) {
  const [[item]] = await conn.query(
    "SELECT id,name,total_quantity,status FROM rental_items WHERE id=? LIMIT 1",
    [itemId]
  );
  if (!item || item.status !== "active") return { item, available_quantity: 0, reserved_quantity: 0 };

  const [[reserved]] = await conn.query(`
    SELECT COALESCE(SUM(bi.quantity),0) AS reserved_quantity
    FROM booking_items bi
    INNER JOIN bookings b ON b.id=bi.booking_id
    WHERE bi.rental_item_id=?
      AND b.status IN ('pending','confirmed','ready','rented','overdue')
      AND b.start_date <= ?
      AND b.end_date >= ?
  `,[itemId,endDate,startDate]);

  const reservedQty = Number(reserved.reserved_quantity || 0);
  return {
    item,
    reserved_quantity: reservedQty,
    available_quantity: Math.max(0, Number(item.total_quantity) - reservedQty)
  };
}

app.get("/api/rentals", async (_req,res) => {
  const [rows] = await db.query(`
    SELECT r.id,r.sku,r.name,r.category,r.description,r.daily_price,r.security_deposit,r.total_quantity,r.status,r.image_url,
      COALESCE((SELECT SUM(bi.quantity) FROM booking_items bi JOIN bookings b ON b.id=bi.booking_id
        WHERE bi.rental_item_id=r.id AND b.status IN ('pending','confirmed','ready','rented','overdue')
          AND b.end_date >= CURDATE()),0) AS reserved
    FROM rental_items r WHERE r.status='active' ORDER BY r.id
  `);
  res.json({items:rows});
});

app.post("/api/availability/check", async (req,res) => {
  const start = parseDateOnly(req.body.start_date);
  const end = parseDateOnly(req.body.end_date);
  const requested = Array.isArray(req.body.items) ? req.body.items : [];
  if (!start || !end || end < start) return res.status(400).json({message:"A valid rental start and end date are required."});
  if (!requested.length) return res.status(400).json({message:"At least one rental item is required."});

  const checks = [];
  for (const row of requested) {
    const itemId = Number(row.item_id);
    const quantity = Math.max(1, Number(row.quantity || 1));
    const availability = await getAvailability(db,itemId,req.body.start_date,req.body.end_date);
    checks.push({
      item_id:itemId,
      item_name:availability.item?.name || "Unknown item",
      requested_quantity:quantity,
      available_quantity:availability.available_quantity,
      available:Boolean(availability.item && availability.available_quantity >= quantity)
    });
  }
  res.json({available:checks.every(x=>x.available),items:checks});
});

app.post("/api/bookings/guest", parseBody(schemas.guestBooking), async (req,res,next) => {
  const conn = await db.getConnection();
  try {
    const start = parseDateOnly(req.body.start_date);
    const end = parseDateOnly(req.body.end_date);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const fullName = String(req.body.full_name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const city = String(req.body.city || "").trim();
    const address = String(req.body.address || "").trim();
    const fulfillment = req.body.fulfillment === "pickup" ? "pickup" : "delivery";
    const paymentMethod = ["cash","gcash","bank_transfer","other"].includes(req.body.payment_method) ? req.body.payment_method : "cash";

    if (!fullName || !email || !phone || !start || !end || end < start || !items.length) {
      return res.status(400).json({message:"Complete contact details, dates, and at least one item are required."});
    }
    if (fulfillment === "delivery" && !address) return res.status(400).json({message:"Delivery address is required."});

    const days = rentalDays(start,end);
    await conn.beginTransaction();
    const normalized = [];
    let rentalSubtotal = 0;
    let depositTotal = 0;

    for (const row of items) {
      const itemId = Number(row.item_id);
      const quantity = Math.max(1,Number(row.quantity || 1));
      const [[item]] = await conn.query(`
        SELECT id,name,daily_price,security_deposit,total_quantity,status
        FROM rental_items WHERE id=? FOR UPDATE
      `,[itemId]);

      if (!item || item.status !== "active") {
        const error = new Error("One of the selected rental items is unavailable.");
        error.statusCode = 409;
        throw error;
      }

      const availability = await getAvailability(conn,itemId,req.body.start_date,req.body.end_date);
      if (availability.available_quantity < quantity) {
        const error = new Error(`${item.name} only has ${availability.available_quantity} available for the selected dates.`);
        error.statusCode = 409;
        error.availability = {item_id:itemId,item_name:item.name,available_quantity:availability.available_quantity,requested_quantity:quantity};
        throw error;
      }

      const dailyPrice = Number(item.daily_price);
      const deposit = Number(item.security_deposit);
      const lineRental = dailyPrice * quantity * days;
      const lineDeposit = deposit * quantity;
      rentalSubtotal += lineRental;
      depositTotal += lineDeposit;
      normalized.push({item,quantity,lineRental,lineDeposit,dailyPrice,deposit});
    }

    const [existingCustomer] = await conn.query("SELECT id FROM customers WHERE email=? LIMIT 1",[email]);
    let customerId;
    if (existingCustomer[0]) {
      customerId = existingCustomer[0].id;
      await conn.query("UPDATE customers SET full_name=?,phone=?,city=?,address=?,status='active' WHERE id=?",[fullName,phone,city||null,address||null,customerId]);
    } else {
      const [customerResult] = await conn.query("INSERT INTO customers(full_name,email,phone,city,address,status) VALUES(?,?,?,?,?,'active')",[fullName,email,phone,city||null,address||null]);
      customerId = customerResult.insertId;
    }

    const deliveryFeeSetting = Number(await getSetting("delivery_fee", "300"));
    const deliveryFee = fulfillment === "delivery" ? deliveryFeeSetting : 0;
    const grandTotal = rentalSubtotal + depositTotal + deliveryFee;

    const [bookingResult] = await conn.query(`
      INSERT INTO bookings
        (customer_id,customer_name,customer_email,customer_phone,city,delivery_address,start_date,end_date,
         fulfillment,payment_method,payment_status,status,rental_subtotal,deposit_total,delivery_fee,grand_total)
      VALUES (?,?,?,?,?,?,?,?,?,?,'unpaid','pending',?,?,?,?)
    `,[customerId,fullName,email,phone,city||null,address||null,req.body.start_date,req.body.end_date,
       fulfillment,paymentMethod,rentalSubtotal,depositTotal,deliveryFee,grandTotal]);

    const bookingId = bookingResult.insertId;
    const bookingNo = `RF-${String(bookingId).padStart(6,"0")}`;
    await conn.query("UPDATE bookings SET booking_no=? WHERE id=?",[bookingNo,bookingId]);

    for (const row of normalized) {
      await conn.query(`
        INSERT INTO booking_items
          (booking_id,rental_item_id,item_name,quantity,daily_price,security_deposit,rental_days,line_rental_total,line_deposit_total)
        VALUES (?,?,?,?,?,?,?,?,?)
      `,[bookingId,row.item.id,row.item.name,row.quantity,row.dailyPrice,row.deposit,days,row.lineRental,row.lineDeposit]);
    }

    await conn.query("INSERT INTO booking_status_history(booking_id,from_status,to_status,note) VALUES(?,NULL,'pending','Guest booking submitted')",[bookingId]);
    await conn.commit();

    res.status(201).json({booking:{
      id:bookingId,booking_no:bookingNo,status:"pending",start_date:req.body.start_date,end_date:req.body.end_date,
      rental_days:days,rental_subtotal:rentalSubtotal,deposit_total:depositTotal,delivery_fee:deliveryFee,grand_total:grandTotal,
      payment_method:paymentMethod
    }});
  } catch (error) {
    try { await conn.rollback(); } catch {}
    if (error.statusCode) return res.status(error.statusCode).json({message:error.message,availability:error.availability || null});
    next(error);
  } finally {
    conn.release();
  }
});

app.get("/api/bookings/track", async (req,res) => {
  const bookingNo = String(req.query.booking_no || "").trim().toUpperCase();
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!bookingNo || !email) return res.status(400).json({message:"Booking number and email are required."});

  const [[booking]] = await db.query(`
    SELECT id,booking_no,customer_name,start_date,end_date,fulfillment,payment_status,status,grand_total,created_at
    FROM bookings WHERE booking_no=? AND customer_email=? LIMIT 1
  `,[bookingNo,email]);
  if (!booking) return res.status(404).json({message:"Booking not found. Check the booking number and email."});

  const [items] = await db.query("SELECT item_name,quantity FROM booking_items WHERE booking_id=? ORDER BY id",[booking.id]);
  const [history] = await db.query("SELECT to_status AS status,created_at FROM booking_status_history WHERE booking_id=? ORDER BY created_at",[booking.id]);
  res.json({booking:{...booking,items,history}});
});

app.get("/api/admin/bookings", authenticate, requireRole("admin"), async (_req,res) => {
  const [rows] = await db.query(`
    SELECT b.id,b.booking_no,b.customer_name,b.start_date,b.end_date,b.grand_total,b.status,b.payment_status,
           GROUP_CONCAT(CONCAT(bi.item_name,' × ',bi.quantity) ORDER BY bi.id SEPARATOR ', ') AS items
    FROM bookings b
    LEFT JOIN booking_items bi ON bi.booking_id=b.id
    GROUP BY b.id
    ORDER BY b.created_at DESC
    LIMIT 250
  `);
  res.json({bookings:rows});
});



async function addNotification({userId=null,bookingId=null,type,title,message,channel="in_app"}) {
  await db.query(
    "INSERT INTO notifications(user_id,booking_id,channel,type,title,message,status) VALUES(?,?,?,?,?,?,'sent')",
    [userId,bookingId,channel,type,title,message]
  );
}

async function getSetting(key, fallback=null) {
  const [[row]] = await db.query("SELECT setting_value FROM business_settings WHERE setting_key=?",[key]);
  return row ? row.setting_value : fallback;
}

async function recalcPaymentStatus(bookingId, conn=db) {
  const [[booking]] = await conn.query("SELECT grand_total FROM bookings WHERE id=?",[bookingId]);
  if (!booking) return;
  const [[sum]] = await conn.query(`
    SELECT COALESCE(SUM(CASE WHEN payment_type='refund' THEN -amount ELSE amount END),0) AS net_paid
    FROM payments WHERE booking_id=? AND status='completed'
  `,[bookingId]);
  const paid = Number(sum.net_paid || 0);
  const total = Number(booking.grand_total || 0);
  let status = "unpaid";
  if (paid > 0 && paid < total) status = "partial";
  if (paid >= total) status = "paid";
  if (paid <= 0 && total > 0) status = "refunded";
  await conn.query("UPDATE bookings SET payment_status=? WHERE id=?",[status,bookingId]);
}

async function bookingDetailById(id, conn=db) {
  const [[booking]] = await conn.query("SELECT * FROM bookings WHERE id=? LIMIT 1",[id]);
  if (!booking) return null;
  const [items] = await conn.query("SELECT * FROM booking_items WHERE booking_id=? ORDER BY id",[id]);
  const [history] = await conn.query(`
    SELECT h.*,u.full_name AS changed_by
    FROM booking_status_history h
    LEFT JOIN users u ON u.id=h.changed_by_user_id
    WHERE h.booking_id=? ORDER BY h.created_at
  `,[id]);
  const [payments] = await conn.query("SELECT * FROM payments WHERE booking_id=? ORDER BY created_at DESC",[id]);
  const [[inspection]] = await conn.query("SELECT * FROM return_inspections WHERE booking_id=? LIMIT 1",[id]);
  return {...booking,items,history,payments,inspection:inspection || null};
}

const validTransitions = {
  pending:["confirmed","rejected","cancelled"],
  confirmed:["ready","cancelled"],
  ready:["rented","cancelled"],
  rented:["returned","overdue"],
  overdue:["returned"],
  returned:["completed"],
  completed:[],
  rejected:[],
  cancelled:[]
};

async function checkOverdueBookings() {
  try {
    const [result] = await db.query(`
      UPDATE bookings SET status='overdue'
      WHERE status='rented' AND end_date < CURDATE()
    `);
    if (result.changedRows > 0) {
      console.log(`[OVERDUE CHECK] Auto-transitioned ${result.changedRows} booking(s) to overdue.`);
      const [overdueBookings] = await db.query(`
        SELECT id, booking_no, customer_name, end_date
        FROM bookings WHERE status='overdue' AND updated_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
      `);
      for (const b of overdueBookings) {
        await db.query(
          "INSERT INTO booking_status_history(booking_id,from_status,to_status,note) VALUES(?,'rented','overdue','Auto-detected: rental past due date')",
          [b.id]
        );
        await addNotification({bookingId:b.id,type:"BOOKING_STATUS",title:`Booking ${b.booking_no}: Overdue`,message:`Rental for ${b.customer_name} is past due.`});
      }
    }
  } catch (e) {
    console.error("[OVERDUE CHECK] Error:", e.message);
  }
}

app.get("/api/admin/dashboard", authenticate, requireRole("admin"), async (_req,res) => {
  const [[stats]] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM bookings WHERE DATE(created_at)=CURDATE()) AS today_bookings,
      (SELECT COUNT(*) FROM bookings WHERE status IN ('rented','overdue')) AS active_rentals,
      (SELECT COUNT(*) FROM bookings WHERE status='overdue' OR (status='rented' AND end_date<CURDATE())) AS overdue_rentals,
      (SELECT COALESCE(SUM(CASE WHEN p.payment_type='refund' THEN -p.amount ELSE p.amount END),0)
       FROM payments p JOIN bookings rb ON rb.id=p.booking_id WHERE p.status='completed' AND rb.status NOT IN ('cancelled','rejected') AND DATE(p.created_at)=CURDATE()) AS revenue_today,
      (SELECT COUNT(*) FROM bookings WHERE payment_status IN ('unpaid','partial') AND status NOT IN ('cancelled','rejected')) AS pending_payments,
      (SELECT COUNT(*) FROM rental_items WHERE status<>'active') AS unavailable_items,
      (SELECT COUNT(*) FROM bookings WHERE start_date>CURDATE() AND status IN ('confirmed','ready')) AS upcoming_reservations
  `);
  const [recent] = await db.query(`
    SELECT b.id,b.booking_no,b.customer_name,b.start_date,b.end_date,b.grand_total,b.status,
      GROUP_CONCAT(CONCAT(bi.item_name,' × ',bi.quantity) SEPARATOR ', ') items
    FROM bookings b LEFT JOIN booking_items bi ON bi.booking_id=b.id
    GROUP BY b.id ORDER BY b.created_at DESC LIMIT 6
  `);
  const [months] = await db.query(`
    SELECT DATE_FORMAT(p.created_at,'%Y-%m') month,
      COALESCE(SUM(CASE WHEN p.payment_type='refund' THEN -p.amount ELSE p.amount END),0) revenue
    FROM payments p
    JOIN bookings b ON b.id=p.booking_id
    WHERE p.status='completed'
      AND b.status NOT IN ('cancelled','rejected')
      AND p.created_at>=DATE_SUB(CURDATE(),INTERVAL 11 MONTH)
    GROUP BY DATE_FORMAT(p.created_at,'%Y-%m') ORDER BY month
  `);
  const [daily] = await db.query(`
    WITH RECURSIVE dates AS (
      SELECT DATE_SUB(CURDATE(), INTERVAL 6 DAY) AS d
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM dates WHERE d < CURDATE()
    )
    SELECT
      DATE_FORMAT(d.d,'%Y-%m-%d') AS date,
      DATE_FORMAT(d.d,'%a') AS label,
      COALESCE((
        SELECT SUM(CASE WHEN p.payment_type='refund' THEN -p.amount ELSE p.amount END)
        FROM payments p
        JOIN bookings pb ON pb.id=p.booking_id
        WHERE p.status='completed'
          AND pb.status NOT IN ('cancelled','rejected')
          AND DATE(p.created_at)=d.d
      ),0) AS revenue,
      COALESCE((
        SELECT COUNT(*) FROM bookings bb
        WHERE DATE(bb.created_at)=d.d
          AND bb.status NOT IN ('cancelled','rejected')
      ),0) AS bookings
    FROM dates d
    ORDER BY d.d
  `);
  res.json({stats,recent,months,daily});
});

app.get("/api/admin/escalations", authenticate, requireRole("admin"), async (_req,res) => {
  const [overdue]=await db.query(`
    SELECT b.id,b.booking_no,b.status,b.start_date,b.end_date,b.grand_total,
      b.customer_id,b.deposit_total,
      c.full_name AS customer_name,c.phone AS customer_phone,c.email AS customer_email,
      DATEDIFF(CURDATE(),b.end_date) AS overdue_days,
      GREATEST(0,DATEDIFF(CURDATE(),b.end_date)) AS days_overdue
    FROM bookings b
    JOIN customers c ON c.id=b.customer_id
    WHERE b.status IN ('overdue','rented') AND b.end_date < CURDATE()
    ORDER BY overdue_days DESC
  `);
  const lateRate=Number(await getSetting("late_fee_per_day","250"));
  const escalated=overdue.map(b=>{
    const days=b.days_overdue||0;
    let level="gentle";
    if(days>=14)level="final";
    else if(days>=7)level="formal";
    else if(days>=3)level="reminder";
    const lateFee=days*lateRate;
    return{...b,level,lateFee,daysText:`${days} day${days===1?"":"s"} overdue`};
  });
  const stats={total:escalated.length,gentle:escalated.filter(e=>e.level==="gentle").length,reminder:escalated.filter(e=>e.level==="reminder").length,formal:escalated.filter(e=>e.level==="formal").length,final:escalated.filter(e=>e.level==="final").length};
  res.json({escalated,stats});
});

app.get("/api/admin/inventory", authenticate, requireRole("admin"), async (_req,res) => {
  const [items] = await db.query(`
    SELECT r.*,
      COALESCE((SELECT SUM(bi.quantity) FROM booking_items bi JOIN bookings b ON b.id=bi.booking_id
        WHERE bi.rental_item_id=r.id AND b.status IN ('confirmed','ready','rented','overdue')
          AND CURDATE() BETWEEN b.start_date AND b.end_date),0) AS reserved_today,
      COALESCE((SELECT SUM(bi.quantity) FROM booking_items bi JOIN bookings b ON b.id=bi.booking_id
        WHERE bi.rental_item_id=r.id AND b.status IN ('pending','confirmed','ready','rented','overdue')
          AND b.end_date >= CURDATE()),0) AS reserved_all,
      COALESCE((SELECT COUNT(*) FROM maintenance_records m WHERE m.rental_item_id=r.id AND m.status IN ('open','in_progress')),0) AS open_maintenance
    FROM rental_items r ORDER BY r.created_at DESC
  `);
  res.json({items});
});

app.post("/api/admin/inventory", authenticate, requireRole("admin"), parseBody(schemas.inventoryItem), async (req,res) => {
  const {sku,name,category,description,image_url} = req.body;
  const daily = req.body.daily_price;
  const deposit = req.body.security_deposit;
  const qty = req.body.total_quantity;
  try {
    const [result] = await db.query(`
      INSERT INTO rental_items(sku,name,category,description,daily_price,security_deposit,total_quantity,status,image_url)
      VALUES(?,?,?,?,?,?,?,'active',?)
    `,[sku,name,category,description||null,daily,deposit,qty,image_url||null]);
    await audit(req,"CREATE_RENTAL_ITEM",null,{item_id:result.insertId,sku});
    res.status(201).json({id:result.insertId});
  } catch(e) {
    if (e.code==="ER_DUP_ENTRY") return res.status(409).json({message:"SKU already exists."});
    throw e;
  }
});

app.patch("/api/admin/inventory/:id", authenticate, requireRole("admin"), parseBody(schemas.inventoryItem), async (req,res) => {
  const id=Number(req.params.id);
  const [[old]] = await db.query("SELECT * FROM rental_items WHERE id=?",[id]);
  if(!old) return res.status(404).json({message:"Rental item not found."});
  const next = {...old,...req.body};
  if(!["active","inactive","maintenance"].includes(next.status)) return res.status(400).json({message:"Invalid inventory status."});
  await db.query(`
    UPDATE rental_items SET sku=?,name=?,category=?,description=?,daily_price=?,security_deposit=?,total_quantity=?,status=?,image_url=?
    WHERE id=?
  `,[next.sku,next.name,next.category,next.description||null,Number(next.daily_price),Number(next.security_deposit),Number(next.total_quantity),next.status,next.image_url||null,id]);
  if(next.status==="maintenance"&&old.status!=="maintenance"){
    await db.query("INSERT INTO maintenance_records(rental_item_id,booking_id,reason,status,notes) VALUES(?,NULL,'Manual maintenance assignment','open',?)",[id,req.body.notes||null]);
  }
  await audit(req,"UPDATE_RENTAL_ITEM",null,{item_id:id});
  res.json({ok:true});
});

app.delete("/api/admin/inventory/:id", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const [[used]] = await db.query("SELECT COUNT(*) count FROM booking_items WHERE rental_item_id=?",[id]);
  if(Number(used.count)>0) {
    await db.query("UPDATE rental_items SET status='inactive' WHERE id=?",[id]);
    return res.json({ok:true,archived:true,message:"Item has booking history and was archived instead of deleted."});
  }
  await db.query("DELETE FROM rental_items WHERE id=?",[id]);
  res.json({ok:true,deleted:true});
});

app.get("/api/admin/items/:id/conditions", authenticate, requireRole("admin"), async (req,res) => {
  const itemId=Number(req.params.id);
  const [[item]]=await db.query("SELECT id,name,sku FROM rental_items WHERE id=?",[itemId]);
  if(!item) return res.status(404).json({message:"Item not found."});
  const [conditions]=await db.query(`
    SELECT ic.*,b.booking_no,u.full_name recorded_by
    FROM item_conditions ic
    LEFT JOIN bookings b ON b.id=ic.booking_id
    LEFT JOIN users u ON u.id=ic.recorded_by_user_id
    WHERE ic.rental_item_id=? ORDER BY ic.created_at DESC
  `,[itemId]);
  res.json({item,conditions});
});

app.post("/api/admin/items/:id/conditions", authenticate, requireRole("admin"), async (req,res) => {
  const itemId=Number(req.params.id);
  const [[item]]=await db.query("SELECT id FROM rental_items WHERE id=?",[itemId]);
  if(!item) return res.status(404).json({message:"Item not found."});
  const {condition_status,condition_type,notes,booking_id}=req.body;
  if(!['excellent','good','fair','poor','damaged','lost'].includes(condition_status)){
    return res.status(400).json({message:"Invalid condition status."});
  }
  if(!['before_rental','after_return','damage_report','maintenance'].includes(condition_type)){
    return res.status(400).json({message:"Invalid condition type."});
  }
  const [result]=await db.query(`
    INSERT INTO item_conditions(rental_item_id,booking_id,condition_status,condition_type,notes,recorded_by_user_id)
    VALUES(?,?,?,?,?,?)
  `,[itemId,booking_id||null,condition_status,condition_type,notes||null,req.user.id]);
  res.status(201).json({id:result.insertId,ok:true});
});

async function generateIncidentNo(conn=db) {
  const [[{cnt}]]=await conn.query("SELECT COUNT(*) AS cnt FROM incidents");
  return `INC-${String(Number(cnt||0)+1).padStart(6,"0")}`;
}

app.get("/api/admin/incidents", authenticate, requireRole("admin"), async (_req,res) => {
  const [incidents]=await db.query(`
    SELECT i.*,r.name item_name,r.sku item_sku,b.booking_no,
      c.full_name customer_name,u1.full_name reported_by,u2.full_name resolved_by
    FROM incidents i
    LEFT JOIN rental_items r ON r.id=i.rental_item_id
    LEFT JOIN bookings b ON b.id=i.booking_id
    LEFT JOIN customers c ON c.id=i.customer_id
    LEFT JOIN users u1 ON u1.id=i.reported_by_user_id
    LEFT JOIN users u2 ON u2.id=i.resolved_by_user_id
    ORDER BY i.created_at DESC
  `);
  res.json({incidents});
});

app.post("/api/admin/incidents", authenticate, requireRole("admin"), parseBody(schemas.createIncident), async (req,res) => {
  const {rental_item_id,booking_id,customer_id,incident_type,description,replacement_cost,charge_amount,insurance_claim_amount}=req.body;
  const [[item]]=await db.query("SELECT id FROM rental_items WHERE id=?",[rental_item_id]);
  if(!item) return res.status(404).json({message:"Rental item not found."});
  const incident_no=await generateIncidentNo();
  const [result]=await db.query(`
    INSERT INTO incidents(incident_no,rental_item_id,booking_id,customer_id,incident_type,description,replacement_cost,charge_amount,insurance_claim_amount,reported_by_user_id)
    VALUES(?,?,?,?,?,?,?,?,?,?)
  `,[incident_no,rental_item_id,booking_id||null,customer_id||null,incident_type||"damaged_minor",description,Number(replacement_cost||0),Number(charge_amount||0),Number(insurance_claim_amount||0),req.user.id]);
  res.status(201).json({id:result.insertId,incident_no,ok:true});
});

app.patch("/api/admin/incidents/:id", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const [[incident]]=await db.query("SELECT id FROM incidents WHERE id=?",[id]);
  if(!incident) return res.status(404).json({message:"Incident not found."});
  const {status,resolution_notes,charge_amount,insurance_claim_amount}=req.body;
  const validStatuses=['reported','investigating','resolved_charged','resolved_insurance','written_off','dismissed'];
  if(status && !validStatuses.includes(status)) return res.status(400).json({message:"Invalid status."});
  const updates=[];
  const params=[];
  if(status){updates.push("status=?");params.push(status);}
  if(resolution_notes!==undefined){updates.push("resolution_notes=?");params.push(resolution_notes);}
  if(charge_amount!==undefined){updates.push("charge_amount=?");params.push(Number(charge_amount));}
  if(insurance_claim_amount!==undefined){updates.push("insurance_claim_amount=?");params.push(Number(insurance_claim_amount));}
  if(status&&status.startsWith("resolved_")){updates.push("resolved_at=NOW()");updates.push("resolved_by_user_id=?");params.push(req.user.id);}
  params.push(id);
  await db.query(`UPDATE incidents SET ${updates.join(",")} WHERE id=?`,params);
  res.json({ok:true});
});

app.get("/api/admin/bookings/:id", authenticate, requireRole("admin"), async (req,res) => {
  const booking=await bookingDetailById(Number(req.params.id));
  if(!booking) return res.status(404).json({message:"Booking not found."});
  res.json({booking});
});

app.delete("/api/admin/bookings/:id", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const [[booking]]=await db.query("SELECT id,booking_no FROM bookings WHERE id=?",[id]);
  if(!booking) return res.status(404).json({message:"Booking not found."});
  await db.query("DELETE FROM booking_items WHERE booking_id=?",[id]);
  await db.query("DELETE FROM booking_status_history WHERE booking_id=?",[id]);
  await db.query("DELETE FROM payments WHERE booking_id=?",[id]);
  await db.query("DELETE FROM return_inspections WHERE booking_id=?",[id]);
  await db.query("DELETE FROM notifications WHERE booking_id=?",[id]);
  await db.query("DELETE FROM bookings WHERE id=?",[id]);
  res.json({ok:true});
});

app.patch("/api/admin/bookings/:id/status", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const to=String(req.body.status||"");
  const note=String(req.body.note||"").slice(0,255);
  const [[booking]] = await db.query("SELECT id,booking_no,status,customer_name FROM bookings WHERE id=?",[id]);
  if(!booking) return res.status(404).json({message:"Booking not found."});
  if(!(validTransitions[booking.status]||[]).includes(to)) {
    return res.status(409).json({message:`Cannot move booking from ${booking.status} to ${to}.`});
  }
  await db.query("UPDATE bookings SET status=? WHERE id=?",[to,id]);
  await db.query("INSERT INTO booking_status_history(booking_id,from_status,to_status,changed_by_user_id,note) VALUES(?,?,?,?,?)",[id,booking.status,to,req.user.id,note||null]);
  await addNotification({bookingId:id,type:"BOOKING_STATUS",title:`Booking ${booking.booking_no}: ${to}`,message:`Your booking status changed from ${booking.status} to ${to}.`});
  await audit(req,"BOOKING_STATUS",null,{booking_id:id,from:booking.status,to});
  res.json({ok:true});
});

app.patch("/api/admin/bookings/:id/reschedule", authenticate, requireRole("admin"), parseBody(schemas.reschedule), async (req,res) => {
  const id=Number(req.params.id);
  const start=parseDateOnly(req.body.start_date), end=parseDateOnly(req.body.end_date);
  if(!start || !end || end<start) return res.status(400).json({message:"Valid dates are required."});
  const booking=await bookingDetailById(id);
  if(!booking) return res.status(404).json({message:"Booking not found."});
  if(!["pending","confirmed","ready"].includes(booking.status)) return res.status(409).json({message:"This booking can no longer be rescheduled."});
  for(const row of booking.items){
    const availability=await getAvailability(db,row.rental_item_id,req.body.start_date,req.body.end_date);
    const selfQty = booking.start_date <= req.body.end_date && booking.end_date >= req.body.start_date ? Number(row.quantity) : 0;
    const effective = availability.available_quantity + selfQty;
    if(effective < Number(row.quantity)) return res.status(409).json({message:`${row.item_name} is not available for the new dates.`});
  }
  const days=rentalDays(start,end);
  let subtotal=0;
  for(const row of booking.items){
    const line=Number(row.daily_price)*Number(row.quantity)*days;
    subtotal+=line;
    await db.query("UPDATE booking_items SET rental_days=?,line_rental_total=? WHERE id=?",[days,line,row.id]);
  }
  const grand=subtotal+Number(booking.deposit_total)+Number(booking.delivery_fee);
  await db.query("UPDATE bookings SET start_date=?,end_date=?,rental_subtotal=?,grand_total=? WHERE id=?",[req.body.start_date,req.body.end_date,subtotal,grand,id]);
  await recalcPaymentStatus(id);
  await db.query("INSERT INTO booking_status_history(booking_id,from_status,to_status,changed_by_user_id,note) VALUES(?,?,?,?,?)",[id,booking.status,booking.status,req.user.id,`Rescheduled to ${req.body.start_date} - ${req.body.end_date}`]);
  res.json({ok:true});
});

app.post("/api/admin/bookings/:id/payments", authenticate, requireRole("admin"), parseBody(schemas.recordPayment), async (req,res) => {
  const bookingId=Number(req.params.id);
  const amount=req.body.amount;
  const type=req.body.payment_type;
  const method=req.body.method;
  const [[booking]]=await db.query("SELECT id,booking_no FROM bookings WHERE id=?",[bookingId]);
  if(!booking) return res.status(404).json({message:"Booking not found."});
  const [result]=await db.query(`
    INSERT INTO payments(booking_id,amount,payment_type,method,reference_no,status,notes,recorded_by_user_id)
    VALUES(?,?,?,?,?,'completed',?,?)
  `,[bookingId,amount,type,method,req.body.reference_no||null,req.body.notes||null,req.user.id]);
  await recalcPaymentStatus(bookingId);
  await audit(req,"RECORD_PAYMENT",null,{booking_id:bookingId,payment_id:result.insertId,amount,type});
  res.status(201).json({id:result.insertId});
});

app.patch("/api/admin/payments/:id/void", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const [[payment]]=await db.query("SELECT booking_id FROM payments WHERE id=?",[id]);
  if(!payment) return res.status(404).json({message:"Payment not found."});
  await db.query("UPDATE payments SET status='void' WHERE id=?",[id]);
  await recalcPaymentStatus(payment.booking_id);
  res.json({ok:true});
});

app.delete("/api/admin/payments/:id", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const [[payment]]=await db.query("SELECT booking_id FROM payments WHERE id=?",[id]);
  if(!payment) return res.status(404).json({message:"Payment not found."});
  await db.query("DELETE FROM payments WHERE id=?",[id]);
  await recalcPaymentStatus(payment.booking_id);
  res.json({ok:true});
});

app.get("/api/admin/customers/:id/score", authenticate, requireRole("admin"), async (req,res) => {
  const customerId=Number(req.params.id);
  const [[customer]]=await db.query("SELECT id,full_name FROM customers WHERE id=?",[customerId]);
  if(!customer) return res.status(404).json({message:"Customer not found."});
  const [bookings]=await db.query(`
    SELECT b.id,b.status,b.start_date,b.end_date,b.created_at,b.grand_total,
      ri.condition_after,ri.late_days,ri.damage_charge
    FROM bookings b
    LEFT JOIN return_inspections ri ON ri.booking_id=b.id
    WHERE b.customer_id=? AND b.status IN ('completed','returned','overdue')
    ORDER BY b.created_at DESC
  `,[customerId]);
  const totalBookings=bookings.length;
  const completedBookings=bookings.filter(b=>b.status==="completed").length;
  const lateReturns=bookings.filter(b=>Number(b.late_days||0)>0).length;
  const damages=bookings.filter(b=>Number(b.damage_charge||0)>0).length;
  const totalSpent=bookings.reduce((s,b)=>s+Number(b.grand_total||0),0);
  let score=70;
  if(totalBookings>0){
    const completionRate=completedBookings/totalBookings;
    score+=Math.round(completionRate*20);
    if(lateReturns===0)score+=10;
    else if(lateReturns<=1)score+=5;
    else score-=Math.min(15,lateReturns*3);
    if(damages===0)score+=5;
    else score-=Math.min(10,damages*5);
    if(totalBookings>=3)score+=5;
    if(totalBookings>=5)score+=5;
  }
  score=Math.max(0,Math.min(100,score));
  let rating="Fair";
  if(score>=90)rating="Excellent";
  else if(score>=75)rating="Good";
  else if(score>=50)rating="Fair";
  else if(score>=30)rating="Poor";
  else rating="At Risk";
  res.json({customer,score,rating,totalBookings,completedBookings,lateReturns,damages,totalSpent});
});

app.post("/api/admin/bookings/:id/return-inspection", authenticate, requireRole("admin"), async (req,res) => {
  const bookingId=Number(req.params.id);
  if(!Number.isInteger(bookingId)||bookingId<=0) return res.status(400).json({message:"Invalid booking ID."});
  const conditionAfter=String(req.body.condition_after||"Good").trim();
  const damageCharge=Number(req.body.damage_charge||0);
  if(!Number.isFinite(damageCharge)||damageCharge<0) return res.status(400).json({message:"Damage charge must be a valid non-negative amount."});
  const booking=await bookingDetailById(bookingId);
  if(!booking) return res.status(404).json({message:"Booking not found."});
  if(!["rented","overdue","returned"].includes(booking.status)) return res.status(409).json({message:"Booking must be rented/overdue before return inspection."});
  const today=new Date();
  const due=new Date(`${String(booking.end_date||"").slice(0,10)}T00:00:00`);
  const lateDays=Number.isFinite(Math.ceil((today-due)/86400000))?Math.max(0,Math.ceil((today-due)/86400000)):0;
  const lateRate=Number(await getSetting("late_fee_per_day","250"))||250;
  const lateFee = req.body.late_fee!==undefined ? Math.max(0,Number(req.body.late_fee)||0) : lateDays*(lateRate||250);
  const damage=Number(damageCharge)||0;
  const deposit=Number(booking.deposit_total||0)||0;
  const refund=Math.max(0,deposit-lateFee-damage);
  const maintenance=req.body.maintenance_required===true||req.body.maintenance_required===1||req.body.maintenance_required==="true";
  const conn=await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`
    INSERT INTO return_inspections
      (booking_id,condition_before,condition_after,missing_items,damage_notes,late_days,late_fee,damage_charge,deposit_refund,maintenance_required,inspected_by_user_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE condition_before=VALUES(condition_before),condition_after=VALUES(condition_after),
      missing_items=VALUES(missing_items),damage_notes=VALUES(damage_notes),late_days=VALUES(late_days),
      late_fee=VALUES(late_fee),damage_charge=VALUES(damage_charge),deposit_refund=VALUES(deposit_refund),
      maintenance_required=VALUES(maintenance_required),inspected_by_user_id=VALUES(inspected_by_user_id),returned_at=NOW()
    `,[bookingId,req.body.condition_before||null,conditionAfter,req.body.missing_items||null,req.body.damage_notes||null,lateDays,lateFee,damage,refund,maintenance?1:0,req.user.id]);
    if(maintenance){
    for(const row of booking.items){
      await conn.query("INSERT INTO maintenance_records(rental_item_id,booking_id,reason,status,notes) VALUES(?,?,'Return inspection flagged maintenance','open',?)",[row.rental_item_id,bookingId,req.body.damage_notes||null]);
      await conn.query("UPDATE rental_items SET status='maintenance' WHERE id=?",[row.rental_item_id]);
      await conn.query("INSERT INTO item_conditions(rental_item_id,booking_id,condition_status,condition_type,notes,recorded_by_user_id) VALUES(?,?,'damaged','damage_report',?,?)",[row.rental_item_id,bookingId,req.body.damage_notes||"Damaged during rental",req.user.id]);
    }
    if(booking.items.length > 0){
      const incidentNo=await generateIncidentNo();
      const normalizedCondition=conditionAfter.toLowerCase();
      const incidentType=normalizedCondition==="lost"?"lost":damage>5000?"damaged_major":"damaged_minor";
      await conn.query(`
        INSERT INTO incidents(incident_no,rental_item_id,booking_id,customer_id,incident_type,status,description,charge_amount,replacement_cost,reported_by_user_id)
        VALUES(?,?,?,?,?,?,?,?,?,?)
      `,[incidentNo,booking.items[0].rental_item_id,bookingId,booking.customer_id,incidentType,"reported",
         req.body.damage_notes||`Return inspection: ${req.body.condition_after||"Damaged"}`,damage,damage,req.user.id]);
    }
  } else if(damage > 0){
    if(booking.items.length > 0){
      const incidentNo=await generateIncidentNo();
      await conn.query(`
        INSERT INTO incidents(incident_no,rental_item_id,booking_id,customer_id,incident_type,status,description,charge_amount,replacement_cost,reported_by_user_id)
        VALUES(?,?,?,?,?,?,?,?,?,?)
      `,[incidentNo,booking.items[0].rental_item_id,bookingId,booking.customer_id,"damaged_minor","reported",
         req.body.damage_notes||"Damage charge applied during return",damage,damage,req.user.id]);
    }
  } else if(conditionAfter!=="Good"){
    for(const row of booking.items){
      const conditionMap={'Excellent':'excellent','Good':'good','Fair':'fair','Poor':'poor','Damaged':'damaged','Lost':'lost'};
      const status=conditionMap[conditionAfter]||'good';
      if(status!=='good'){
        await conn.query("INSERT INTO item_conditions(rental_item_id,booking_id,condition_status,condition_type,notes,recorded_by_user_id) VALUES(?,?,?,'after_return',?,?)",[row.rental_item_id,bookingId,status,req.body.damage_notes||null,req.user.id]);
        if(status==='damaged'||status==='lost'){
          const incidentNo=await generateIncidentNo();
          await conn.query(`
            INSERT INTO incidents(incident_no,rental_item_id,booking_id,customer_id,incident_type,status,description,charge_amount,replacement_cost,reported_by_user_id)
            VALUES(?,?,?,?,?,?,?,?,?,?)
          `,[incidentNo,row.rental_item_id,bookingId,booking.customer_id,status==='lost'?"lost":"damaged_minor","reported",
             req.body.damage_notes||`Item returned in ${status} condition`,0,0,req.user.id]);
        }
      }
    }
  }
  if(booking.status!=="returned"){
    await conn.query("UPDATE bookings SET status='returned' WHERE id=?",[bookingId]);
    await conn.query("INSERT INTO booking_status_history(booking_id,from_status,to_status,changed_by_user_id,note) VALUES(?,?,'returned',?,?)",[bookingId,booking.status,req.user.id,"Return inspection recorded"]);
  }
    await conn.commit();
    res.json({ok:true,late_days:lateDays,late_fee:lateFee,damage_charge:damage,deposit_refund:refund});
  } catch(error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

app.post("/api/admin/bookings/:id/complete", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const booking=await bookingDetailById(id);
  if(!booking) return res.status(404).json({message:"Booking not found."});
  if(booking.status!=="returned") return res.status(409).json({message:"Return inspection must be completed first."});
  if(booking.inspection && Number(booking.inspection.deposit_refund)>0){
    const [[already]]=await db.query("SELECT COUNT(*) count FROM payments WHERE booking_id=? AND payment_type='refund' AND status='completed'",[id]);
    if(Number(already.count)===0){
      await db.query("INSERT INTO payments(booking_id,amount,payment_type,method,status,notes,recorded_by_user_id) VALUES(?,?,'refund','cash','completed','Deposit refund recorded at completion',?)",[id,booking.inspection.deposit_refund,req.user.id]);
    }
  }
  await db.query("UPDATE bookings SET status='completed' WHERE id=?",[id]);
  await db.query("INSERT INTO booking_status_history(booking_id,from_status,to_status,changed_by_user_id,note) VALUES(?,'returned','completed',?,?)",[id,req.user.id,req.body.note||"Rental completed"]);
  await recalcPaymentStatus(id);
  res.json({ok:true});
});

app.get("/api/admin/customers", authenticate, requireRole("admin"), async (_req,res) => {
  const [customers]=await db.query(`
    SELECT c.*,
      COUNT(b.id) booking_count,
      COALESCE(SUM(CASE WHEN b.status='completed' THEN b.grand_total ELSE 0 END),0) lifetime_value,
      MAX(b.created_at) last_booking_at
    FROM customers c LEFT JOIN bookings b ON b.customer_id=c.id
    GROUP BY c.id ORDER BY c.created_at DESC
  `);
  res.json({customers});
});

app.patch("/api/admin/customers/:id/status", authenticate, requireRole("admin"), async (req,res) => {
  const status=req.body.status;
  if(!["active","blocked"].includes(status)) return res.status(400).json({message:"Invalid customer status."});
  await db.query("UPDATE customers SET status=? WHERE id=?",[status,Number(req.params.id)]);
  res.json({ok:true});
});

app.patch("/api/admin/customers/:id", authenticate, requireRole("admin"), parseBody(schemas.updateCustomer), async (req,res) => {
  const id=Number(req.params.id);
  const [[existing]]=await db.query("SELECT id FROM customers WHERE id=?",[id]);
  if(!existing) return res.status(404).json({message:"Customer not found."});
  const {full_name,email,phone,city,address}=req.body;
  const [[dup]]=await db.query("SELECT id FROM customers WHERE email=? AND id!=?",[email,id]);
  if(dup) return res.status(409).json({message:"Email is already used by another customer."});
  await db.query("UPDATE customers SET full_name=?,email=?,phone=?,city=?,address=? WHERE id=?",[full_name,email,phone,city||null,address||null,id]);
  const [[updated]]=await db.query("SELECT * FROM customers WHERE id=?",[id]);
  res.json({customer:updated});
});

app.delete("/api/admin/customers/:id", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const [[customer]]=await db.query("SELECT id FROM customers WHERE id=?",[id]);
  if(!customer) return res.status(404).json({message:"Customer not found."});
  await db.query("DELETE FROM customers WHERE id=?",[id]);
  res.json({ok:true});
});

app.delete("/api/admin/customers", authenticate, requireRole("admin"), async (_req,res) => {
  await db.query("DELETE FROM customers");
  res.json({ok:true});
});

app.get("/api/admin/payments", authenticate, requireRole("admin"), async (_req,res) => {
  const [payments]=await db.query(`
    SELECT p.*,b.booking_no,b.customer_name,u.full_name recorded_by
    FROM payments p JOIN bookings b ON b.id=p.booking_id
    LEFT JOIN users u ON u.id=p.recorded_by_user_id
    ORDER BY p.created_at DESC LIMIT 300
  `);
  res.json({payments});
});

app.get("/api/admin/reports", authenticate, requireRole("admin"), async (_req,res,next) => {
  try {
    const validStatuses = ["confirmed","ready","rented","overdue","returned","completed"];
    const placeholders = validStatuses.map(()=>"?").join(",");

    const [[currencyRow]] = await db.query(
      "SELECT setting_value FROM business_settings WHERE setting_key='currency' LIMIT 1"
    );
    const currency = currencyRow?.setting_value || "PHP";

    const [[summary]] = await db.query(`
      SELECT
        (SELECT COALESCE(SUM(CASE WHEN p.payment_type='refund' THEN -p.amount ELSE p.amount END),0)
           FROM payments p JOIN bookings b ON b.id=p.booking_id
          WHERE p.status='completed' AND b.status NOT IN ('cancelled','rejected')
            AND YEAR(p.created_at)=YEAR(CURDATE()) AND MONTH(p.created_at)=MONTH(CURDATE())) AS monthly_revenue,
        (SELECT COALESCE(SUM(CASE WHEN p.payment_type='refund' THEN -p.amount ELSE p.amount END),0)
           FROM payments p JOIN bookings b ON b.id=p.booking_id
          WHERE p.status='completed' AND b.status NOT IN ('cancelled','rejected')
            AND YEAR(p.created_at)=YEAR(DATE_SUB(CURDATE(),INTERVAL 1 MONTH))
            AND MONTH(p.created_at)=MONTH(DATE_SUB(CURDATE(),INTERVAL 1 MONTH))) AS previous_month_revenue,
        (SELECT COUNT(*) FROM bookings b
          WHERE b.status IN (${placeholders})
            AND YEAR(b.created_at)=YEAR(CURDATE()) AND MONTH(b.created_at)=MONTH(CURDATE())) AS monthly_rentals,
        (SELECT COUNT(*) FROM bookings b
          WHERE b.status IN (${placeholders})
            AND YEAR(b.created_at)=YEAR(DATE_SUB(CURDATE(),INTERVAL 1 MONTH))
            AND MONTH(b.created_at)=MONTH(DATE_SUB(CURDATE(),INTERVAL 1 MONTH))) AS previous_month_rentals,
        (SELECT COALESCE(SUM(total_quantity),0) FROM rental_items WHERE status='active') AS total_rentable_units,
        (SELECT COALESCE(SUM(bi.quantity),0)
           FROM booking_items bi JOIN bookings b ON b.id=bi.booking_id
          WHERE b.status IN ('rented','overdue')
            AND CURDATE() BETWEEN b.start_date AND b.end_date) AS currently_rented_units
    `, [...validStatuses, ...validStatuses]);

    const [topItems] = await db.query(`
      SELECT
        bi.rental_item_id,
        COALESCE(r.name,bi.item_name) AS item_name,
        COALESCE(r.category,'Rental') AS category,
        r.image_url,
        SUM(bi.quantity) AS rented_quantity,
        COUNT(DISTINCT bi.booking_id) AS rental_count
      FROM booking_items bi
      JOIN bookings b ON b.id=bi.booking_id
      LEFT JOIN rental_items r ON r.id=bi.rental_item_id
      WHERE b.status IN (${placeholders})
        AND b.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(),INTERVAL 11 MONTH),'%Y-%m-01')
      GROUP BY bi.rental_item_id,COALESCE(r.name,bi.item_name),COALESCE(r.category,'Rental'),r.image_url
      ORDER BY rented_quantity DESC,item_name ASC
      LIMIT 5
    `, validStatuses);

    const [monthlyRows] = await db.query(`
      SELECT DATE_FORMAT(p.created_at,'%Y-%m') AS month,
             COALESCE(SUM(CASE WHEN p.payment_type='refund' THEN -p.amount ELSE p.amount END),0) AS revenue
      FROM payments p
      JOIN bookings b ON b.id=p.booking_id
      WHERE p.status='completed'
        AND b.status NOT IN ('cancelled','rejected')
        AND p.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(),INTERVAL 11 MONTH),'%Y-%m-01')
      GROUP BY DATE_FORMAT(p.created_at,'%Y-%m')
      ORDER BY month
    `);

    // Always return exactly 12 calendar months, including zero-revenue months.
    const byMonth = new Map(monthlyRows.map(row => [row.month, Number(row.revenue || 0)]));
    const now = new Date();
    const revenueTrend = [];
    for (let offset = 11; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      revenueTrend.push({
        month,
        label: d.toLocaleString("en-US", {month:"short"}),
        full_label: d.toLocaleString("en-US", {month:"long", year:"numeric"}),
        revenue: byMonth.get(month) || 0
      });
    }

    const monthlyRevenue = Number(summary.monthly_revenue || 0);
    const previousRevenue = Number(summary.previous_month_revenue || 0);
    const monthlyRentals = Number(summary.monthly_rentals || 0);
    const previousRentals = Number(summary.previous_month_rentals || 0);
    const totalRentable = Number(summary.total_rentable_units || 0);
    const currentlyRented = Number(summary.currently_rented_units || 0);
    const utilization = totalRentable > 0 ? Math.min(100, (currentlyRented / totalRentable) * 100) : 0;
    const percentChange = (current, previous) => previous > 0 ? ((current - previous) / previous) * 100 : null;

    res.json({
      currency,
      generated_at: new Date().toISOString(),
      summary: {
        monthly_revenue: monthlyRevenue,
        monthly_revenue_change: percentChange(monthlyRevenue, previousRevenue),
        total_rentals: monthlyRentals,
        rental_change: percentChange(monthlyRentals, previousRentals),
        utilization: Number(utilization.toFixed(1)),
        currently_rented_units: currentlyRented,
        total_rentable_units: totalRentable,
        top_item: topItems[0] || null
      },
      revenue_trend: revenueTrend,
      top_items: topItems.map(row => ({...row, rented_quantity:Number(row.rented_quantity||0), rental_count:Number(row.rental_count||0)}))
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/maintenance", authenticate, requireRole("admin"), async (_req,res,next) => {
  try {
    const [records]=await db.query(`
      SELECT COALESCE(m.id,0) AS id,r.id AS rental_item_id,m.booking_id,
        COALESCE(m.reason,'Manual maintenance') AS reason,
        COALESCE(m.status,'open') AS status,
        COALESCE(m.opened_at,r.updated_at) AS opened_at,
        COALESCE(m.cost,0) AS cost,m.notes,m.completed_at,
        r.name item_name,r.sku,b.booking_no
      FROM rental_items r
      LEFT JOIN maintenance_records m ON m.rental_item_id=r.id
      LEFT JOIN bookings b ON b.id=m.booking_id
      WHERE r.status='maintenance'
      ORDER BY opened_at DESC
    `);
    res.json({records});
  } catch(err) { next(err); }
});

app.patch("/api/admin/maintenance/:id", authenticate, requireRole("admin"), async (req,res,next) => {
  try {
    const id=Number(req.params.id);
    const status=req.body.status;
    if(!["open","in_progress","completed","cancelled"].includes(status)) return res.status(400).json({message:"Invalid maintenance status."});
    let [[row]]=await db.query("SELECT rental_item_id FROM maintenance_records WHERE id=?",[id]);
    if(!row&&req.body.rental_item_id){
      const rid=Number(req.body.rental_item_id);
      const [ins]=await db.query("INSERT INTO maintenance_records(rental_item_id,booking_id,reason,status,notes) VALUES(?,NULL,'Manual maintenance',?,?)",[rid,status,req.body.notes||null]);
      row={rental_item_id:rid};
      if(status==="completed"){
        const [[open]]=await db.query("SELECT COUNT(*) count FROM maintenance_records WHERE rental_item_id=? AND status IN ('open','in_progress')",[rid]);
        if(Number(open.count)===0) await db.query("UPDATE rental_items SET status='active' WHERE id=?",[rid]);
      }
      return res.json({ok:true});
    }
    if(!row) return res.status(404).json({message:"Maintenance record not found."});
    await db.query("UPDATE maintenance_records SET status=?,cost=?,notes=?,completed_at=IF(?='completed',NOW(),completed_at) WHERE id=?",[status,Number(req.body.cost||0),req.body.notes||null,status,id]);
    if(status==="completed"){
      const [[open]]=await db.query("SELECT COUNT(*) count FROM maintenance_records WHERE rental_item_id=? AND status IN ('open','in_progress')",[row.rental_item_id]);
      if(Number(open.count)===0) await db.query("UPDATE rental_items SET status='active' WHERE id=?",[row.rental_item_id]);
    }
    res.json({ok:true});
  } catch(err) { next(err); }
});

app.get("/api/admin/settings", authenticate, requireRole("admin"), async (_req,res) => {
  const [rows]=await db.query("SELECT setting_key,setting_value FROM business_settings ORDER BY setting_key");
  res.json({settings:Object.fromEntries(rows.map(x=>[x.setting_key,x.setting_value]))});
});

app.put("/api/admin/settings", authenticate, requireRole("admin"), async (req,res) => {
  const allowed=["business_name","business_email","business_phone","business_address","delivery_fee","late_fee_per_day","currency","cancellation_policy","notification_email_enabled","notification_sms_enabled"];
  for(const key of allowed){
    if(req.body[key]!==undefined){
      await db.query("INSERT INTO business_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[key,String(req.body[key])]);
    }
  }
  await audit(req,"UPDATE_SETTINGS");
  res.json({ok:true});
});

app.get("/api/notifications", authenticate, async (req,res) => {
  const [notifications]=await db.query("SELECT * FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 100",[req.user.id]);
  res.json({notifications});
});

app.patch("/api/notifications/:id/read", authenticate, async (req,res) => {
  await db.query("UPDATE notifications SET status='read',read_at=NOW() WHERE id=? AND (user_id=? OR user_id IS NULL)",[Number(req.params.id),req.user.id]);
  res.json({ok:true});
});

setInterval(checkOverdueBookings, 60 * 60 * 1000);
setTimeout(checkOverdueBookings, 5000);

app.post("/api/admin/overdue-check", authenticate, requireRole("admin"), async (_req,res) => {
  const before = Date.now();
  await checkOverdueBookings();
  res.json({ok:true, elapsed_ms:Date.now()-before});
});

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