-- Private GCash instruction-delivery and customer payment-proof state.
-- QR images are emailed as transient attachments and are intentionally not
-- persisted or exposed through the customer website.
CREATE TABLE IF NOT EXISTS booking_payment_workflows (
  booking_id BIGINT UNSIGNED PRIMARY KEY,
  instructions_sent_at DATETIME NULL,
  instructions_sent_by_user_id INT UNSIGNED NULL,
  proof_path VARCHAR(255) NULL,
  proof_original_name VARCHAR(255) NULL,
  proof_uploaded_at DATETIME NULL,
  proof_status ENUM('awaiting','submitted','reviewed') NOT NULL DEFAULT 'awaiting',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_workflow_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_workflow_sender FOREIGN KEY (instructions_sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
