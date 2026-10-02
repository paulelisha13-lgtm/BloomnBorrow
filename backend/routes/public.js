import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { db } from "../lib/db.js";
import { parseBody, schemas } from "../lib/validate.js";
import { createBooking, getAvailability, bookingDetailById } from "../lib/bookings.js";
import { parseDateOnly } from "../lib/dates.js";
import { getSettings } from "../lib/settings.js";
import { sendMail } from "../lib/mailer.js";
import { idDocumentUpload, paymentProofUpload, PAYMENT_PROOFS_DIR } from "../lib/upload.js";
import { addNotification } from "../lib/notifications.js";
import fs from "fs";
import path from "path";
import { peso, escHtml } from "../lib/format.js";
import { INVOICE_BRANDING_KEYS } from "../lib/invoiceTemplate.js";

const router = Router();

// The Customer Side has no login to throttle abuse the way authLimiter does
// for staff, so its write/enumeration surfaces get their own limits.
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PUBLIC_BOOKING || 8),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many rental requests from this device. Please wait a while and try again." }
});
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PUBLIC_LOOKUP || 30),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many status checks from this device. Please wait a while and try again." }
});

const ITEM_FIELDS = "r.id,r.name,r.category,r.description,r.daily_price,r.original_price,r.security_deposit,r.total_quantity,r.image_url";
// rental_items.bundle_items (migration 010) is optional: a database that has
// not run it yet must still serve the full catalog, so the column is probed
// once and then remembered for the lifetime of the process.
let bundleColumnKnown = false;
let hasBundleColumn = false;
async function itemColumns() {
  if (!bundleColumnKnown) {
    try {
      const [[row]] = await db.query(
        "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rental_items' AND COLUMN_NAME='bundle_items'"
      );
      hasBundleColumn = Number(row.c) > 0;
    } catch { hasBundleColumn = false; }
    bundleColumnKnown = true;
  }
  return hasBundleColumn ? `${ITEM_FIELDS},r.bundle_items` : ITEM_FIELDS;
}
// Normalise the JSON column into exactly the shape the customer-facing card
// and details panel expect: a clean list of { name, quantity }, never null.
function parseBundleItems(raw) {
  let list = raw;
  if (typeof list === "string") { try { list = JSON.parse(list); } catch { list = null; } }
  if (!Array.isArray(list)) return [];
  return list
    .map(entry => ({ name: String(entry?.name ?? "").trim(), quantity: Math.max(1, Number(entry?.quantity) || 1) }))
    .filter(entry => entry.name);
}
// Same "reserved right now" figure Admin -> Inventory already shows as
// Available (backend/routes/inventory.js) -- reused verbatim so the
// Customer Side's Available count always agrees with Admin's, instead of a
// second availability metric. This is the general, non-date-specific
// figure for browsing; the date-exact check still happens at checkout via
// /public/availability/check, same as it does for Admin -> Add Booking.
const RESERVED_ALL_SQL = `COALESCE((SELECT SUM(bi.quantity) FROM booking_items bi JOIN bookings b ON b.id=bi.booking_id
  WHERE bi.rental_item_id=r.id AND b.status IN ('pending','confirmed','ready','rented','overdue')
    AND b.end_date >= CURDATE()),0)`;

function withAvailable(item) {
  const { total_quantity, reserved_all, bundle_items, ...rest } = item;
  return {
    ...rest,
    total_quantity,
    available_quantity: Math.max(0, Number(total_quantity) - Number(reserved_all)),
    bundle_items: parseBundleItems(bundle_items)
  };
}

// Public catalog — the same rental_items rows Admin manages, filtered to what
// a customer may book, so an item disabled in Admin disappears here too.
router.get("/api/public/items", async (_req,res) => {
  const [items] = await db.query(`SELECT ${await itemColumns()}, ${RESERVED_ALL_SQL} AS reserved_all FROM rental_items r WHERE r.status='active' ORDER BY r.name`);
  res.json({items: items.map(withAvailable)});
});

router.get("/api/public/items/:id", async (req,res) => {
  const [[item]] = await db.query(`SELECT ${await itemColumns()}, ${RESERVED_ALL_SQL} AS reserved_all FROM rental_items r WHERE r.id=? AND r.status='active' LIMIT 1`,[Number(req.params.id)]);
  if (!item) return res.status(404).json({message:"Item not found."});
  res.json({item: withAvailable(item)});
});

