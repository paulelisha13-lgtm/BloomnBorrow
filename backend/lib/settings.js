import { db } from "./db.js";

export async function getSetting(key, fallback=null) {
  const [[row]] = await db.query("SELECT setting_value FROM business_settings WHERE setting_key=?",[key]);
  return row ? row.setting_value : fallback;
}

// Load several settings in one round trip (invoices need the branding keys on
// every send, and getSetting() would otherwise cost one query per key).
export async function getSettings(keys) {
  if (!keys.length) return {};
  const [rows] = await db.query(
    "SELECT setting_key,setting_value FROM business_settings WHERE setting_key IN (?)",
    [keys]
  );
  return Object.fromEntries(rows.map(r => [r.setting_key, r.setting_value]));
}
