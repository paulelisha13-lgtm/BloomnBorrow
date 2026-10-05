import { Router } from "express";
import { authenticate, requireRole, requireStaffCsrf } from "../lib/auth.js";
import { parseBody, schemas } from "../lib/validate.js";
import { db } from "../lib/db.js";
import { checkOverdueBookings } from "../jobs/overdueCheck.js";
import { audit } from "../lib/audit.js";
import { getAvailability, bookingDetailById, createBooking, validTransitions, recalcPaymentStatus } from "../lib/bookings.js";
import { gcashQrUpload, removeUpload, sendUpload } from "../lib/upload.js";
import { lateDaysSince, parseDateOnly, rentalDays, toDateOnly } from "../lib/dates.js";
import { generateIncidentNo } from "../lib/incidents.js";
import { addNotification } from "../lib/notifications.js";
import { getSetting, getSettings } from "../lib/settings.js";
import { INVOICE_BRANDING_KEYS, renderInvoiceHtml, renderInvoiceText } from "../lib/invoiceTemplate.js";
import { sendMail } from "../lib/mailer.js";
import { escHtml, peso } from "../lib/format.js";
import { allocateVerifiedGcashPayment } from "../lib/gcashPayment.js";
import { lifecycleEmailResponse, sendBookingLifecycleEmail } from "../lib/bookingEmails.js";
import { bookingStatusUrl } from "../lib/bookingAccess.js";

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
    SELECT b.id,b.booking_no,b.customer_name,b.start_date,b.end_date,b.grand_total,b.status,b.payment_status,b.created_at,
           GROUP_CONCAT(CONCAT(bi.item_name,' × ',bi.quantity) ORDER BY bi.id SEPARATOR ', ') AS items,
           MAX(w.proof_status) AS gcash_proof_status,MAX(w.proof_uploaded_at) AS gcash_proof_uploaded_at
    FROM bookings b
    LEFT JOIN booking_items bi ON bi.booking_id=b.id
    LEFT JOIN booking_payment_workflows w ON w.booking_id=b.id
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
    const delivery=await sendBookingLifecycleEmail({bookingId,event:"submitted"});
    res.status(201).json({booking:await bookingDetailById(bookingId),...lifecycleEmailResponse(delivery,"Booking created.")});
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
  const sent = await sendUpload(res,"id-documents",booking.id_document_path,{name:booking.id_document_original_name});
  if (!sent) return res.status(404).json({message:"No ID document on file for this booking."});
});

router.get("/api/admin/bookings/:id/payment-proof", authenticate, requireRole("admin","staff"), async (req,res) => {
  const [[proof]] = await db.query("SELECT proof_path,proof_original_name FROM booking_payment_workflows WHERE booking_id=?",[Number(req.params.id)]);
  if (!proof?.proof_path) return res.status(404).json({message:"No payment proof has been uploaded for this booking."});
  const sent = await sendUpload(res,"payment-proofs",proof.proof_path,{name:proof.proof_original_name,inline:true});
  if (!sent) return res.status(404).json({message:"The payment proof file is no longer available."});
});