// Same business fields Settings.jsx lets admins edit and invoices already
// use (INVOICE_BRANDING_KEYS), plus the social links from the same
// key-value settings store -- reused here instead of a second contact
// record, and safe to expose publicly (no credentials/internal data).
const SOCIAL_KEYS = ["business_facebook", "business_instagram"];
router.get("/api/public/business-info", async (_req,res) => {
  const business = await getSettings([...INVOICE_BRANDING_KEYS, ...SOCIAL_KEYS]);
  res.json({business});
});

// Mirrors POST /api/admin/availability/check so the customer form's live
// availability box behaves identically to Admin's Add Booking.
router.post("/api/public/availability/check", parseBody(schemas.availabilityCheck), async (req,res) => {
  const start = parseDateOnly(req.body.start_date);
  const end = parseDateOnly(req.body.end_date);
  if (!start || !end || end < start) return res.status(400).json({message:"A valid rental start and end date are required."});
  const checks = [];
  for (const row of req.body.items) {
    const availability = await getAvailability(db, row.item_id, req.body.start_date, req.body.end_date);
    checks.push({
      item_id: row.item_id,
      item_name: availability.item?.name || "Unknown item",
      requested_quantity: row.quantity,
      available_quantity: availability.available_quantity,
      available: Boolean(availability.item && availability.available_quantity >= row.quantity)
    });
  }
  res.json({available: checks.every(x=>x.available), items: checks});
});

// Guest booking request. Multipart because it carries the required ID
// document alongside the booking fields; runs through the exact same
// createBooking() core as Admin -> Add Booking, so it lands in the same
// 'pending' / 'unpaid' state with the same availability/pricing rules.
router.post("/api/public/bookings", bookingLimiter, (req,res,next) => {
  idDocumentUpload(req,res,(err) => {
    if (err) return res.status(400).json({message: err.message || "Could not process the uploaded file."});
    if (!req.file) return res.status(400).json({message:"A valid ID document (JPG, PNG, or PDF, up to 5MB) is required."});
    next();
  });
}, (req,res,next) => {
  // Same job as the shared parseBody() middleware, but done inline so a
  // rejected/invalid request can also clean up the file multer already
  // wrote to disk -- parseBody has no reason to know about uploads.
  if (typeof req.body.items === "string") {
    try { req.body.items = JSON.parse(req.body.items); }
    catch { fs.unlink(req.file.path, () => {}); return res.status(400).json({message:"items must be a valid list."}); }
  }
  const result = schemas.customerBooking.safeParse(req.body);
  if (!result.success) {
    fs.unlink(req.file.path, () => {});
    const issue = result.error.issues[0];
    const field = issue.path.join(".");
    return res.status(400).json({message: field ? `${field} ${issue.message}` : issue.message});
  }
  req.body = result.data;
  next();
}, async (req,res,next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { bookingId, bookingNo, customer, grandTotal } = await createBooking(conn, req.body, {
      historyNote: "Customer self-service booking request",
      idDocument: { path: req.file.filename, originalName: req.file.originalname }
    });
    await conn.commit();

    try {
      const { business_email } = await getSettings(["business_email"]);
      if (business_email) {
        await sendMail({
          to: business_email,
          subject: `New rental request ${bookingNo} — awaiting approval`,
          text: `A customer submitted a new rental request.\n\nBooking: ${bookingNo}\nCustomer: ${customer.full_name} (${customer.email})\nTotal: ${peso(grandTotal)}\nID uploaded: yes\n\nReview it in the Admin Bookings page.`,
          html: `<p>A customer submitted a new rental request.</p><ul><li><b>Booking:</b> ${escHtml(bookingNo)}</li><li><b>Customer:</b> ${escHtml(customer.full_name)} (${escHtml(customer.email)})</li><li><b>Total:</b> ${peso(grandTotal)}</li><li><b>ID uploaded:</b> yes</li></ul><p>Review it in the Admin Bookings page.</p>`
        });
      }
    } catch { /* best-effort: a mail hiccup must never fail the customer's booking */ }

    const booking = await bookingDetailById(bookingId);
    res.status(201).json({booking: {
      booking_no: booking.booking_no, status: booking.status,
      start_date: booking.start_date, end_date: booking.end_date,
      items: booking.items, grand_total: booking.grand_total,
      payment_method: booking.payment_method
    }});
  } catch (error) {
    try { await conn.rollback(); } catch {}
    fs.unlink(req.file.path, () => {}); // the booking never happened, so don't keep the file
    if (error.statusCode) return res.status(error.statusCode).json({message:error.message});
    next(error);
  } finally { conn.release(); }
});

