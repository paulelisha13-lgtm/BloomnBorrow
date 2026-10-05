-- The customer website (accounts, favorites, saved addresses) was removed; the
-- system is admin-only. Drop its three tables, but only when they hold no rows,
-- so this can never delete real data. Safe to re-run.
SET @has_accounts = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customer_accounts');
SET @has_favorites = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customer_favorites');
SET @has_addresses = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customer_saved_addresses');

SET @rows_accounts = 0, @rows_favorites = 0, @rows_addresses = 0;
SET @q = IF(@has_accounts>0, 'SET @rows_accounts = (SELECT COUNT(*) FROM customer_accounts)', 'SET @rows_accounts = 0');
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @q = IF(@has_favorites>0, 'SET @rows_favorites = (SELECT COUNT(*) FROM customer_favorites)', 'SET @rows_favorites = 0');
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @q = IF(@has_addresses>0, 'SET @rows_addresses = (SELECT COUNT(*) FROM customer_saved_addresses)', 'SET @rows_addresses = 0');
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @all_empty = (@rows_accounts + @rows_favorites + @rows_addresses) = 0;
-- Children first (they reference customer_accounts).
SET @q = IF(@all_empty, 'DROP TABLE IF EXISTS customer_favorites', 'SELECT 1');
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @q = IF(@all_empty, 'DROP TABLE IF EXISTS customer_saved_addresses', 'SELECT 1');
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @q = IF(@all_empty, 'DROP TABLE IF EXISTS customer_accounts', 'SELECT 1');
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;
