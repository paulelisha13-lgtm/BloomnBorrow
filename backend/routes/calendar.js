import { Router } from "express";
import { authenticate, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { parseBody, schemas } from "../lib/validate.js";
import { audit, changedFields } from "../lib/audit.js";

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A calendar view is only ever a month or a little wider, so the range is
// capped instead of trusting whatever from/to the client sends.
const RANGE_CAP_DAYS = 93;
const dayMs = 24 * 60 * 60 * 1000;

function readRange(query) {
  const from = DATE_RE.test(query.from || "") ? query.from : null;
  const to = DATE_RE.test(query.to || "") ? query.to : null;
  if (!from || !to) return null;
  const start = Date.parse(from), end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  if (end - start > RANGE_CAP_DAYS * dayMs) return null;
  return { from, to };
}

// Month view: everything scheduled in the visible window, calendar entries
// alongside the real rental bookings so the schedule is useful without having
// to duplicate every booking. Bookings come back flagged read-only.
router.get("/api/admin/calendar", authenticate, requireRole("admin","manager","staff"), async (req,res,next) => {
  try {
    const range = readRange(req.query);
    if (!range) return res.status(400).json({message:"A valid from and to date range is required."});

    const [entries] = await db.query(
      `SELECT e.*,u.full_name created_by
         FROM calendar_entries e
         LEFT JOIN users u ON u.id=e.created_by_user_id
        WHERE e.entry_date BETWEEN ? AND ?
        ORDER BY e.entry_date, e.start_time IS NULL, e.start_time, e.id`,
      [range.from, range.to]
    );

    const [bookings] = await db.query(
      `SELECT b.id,b.booking_no,b.customer_name,b.start_date,b.end_date,b.status,b.payment_status,
              GROUP_CONCAT(bi.item_name ORDER BY bi.id SEPARATOR ', ') items
         FROM bookings b
         LEFT JOIN booking_items bi ON bi.booking_id=b.id
        WHERE b.start_date <= ? AND b.end_date >= ?
        GROUP BY b.id
        ORDER BY b.start_date,b.id`,
      [range.to, range.from]
    );

    res.json({
      entries,
      bookings: bookings.map(b => ({ ...b, source: "booking", read_only: true })),
      range
    });
  } catch (err) { next(err); }
});

router.get("/api/admin/calendar/:id", authenticate, requireRole("admin","manager","staff"), async (req,res,next) => {
  try {
    const id = Number(req.params.id);
    const [[entry]] = await db.query(
      `SELECT e.*,u.full_name created_by
         FROM calendar_entries e
         LEFT JOIN users u ON u.id=e.created_by_user_id
        WHERE e.id=? LIMIT 1`,
      [id]
    );
    if (!entry) return res.status(404).json({message:"Calendar entry not found."});
    res.json({ entry });
  } catch (err) { next(err); }
});

router.post("/api/admin/calendar", authenticate, requireRole("admin","manager","staff"), parseBody(schemas.calendarEntry), async (req,res,next) => {
  try {
    const b = req.body;
    const [result] = await db.query(
      `INSERT INTO calendar_entries
         (entry_type,title,customer_name,customer_email,customer_phone,entry_date,start_time,end_time,
          guests,location,status,category,reminder_at,details,notes,created_by_user_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.entry_type, b.title, b.customer_name || null, b.customer_email || null, b.customer_phone || null,
       b.entry_date, b.start_time, b.end_time, Number(b.guests || 0) || null, b.location || null,
       b.status, b.category || null, b.reminder_at ? b.reminder_at.replace("T", " ") : null,
       b.details || null, b.notes || null, req.user.id]
    );
    await audit(req,"CREATE_CALENDAR_ENTRY",null,{
      entry_id:result.insertId,entry_type:b.entry_type,title:b.title,entry_date:b.entry_date,status:b.status
    });
    res.status(201).json({ id: result.insertId, ok: true });
  } catch (err) { next(err); }
});

router.patch("/api/admin/calendar/:id", authenticate, requireRole("admin","manager","staff"), parseBody(schemas.calendarEntry), async (req,res,next) => {
  try {
    const id = Number(req.params.id);
    const [[before]] = await db.query(
      `SELECT id,entry_type,title,customer_name,customer_email,customer_phone,entry_date,
              start_time,end_time,guests,location,status,category,reminder_at,details,notes
         FROM calendar_entries WHERE id=? LIMIT 1`,
      [id]
    );
    if (!before) return res.status(404).json({message:"Calendar entry not found."});

    const b = req.body;
    await db.query(
      `UPDATE calendar_entries SET
         entry_type=?,title=?,customer_name=?,customer_email=?,customer_phone=?,entry_date=?,
         start_time=?,end_time=?,guests=?,location=?,status=?,category=?,reminder_at=?,details=?,notes=?
       WHERE id=?`,
      [b.entry_type, b.title, b.customer_name || null, b.customer_email || null, b.customer_phone || null,
       b.entry_date, b.start_time, b.end_time, Number(b.guests || 0) || null, b.location || null,
       b.status, b.category || null, b.reminder_at ? b.reminder_at.replace("T", " ") : null,
       b.details || null, b.notes || null, id]
    );

    const [[after]] = await db.query(
      `SELECT entry_type,title,customer_name,customer_email,customer_phone,entry_date,
              start_time,end_time,guests,location,status,category,reminder_at,details,notes
         FROM calendar_entries WHERE id=? LIMIT 1`,
      [id]
    );
    await audit(req,"UPDATE_CALENDAR_ENTRY",null,{
      entry_id:id,title:after.title,entry_date:after.entry_date,
      changes:changedFields(before,after,["entry_type","title","customer_name","customer_email","customer_phone","entry_date","start_time","end_time","guests","location","status","category","reminder_at","details","notes"])
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Admin-only, like every other delete in the app. Cancelling is the soft
// option staff have: it sets status='cancelled' through the PATCH route above.
router.delete("/api/admin/calendar/:id", authenticate, requireRole("admin","manager"), async (req,res,next) => {
  try {
    const id = Number(req.params.id);
    const [[entry]] = await db.query("SELECT id,title,entry_date,entry_type FROM calendar_entries WHERE id=? LIMIT 1",[id]);
    if (!entry) return res.status(404).json({message:"Calendar entry not found."});
    await db.query("DELETE FROM calendar_entries WHERE id=?",[id]);
    await audit(req,"DELETE_CALENDAR_ENTRY",null,{
      entry_id:id,title:entry.title,entry_date:entry.entry_date,entry_type:entry.entry_type
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
