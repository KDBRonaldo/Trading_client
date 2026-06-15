# Kafka 适配器核心测试方案

## 测试对象

`server/kafka.js`

重点测试交易客户端和中央交易系统之间的 Kafka 适配逻辑。

## 测试目标

验证核心链路可用：

```text
客户端下单 -> 发送 Kafka 指令 -> 接收成交/状态回报 -> 更新本地数据库
```

## 测试方式

10 分钟内不接真实 Kafka，使用 mock 替代：

- Kafka producer
- Kafka consumer
- MySQL `pool.execute`

## 核心用例

### 1. Kafka 未启用时不能发送指令

前置条件：

```env
KAFKA_ENABLED=false
```

操作：

调用 `publishOrderCommand(order)`

预期：

- 抛出 503 错误
- 提示 Kafka 未启用

### 2. 下单指令格式正确

输入：

```json
{
  "fundAccountNo": "6222026000000001",
  "orderNo": "C001",
  "stockCode": "600519",
  "direction": "BUY",
  "price": "1688.35",
  "quantity": "100"
}
```

预期：

- topic 为 `central.order.command`
- message key 为 `C001`
- `price` 转成数字 `1688.35`
- `quantity` 转成数字 `100`

### 3. 撤单指令格式正确

输入：

```json
{
  "orderId": "C001",
  "fundAccountNo": "6222026000000001"
}
```

预期：

- topic 为 `central.cancel.command`
- 消息包含 `orderId`、`accountId`、`timestamp`

### 4. 行情回报可以缓存并查询

输入：

```json
{
  "stockCode": "600519",
  "stockName": "贵州茅台",
  "latestPrice": 1688.35
}
```

操作：

调用 `getCachedStockQuotes("600519")`

预期：

- 返回 1 条行情
- `stockCode` 为 `600519`
- `latestPrice` 为 `1688.35`

### 5. 成交回报更新订单

输入成交回报：

```json
{
  "tradeNo": "T001",
  "orderId": "C001",
  "stockCode": "600519",
  "tradePrice": 1688.35,
  "tradeQuantity": 100
}
```

数据库 mock 原订单：

```json
{
  "local_order_id": 1,
  "order_quantity": 100,
  "traded_quantity": 0,
  "stock_code": "600519"
}
```

预期：

- `traded_quantity` 更新为 `100`
- `remaining_quantity` 更新为 `0`
- `order_status` 更新为 `TRADED`
- 新增一条 `trade_record`

## 通过标准

以上 5 个用例全部通过，即认为 Kafka 适配器核心交易链路可用。
