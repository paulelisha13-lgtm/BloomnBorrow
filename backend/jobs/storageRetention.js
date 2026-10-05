import { db } from "../lib/db.js";
import { deleteUpload } from "../lib/upload.js";

// Storage retention, run once a day. Free-tier storage is small and ID photos
// are sensitive, so for bookings that are finished (completed, cancelled or
// rejected) and untouched for UPLOAD_RETENTION_DAYS this deletes the stored ID
// document and payment proof. Bookings, payments, customers and inventory rows
// are never deleted. Bookings with an open damage incident are skipped.
// Also drops notifications older than NOTIFICATION_RETENTION_DAYS.
// Set a variable to 0 to turn that cleanup off.
const days = (value, fallback) => Math.max(0, Math.floor(Number(value ?? fallback)) || 0);
export const UPLOAD_RETENTION_DAYS = days(process.env.UPLOAD_RETENTION_DAYS, 30);
export const NOTIFICATION_RETENTION_DAYS = days(process.env.NOTIFICATION_RETENTION_DAYS, 30);

const BATCH = 50;
const MAX_BATCHES = 40;

export async function purgeOldUploads() {
  if (!UPLOAD_RETENTION_DAYS) return 0;
  let removed = 0;
  let lastId = 0;
  try {
    for (let round = 0; round < MAX_BATCHES; round++) {
      const [rows] = await db.query(`
        SELECT b.id, b.id_document_path, w.proof_path
        FROM bookings b
        LEFT JOIN booking_payment_workflows w ON w.booking_id = b.id
        WHERE b.id > ?
          AND b.status IN ('completed','cancelled','rejected')
          AND b.updated_at < DATE_SUB(NOW(), INTERVAL ? DAY)
          AND (b.id_document_path IS NOT NULL OR w.proof_path IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM incidents i WHERE i.booking_id = b.id AND i.status IN ('reported','investigating')
          )
        ORDER BY b.id LIMIT ${BATCH}
      `, [lastId, UPLOAD_RETENTION_DAYS]);
      if (!rows.length) break;
      for (const row of rows) {
        lastId = row.id;
        // Delete the file first and clear the reference only if that worked, so
        // a storage outage leaves the row for tomorrow instead of orphaning a file.
        if (row.id_document_path && await deleteUpload("id-documents", row.id_document_path)) {
          // updated_at=updated_at keeps the booking's "last changed" time intact.
          await db.query(
            "UPDATE bookings SET id_document_path=NULL,id_document_original_name=NULL,updated_at=updated_at WHERE id=? AND id_document_path=?",
            [row.id, row.id_document_path]
          );
          removed++;
        }
        if (row.proof_path && await deleteUpload("payment-proofs", row.proof_path)) {
          await db.query(
            "UPDATE booking_payment_workflows SET proof_path=NULL,proof_original_name=NULL,updated_at=updated_at WHERE booking_id=? AND proof_path=?",
            [row.id, row.proof_path]
          );
          removed++;
        }
      }
      if (rows.length < BATCH) break;
    }
    if (removed > 0) {
      await db.query(
        "INSERT INTO access_audit_logs(user_id,action,details) VALUES(NULL,'UPLOADS_PURGED',?)",
        [JSON.stringify({ files_deleted: removed, retention_days: UPLOAD_RETENTION_DAYS })]
      );
      console.log(`Upload retention: deleted ${removed} files from bookings finished over ${UPLOAD_RETENTION_DAYS} days ago.`);
    }
  } catch (error) {
    console.error("Upload retention failed:", error);
  }
  return removed;
}

export async function purgeOldNotifications() {
  if (!NOTIFICATION_RETENTION_DAYS) return 0;
  try {
    let deleted = 0;
    for (;;) {
      const [result] = await db.query(
        "DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY) ORDER BY created_at LIMIT 5000",
        [NOTIFICATION_RETENTION_DAYS]
      );
      deleted += result.affectedRows;
      if (result.affectedRows < 5000) break;
    }
    if (deleted > 0) console.log(`Notification retention: deleted ${deleted} notifications older than ${NOTIFICATION_RETENTION_DAYS} days.`);
    return deleted;
  } catch (error) {
    console.error("Notification retention failed:", error);
    return 0;
  }
}

export async function runStorageRetention() {
  await purgeOldUploads();
  await purgeOldNotifications();
}
