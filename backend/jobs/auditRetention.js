import { db } from "../lib/db.js";

// Audit log retention. The log holds personal data (emails, IPs, customer
// names), so entries older than AUDIT_RETENTION_DAYS are deleted once a day.
// Set AUDIT_RETENTION_DAYS=0 to keep everything. Each purge is itself logged.
export const AUDIT_RETENTION_DAYS = Math.max(0, Math.floor(Number(process.env.AUDIT_RETENTION_DAYS ?? 30)) || 0);

export async function purgeOldAuditLogs() {
  if (!AUDIT_RETENTION_DAYS) return 0;
  try {
    let deleted = 0;
    // Small batches so a large first purge never holds long table locks.
    for (;;) {
      const [result] = await db.query(
        "DELETE FROM access_audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY) ORDER BY created_at LIMIT 5000",
        [AUDIT_RETENTION_DAYS]
      );
      deleted += result.affectedRows;
      if (result.affectedRows < 5000) break;
    }
    if (deleted > 0) {
      await db.query(
        "INSERT INTO access_audit_logs(user_id,action,details) VALUES(NULL,'AUDIT_LOG_PURGED',?)",
        [JSON.stringify({ deleted, retention_days: AUDIT_RETENTION_DAYS })]
      );
      console.log(`Audit log retention: deleted ${deleted} entries older than ${AUDIT_RETENTION_DAYS} days.`);
    }
    return deleted;
  } catch (error) {
    console.error("Audit log retention failed:", error);
    return 0;
  }
}
