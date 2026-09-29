import { db } from "./db.js";

export async function getSetting(key, fallback=null) {
  const [[row]] = await db.query("SELECT setting_value FROM business_settings WHERE setting_key=?",[key]);
  return row ? row.setting_value : fallback;
}
