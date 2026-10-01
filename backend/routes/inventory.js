import { Router } from "express";
import { authenticate, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { parseBody, schemas } from "../lib/validate.js";
import { audit } from "../lib/audit.js";

const router = Router();

router.get("/api/admin/inventory", authenticate, requireRole("admin","staff"), async (_req,res) => {
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

router.post("/api/admin/inventory", authenticate, requireRole("admin"), parseBody(schemas.inventoryItem), async (req,res) => {
  const {sku,name,category,description,image_url} = req.body;
  const daily = req.body.daily_price;
  const original = req.body.original_price;
  const deposit = req.body.security_deposit;
  const qty = req.body.total_quantity;
  try {
    const [result] = await db.query(`
      INSERT INTO rental_items(sku,name,category,description,daily_price,original_price,security_deposit,total_quantity,status,image_url)
      VALUES(?,?,?,?,?,?,?,?,?,'active')
    `,[sku,name,category,description||null,daily,original,deposit,qty,image_url||null]);
    await audit(req,"CREATE_RENTAL_ITEM",null,{item_id:result.insertId,sku});
    res.status(201).json({id:result.insertId});
  } catch(e) {
    if (e.code==="ER_DUP_ENTRY") return res.status(409).json({message:"SKU already exists."});
    throw e;
  }
});

router.patch("/api/admin/inventory/:id", authenticate, requireRole("admin"), parseBody(schemas.inventoryItem), async (req,res) => {
  const id=Number(req.params.id);
  const [[old]] = await db.query("SELECT * FROM rental_items WHERE id=?",[id]);
  if(!old) return res.status(404).json({message:"Rental item not found."});
  const next = {...old,...req.body};
  if(!["active","inactive","maintenance"].includes(next.status)) return res.status(400).json({message:"Invalid inventory status."});
  await db.query(`
    UPDATE rental_items SET sku=?,name=?,category=?,description=?,daily_price=?,original_price=?,security_deposit=?,total_quantity=?,status=?,image_url=?
    WHERE id=?
  `,[next.sku,next.name,next.category,next.description||null,Number(next.daily_price),next.original_price==null?null:Number(next.original_price),Number(next.security_deposit),Number(next.total_quantity),next.status,next.image_url||null,id]);
  if(next.status==="maintenance"&&old.status!=="maintenance"){
    await db.query("INSERT INTO maintenance_records(rental_item_id,booking_id,reason,status,notes) VALUES(?,NULL,'Manual maintenance assignment','open',?)",[id,req.body.notes||null]);
  }
  await audit(req,"UPDATE_RENTAL_ITEM",null,{item_id:id});
  res.json({ok:true});
});

router.delete("/api/admin/inventory/:id", authenticate, requireRole("admin"), async (req,res) => {
  const id=Number(req.params.id);
  const [[used]] = await db.query("SELECT COUNT(*) count FROM booking_items WHERE rental_item_id=?",[id]);
  if(Number(used.count)>0) {
    await db.query("UPDATE rental_items SET status='inactive' WHERE id=?",[id]);
    await audit(req,"ARCHIVE_RENTAL_ITEM",null,{item_id:id});
    return res.json({ok:true,archived:true,message:"Item has booking history and was archived instead of deleted."});
  }
  const [[gone]] = await db.query("SELECT sku,name FROM rental_items WHERE id=?",[id]);
  await db.query("DELETE FROM rental_items WHERE id=?",[id]);
  await audit(req,"DELETE_RENTAL_ITEM",null,{item_id:id,sku:gone?.sku,name:gone?.name});
  res.json({ok:true,deleted:true});
});

router.get("/api/admin/items/:id/conditions", authenticate, requireRole("admin","staff"), async (req,res) => {
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

router.post("/api/admin/items/:id/conditions", authenticate, requireRole("admin","staff"), async (req,res) => {
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
  await audit(req,"RECORD_ITEM_CONDITION",null,{item_id:itemId,booking_id:booking_id||null,condition_status,condition_type});
  res.status(201).json({id:result.insertId,ok:true});
});

export default router;
