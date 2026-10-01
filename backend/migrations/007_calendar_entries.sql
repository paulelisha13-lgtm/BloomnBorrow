-- Calendar Reservation & Booking module
-- Replaces the Incidents module in the admin UI. The incidents table itself is
-- left in place: backend/routes/bookings.js still writes damage records to it
-- during return inspection.

CREATE TABLE IF NOT EXISTS calendar_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entry_type ENUM('booking','reservation','note','event') NOT NULL DEFAULT 'reservation',
  title VARCHAR(160) NOT NULL,
  customer_name VARCHAR(160) NULL,
  customer_email VARCHAR(190) NULL,
  customer_phone VARCHAR(50) NULL,
  entry_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  guests SMALLINT UNSIGNED NULL,
  location VARCHAR(160) NULL,
  status ENUM('pending','confirmed','cancelled','completed') NOT NULL DEFAULT 'pending',
  category VARCHAR(40) NULL,
  reminder_at DATETIME NULL,
  details TEXT NULL,
  notes TEXT NULL,
  created_by_user_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_calendar_date (entry_date),
  INDEX idx_calendar_type (entry_type),
  INDEX idx_calendar_status (status),
  INDEX idx_calendar_created_by (created_by_user_id),
  CONSTRAINT fk_calendar_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
