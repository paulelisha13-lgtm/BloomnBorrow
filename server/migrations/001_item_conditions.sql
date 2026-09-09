-- Phase 1: Item Condition Tracker
-- Add item_conditions table to track condition history for rental items

CREATE TABLE IF NOT EXISTS item_conditions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rental_item_id INT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  condition_status ENUM('excellent','good','fair','poor','damaged','lost') NOT NULL DEFAULT 'good',
  condition_type ENUM('before_rental','after_return','damage_report','maintenance') NOT NULL DEFAULT 'after_return',
  notes TEXT NULL,
  recorded_by_user_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_item_conditions_item (rental_item_id),
  INDEX idx_item_conditions_booking (booking_id),
  CONSTRAINT fk_condition_item FOREIGN KEY (rental_item_id) REFERENCES rental_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_condition_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  CONSTRAINT fk_condition_user FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
