import { Router } from "express";
import { authenticate, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { parseBody, schemas } from "../lib/validate.js";
import { audit, changedFields } from "../lib/audit.js";
import { generateIncidentNo } from "../lib/incidents.js";

const router = Router();

router.get("/api/admin/incidents", authenticate, requireRole("admin","staff"), async (_req,res) => {
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

router.post("/api/admin/incidents", authenticate, requireRole("admin","staff"), parseBody(schemas.createIncident), async (req,res) => {
  const {rental_item_id,booking_id,customer_id,incident_type,description,replacement_cost,charge_amount,insurance_claim_amount}=req.body;
  const [[item]]=await db.query("SELECT id FROM rental_items WHERE id=?",[rental_item_id]);
  if(!item) return res.status(404).json({message:"Rental item not found."});
  const incident_no=await generateIncidentNo();
  const [result]=await db.query(`
    INSERT INTO incidents(incident_no,rental_item_id,booking_id,customer_id,incident_type,description,replacement_cost,charge_amount,insurance_claim_amount,reported_by_user_id)
    VALUES(?,?,?,?,?,?,?,?,?,?)
  `,[incident_no,rental_item_id,booking_id||null,customer_id||null,incident_type||"damaged_minor",description,Number(replacement_cost||0),Number(charge_amount||0),Number(insurance_claim_amount||0),req.user.id]);
  await audit(req,"CREATE_INCIDENT",null,{incident_id:result.insertId,incident_no,item_id:rental_item_id,booking_id,incident_type,charge_amount});
  res.status(201).json({id:result.insertId,incident_no,ok:true});
});

router.patch("/api/admin/incidents/:id", authenticate, requireRole("admin","staff"), async (req,res) => {
  const id=Number(req.params.id);
  const [[incident]]=await db.query("SELECT id,incident_no,status,resolution_notes,charge_amount,insurance_claim_amount FROM incidents WHERE id=?",[id]);
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
  const [[after]]=await db.query("SELECT status,resolution_notes,charge_amount,insurance_claim_amount FROM incidents WHERE id=?",[id]);
  await audit(req,"UPDATE_INCIDENT",null,{incident_id:id,incident_no:incident.incident_no,changes:changedFields(incident,after,["status","resolution_notes","charge_amount","insurance_claim_amount"])});
  res.json({ok:true});
});

export default router;
