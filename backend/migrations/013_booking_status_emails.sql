-- Enable lifecycle emails once when this feature is first installed. The
-- marker prevents later migrate runs from overriding an Admin who turns the
-- setting off from the Settings page.
SET @first_install = IF((SELECT COUNT(*) FROM business_settings WHERE setting_key='booking_status_email_feature_initialized')=0,1,0);
INSERT IGNORE INTO business_settings(setting_key,setting_value) VALUES('notification_email_enabled','1');
UPDATE business_settings SET setting_value='1' WHERE setting_key='notification_email_enabled' AND @first_install=1;
INSERT IGNORE INTO business_settings(setting_key,setting_value) VALUES('booking_status_email_feature_initialized','1');