// Status check by booking_no + email (both required, so a guessable/sequential
// booking_no alone cannot be used to browse other customers' requests).
router.get("/api/public/bookings/lookup", lookupLimiter, async (req,res) => {
  const bookingNo = String(req.query.booking_no || "").trim();
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!bookingNo || !email) return res.status(400).json({message:"Booking number and email are required."});
  const [[booking]] = await db.query(
    `SELECT b.id,b.booking_no,b.status,b.payment_status,b.payment_method,b.start_date,b.end_date,b.grand_total,b.created_at,
            w.instructions_sent_at,w.proof_uploaded_at,w.proof_status
     FROM bookings b
     LEFT JOIN booking_payment_workflows w ON w.booking_id=b.id
     WHERE b.booking_no=? AND b.customer_email=? LIMIT 1`,
    [bookingNo, email]
  );
  if (!booking) return res.status(404).json({message:"No booking found for that booking number and email."});
  const [items] = await db.query("SELECT item_name,quantity FROM booking_items WHERE booking_id=?",[booking.id]);
  const { id: _id, instructions_sent_at, proof_uploaded_at, proof_status, ...publicBooking } = booking;
  res.json({booking: {
    ...publicBooking,
    items,
    gcash_instructions_sent: Boolean(instructions_sent_at),
    payment_proof_status: proof_status || null,
    payment_proof_uploaded_at: proof_uploaded_at || null
  }});
});

// Customers identify the booking with the same booking-number + email pair
// used by status lookup. Proofs stay private and are never served publicly.
router.post("/api/public/bookings/payment-proof", bookingLimiter, (req,res,next) => {
  paymentProofUpload(req,res,(err) => {
    if (err) return res.status(400).json({message:err.message || "Could not process the payment proof."});
    if (!req.file) return res.status(400).json({message:"Choose a payment screenshot to upload."});
    next();
  });
}, async (req,res,next) => {
  const removeNewFile = () => { if (req.file?.path) fs.unlink(req.file.path, () => {}); };
  try {
    const bookingNo = String(req.body.booking_no || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!bookingNo || !email) {
      removeNewFile();
      return res.status(400).json({message:"Booking number and email are required."});
    }
    const [[booking]] = await db.query(`
      SELECT b.id,b.booking_no,b.status,b.payment_method,w.instructions_sent_at,w.proof_path
      FROM bookings b
      LEFT JOIN booking_payment_workflows w ON w.booking_id=b.id
      WHERE b.booking_no=? AND b.customer_email=? LIMIT 1
    `,[bookingNo,email]);
    if (!booking) {
      removeNewFile();
      return res.status(404).json({message:"No booking found for that booking number and email."});
    }
    if (booking.payment_method !== "gcash") {
      removeNewFile();
      return res.status(409).json({message:"This booking does not use GCash as its payment method."});
    }
    if (!booking.instructions_sent_at) {
      removeNewFile();
      return res.status(409).json({message:"Payment instructions have not been sent for this booking yet."});
    }
    if (["cancelled","rejected","completed"].includes(booking.status)) {
      removeNewFile();
      return res.status(409).json({message:"Payment proof cannot be submitted for a closed booking."});
    }

    await db.query(`
      UPDATE booking_payment_workflows
      SET proof_path=?,proof_original_name=?,proof_uploaded_at=NOW(),proof_status='submitted'
      WHERE booking_id=?
    `,[req.file.filename,req.file.originalname,booking.id]);
    if (booking.proof_path && booking.proof_path !== req.file.filename) {
      fs.unlink(path.join(PAYMENT_PROOFS_DIR,path.basename(booking.proof_path)),() => {});
    }
    await addNotification({
      bookingId:booking.id,
      type:"PAYMENT_PROOF_UPLOADED",
      title:`Payment proof uploaded for ${booking.booking_no}`,
      message:"A customer uploaded a GCash payment screenshot for review."
    });
    res.status(201).json({ok:true,payment_proof_status:"submitted",payment_proof_uploaded_at:new Date().toISOString()});
  } catch (error) {
    removeNewFile();
    next(error);
  }
});

export default router;
