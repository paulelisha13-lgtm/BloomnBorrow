-- Staff accounts: the role column started as admin | staff. Older databases were
-- created with admin | driver, so any 'driver' rows become 'staff' before the
-- column is redefined. Migrations run on every deploy, so this must stay safe to
-- re-run: once migration 014 has added 'manager' (and manager accounts exist),
-- narrowing the column back to admin | staff would fail with "Data truncated for
-- column 'role'". The narrowing therefore only runs while 'manager' is absent.
SET @has_driver = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role' AND COLUMN_TYPE LIKE '%driver%');
SET @ddl = IF(@has_driver>0, "ALTER TABLE users MODIFY COLUMN role ENUM('admin','driver','staff') NOT NULL DEFAULT 'staff'", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE users SET role='staff' WHERE role='driver';
SET @has_manager = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='role' AND COLUMN_TYPE LIKE '%manager%');
SET @ddl = IF(@has_manager>0, 'SELECT 1', "ALTER TABLE users MODIFY COLUMN role ENUM('admin','staff') NOT NULL DEFAULT 'staff'");
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