router.patch("/api/admin/bookings/:id/payment-proof/review", authenticate, requireRole("admin","staff"), parseBody(schemas.gcashProofReview), async (req,res,next) => {
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0) return res.status(400).json({message:"Invalid booking ID."});
  const {action,verified_amount,gcash_reference,review_note}=req.body;
  const conn=await db.getConnection();
  let booking;
  let allocation=null;
  const paymentIds=[];
  try {
    await conn.beginTransaction();
    [[booking]]=await conn.query(`
      SELECT b.id,b.booking_no,b.customer_name,b.customer_email,b.payment_method,b.payment_status,b.status,
             b.rental_subtotal,b.deposit_total,b.delivery_fee,b.grand_total,
             w.proof_path,w.proof_status
      FROM bookings b
      LEFT JOIN booking_payment_workflows w ON w.booking_id=b.id
      WHERE b.id=? FOR UPDATE
    `,[id]);
    if(!booking){await conn.rollback();return res.status(404).json({message:"Booking not found."});}
    if(booking.payment_method!=="gcash"){await conn.rollback();return res.status(409).json({message:"This booking does not use GCash as its payment method."});}
    if(!booking.proof_path){await conn.rollback();return res.status(409).json({message:"No customer payment proof has been uploaded for this booking."});}
    if(booking.proof_status!=="submitted"){
      const message=booking.proof_status==="approved"
        ? "This payment proof has already been approved. No additional payment was recorded."
        : booking.proof_status==="rejected"
          ? "This payment proof has already been rejected. Wait for the customer to upload a new screenshot."
          : "This payment proof is not ready for review.";
      await conn.rollback();
      return res.status(409).json({message});
    }
    if(["cancelled","rejected","completed"].includes(booking.status)){
      await conn.rollback();
      return res.status(409).json({message:"Payment proof cannot be reviewed for a closed booking."});
    }

    if(action==="approve"){
      const [[paid]]=await conn.query(`
        SELECT
          COALESCE(SUM(CASE WHEN payment_type IN ('rental','delivery','other') THEN amount ELSE 0 END),0) AS rental_paid,
          COALESCE(SUM(CASE WHEN payment_type='deposit' THEN amount ELSE 0 END),0) AS deposit_paid
        FROM payments WHERE booking_id=? AND status='completed'
      `,[id]);
      try {
        allocation=allocateVerifiedGcashPayment({
          verifiedAmount:verified_amount,
          rentalDue:Number(booking.rental_subtotal||0)+Number(booking.delivery_fee||0),
          depositDue:booking.deposit_total,
          rentalPaid:paid.rental_paid,
          depositPaid:paid.deposit_paid
        });
      } catch(error) {
        await conn.rollback();
        const message=error.remainingBalance!==undefined
          ? `Verified amount cannot exceed the remaining balance of ${peso(error.remainingBalance)}.`
          : error.message;
        return res.status(409).json({message});
      }

      const note=["Approved from customer GCash proof",review_note].filter(Boolean).join(" — ").slice(0,255);
      if(allocation.rental>0){
        const [result]=await conn.query(`
          INSERT INTO payments(booking_id,amount,payment_type,method,reference_no,status,notes,recorded_by_user_id)
          VALUES(?,?,'rental','gcash',?,'completed',?,?)
        `,[id,allocation.rental,gcash_reference,note,req.user.id]);
        paymentIds.push(result.insertId);
      }
      if(allocation.deposit>0){
        const [result]=await conn.query(`
          INSERT INTO payments(booking_id,amount,payment_type,method,reference_no,status,notes,recorded_by_user_id)
          VALUES(?,?,'deposit','gcash',?,'completed',?,?)
        `,[id,allocation.deposit,gcash_reference,note,req.user.id]);
        paymentIds.push(result.insertId);
      }
      await conn.query(`
        UPDATE booking_payment_workflows
        SET proof_status='approved',reviewed_at=NOW(),reviewed_by_user_id=?,review_note=?,gcash_reference=?,verified_amount=?
        WHERE booking_id=?
      `,[req.user.id,review_note||null,gcash_reference,verified_amount,id]);
      await recalcPaymentStatus(id,conn);
    } else {
      await conn.query(`
        UPDATE booking_payment_workflows
        SET proof_status='rejected',reviewed_at=NOW(),reviewed_by_user_id=?,review_note=?,gcash_reference=NULL,verified_amount=NULL
        WHERE booking_id=?
      `,[req.user.id,review_note,id]);
    }
    await conn.commit();
  } catch(error) {
    try{await conn.rollback();}catch{}
    return next(error);
  } finally { conn.release(); }

  const approved=action==="approve";
  try {
    await addNotification({
      bookingId:id,
      type:approved?"PAYMENT_PROOF_APPROVED":"PAYMENT_PROOF_REJECTED",
      title:`Payment proof ${approved?"approved":"rejected"} for ${booking.booking_no}`,
      message:approved?`${peso(verified_amount)} was verified and recorded.`:`Customer action required: ${review_note}`
    });
  } catch(error) {
    // The financial decision is already committed. A secondary notification
    // failure must not make the response look like the payment was not saved.
    console.error(`[GCASH REVIEW NOTIFICATION] ${booking.booking_no}:`,error.message);
  }
  await audit(req,approved?"APPROVE_GCASH_PROOF":"REJECT_GCASH_PROOF",null,{
    booking_id:id,booking_no:booking.booking_no,amount:approved?verified_amount:undefined,
    reference_no:approved?gcash_reference:undefined,payment_ids:paymentIds,reason:approved?undefined:review_note
  });

  let emailSent=false;
  let emailWarning="";
  try {
    const {business_name:businessName}=await getSettings(["business_name"]);
    const brand=businessName||"Bloom & Borrow";
    const statusUrl=bookingStatusUrl(id);
    const statusText=statusUrl?`\n\nOpen your secure booking page: ${statusUrl}`:"";
    const statusButton=statusUrl?`<p style="margin:20px 0"><a href="${escHtml(statusUrl)}" style="display:inline-block;padding:11px 17px;border-radius:9px;background:#089b9d;color:#fff;text-decoration:none;font-weight:700">View Booking and Payment</a></p>`:"";
    if(approved){
      const remaining=allocation?.outstandingAfter||0;
      await sendMail({
        to:booking.customer_email,
        subject:`GCash payment approved — ${booking.booking_no}`,
        text:`Hello ${booking.customer_name},\n\nYour GCash payment proof for ${booking.booking_no} has been approved.\n\nVerified amount: ${peso(verified_amount)}\nGCash reference: ${gcash_reference}\nRemaining balance: ${peso(remaining)}\n\n${remaining>0?`You may upload another payment proof from your secure booking page after paying the remaining balance.${statusText}\n\nThis private link expires and should not be forwarded.`:"Your payment has been recorded successfully."}\n\n${brand}`,
        html:`<p>Hello ${escHtml(booking.customer_name)},</p><p>Your GCash payment proof for <strong>${escHtml(booking.booking_no)}</strong> has been approved.</p><ul><li><strong>Verified amount:</strong> ${peso(verified_amount)}</li><li><strong>GCash reference:</strong> ${escHtml(gcash_reference)}</li><li><strong>Remaining balance:</strong> ${peso(remaining)}</li></ul><p>${remaining>0?"You may upload another payment proof from your secure booking page after paying the remaining balance.":"Your payment has been recorded successfully."}</p>${remaining>0?`${statusButton}<p style="font-size:12px;color:#718687">This private link expires and should not be forwarded.</p>`:""}<p>${escHtml(brand)}</p>`
      });
    }else{
      await sendMail({
        to:booking.customer_email,
        subject:`Action needed for GCash payment — ${booking.booking_no}`,
        text:`Hello ${booking.customer_name},\n\nWe could not approve the GCash payment proof for ${booking.booking_no}.\n\nReason: ${review_note}\n\nOpen your secure booking page and upload a clear replacement screenshot.${statusText}\n\nThis private link expires and should not be forwarded.\n\n${brand}`,
        html:`<p>Hello ${escHtml(booking.customer_name)},</p><p>We could not approve the GCash payment proof for <strong>${escHtml(booking.booking_no)}</strong>.</p><p><strong>Reason:</strong> ${escHtml(review_note)}</p><p>Open your secure booking page and upload a clear replacement screenshot.</p>${statusButton}<p style="font-size:12px;color:#718687">This private link expires and should not be forwarded.</p><p>${escHtml(brand)}</p>`
      });
    }
    emailSent=true;
  } catch(error) {
    console.error(`[GCASH REVIEW EMAIL] ${booking.booking_no}:`,error.message);
    emailWarning="The review was saved, but the customer email could not be sent. Check the SMTP configuration and contact the customer manually.";
  }

  res.json({
    ok:true,
    proof_status:approved?"approved":"rejected",
    recorded_payment_ids:paymentIds,
    remaining_balance:allocation?.outstandingAfter??null,
    email_sent:emailSent,
    message:approved
      ? `Payment proof approved and ${peso(verified_amount)} recorded.${emailSent?" Customer email sent.":""}`
      : `Payment proof rejected.${emailSent?" Customer email sent with the reason.":""}`,
    ...(emailWarning?{email_warning:emailWarning}:{})
  });
});

