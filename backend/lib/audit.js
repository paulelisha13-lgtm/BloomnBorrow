import { db } from "./db.js";

const PRIVATE_DETAIL_KEY = /(?:email|phone|address|full_name|customer_name|(?:^|_)to$)/i;

export function redactPrivateDetails(value) {
  if (Array.isArray(value)) return value.map(redactPrivateDetails);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    PRIVATE_DETAIL_KEY.test(key) ? "[redacted]" : redactPrivateDetails(entry)
  ]));
}

export async function audit(req, action, targetUserId=null, details=null) {
  try {
    await db.query(
      "INSERT INTO access_audit_logs(user_id,action,target_user_id,ip_address,user_agent,details) VALUES(?,?,?,?,?,?)",
      [req.user?.id || null, action, targetUserId, req.ip, req.get("user-agent")?.slice(0,255) || null, details ? JSON.stringify(redactPrivateDetails(details)) : null]
    );
  } catch {}
}

// Field-level before/after for audit details; only fields that actually changed.
export function changedFields(before, after, keys) {
  const changes = {};
  for (const key of keys) {
    const from = before?.[key] ?? null, to = after?.[key] ?? null;
    if (String(from ?? "") !== String(to ?? "")) changes[key] = { from, to };
  }
  return changes;
}
