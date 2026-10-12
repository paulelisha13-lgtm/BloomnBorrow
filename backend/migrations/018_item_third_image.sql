-- Third item photo. NULL = the item has fewer than three photos, so every
-- existing row is unchanged (image_url / image_url_2 keep working as before).
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rental_items' AND COLUMN_NAME='image_url_3')=0,
  'ALTER TABLE rental_items ADD COLUMN image_url_3 TEXT NULL AFTER image_url_2','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
