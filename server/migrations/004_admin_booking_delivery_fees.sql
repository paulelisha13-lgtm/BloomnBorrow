-- Conditional DDL keeps this safe on existing databases and MariaDB versions
-- that do not support ADD COLUMN IF NOT EXISTS.
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customers' AND COLUMN_NAME='province')=0,
  'ALTER TABLE customers ADD COLUMN province VARCHAR(120) NULL AFTER address','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customers' AND COLUMN_NAME='postal_code')=0,
  'ALTER TABLE customers ADD COLUMN postal_code VARCHAR(20) NULL AFTER province','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='province')=0,
  'ALTER TABLE bookings ADD COLUMN province VARCHAR(120) NULL AFTER delivery_address','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='postal_code')=0,
  'ALTER TABLE bookings ADD COLUMN postal_code VARCHAR(20) NULL AFTER province','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='booking_items' AND COLUMN_NAME='delivery_fee_per_piece')=0,
  'ALTER TABLE booking_items ADD COLUMN delivery_fee_per_piece DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER line_deposit_total','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='booking_items' AND COLUMN_NAME='line_delivery_total')=0,
  'ALTER TABLE booking_items ADD COLUMN line_delivery_total DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER delivery_fee_per_piece','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
