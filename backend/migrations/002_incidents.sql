-- Phase 2: Lost/Damage Incident Module
-- Add incidents table for tracking lost and damaged items

CREATE TABLE IF NOT EXISTS incidents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_no VARCHAR(30) NOT NULL UNIQUE,
  rental_item_id INT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  customer_id BIGINT UNSIGNED NULL,
  incident_type ENUM('lost','damaged_minor','damaged_major','partially_missing','other') NOT NULL DEFAULT 'damaged_minor',
  status ENUM('reported','investigating','resolved_charged','resolved_insurance','written_off','dismissed') NOT NULL DEFAULT 'reported',
  description TEXT NOT NULL,
  replacement_cost DECIMAL(12,2) NULL DEFAULT 0,
  charge_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  insurance_claim_amount DECIMAL(12,2) NULL DEFAULT 0,
  resolution_notes TEXT NULL,
  reported_by_user_id INT UNSIGNED NULL,
  resolved_by_user_id INT UNSIGNED NULL,
  reported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_incidents_item (rental_item_id),
  INDEX idx_incidents_booking (booking_id),
  INDEX idx_incidents_customer (customer_id),
  INDEX idx_incidents_status (status),
  CONSTRAINT fk_incident_item FOREIGN KEY (rental_item_id) REFERENCES rental_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_incident_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  CONSTRAINT fk_incident_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_incident_reported_by FOREIGN KEY (reported_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_incident_resolved_by FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
