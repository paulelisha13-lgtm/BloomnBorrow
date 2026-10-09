-- Expense tracking for the Finance module. Safe to run again.
-- source_type/source_id link an expense to the maintenance or incident record it
-- was confirmed from; the unique key makes confirming the same suggestion twice
-- impossible. Manual expenses use source_type='manual' with a NULL source_id,
-- which MySQL allows to repeat.
CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  expense_date DATE NOT NULL,
  category VARCHAR(40) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  description VARCHAR(255) NOT NULL,
  receipt_path VARCHAR(255) NULL,
  receipt_original_name VARCHAR(255) NULL,
  booking_id BIGINT UNSIGNED NULL,
  rental_item_id INT UNSIGNED NULL,
  source_type ENUM('manual','maintenance','incident') NOT NULL DEFAULT 'manual',
  source_id BIGINT UNSIGNED NULL,
  recorded_by_user_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_expenses_date (expense_date),
  INDEX idx_expenses_category (category),
  UNIQUE KEY uq_expenses_source (source_type, source_id),
  CONSTRAINT fk_expense_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  CONSTRAINT fk_expense_item FOREIGN KEY (rental_item_id) REFERENCES rental_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_expense_user FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Suggested expenses (completed maintenance cost, resolved damage/loss) the
-- owner chose to ignore, so they stop being suggested.
CREATE TABLE IF NOT EXISTS expense_suggestion_dismissals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_type ENUM('maintenance','incident') NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  dismissed_by_user_id INT UNSIGNED NULL,
  dismissed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dismissal_source (source_type, source_id),
  CONSTRAINT fk_dismissal_user FOREIGN KEY (dismissed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
