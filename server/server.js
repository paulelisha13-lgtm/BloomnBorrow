import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { db } from "./db.js";
import { authenticate, requireRole, signToken, setStaffSession, clearStaffSession, revokeJti, requireStaffCsrf, csrfForJti, verifyCsrfValue } from "./auth.js";

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
  referrerPolicy: { policy: "no-referrer" }
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

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true
});
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

app.use("/api", globalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/customer-auth/login", authLimiter);
app.use("/api/customer-auth/register", authLimiter);
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

app.post("/api/auth/login", async (req,res) => {
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

app.patch("/api/auth/profile", authenticate, requireStaffCsrf, async (req,res) => {
  const fullName = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim();
  if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({message:"A valid full name and email address are required."});
  }
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

app.patch("/api/auth/change-password", authenticate, async (req,res) => {
  const current = String(req.body.current_password || "");
  const next = String(req.body.new_password || "");
  if (next.length < 12) return res.status(400).json({message:"New password must be at least 12 characters."});
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

app.post("/api/users", authenticate, requireRole("admin"), async (req,res) => {
  const {full_name,phone,role} = req.body;
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!full_name || !email || password.length < 8 || !["admin"].includes(role)) return res.status(400).json({message:"Valid name, email, role, and 8+ character password are required."});
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
    SELECT id,sku,name,category,description,daily_price,security_deposit,total_quantity,status,image_url
    FROM rental_items WHERE status='active' ORDER BY id
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

app.post("/api/bookings/guest", async (req,res,next) => {
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

    const deliveryFee = fulfillment === "delivery" ? 300 : 0;
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
      rental_days:days,rental_subtotal:rentalSubtotal,deposit_total:depositTotal,delivery_fee:deliveryFee,grand_total:grandTotal
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
    SELECT b.id,b.booking_no,b.customer_name,b.start_date,b.end_date,b.grand_total,b.status,
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

app.get("/api/admin/inventory", authenticate, requireRole("admin"), async (_req,res) => {
  const [items] = await db.query(`
    SELECT r.*,
      COALESCE((SELECT SUM(bi.quantity) FROM booking_items bi JOIN bookings b ON b.id=bi.booking_id
        WHERE bi.rental_item_id=r.id AND b.status IN ('confirmed','ready','rented','overdue')
          AND CURDATE() BETWEEN b.start_date AND b.end_date),0) AS reserved_today,
      COALESCE((SELECT COUNT(*) FROM maintenance_records m WHERE m.rental_item_id=r.id AND m.status IN ('open','in_progress')),0) AS open_maintenance
    FROM rental_items r ORDER BY r.created_at DESC
  `);
  res.json({items});
});

app.post("/api/admin/inventory", authenticate, requireRole("admin"), async (req,res) => {
  const {sku,name,category,description,image_url} = req.body;
  const daily = Number(req.body.daily_price);
  const deposit = Number(req.body.security_deposit);
  const qty = Number(req.body.total_quantity);
  if (!sku || !name || !category || !Number.isFinite(daily) || daily<0 || !Number.isFinite(deposit) || deposit<0 || !Number.isInteger(qty) || qty<1) {
    return res.status(400).json({message:"SKU, name, category, valid price/deposit, and quantity are required."});
  }
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

app.patch("/api/admin/inventory/:id", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const [[old]] = await db.query("SELECT * FROM rental_items WHERE id=?",[id]);
  if(!old) return res.status(404).json({message:"Rental item not found."});
  const next = {...old,...req.body};
  if(!["active","inactive","maintenance"].includes(next.status)) return res.status(400).json({message:"Invalid inventory status."});
  await db.query(`
    UPDATE rental_items SET sku=?,name=?,category=?,description=?,daily_price=?,security_deposit=?,total_quantity=?,status=?,image_url=?
    WHERE id=?
  `,[next.sku,next.name,next.category,next.description||null,Number(next.daily_price),Number(next.security_deposit),Number(next.total_quantity),next.status,next.image_url||null,id]);
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

app.get("/api/admin/bookings/:id", authenticate, requireRole("admin"), async (req,res) => {
  const booking=await bookingDetailById(Number(req.params.id));
  if(!booking) return res.status(404).json({message:"Booking not found."});
  res.json({booking});
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

app.patch("/api/admin/bookings/:id/reschedule", authenticate, requireRole("admin"), async (req,res) => {
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

app.post("/api/admin/bookings/:id/payments", authenticate, requireRole("admin"), async (req,res) => {
  const bookingId=Number(req.params.id);
  const amount=Number(req.body.amount);
  const type=["rental","deposit","delivery","other","refund"].includes(req.body.payment_type)?req.body.payment_type:"rental";
  const method=["cash","gcash","bank_transfer","other"].includes(req.body.method)?req.body.method:"cash";
  if(!Number.isFinite(amount) || amount<=0) return res.status(400).json({message:"Payment amount must be greater than zero."});
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

app.post("/api/admin/bookings/:id/return-inspection", authenticate, requireRole("admin"), async (req,res) => {
  const bookingId=Number(req.params.id);
  const booking=await bookingDetailById(bookingId);
  if(!booking) return res.status(404).json({message:"Booking not found."});
  if(!["rented","overdue","returned"].includes(booking.status)) return res.status(409).json({message:"Booking must be rented/overdue before return inspection."});
  const today=new Date();
  const due=new Date(`${String(booking.end_date).slice(0,10)}T00:00:00`);
  const lateDays=Math.max(0,Math.ceil((today-due)/86400000));
  const lateRate=Number(await getSetting("late_fee_per_day","250"));
  const lateFee = req.body.late_fee!==undefined ? Math.max(0,Number(req.body.late_fee)) : lateDays*lateRate;
  const damage=Math.max(0,Number(req.body.damage_charge||0));
  const deposit=Number(booking.deposit_total||0);
  const refund=Math.max(0,deposit-lateFee-damage);
  const maintenance=Boolean(req.body.maintenance_required);
  await db.query(`
    INSERT INTO return_inspections
      (booking_id,condition_before,condition_after,missing_items,damage_notes,late_days,late_fee,damage_charge,deposit_refund,maintenance_required,inspected_by_user_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE condition_before=VALUES(condition_before),condition_after=VALUES(condition_after),
      missing_items=VALUES(missing_items),damage_notes=VALUES(damage_notes),late_days=VALUES(late_days),
      late_fee=VALUES(late_fee),damage_charge=VALUES(damage_charge),deposit_refund=VALUES(deposit_refund),
      maintenance_required=VALUES(maintenance_required),inspected_by_user_id=VALUES(inspected_by_user_id),returned_at=NOW()
  `,[bookingId,req.body.condition_before||null,req.body.condition_after||"Good",req.body.missing_items||null,req.body.damage_notes||null,lateDays,lateFee,damage,refund,maintenance?1:0,req.user.id]);
  if(maintenance){
    for(const row of booking.items){
      await db.query("INSERT INTO maintenance_records(rental_item_id,booking_id,reason,status,notes) VALUES(?,?,'Return inspection flagged maintenance','open',?)",[row.rental_item_id,bookingId,req.body.damage_notes||null]);
      await db.query("UPDATE rental_items SET status='maintenance' WHERE id=?",[row.rental_item_id]);
    }
  }
  if(booking.status!=="returned"){
    await db.query("UPDATE bookings SET status='returned' WHERE id=?",[bookingId]);
    await db.query("INSERT INTO booking_status_history(booking_id,from_status,to_status,changed_by_user_id,note) VALUES(?,?,'returned',?,?)",[bookingId,booking.status,req.user.id,"Return inspection recorded"]);
  }
  res.json({ok:true,late_days:lateDays,late_fee:lateFee,damage_charge:damage,deposit_refund:refund});
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

app.get("/api/admin/maintenance", authenticate, requireRole("admin"), async (_req,res) => {
  const [records]=await db.query(`
    SELECT m.*,r.name item_name,r.sku,b.booking_no
    FROM maintenance_records m JOIN rental_items r ON r.id=m.rental_item_id
    LEFT JOIN bookings b ON b.id=m.booking_id
    ORDER BY m.opened_at DESC
  `);
  res.json({records});
});

app.patch("/api/admin/maintenance/:id", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const status=req.body.status;
  if(!["open","in_progress","completed","cancelled"].includes(status)) return res.status(400).json({message:"Invalid maintenance status."});
  const [[row]]=await db.query("SELECT rental_item_id FROM maintenance_records WHERE id=?",[id]);
  if(!row) return res.status(404).json({message:"Maintenance record not found."});
  await db.query("UPDATE maintenance_records SET status=?,cost=?,notes=?,completed_at=IF(?='completed',NOW(),completed_at) WHERE id=?",[status,Number(req.body.cost||0),req.body.notes||null,status,id]);
  if(status==="completed"){
    const [[open]]=await db.query("SELECT COUNT(*) count FROM maintenance_records WHERE rental_item_id=? AND status IN ('open','in_progress')",[row.rental_item_id]);
    if(Number(open.count)===0) await db.query("UPDATE rental_items SET status='active' WHERE id=?",[row.rental_item_id]);
  }
  res.json({ok:true});
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


const CUSTOMER_COOKIE = "bloom_borrow_customer_session";
const CUSTOMER_CSRF_COOKIE = "bloom_borrow_customer_csrf";

function customerSecret() {
  const value=process.env.JWT_SECRET;
  const minimum=process.env.NODE_ENV==="production"?64:32;
  if(!value || value.length<minimum) throw new Error(`JWT_SECRET must be at least ${minimum} characters.`);
  return value;
}
function customerCsrfSecret() {
  const value=process.env.CSRF_SECRET || process.env.JWT_SECRET;
  const minimum=process.env.NODE_ENV==="production"?64:32;
  if(!value || value.length<minimum) throw new Error(`CSRF_SECRET must be at least ${minimum} characters.`);
  return value;
}
function customerCsrfForJti(jti) {
  const mac=crypto.createHmac("sha256",customerCsrfSecret()).update(jti).digest("hex");
  return `${jti}.${mac}`;
}
function signCustomerToken(account) {
  return jwt.sign(
    {sub:account.id,type:"customer",customer_id:account.customer_id,email:account.email},
    customerSecret(),
    {expiresIn:process.env.JWT_EXPIRES_IN || "2h",jwtid:crypto.randomUUID()}
  );
}
function setCustomerSession(res,token) {
  const payload=jwt.decode(token);
  const secure=process.env.NODE_ENV==="production";
  const maxAge=Math.max(1,payload.exp*1000-Date.now());
  res.cookie(CUSTOMER_COOKIE,token,{httpOnly:true,secure,sameSite:"lax",path:"/",maxAge});
  res.cookie(CUSTOMER_CSRF_COOKIE,customerCsrfForJti(payload.jti),{httpOnly:false,secure,sameSite:"lax",path:"/",maxAge});
}
function clearCustomerSession(res) {
  const secure=process.env.NODE_ENV==="production";
  res.clearCookie(CUSTOMER_COOKIE,{secure,sameSite:"lax",path:"/"});
  res.clearCookie(CUSTOMER_CSRF_COOKIE,{secure,sameSite:"lax",path:"/"});
}
async function authenticateCustomer(req,res,next) {
  try {
    const token=req.cookies?.[CUSTOMER_COOKIE];
    if(!token) return res.status(401).json({message:"Customer authentication required."});
    const payload=jwt.verify(token,customerSecret(),{algorithms:["HS256"]});
    if(payload.type!=="customer") return res.status(401).json({message:"Invalid customer session."});
    const [[revoked]]=await db.query(
      "SELECT id FROM revoked_tokens WHERE token_hash=? AND expires_at>NOW() LIMIT 1",
      [crypto.createHash("sha256").update(String(payload.jti)).digest("hex")]
    );
    if(revoked) return res.status(401).json({message:"Session is no longer valid."});
    const [[account]]=await db.query(`
      SELECT ca.id,ca.customer_id,ca.email,ca.status,c.full_name,c.phone,c.city,c.address
      FROM customer_accounts ca JOIN customers c ON c.id=ca.customer_id
      WHERE ca.id=? LIMIT 1
    `,[payload.sub]);
    if(!account || account.status!=="active") return res.status(401).json({message:"Customer account is unavailable."});
    req.customerAccount=account;
    req.customerAuthPayload=payload;
    next();
  } catch {
    return res.status(401).json({message:"Invalid or expired customer session."});
  }
}
function requireCustomerCsrf(req,res,next) {
  if(["GET","HEAD","OPTIONS"].includes(req.method)) return next();
  const value=req.get("x-csrf-token");
  const jti=req.customerAuthPayload?.jti;
  const expected=jti?customerCsrfForJti(jti):"";
  const a=Buffer.from(String(value||""));
  const b=Buffer.from(expected);
  if(!value || a.length!==b.length || !crypto.timingSafeEqual(a,b)) {
    return res.status(403).json({message:"Security token validation failed. Refresh and try again."});
  }
  next();
}

app.post("/api/customer-auth/register", async (req,res) => {
  const fullName=String(req.body.full_name||"").trim();
  const email=String(req.body.email||"").trim().toLowerCase();
  const phone=String(req.body.phone||"").trim();
  const city=String(req.body.city||"").trim();
  const address=String(req.body.address||"").trim();
  const password=String(req.body.password||"");

  if(!fullName || !email || !phone || password.length<12 || /password|bloom_borrow|123456/i.test(password)){
    return res.status(400).json({message:"Full name, email, phone, and a non-trivial 12+ character password are required."});
  }

  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();

    const [[existingAccount]]=await conn.query("SELECT id FROM customer_accounts WHERE email=? LIMIT 1",[email]);
    if(existingAccount){
      await conn.rollback();
      return res.status(409).json({message:"A customer account already exists for this email."});
    }

    const [[existingCustomer]]=await conn.query("SELECT id,status FROM customers WHERE email=? LIMIT 1",[email]);
    let customerId;
    if(existingCustomer){
      if(existingCustomer.status==="blocked"){
        await conn.rollback();
        return res.status(403).json({message:"This customer profile is blocked."});
      }
      customerId=existingCustomer.id;
      await conn.query("UPDATE customers SET full_name=?,phone=?,city=?,address=? WHERE id=?",[fullName,phone,city||null,address||null,customerId]);
    }else{
      const [cr]=await conn.query("INSERT INTO customers(full_name,email,phone,city,address,status) VALUES(?,?,?,?,?,'active')",[fullName,email,phone,city||null,address||null]);
      customerId=cr.insertId;
    }

    const hash=await bcrypt.hash(password,12);
    const [ar]=await conn.query("INSERT INTO customer_accounts(customer_id,email,password_hash,status) VALUES(?,?,?,'active')",[customerId,email,hash]);

    await conn.commit();

    const account={id:ar.insertId,customer_id:customerId,email};
    const token=signCustomerToken(account);
    setCustomerSession(res,token);
    res.status(201).json({user:{id:account.id,customer_id:customerId,email,full_name:fullName,phone,city,address}});
  }catch(e){
    try{await conn.rollback()}catch{}
    if(e.code==="ER_DUP_ENTRY") return res.status(409).json({message:"That email address is already registered."});
    throw e;
  }finally{
    conn.release();
  }
});

app.post("/api/customer-auth/login", async (req,res) => {
  const email=String(req.body.email||"").trim().toLowerCase();
  const password=String(req.body.password||"");
  const [[account]]=await db.query(`
    SELECT ca.*,c.full_name,c.phone,c.city,c.address,c.status customer_status
    FROM customer_accounts ca JOIN customers c ON c.id=ca.customer_id
    WHERE ca.email=? LIMIT 1
  `,[email]);

  if(!account || account.status!=="active" || account.customer_status==="blocked"){
    return res.status(401).json({message:"Invalid email or password."});
  }
  if(!await bcrypt.compare(password,account.password_hash)){
    return res.status(401).json({message:"Invalid email or password."});
  }

  await db.query("UPDATE customer_accounts SET last_login_at=NOW() WHERE id=?",[account.id]);
  const token=signCustomerToken(account);
  setCustomerSession(res,token);
  res.json({user:{id:account.id,customer_id:account.customer_id,email:account.email,full_name:account.full_name,phone:account.phone,city:account.city,address:account.address}});
});


app.post("/api/customer-auth/logout", authenticateCustomer, requireCustomerCsrf, async (req,res) => {
  const payload=req.customerAuthPayload;
  await db.query(
    `INSERT INTO revoked_tokens(token_hash,expires_at) VALUES(?,FROM_UNIXTIME(?))
     ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at)`,
    [crypto.createHash("sha256").update(String(payload.jti)).digest("hex"),payload.exp]
  );
  clearCustomerSession(res);
  res.json({ok:true});
});

app.get("/api/customer-account/me", authenticateCustomer, async (req,res) => {
  const a=req.customerAccount;
  const [bookings]=await db.query(`
    SELECT id,booking_no,start_date,end_date,fulfillment,payment_status,status,grand_total,created_at
    FROM bookings WHERE customer_id=? ORDER BY created_at DESC
  `,[a.customer_id]);

  const [favorites]=await db.query(`
    SELECT r.id,r.name,r.category,r.daily_price,r.security_deposit,r.image_url
    FROM customer_favorites f JOIN rental_items r ON r.id=f.rental_item_id
    WHERE f.customer_account_id=? ORDER BY f.created_at DESC
  `,[a.id]);

  const [addresses]=await db.query(`
    SELECT id,label,address,city,is_default FROM customer_saved_addresses
    WHERE customer_account_id=? ORDER BY is_default DESC,created_at DESC
  `,[a.id]);

  res.json({user:a,bookings,favorites,addresses});
});

app.post("/api/customer-account/addresses", authenticateCustomer, requireCustomerCsrf, async (req,res) => {
  const label=String(req.body.label||"Home").trim();
  const address=String(req.body.address||"").trim();
  const city=String(req.body.city||"").trim();
  if(!address) return res.status(400).json({message:"Address is required."});
  if(req.body.is_default){
    await db.query("UPDATE customer_saved_addresses SET is_default=0 WHERE customer_account_id=?",[req.customerAccount.id]);
  }
  const [r]=await db.query(`
    INSERT INTO customer_saved_addresses(customer_account_id,label,address,city,is_default)
    VALUES(?,?,?,?,?)
  `,[req.customerAccount.id,label,address,city||null,req.body.is_default?1:0]);
  res.status(201).json({id:r.insertId});
});

app.delete("/api/customer-account/addresses/:id", authenticateCustomer, requireCustomerCsrf, async (req,res) => {
  await db.query("DELETE FROM customer_saved_addresses WHERE id=? AND customer_account_id=?",[Number(req.params.id),req.customerAccount.id]);
  res.json({ok:true});
});

app.post("/api/customer-account/favorites/:itemId", authenticateCustomer, requireCustomerCsrf, async (req,res) => {
  await db.query(`
    INSERT INTO customer_favorites(customer_account_id,rental_item_id) VALUES(?,?)
    ON DUPLICATE KEY UPDATE rental_item_id=VALUES(rental_item_id)
  `,[req.customerAccount.id,Number(req.params.itemId)]);
  res.json({ok:true});
});

app.delete("/api/customer-account/favorites/:itemId", authenticateCustomer, requireCustomerCsrf, async (req,res) => {
  await db.query("DELETE FROM customer_favorites WHERE customer_account_id=? AND rental_item_id=?",[req.customerAccount.id,Number(req.params.itemId)]);
  res.json({ok:true});
});

app.use((err,req,res,_next) => {
  const requestId=crypto.randomUUID();
  console.error(`[${requestId}]`,err);
  const status=Number(err.statusCode)||500;
  const message=status<500 ? err.message : "Internal server error.";
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