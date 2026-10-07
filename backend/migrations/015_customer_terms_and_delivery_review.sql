-- Records the exact rental terms accepted by customer self-service bookings
-- and distinguishes reviewed free delivery (PHP 0) from a fee not yet quoted.
-- Every statement is safe to run again.
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='delivery_fee_confirmed_at')=0,
  'ALTER TABLE bookings ADD COLUMN delivery_fee_confirmed_at DATETIME NULL AFTER delivery_fee','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='rental_terms_version')=0,
  'ALTER TABLE bookings ADD COLUMN rental_terms_version VARCHAR(80) NULL AFTER id_document_original_name','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='rental_terms_accepted_at')=0,
  'ALTER TABLE bookings ADD COLUMN rental_terms_accepted_at DATETIME NULL AFTER rental_terms_version','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='rental_terms_snapshot')=0,
  'ALTER TABLE bookings ADD COLUMN rental_terms_snapshot LONGTEXT NULL AFTER rental_terms_accepted_at','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO business_settings(setting_key,setting_value) VALUES
  ('free_delivery_area','Biclatan, General Trias, Cavite and nearby areas confirmed by Bloom & Borrow'),
  ('delivery_policy','Addresses outside the free-delivery area are reviewed individually. Any delivery fee is based on distance and trip requirements and will be confirmed before the rental request is approved.'),
  ('rental_care_policy','The renter is responsible for the proper use, handling, and safekeeping of every rented item from receipt until return.'),
  ('loss_damage_policy','Lost, stolen, missing, or irreparably damaged items may be charged at replacement cost. Repairable damage may be charged based on the documented repair cost.'),
  ('inspection_policy','Rental items are checked before release and again upon return. Any issue found during return inspection will be documented and reviewed before the security deposit is settled.'),
  ('rental_terms_version','1.0')
ON DUPLICATE KEY UPDATE setting_value=setting_value;

-- Bookings already past review keep working: treat their delivery fee as reviewed.
UPDATE bookings SET delivery_fee_confirmed_at=created_at WHERE fulfillment='delivery' AND status<>'pending' AND delivery_fee_confirmed_at IS NULL;
