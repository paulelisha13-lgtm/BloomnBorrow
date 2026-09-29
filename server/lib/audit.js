import { db } from "./db.js";

export async function audit(req, action, targetUserId=null, details=null) {
  try {
    await db.query(
      "INSERT INTO access_audit_logs(user_id,action,target_user_id,ip_address,user_agent,details) VALUES(?,?,?,?,?,?)",
      [req.user?.id || null, action, targetUserId, req.ip, req.get("user-agent")?.slice(0,255) || null, details ? JSON.stringify(details) : null]
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
