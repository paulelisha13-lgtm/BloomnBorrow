import { Router } from "express";
import { authenticate, requireRole, requireStaffCsrf } from "../lib/auth.js";
import { parseBody, schemas } from "../lib/validate.js";
import { db } from "../lib/db.js";
import { checkOverdueBookings } from "../jobs/overdueCheck.js";
import { audit } from "../lib/audit.js";
import { getAvailability, bookingDetailById, createBooking, validTransitions, recalcPaymentStatus } from "../lib/bookings.js";
import fs from "fs";
import path from "path";
import { ID_DOCUMENTS_DIR } from "../lib/upload.js";
import { lateDaysSince, parseDateOnly, rentalDays, toDateOnly } from "../lib/dates.js";
import { generateIncidentNo } from "../lib/incidents.js";
import { addNotification } from "../lib/notifications.js";
import { getSetting, getSettings } from "../lib/settings.js";
import { INVOICE_BRANDING_KEYS, renderInvoiceHtml, renderInvoiceText } from "../lib/invoiceTemplate.js";
import { sendMail } from "../lib/mailer.js";

const router = Router();

router.post("/api/admin/availability/check", authenticate, requireRole("admin","staff"), parseBody(schemas.availabilityCheck), async (req,res) => {
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

router.get("/api/admin/bookings", authenticate, requireRole("admin","staff"), async (_req,res) => {
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

router.post("/api/admin/bookings", authenticate, requireRole("admin","staff"), requireStaffCsrf, parseBody(schemas.adminBooking), async (req,res,next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { bookingId, bookingNo, customer, grandTotal } = await createBooking(conn, req.body, {
      historyNote: "Admin booking created",
      changedByUserId: req.user.id
    });
    await conn.commit();
    await audit(req,"CREATE_BOOKING",null,{booking_id:bookingId,booking_no:bookingNo,customer_id:customer.id,grand_total:grandTotal});
    res.status(201).json({booking:await bookingDetailById(bookingId)});
  } catch (error) {
    try { await conn.rollback(); } catch {}
    if (error.statusCode) return res.status(error.statusCode).json({message:error.message});
    next(error);
  } finally { conn.release(); }
});

router.get("/api/admin/bookings/:id", authenticate, requireRole("admin","staff"), async (req,res) => {
  const booking=await bookingDetailById(Number(req.params.id));
  if(!booking) return res.status(404).json({message:"Booking not found."});
  res.json({booking});
});

// Serves the customer's uploaded ID document. Never web-accessible on its
// own (the file lives outside dist/ and is not registered with
// express.static) — this authenticated route is the only way to reach it.
router.get("/api/admin/bookings/:id/id-document", authenticate, requireRole("admin","staff"), async (req,res) => {
  const [[booking]] = await db.query("SELECT id_document_path,id_document_original_name FROM bookings WHERE id=?",[Number(req.params.id)]);
  if (!booking || !booking.id_document_path) return res.status(404).json({message:"No ID document on file for this booking."});
  const filePath = path.join(ID_DOCUMENTS_DIR, path.basename(booking.id_document_path));
  if (!fs.existsSync(filePath)) return res.status(404).json({message:"No ID document on file for this booking."});
  res.download(filePath, booking.id_document_original_name || path.basename(filePath));
});

router.delete("/api/admin/bookings/:id", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const [[booking]]=await db.query("SELECT id,booking_no,customer_name,customer_email,status,grand_total FROM bookings WHERE id=?",[id]);
  if(!booking) return res.status(404).json({message:"Booking not found."});
  // Money records must survive: a booking with any payment on file (even a
  // voided one) can only be cancelled, never deleted. Deleting is for entries
  // made by mistake that never had money attached.
  const [[paid]]=await db.query("SELECT COUNT(*) count FROM payments WHERE booking_id=?",[id]);
  if(Number(paid.count)>0) return res.status(409).json({message:"This booking has payment records, so it cannot be deleted. Cancel it instead to keep its history."});
  const conn=await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const table of ["booking_items","booking_status_history","return_inspections","notifications"]) {
      await conn.query(`DELETE FROM ${table} WHERE booking_id=?`,[id]);
    }
    await conn.query("DELETE FROM bookings WHERE id=?",[id]);
    await conn.commit();
  } catch(error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
  await audit(req,"DELETE_BOOKING",null,{booking_id:id,booking_no:booking.booking_no,customer_name:booking.customer_name,customer_email:booking.customer_email,status:booking.status,grand_total:booking.grand_total});
  res.json({ok:true});
});

router.patch("/api/admin/bookings/:id/status", authenticate, requireRole("admin","staff"), async (req,res) => {
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

router.patch("/api/admin/bookings/:id/reschedule", authenticate, requireRole("admin","staff"), parseBody(schemas.reschedule), async (req,res) => {
  const id=Number(req.params.id);
  const start=parseDateOnly(req.body.start_date), end=parseDateOnly(req.body.end_date);
  if(!start || !end || end<start) return res.status(400).json({message:"Valid dates are required."});
  const booking=await bookingDetailById(id);
  if(!booking) return res.status(404).json({message:"Booking not found."});
  if(!["pending","confirmed","ready"].includes(booking.status)) return res.status(409).json({message:"This booking can no longer be rescheduled."});
  for(const row of booking.items){
    const availability=await getAvailability(db,row.rental_item_id,req.body.start_date,req.body.end_date);
    const selfQty = toDateOnly(booking.start_date) <= req.body.end_date && toDateOnly(booking.end_date) >= req.body.start_date ? Number(row.quantity) : 0;
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
  await audit(req,"RESCHEDULE_BOOKING",null,{booking_id:id,booking_no:booking.booking_no,from:{start_date:booking.start_date,end_date:booking.end_date},to:{start_date:req.body.start_date,end_date:req.body.end_date},grand_total:{from:booking.grand_total,to:grand}});
  res.json({ok:true});
});

router.post("/api/admin/bookings/:id/payments", authenticate, requireRole("admin","staff"), parseBody(schemas.recordPayment), async (req,res) => {
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

router.post("/api/admin/bookings/:id/return-inspection", authenticate, requireRole("admin","staff"), async (req,res) => {
  const bookingId=Number(req.params.id);
  if(!Number.isInteger(bookingId)||bookingId<=0) return res.status(400).json({message:"Invalid booking ID."});
  const conditionAfter=String(req.body.condition_after||"Good").trim();
  const damageCharge=Number(req.body.damage_charge||0);
  if(!Number.isFinite(damageCharge)||damageCharge<0) return res.status(400).json({message:"Damage charge must be a valid non-negative amount."});
  const booking=await bookingDetailById(bookingId);
  if(!booking) return res.status(404).json({message:"Booking not found."});
  if(!["rented","overdue","returned"].includes(booking.status)) return res.status(409).json({message:"Booking must be rented/overdue before return inspection."});
  const lateDays=lateDaysSince(booking.end_date);
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
    await audit(req,"RETURN_INSPECTION",null,{booking_id:bookingId,booking_no:booking.booking_no,condition_after:conditionAfter,late_days:lateDays,late_fee:lateFee,damage_charge:damage,deposit_refund:refund});
    res.json({ok:true,late_days:lateDays,late_fee:lateFee,damage_charge:damage,deposit_refund:refund});
  } catch(error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

router.post("/api/admin/bookings/:id/complete", authenticate, requireRole("admin","staff"), async (req,res) => {
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
  await audit(req,"COMPLETE_BOOKING",null,{booking_id:id,booking_no:booking.booking_no,deposit_refund:booking.inspection?.deposit_refund||0});
  res.json({ok:true});
});

router.post("/api/admin/bookings/:id/send-invoice", authenticate, requireRole("admin","staff"), requireStaffCsrf, parseBody(schemas.sendInvoice), async (req,res) => {
  const id = Number(req.params.id);
  const booking = await bookingDetailById(id);
  if (!booking) return res.status(404).json({message:"Booking not found."});
  const to = req.body.email || booking.customer_email;
  if (!to) return res.status(400).json({message:"This booking has no customer email on file. Add one or send to a specific address."});
  try {
    const business = await getSettings(INVOICE_BRANDING_KEYS);
    await sendMail({
      to,
      subject: `Invoice ${booking.booking_no} — ${business.business_name || "Bloom & Borrow"}`,
      html: renderInvoiceHtml(booking, business),
      text: renderInvoiceText(booking, business)
    });
  } catch (error) {
    return res.status(502).json({message:`Could not send the invoice email: ${error.message}`});
  }
  await audit(req,"SEND_INVOICE_EMAIL",null,{booking_id:id,booking_no:booking.booking_no,to});
  res.json({ok:true, sent_to: to});
});

router.post("/api/admin/overdue-check", authenticate, requireRole("admin"), async (req,res) => {
  const before = Date.now();
  await checkOverdueBookings();
  await audit(req,"RUN_OVERDUE_CHECK");
  res.json({ok:true, elapsed_ms:Date.now()-before});
});

export default router;
