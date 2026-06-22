# 数据库脚本说明

## 文件列表

当前目录包含以下文件：

- `01_create_tables.sql`
- `02_views.sql`
- `03_test_data.sql`
- `04_optional_procedures.sql`

## 适用范围

本脚本基于当前版本数据库边界编写：

- 不维护黑名单表
- 不维护冻结记录表
- 不做角色体系
- 不记录 IP 地址
- 冻结判断先看账户 `status`
- 交易冻结只依赖：
  - `fund_account.frozen_balance`
  - `holding.frozen_quantity`

## 数据库对象

### 核心表

- `investor`：投资者信息
- `security_account`：证券账户
- `fund_account`：资金账户
- `fund_transaction_log`：资金流水
- `staff`：工作人员
- `holding`：持仓
- `operation_log`：操作日志

### 视图

- `v_fund_account_simple`
- `v_holding_available`
- `v_investor_basic`

### 可选存储过程

- `sp_deposit`
- `sp_withdraw`
- `sp_update_fund_balance`
- `sp_update_security_holding`
- `sp_annual_interest`

## 执行顺序

建议按以下顺序执行：

```sql
SOURCE 01_create_tables.sql;
SOURCE 02_views.sql;
SOURCE 03_test_data.sql;
SOURCE 04_optional_procedures.sql;
```

如果你们暂时不需要存储过程，可以只执行前 3 个文件。

## 建表说明

### 循环依赖处理

`security_account.linked_fund_acc` 和 `fund_account.sec_acc_no` 是双向绑定关系。

因此建表脚本采用：

1. 先创建 `security_account`
2. 再创建 `fund_account`
3. 最后用 `ALTER TABLE` 给 `security_account.linked_fund_acc` 补外键

这样可以避免循环依赖导致建表失败。

### 密码字段

以下字段都保存哈希值，不保存明文：

- `staff.password_hash`
- `fund_account.trade_password`
- `fund_account.withdraw_password`

当前测试数据里为了演示，使用了形如 `sha256$demo$xxx` 的占位值。

如果你们后端已经确定了真实哈希格式，应统一替换测试数据和调用逻辑。

## 关键业务规则

### 账户状态优先

业务处理先检查账户 `status`：

- 证券账户：`security_account.status`
- 资金账户：`fund_account.status`

如果状态不是 `正常`，大部分普通业务直接拒绝。

### 交易冻结第二层判断

状态允许后，再看交易冻结量：

- 资金冻结：`fund_account.frozen_balance`
- 持仓冻结：`holding.frozen_quantity`

### 逻辑删除

除持仓表外，其余核心表默认不做物理删除。

通过状态字段表示注销或禁用：

- 证券账户：`已销户`
- 资金账户：`已销户`
- 工作人员：`禁用`

## 只允许插入和查询的表

以下表设计上只应追加记录，不应更新既有历史：

- `fund_transaction_log`
- `operation_log`

## 存储过程说明

## `sp_deposit`

功能：

- 校验资金账户状态
- 增加可用余额
- 插入“存款”流水

## `sp_withdraw`

功能：

- 校验资金账户状态
- 校验取款密码
- 校验可用余额
- 扣减可用余额
- 插入“取款”流水

注意：

- 当前过程按“传入值和库中存储值直接比对”实现。
- 如果后端要传明文密码，则应由后端先做同一套哈希，再传入过程。

## `sp_update_fund_balance`

支持交易类型：

- `买入冻结`
- `买入扣款`
- `卖出回款`
- `撤单解冻`

特点：

- 自动更新 `available_balance` / `frozen_balance`
- 自动插入资金流水
- 使用 `ref_order_id + txn_type` 做幂等判断

## `sp_update_security_holding`

支持持仓变更类型：

- `买入增加`
- `卖出冻结`
- `卖出扣减`
- `撤单释放`

特点：

- 自动维护 `quantity`
- 自动维护 `frozen_quantity`
- 买入时自动计算移动平均成本

## `sp_annual_interest`

功能：

- 按正常状态资金账户批量结息
- 更新 `available_balance`
- 更新 `last_interest_date`
- 插入“结息”流水

## 简单调用示例

### 存款

```sql
CALL sp_deposit(
    'FA2026000001',
    1000.00,
    1,
    @code,
    @message,
    @available_balance,
    @log_id
);

SELECT @code, @message, @available_balance, @log_id;
```

### 取款

```sql
CALL sp_withdraw(
    'FA2026000001',
    500.00,
    'sha256$demo$withdraw001',
    1,
    @code,
    @message,
    @available_balance,
    @log_id
);

SELECT @code, @message, @available_balance, @log_id;
```

### 交易冻结资金

```sql
CALL sp_update_fund_balance(
    'FA2026000001',
    'ORD-20260615-1001',
    '买入冻结',
    3000.00,
    @code,
    @message,
    @available_balance,
    @frozen_balance,
    @log_id
);

SELECT @code, @message, @available_balance, @frozen_balance, @log_id;
```

### 卖出冻结持仓

```sql
CALL sp_update_security_holding(
    'SA2026000001',
    '600519',
    '卖出冻结',
    10,
    NULL,
    @code,
    @message,
    @quantity,
    @frozen_quantity,
    @avg_cost
);

SELECT @code, @message, @quantity, @frozen_quantity, @avg_cost;
```

## 当前版本暂不包含的数据库对象

- `blacklist`
- `freeze_record`
- 角色权限表
- 委托单表
- 股票基础信息表

`blacklist` 不属于当前数据库脚本范围，应通过外部风控接口或上层服务处理；冻结历史应通过 `operation_log.detail` 留痕，当前数据库不维护独立 `freeze_record` 表。