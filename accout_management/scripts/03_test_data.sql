USE account_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM operation_log;
DELETE FROM holding;
DELETE FROM fund_transaction_log;
DELETE FROM fund_account;
DELETE FROM security_account;
DELETE FROM staff;
DELETE FROM investor;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO investor (
    investor_id, type, name, id_type, id_number, phone, address,
    occupation, education, legal_number, business_license,
    authorize_name, authorize_phone, authorize_address,
    executor_name, agent_name, agent_id_number
) VALUES
    (1, '个人', '张三', '身份证', '330101199001010011', '13800000001', '浙江省杭州市西湖区文三路1号', '工程师', '本科', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (2, '个人', '李四', '身份证', '330102199202020022', '13800000002', '浙江省杭州市拱墅区莫干山路2号', '教师', '硕士', NULL, NULL, NULL, NULL, NULL, NULL, '王五', '330102198812120033'),
    (3, '法人', '杭州星河科技有限公司', '营业执照', '91330100MA0000001A', '0571-88000000', '浙江省杭州市滨江区江南大道88号', NULL, NULL, 'REG-2026-001', 'LIC-2026-001', '330103198503030044', '13900000003', '浙江省杭州市滨江区科技园1幢', '赵六', NULL, NULL);

INSERT INTO staff (
    staff_id, username, password_hash, status
) VALUES
    (1, 'staff01', 'sha256$demo$staff01pass', '正常'),
    (2, 'operator01', 'sha256$demo$operator01pass', '正常');

INSERT INTO security_account (
    sec_acc_no, investor_id, status, open_date, linked_fund_acc
) VALUES
    ('SA2026000001', 1, '正常', '2026-06-01', NULL),
    ('SA2026000002', 2, '正常', '2026-06-02', NULL),
    ('SA2026000003', 3, '正常', '2026-06-03', NULL);

INSERT INTO fund_account (
    fund_acc_no, sec_acc_no, trade_password, withdraw_password,
    available_balance, frozen_balance, currency, status,
    open_date, last_interest_date, annual_interest_rate
) VALUES
    ('FA2026000001', 'SA2026000001', 'sha256$demo$trade001', 'sha256$demo$withdraw001', 120000.00, 5000.00, 'CNY', '正常', '2026-06-01', '2025-06-30', 0.0035),
    ('FA2026000002', 'SA2026000002', 'sha256$demo$trade002', 'sha256$demo$withdraw002', 56000.00, 0.00, 'CNY', '正常', '2026-06-02', '2025-06-30', 0.0035),
    ('FA2026000003', 'SA2026000003', 'sha256$demo$trade003', 'sha256$demo$withdraw003', 350000.00, 20000.00, 'CNY', '正常', '2026-06-03', '2025-06-30', 0.0035);

UPDATE security_account
SET linked_fund_acc = CASE sec_acc_no
    WHEN 'SA2026000001' THEN 'FA2026000001'
    WHEN 'SA2026000002' THEN 'FA2026000002'
    WHEN 'SA2026000003' THEN 'FA2026000003'
END
WHERE sec_acc_no IN ('SA2026000001', 'SA2026000002', 'SA2026000003');

INSERT INTO holding (
    holding_id, sec_acc_no, stock_code, stock_name, quantity, frozen_quantity, avg_cost
) VALUES
    (1, 'SA2026000001', '600519', '贵州茅台', 200, 50, 1680.5000),
    (2, 'SA2026000001', '000001', '平安银行', 1000, 0, 11.2300),
    (3, 'SA2026000002', '600036', '招商银行', 800, 100, 41.8800),
    (4, 'SA2026000003', '300750', '宁德时代', 500, 0, 186.4500);

INSERT INTO fund_transaction_log (
    log_id, fund_acc_no, txn_type, amount, available_after, frozen_after, ref_order_id, operator_id, txn_time
) VALUES
    (1, 'FA2026000001', '存款', 100000.00, 100000.00, 0.00, NULL, 1, '2026-06-01 09:10:00'),
    (2, 'FA2026000001', '买入冻结', 5000.00, 95000.00, 5000.00, 'ORD-20260601-0001', NULL, '2026-06-01 10:00:00'),
    (3, 'FA2026000001', '卖出回款', 25000.00, 120000.00, 5000.00, 'ORD-20260602-0003', NULL, '2026-06-02 14:20:00'),
    (4, 'FA2026000002', '存款', 56000.00, 56000.00, 0.00, NULL, 2, '2026-06-02 11:00:00'),
    (5, 'FA2026000003', '存款', 370000.00, 370000.00, 0.00, NULL, 1, '2026-06-03 09:00:00'),
    (6, 'FA2026000003', '买入冻结', 20000.00, 350000.00, 20000.00, 'ORD-20260603-0010', NULL, '2026-06-03 09:30:00');

INSERT INTO operation_log (
    log_id, staff_id, operation_type, target_type, target_id, detail, operation_time
) VALUES
    (1, 1, '证券账户开户', 'security_account', 'SA2026000001', '为张三开设证券账户', '2026-06-01 09:00:00'),
    (2, 1, '资金账户开户', 'fund_account', 'FA2026000001', '为SA2026000001开设并绑定资金账户', '2026-06-01 09:05:00'),
    (3, 2, '存款', 'fund_account', 'FA2026000002', '柜台存款56000.00', '2026-06-02 11:00:00'),
    (4, 1, '证券账户开户', 'security_account', 'SA2026000003', '为杭州星河科技有限公司开设证券账户', '2026-06-03 08:50:00');
