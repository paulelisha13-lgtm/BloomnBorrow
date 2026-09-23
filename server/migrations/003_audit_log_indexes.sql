-- Indexes for the Audit Log page (filter by date and by action).
-- migrate.js re-runs every migration, and MySQL has no CREATE INDEX IF NOT EXISTS,
-- so each index is only created when information_schema shows it is missing.

SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'access_audit_logs' AND index_name = 'idx_audit_created_at');
SET @ddl := IF(@has_idx = 0, 'CREATE INDEX idx_audit_created_at ON access_audit_logs(created_at)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'access_audit_logs' AND index_name = 'idx_audit_action_created');
SET @ddl := IF(@has_idx = 0, 'CREATE INDEX idx_audit_action_created ON access_audit_logs(action, created_at)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
