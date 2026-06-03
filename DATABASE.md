# 交易客户端数据库说明

交易客户端不是只做前端页面。根据设计报告，交易客户端子系统需要维护一部分本地业务数据，用于会话、委托、成交回报、价格提醒和通知记录。

## 重要边界

资金余额、冻结资金、证券持仓等主数据仍以资金账户系统和证券账户系统为准。交易客户端数据库只保存交易过程中需要追踪的本地流水和必要引用，不重复维护外部系统的账户主数据。

## 需要维护的表

```text
login_session        登录会话表
order_record         委托记录表
trade_record         成交回报表
price_alert          价格提醒规则表
alert_notification   提醒通知记录表
```

建表脚本：

```text
database/schema.sql
```

## 各表用途

### login_session

用于记录用户登录交易客户端后的会话状态。

写入时机：

- 登录成功后写入。

更新时机：

- 用户操作时更新最后活跃时间。
- 退出登录或会话超时时更新状态。

### order_record

用于保存用户提交的买入/卖出委托。

写入时机：

- 买入或卖出委托通过本地校验、交易管理审查，并被中央交易系统受理后写入。

更新时机：

- 收到成交回报。
- 撤单成功。
- 中央交易系统拒绝。
- 当日委托过期。

### trade_record

用于保存中央交易系统返回的成交结果。

写入时机：

- 中央交易系统返回实际成交结果时写入。

关键点：

- `trade_no` 建唯一索引，避免重复成交回报被重复写入。

### price_alert

用于保存用户设置的价格提醒规则。

写入时机：

- 用户新增价格提醒时写入。

更新时机：

- 提醒触发时更新为 `TRIGGERED`。
- 用户删除或关闭提醒时更新为 `DISABLED`。

### alert_notification

用于保存价格提醒触发后的通知。

写入时机：

- 价格提醒规则触发后写入。

更新时机：

- 用户查看通知后更新为已读。

## 前端和数据库的关系

浏览器前端不能直接连接 MySQL。正式实现时应该增加一个交易客户端后端服务，例如：

```text
前端页面
  -> 交易客户端后端 API
    -> MySQL trading_client
    -> 资金账户系统
    -> 证券账户系统
    -> 交易管理系统
    -> 中央交易系统
```

当前前端使用 `localStorage` 只是为了本地演示，相当于临时 mock 存储。最终部署时，`localStorage` 不应该作为正式数据库。

## 建议后端接口

后续如果实现交易客户端后端，可以先提供这些内部接口给前端使用：

```text
POST /api/client/sessions
PATCH /api/client/sessions/{sessionId}

GET /api/client/orders
POST /api/client/orders
PATCH /api/client/orders/{localOrderId}

GET /api/client/trades
POST /api/client/trades

GET /api/client/alerts
POST /api/client/alerts
PATCH /api/client/alerts/{alertId}

GET /api/client/notifications
PATCH /api/client/notifications/{notificationId}
```

也可以先不单独暴露这些接口，而是在买入、卖出、撤单、成交回报处理流程中由后端内部直接写数据库。

## 是否需要加入分工

需要。数据库不是测试阶段才做的东西，它影响委托、成交、撤单和价格提醒的业务闭环。建议由机动支持人员中的一人优先认领数据库持久化与部署相关工作，另一个机动人员协助测试、文档和联调排查。