router.delete("/api/admin/bookings/:id", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const [[booking]]=await db.query("SELECT id,booking_no,customer_name,customer_email,status,grand_total FROM bookings WHERE id=?",[id]);
  if(!booking) return res.status(404).json({message:"Booking not found."});
  const [[paymentWorkflow]]=await db.query("SELECT proof_path FROM booking_payment_workflows WHERE booking_id=?",[id]);
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
  if(paymentWorkflow?.proof_path) removeUpload("payment-proofs",paymentWorkflow.proof_path);
  await audit(req,"DELETE_BOOKING",null,{booking_id:id,booking_no:booking.booking_no,status:booking.status,grand_total:booking.grand_total});
  res.json({ok:true});
});

router.patch("/api/admin/bookings/:id/status", authenticate, requireRole("admin","staff"), async (req,res) => {
  const id=Number(req.params.id);
  const to=String(req.body.status||"");
  const note=String(req.body.note||"").slice(0,255);
  const [[booking]] = await db.query("SELECT id,booking_no,status,customer_name FROM bookings WHERE id=?",[id]);
  if(!booking) return res.status(404).json({message:"Booking not found."});
  if(to==="rejected" && !note.trim()) {
    return res.status(400).json({message:"A customer-facing rejection reason is required."});
  }
  if(!(validTransitions[booking.status]||[]).includes(to)) {
    return res.status(409).json({message:`Cannot move booking from ${booking.status} to ${to}.`});
  }
  await db.query("UPDATE bookings SET status=? WHERE id=?",[to,id]);
  await db.query("INSERT INTO booking_status_history(booking_id,from_status,to_status,changed_by_user_id,note) VALUES(?,?,?,?,?)",[id,booking.status,to,req.user.id,note||null]);
  try{await addNotification({bookingId:id,type:"BOOKING_STATUS",title:`Booking ${booking.booking_no}: ${to}`,message:`Your booking status changed from ${booking.status} to ${to}.`});}catch(error){console.error(`[BOOKING NOTIFICATION] ${booking.booking_no}:`,error.message)}
  await audit(req,"BOOKING_STATUS",null,{booking_id:id,from:booking.status,to});
  const delivery=await sendBookingLifecycleEmail({bookingId:id,event:to,context:{note}});
  res.json({ok:true,...lifecycleEmailResponse(delivery,`Booking marked ${to}.`)});
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
  const delivery=await sendBookingLifecycleEmail({bookingId:id,event:"rescheduled",context:{old_start_date:booking.start_date,old_end_date:booking.end_date}});
  res.json({ok:true,grand_total:grand,...lifecycleEmailResponse(delivery,"Booking dates updated.")});
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
  } catch(error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  await audit(req,"RETURN_INSPECTION",null,{booking_id:bookingId,booking_no:booking.booking_no,condition_after:conditionAfter,late_days:lateDays,late_fee:lateFee,damage_charge:damage,deposit_refund:refund});
  const delivery=await sendBookingLifecycleEmail({bookingId,event:"returned",context:{late_fee:lateFee,damage_charge:damage,deposit_refund:refund}});
  res.json({ok:true,late_days:lateDays,late_fee:lateFee,damage_charge:damage,deposit_refund:refund,...lifecycleEmailResponse(delivery,"Return inspection recorded.")});
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
  const delivery=await sendBookingLifecycleEmail({bookingId:id,event:"completed",context:{deposit_refund:booking.inspection?.deposit_refund||0}});
  res.json({ok:true,...lifecycleEmailResponse(delivery,"Rental completed.")});
});

