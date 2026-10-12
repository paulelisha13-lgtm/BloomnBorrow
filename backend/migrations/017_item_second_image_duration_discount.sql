-- Second item image + rental duration discount.
--
-- rental_items.image_url_2: optional second photo (promo bundles / packages).
--   NULL = the item has one photo, so every existing row is unchanged.
-- rental_items.duration_discount_*: a per-item "rent 3+ days, pay less per day"
--   rule. It is separate from original_price (the display-only "Save" promo):
--   the discount is taken off daily_price, never off original_price.
--   enabled=0 (the default) means no rule, so existing items price exactly as before.
-- booking_items.duration_discount_*: what a booking line was actually charged.
--   type/value snapshot the rule so a reschedule can re-evaluate it for the new
--   length; per_day is the amount already taken off daily_price. Old rows keep
--   NULL / 0, i.e. no discount, and their stored totals are untouched.

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rental_items' AND COLUMN_NAME='image_url_2')=0,
  'ALTER TABLE rental_items ADD COLUMN image_url_2 TEXT NULL AFTER image_url','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rental_items' AND COLUMN_NAME='duration_discount_enabled')=0,
  'ALTER TABLE rental_items ADD COLUMN duration_discount_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER original_price','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rental_items' AND COLUMN_NAME='duration_discount_type')=0,
  'ALTER TABLE rental_items ADD COLUMN duration_discount_type ENUM(''percent'',''fixed'') NOT NULL DEFAULT ''percent'' AFTER duration_discount_enabled','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rental_items' AND COLUMN_NAME='duration_discount_value')=0,
  'ALTER TABLE rental_items ADD COLUMN duration_discount_value DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER duration_discount_type','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='booking_items' AND COLUMN_NAME='duration_discount_type')=0,
  'ALTER TABLE booking_items ADD COLUMN duration_discount_type ENUM(''percent'',''fixed'') NULL AFTER line_rental_total','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='booking_items' AND COLUMN_NAME='duration_discount_value')=0,
  'ALTER TABLE booking_items ADD COLUMN duration_discount_value DECIMAL(12,2) NULL AFTER duration_discount_type','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='booking_items' AND COLUMN_NAME='duration_discount_per_day')=0,
  'ALTER TABLE booking_items ADD COLUMN duration_discount_per_day DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER duration_discount_value','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
