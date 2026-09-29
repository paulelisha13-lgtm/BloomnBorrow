-- Staff accounts: the role column is admin | staff. Older databases were created
-- with admin | driver, so any 'driver' rows become 'staff' before the column is
-- redefined. Safe to re-run: MODIFY COLUMN to the same definition is a no-op.
SET @has_driver = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role' AND COLUMN_TYPE LIKE '%driver%');
SET @ddl = IF(@has_driver>0, "ALTER TABLE users MODIFY COLUMN role ENUM('admin','driver','staff') NOT NULL DEFAULT 'staff'", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE users SET role='staff' WHERE role='driver';
ALTER TABLE users MODIFY COLUMN role ENUM('admin','staff') NOT NULL DEFAULT 'staff';
