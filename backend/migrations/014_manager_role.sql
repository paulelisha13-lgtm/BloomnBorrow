-- Adds the manager role: admin-level access except Access Management (users)
-- and the Audit Log. Safe to re-run.
ALTER TABLE users MODIFY COLUMN role ENUM('admin','manager','staff') NOT NULL DEFAULT 'staff';