router.post("/api/admin/bookings/:id/send-gcash-instructions", authenticate, requireRole("admin","staff"), requireStaffCsrf, (req,res,next) => {
  gcashQrUpload(req,res,(err) => {
    if (err) return res.status(400).json({message:err.message || "Could not process the GCash QR code."});
    if (!req.file) return res.status(400).json({message:"Choose the GCash QR code image to send."});
    next();
  });
}, async (req,res) => {
  const id = Number(req.params.id);
  const booking = await bookingDetailById(id);
  if (!booking) return res.status(404).json({message:"Booking not found."});
  if (booking.payment_method !== "gcash") return res.status(409).json({message:"This booking did not select GCash as its payment method."});
  if (booking.status === "pending") return res.status(409).json({message:"Approve the rental request before sending payment instructions."});
  if (["cancelled","rejected","completed"].includes(booking.status)) return res.status(409).json({message:"Payment instructions cannot be sent for a closed booking."});
  if (!booking.customer_email) return res.status(400).json({message:"This booking has no customer email address."});

  const instructions = String(req.body.instructions || "").trim();
  if (!instructions) return res.status(400).json({message:"Add the payment instructions to include in the email."});
  if (instructions.length > 2000) return res.status(400).json({message:"Payment instructions must be 2,000 characters or fewer."});

  const business = await getSettings(INVOICE_BRANDING_KEYS);
  const businessName = business.business_name || "Bloom & Borrow";
  const safeInstructions = escHtml(instructions).replace(/\r?\n/g,"<br>");
  const statusUrl = bookingStatusUrl(id);
  const statusText = statusUrl ? `\n\nView your booking and upload payment proof: ${statusUrl}` : "";
  const statusButton = statusUrl ? `<p style="margin:20px 0"><a href="${escHtml(statusUrl)}" style="display:inline-block;padding:11px 17px;border-radius:9px;background:#089b9d;color:#fff;text-decoration:none;font-weight:700">View Booking and Upload Payment Proof</a></p>` : "";
  try {
    await sendMail({
      to:booking.customer_email,
      subject:`GCash payment instructions for ${booking.booking_no} — ${businessName}`,
      text:`Your rental request ${booking.booking_no} has been reviewed.\n\nAmount due: ${peso(Number(booking.grand_total))}\n\n${instructions}\n\nThe GCash QR code is attached to this email. After paying, use the secure link below to view your booking and upload your payment screenshot.${statusText}\n\nThis private link expires and should not be forwarded.`,
      html:`<p>Your rental request <strong>${escHtml(booking.booking_no)}</strong> has been reviewed.</p><p><strong>Amount due:</strong> ${peso(Number(booking.grand_total))}</p><p>${safeInstructions}</p><p>The GCash QR code is attached below. After paying, use the secure button to view your booking and upload your payment screenshot.</p><p><img src="cid:gcash-payment-qr" alt="GCash payment QR code" style="display:block;max-width:320px;width:100%;height:auto"></p>${statusButton}<p style="font-size:12px;color:#718687">This private link expires and should not be forwarded.</p>`,
      attachments:[{
        filename:req.file.originalname || "gcash-qr.png",
        content:req.file.buffer,
        contentType:req.file.mimetype,
        cid:"gcash-payment-qr"
      }]
    });
  } catch (error) {
    return res.status(502).json({message:`Could not send the GCash payment email: ${error.message}`});
  }

  await db.query(`
    INSERT INTO booking_payment_workflows(booking_id,instructions_sent_at,instructions_sent_by_user_id,proof_status)
    VALUES(?,NOW(),?,'awaiting')
    ON DUPLICATE KEY UPDATE instructions_sent_at=NOW(),instructions_sent_by_user_id=VALUES(instructions_sent_by_user_id)
  `,[id,req.user.id]);
  await audit(req,"SEND_GCASH_INSTRUCTIONS",null,{booking_id:id,booking_no:booking.booking_no});
  res.json({ok:true,sent_to:booking.customer_email});
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
  await audit(req,"SEND_INVOICE_EMAIL",null,{booking_id:id,booking_no:booking.booking_no});
  res.json({ok:true, sent_to: to});
});

