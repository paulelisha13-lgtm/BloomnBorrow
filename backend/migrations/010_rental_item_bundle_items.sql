-- Rental packages/bundles: an optional list of what a package item contains.
-- Stored as JSON on the item itself, because a package is still one row with
-- one SKU, one price and one stock count -- the contents are display-only
-- for the customer-facing catalog (card badge + details panel).
-- Nullable: NULL means the item is a plain rental item, not a package.
-- Values are [{"name":"Folding Chair","quantity":4}, ...].
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rental_items' AND COLUMN_NAME='bundle_items')=0,
  'ALTER TABLE rental_items ADD COLUMN bundle_items JSON NULL AFTER image_url','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
