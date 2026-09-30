-- Customer Side: guest bookings submit an ID document for verification.
-- Nullable so existing/admin-created bookings are unaffected. Presence of
-- id_document_path is also how a customer-submitted booking is told apart
-- from a staff-entered one, without a separate "source" column.
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='id_document_path')=0,
  'ALTER TABLE bookings ADD COLUMN id_document_path VARCHAR(255) NULL AFTER notes','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='id_document_original_name')=0,
  'ALTER TABLE bookings ADD COLUMN id_document_original_name VARCHAR(255) NULL AFTER id_document_path','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