router.post("/api/admin/bookings/:id/send-status-email", authenticate, requireRole("admin","staff"), requireStaffCsrf, async (req,res) => {
  const id=Number(req.params.id);
  const booking=await bookingDetailById(id);
  if(!booking)return res.status(404).json({message:"Booking not found."});
  const latestStatus=[...(booking.history||[])].reverse().find(entry=>entry.to_status===booking.status);
  const event=booking.status==="pending"?"submitted":booking.status;
  const delivery=await sendBookingLifecycleEmail({
    bookingId:id,
    event,
    context:{
      note:latestStatus?.note||"",
      late_fee:booking.inspection?.late_fee||0,
      damage_charge:booking.inspection?.damage_charge||0,
      deposit_refund:booking.inspection?.deposit_refund||0
    }
  });
  if(delivery.skipped)return res.status(409).json({message:delivery.reason});
  if(!delivery.sent)return res.status(502).json({message:delivery.error});
  await audit(req,"SEND_BOOKING_STATUS_EMAIL",null,{booking_id:id,booking_no:booking.booking_no,status:booking.status});
  res.json({ok:true,email_sent:true,message:`Current ${booking.status} status emailed to the customer.`});
});

router.post("/api/admin/overdue-check", authenticate, requireRole("admin"), async (req,res) => {
  const before = Date.now();
  await checkOverdueBookings();
  await audit(req,"RUN_OVERDUE_CHECK");
  res.json({ok:true, elapsed_ms:Date.now()-before});
});

export default router;
