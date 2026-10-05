import { Router } from "express";
import { authenticate, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { audit } from "../lib/audit.js";
import { recalcPaymentStatus } from "../lib/bookings.js";

const router = Router();

// Payments are never deleted: a mistaken entry is voided, which removes it from
// every total while keeping the record (and who voided it, and why) on file.
router.patch("/api/admin/payments/:id/void", authenticate, requireRole("admin","manager"), async (req,res) => {
  const id=Number(req.params.id);
  const reason=String(req.body.reason||"").trim().slice(0,150);
  if(!reason) return res.status(400).json({message:"A reason is required to void a payment."});
  const [[payment]]=await db.query("SELECT booking_id,amount,payment_type,method,reference_no,status,notes FROM payments WHERE id=?",[id]);
  if(!payment) return res.status(404).json({message:"Payment not found."});
  if(payment.status==="void") return res.status(409).json({message:"This payment is already void."});
  const notes=[payment.notes,`VOID: ${reason}`].filter(Boolean).join(" | ").slice(0,255);
  await db.query("UPDATE payments SET status='void',notes=? WHERE id=?",[notes,id]);
  await recalcPaymentStatus(payment.booking_id);
  const {notes:_notes,status:_status,...details}=payment;
  await audit(req,"VOID_PAYMENT",null,{payment_id:id,...details,reason});
  res.json({ok:true});
});

router.get("/api/admin/payments", authenticate, requireRole("admin","manager","staff"), async (_req,res) => {
  const [payments]=await db.query(`
    SELECT p.*,b.booking_no,b.customer_name,b.customer_email,u.full_name recorded_by
    FROM payments p JOIN bookings b ON b.id=p.booking_id
    LEFT JOIN users u ON u.id=p.recorded_by_user_id
    ORDER BY p.created_at DESC LIMIT 300
  `);
  res.json({payments});
});

export default router;
