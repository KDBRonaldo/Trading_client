USE account_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM operation_log;
DELETE FROM holding_change_log;
DELETE FROM holding;
DELETE FROM fund_transaction_log;
DELETE FROM fund_account;
DELETE FROM security_account;
DELETE FROM login_certificate_state;
DELETE FROM staff;
DELETE FROM investor;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO staff (staff_id, username, password_hash, status, created_at) VALUES
(1, 'staff01', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', CONVERT(0xE6ADA3E5B8B8 USING utf8mb4), NOW()),
(2, 'staff02', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', CONVERT(0xE6ADA3E5B8B8 USING utf8mb4), NOW()),
(3, 'staff03', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', CONVERT(0xE6ADA3E5B8B8 USING utf8mb4), NOW()),
(4, 'staff04', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', CONVERT(0xE6ADA3E5B8B8 USING utf8mb4), NOW()),
(5, 'staff05', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', CONVERT(0xE6ADA3E5B8B8 USING utf8mb4), NOW()),
(6, 'staff06', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', CONVERT(0xE6ADA3E5B8B8 USING utf8mb4), NOW()),
(7, 'staff07', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', CONVERT(0xE6ADA3E5B8B8 USING utf8mb4), NOW()),
(8, 'staff08', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', CONVERT(0xE6ADA3E5B8B8 USING utf8mb4), NOW()),
(9, 'staff09', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', CONVERT(0xE6ADA3E5B8B8 USING utf8mb4), NOW()),
(10, 'staff10', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', CONVERT(0xE6ADA3E5B8B8 USING utf8mb4), NOW()),
(11, 'tradeadmin', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', CONVERT(0xE6ADA3E5B8B8 USING utf8mb4), NOW());
