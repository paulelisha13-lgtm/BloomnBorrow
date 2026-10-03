-- Complete the GCash proof workflow with an explicit Admin review decision.
-- The temporary enum includes the legacy `reviewed` value so existing rows can
-- be migrated safely before the final enum is applied.
ALTER TABLE booking_payment_workflows
  MODIFY COLUMN proof_status ENUM('awaiting','submitted','reviewed','approved','rejected') NOT NULL DEFAULT 'awaiting';

-- Legacy `reviewed` did not create a payment, so return those rows to the
-- review queue instead of implying that money was approved and recorded.
UPDATE booking_payment_workflows SET proof_status='submitted' WHERE proof_status='reviewed';

ALTER TABLE booking_payment_workflows
  MODIFY COLUMN proof_status ENUM('awaiting','submitted','approved','rejected') NOT NULL DEFAULT 'awaiting';

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='booking_payment_workflows' AND COLUMN_NAME='reviewed_at')=0,
  'ALTER TABLE booking_payment_workflows ADD COLUMN reviewed_at DATETIME NULL AFTER proof_status','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='booking_payment_workflows' AND COLUMN_NAME='reviewed_by_user_id')=0,
  'ALTER TABLE booking_payment_workflows ADD COLUMN reviewed_by_user_id INT UNSIGNED NULL AFTER reviewed_at','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='booking_payment_workflows' AND COLUMN_NAME='review_note')=0,
  'ALTER TABLE booking_payment_workflows ADD COLUMN review_note VARCHAR(500) NULL AFTER reviewed_by_user_id','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='booking_payment_workflows' AND COLUMN_NAME='gcash_reference')=0,
  'ALTER TABLE booking_payment_workflows ADD COLUMN gcash_reference VARCHAR(120) NULL AFTER review_note','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='booking_payment_workflows' AND COLUMN_NAME='verified_amount')=0,
  'ALTER TABLE booking_payment_workflows ADD COLUMN verified_amount DECIMAL(12,2) NULL AFTER gcash_reference','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Also repairs databases that ran an earlier draft of this migration.
UPDATE booking_payment_workflows
SET proof_status='submitted',reviewed_at=NULL,reviewed_by_user_id=NULL,review_note=NULL,gcash_reference=NULL
WHERE proof_status='approved' AND verified_amount IS NULL AND proof_path IS NOT NULL;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='booking_payment_workflows' AND CONSTRAINT_NAME='fk_payment_workflow_reviewer')=0,
  'ALTER TABLE booking_payment_workflows ADD CONSTRAINT fk_payment_workflow_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
