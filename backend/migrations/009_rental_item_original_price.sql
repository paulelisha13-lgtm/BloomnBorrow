-- Discounted-price display: rental_items gains an optional "compare-at" price.
-- Nullable: NULL means the item has no discount, so existing rows and the
-- plain price display are unaffected. Display-only -- bookings, invoices and
-- all totals keep charging daily_price.
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rental_items' AND COLUMN_NAME='original_price')=0,
  'ALTER TABLE rental_items ADD COLUMN original_price DECIMAL(12,2) NULL AFTER daily_price','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
