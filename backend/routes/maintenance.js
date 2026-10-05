import { Router } from "express";
import { authenticate, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { audit } from "../lib/audit.js";

const router = Router();

router.get("/api/admin/maintenance", authenticate, requireRole("admin","manager","staff"), async (_req,res,next) => {
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

router.patch("/api/admin/maintenance/:id", authenticate, requireRole("admin","manager","staff"), async (req,res,next) => {
  try {
    const id=Number(req.params.id);
    const status=req.body.status;
    if(!["open","in_progress","completed","cancelled"].includes(status)) return res.status(400).json({message:"Invalid maintenance status."});
    let [[row]]=await db.query("SELECT rental_item_id,status FROM maintenance_records WHERE id=?",[id]);
    if(!row&&req.body.rental_item_id){
      const rid=Number(req.body.rental_item_id);
      const [ins]=await db.query("INSERT INTO maintenance_records(rental_item_id,booking_id,reason,status,notes) VALUES(?,NULL,'Manual maintenance',?,?)",[rid,status,req.body.notes||null]);
      row={rental_item_id:rid};
      if(status==="completed"){
        const [[open]]=await db.query("SELECT COUNT(*) count FROM maintenance_records WHERE rental_item_id=? AND status IN ('open','in_progress')",[rid]);
        if(Number(open.count)===0) await db.query("UPDATE rental_items SET status='active' WHERE id=?",[rid]);
      }
      await audit(req,"CREATE_MAINTENANCE",null,{maintenance_id:ins.insertId,item_id:rid,status});
      return res.json({ok:true});
    }
    if(!row) return res.status(404).json({message:"Maintenance record not found."});
    await db.query("UPDATE maintenance_records SET status=?,cost=?,notes=?,completed_at=IF(?='completed',NOW(),completed_at) WHERE id=?",[status,Number(req.body.cost||0),req.body.notes||null,status,id]);
    if(status==="completed"){
      const [[open]]=await db.query("SELECT COUNT(*) count FROM maintenance_records WHERE rental_item_id=? AND status IN ('open','in_progress')",[row.rental_item_id]);
      if(Number(open.count)===0) await db.query("UPDATE rental_items SET status='active' WHERE id=?",[row.rental_item_id]);
    }
    await audit(req,"UPDATE_MAINTENANCE",null,{maintenance_id:id,item_id:row.rental_item_id,from:row.status,to:status,cost:Number(req.body.cost||0)});
    res.json({ok:true});
  } catch(err) { next(err); }
});

export default router;
