import { Router } from "express";
import { authenticate, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { parseBody, schemas } from "../lib/validate.js";
import { audit, changedFields } from "../lib/audit.js";
import { removeUpload } from "../lib/upload.js";

const router = Router();

router.get("/api/admin/customers/:id/score", authenticate, requireRole("admin","manager","staff"), async (req,res) => {
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

router.get("/api/admin/customers", authenticate, requireRole("admin","manager","staff"), async (_req,res) => {
  const [customers]=await db.query(`
    SELECT c.*,
      COUNT(b.id) booking_count,
      COALESCE(SUM(CASE WHEN b.status='completed' THEN b.grand_total ELSE 0 END),0) lifetime_value,
      MAX(b.created_at) last_booking_at,
      SUM(CASE WHEN b.status='pending' THEN 1 ELSE 0 END) pending_booking_count
    FROM customers c LEFT JOIN bookings b ON b.customer_id=c.id
    GROUP BY c.id ORDER BY c.created_at DESC
  `);
  res.json({customers});
});

router.get("/api/admin/customers/:id", authenticate, requireRole("admin","manager","staff"), async (req,res) => {
  const id=Number(req.params.id);
  const [[customer]]=await db.query(`
    SELECT c.*,COUNT(b.id) booking_count,
      COALESCE(SUM(CASE WHEN b.status='completed' THEN b.grand_total ELSE 0 END),0) lifetime_value,
      MAX(b.created_at) last_booking_at,
      SUM(CASE WHEN b.status='pending' THEN 1 ELSE 0 END) pending_booking_count
    FROM customers c LEFT JOIN bookings b ON b.customer_id=c.id WHERE c.id=? GROUP BY c.id
  `,[id]);
  if(!customer) return res.status(404).json({message:"Customer not found."});
  const [bookings]=await db.query(`
    SELECT b.id,b.booking_no,b.start_date,b.end_date,b.status,b.payment_status,b.rental_subtotal,b.deposit_total,b.delivery_fee,b.grand_total,b.created_at,
      GROUP_CONCAT(CONCAT(bi.item_name,' × ',bi.quantity) ORDER BY bi.id SEPARATOR ', ') items
    FROM bookings b LEFT JOIN booking_items bi ON bi.booking_id=b.id
    WHERE b.customer_id=? GROUP BY b.id ORDER BY b.created_at DESC
  `,[id]);
  res.json({customer:{...customer,recent_bookings:bookings}});
});

router.patch("/api/admin/customers/:id", authenticate, requireRole("admin","manager","staff"), parseBody(schemas.updateCustomer), async (req,res) => {
  const id=Number(req.params.id);
  const [[existing]]=await db.query("SELECT id,full_name,email,phone,city,address,province,postal_code FROM customers WHERE id=?",[id]);
  if(!existing) return res.status(404).json({message:"Customer not found."});
  const {full_name,email,phone,city,address,province,postal_code}=req.body;
  const [[dup]]=await db.query("SELECT id FROM customers WHERE email=? AND id!=?",[email,id]);
  if(dup) return res.status(409).json({message:"Email is already used by another customer."});
  await db.query("UPDATE customers SET full_name=?,email=?,phone=?,city=?,address=?,province=?,postal_code=? WHERE id=?",[full_name,email,phone,city||null,address||null,province||null,postal_code||null,id]);
  const [[updated]]=await db.query("SELECT * FROM customers WHERE id=?",[id]);
  await audit(req,"UPDATE_CUSTOMER",null,{customer_id:id,changed_fields:Object.keys(changedFields(existing,updated,["full_name","email","phone","city","address","province","postal_code"]))});
  res.json({customer:updated});
});

router.delete("/api/admin/customers/:id", authenticate, requireRole("admin","manager"), async (req,res) => {
  const id=Number(req.params.id);
  const conn=await db.getConnection();
  let bookings=[];
  try {
    await conn.beginTransaction();
    const [[customer]]=await conn.query("SELECT id FROM customers WHERE id=? FOR UPDATE",[id]);
    if(!customer) {
      await conn.rollback();
      return res.status(404).json({message:"Customer not found."});
    }
    [bookings]=await conn.query(`
      SELECT b.id,b.id_document_path,
        (SELECT w.proof_path FROM booking_payment_workflows w WHERE w.booking_id=b.id) proof_path
      FROM bookings b WHERE b.customer_id=? FOR UPDATE
    `,[id]);
    await conn.query(`
      UPDATE bookings SET customer_id=NULL,customer_name='Deleted customer',
        customer_email=CONCAT('deleted-',id,'@invalid.local'),customer_phone='',city=NULL,
        delivery_address=NULL,province=NULL,postal_code=NULL,notes=NULL,
        id_document_path=NULL,id_document_original_name=NULL
      WHERE customer_id=?
    `,[id]);
    for(const booking of bookings) {
      await conn.query(`
        UPDATE booking_payment_workflows
        SET proof_path=NULL,proof_original_name=NULL,proof_uploaded_at=NULL,proof_status='awaiting',
            reviewed_at=NULL,reviewed_by_user_id=NULL,review_note=NULL,gcash_reference=NULL,verified_amount=NULL
        WHERE booking_id=?
      `,[booking.id]);
    }
    await conn.query("DELETE FROM customers WHERE id=?",[id]);
    await conn.commit();
  } catch(error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
  for(const booking of bookings) {
    removeUpload("id-documents",booking.id_document_path);
    removeUpload("payment-proofs",booking.proof_path);
  }
  await audit(req,"DELETE_CUSTOMER",null,{customer_id:id,anonymized_booking_count:bookings.length});
  res.json({ok:true,anonymized_booking_count:bookings.length});
});

export default router;
