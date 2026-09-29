import { Router } from "express";
import { authenticate, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { audit, changedFields } from "../lib/audit.js";

const router = Router();

// Readable by staff too: the print invoice renders the same business branding
// as the emailed one, and staff are allowed to send invoices. No credentials
// live in business_settings, and the write route below stays admin-only.
router.get("/api/admin/settings", authenticate, requireRole("admin","staff"), async (_req,res) => {
  const [rows]=await db.query("SELECT setting_key,setting_value FROM business_settings ORDER BY setting_key");
  res.json({settings:Object.fromEntries(rows.map(x=>[x.setting_key,x.setting_value]))});
});

router.put("/api/admin/settings", authenticate, requireRole("admin"), async (req,res) => {
  const allowed=["business_name","business_email","business_phone","business_address","delivery_fee","late_fee_per_day","currency","cancellation_policy","notification_email_enabled","notification_sms_enabled"];
  const [beforeRows]=await db.query("SELECT setting_key,setting_value FROM business_settings");
  const before=Object.fromEntries(beforeRows.map(x=>[x.setting_key,x.setting_value]));
  const after={...before};
  for(const key of allowed) if(req.body[key]!==undefined) after[key]=String(req.body[key]);
  for(const key of allowed){
    if(req.body[key]!==undefined){
      await db.query("INSERT INTO business_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[key,String(req.body[key])]);
    }
  }
  await audit(req,"UPDATE_SETTINGS",null,{changes:changedFields(before,after,allowed)});
  res.json({ok:true});
});

export default router;
