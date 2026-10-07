import { Router } from "express";
import { authenticate, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { audit, changedFields } from "../lib/audit.js";
import { RENTAL_POLICY_EDITABLE_KEYS } from "../lib/rentalTerms.js";

const router = Router();

router.get("/api/admin/settings", authenticate, requireRole("admin","manager"), async (_req,res) => {
  const [rows]=await db.query("SELECT setting_key,setting_value FROM business_settings ORDER BY setting_key");
  res.json({settings:Object.fromEntries(rows.map(x=>[x.setting_key,x.setting_value]))});
});

router.put("/api/admin/settings", authenticate, requireRole("admin","manager"), async (req,res) => {
  const allowed=["business_name","business_email","business_phone","business_address","business_facebook","business_instagram","delivery_fee","late_fee_per_day","currency","cancellation_policy","free_delivery_area","delivery_policy","rental_care_policy","loss_damage_policy","inspection_policy","notification_email_enabled","notification_sms_enabled"];
  const [beforeRows]=await db.query("SELECT setting_key,setting_value FROM business_settings");
  const before=Object.fromEntries(beforeRows.map(x=>[x.setting_key,x.setting_value]));
  const after={...before};
  for(const key of allowed) if(req.body[key]!==undefined) after[key]=String(req.body[key]);
  for(const key of allowed){
    if(req.body[key]!==undefined){
      await db.query("INSERT INTO business_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[key,String(req.body[key])]);
    }
  }
  const policyChanged=RENTAL_POLICY_EDITABLE_KEYS.some(key=>req.body[key]!==undefined&&String(req.body[key])!==String(before[key]??""));
  if(policyChanged){
    after.rental_terms_version=new Date().toISOString();
    await db.query("INSERT INTO business_settings(setting_key,setting_value) VALUES('rental_terms_version',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[after.rental_terms_version]);
  }
  await audit(req,"UPDATE_SETTINGS",null,{changes:changedFields(before,after,[...allowed,"rental_terms_version"])});
  res.json({ok:true,rental_terms_version:after.rental_terms_version||before.rental_terms_version||"1.0"});
});

export default router;
