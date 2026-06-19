# 交易客户端与中央交易系统 Kafka 接口契约

本文档由交易客户端定义，中央交易系统按此格式适配。

## 基本约定

- 消息格式：JSON UTF-8。
- Kafka message key：优先使用 `orderId`；行情使用 `stockCode`。
- 时间格式：ISO 8601 字符串，例如 `2026-06-15T10:00:00+08:00`。
- 金额价格：数字类型，保留两位小数。
- 数量：整数，股票数量单位为股。

## Topic

| Topic                    | 方向              | 用途                |
| ------------------------ | --------------- | ----------------- |
| `central.order.command`  | 交易客户端 -> 中央交易系统 | 提交买入/卖出委托         |
| `central.cancel.command` | 交易客户端 -> 中央交易系统 | 取消委托              |
| `central.stock.query`    | 交易客户端 -> 中央交易系统 | 查询股票行情            |
| `client.stock.quote`     | 中央交易系统 -> 交易客户端 | 返回股票行情            |
| `client.trade.report`    | 中央交易系统 -> 交易客户端 | 返回成交反馈            |
| `client.order.report`    | 中央交易系统 -> 交易客户端 | 返回拒绝、过期、撤单等订单状态反馈 |

## 1. 提交指令

Topic：`central.order.command`

```json
{
  "accountId": "6222026000000001",
  "orderId": "C1710000000000",
  "stockCode": "600519",
  "side": "BUY",
  "price": 1688.35,
  "quantity": 100,
  "highLimit": 1850.00,
  "lowLimit": 1520.00,
  "timestamp": "2026-06-15T10:00:00+08:00"
}
```

字段说明：

| 字段          | 类型     | 必填  | 说明             |
| ----------- | ------ | --- | -------------- |
| `accountId` | string | 是   | 资金账户 ID        |
| `orderId`   | string | 是   | 交易客户端生成的委托号    |
| `stockCode` | string | 是   | 6 位股票代码        |
| `side`      | string | 是   | `BUY` 或 `SELL` |
| `price`     | number | 是   | 委托价格           |
| `quantity`  | number | 是   | 委托数量           |
| `highLimit` | number | 否   | 交易客户端页面当前显示的涨停价 |
| `lowLimit`  | number | 否   | 交易客户端页面当前显示的跌停价 |
| `timestamp` | string | 是   | 委托发送时间         |

## 2. 取消指令

Topic：`central.cancel.command`

```json
{
  "orderId": "C1710000000000",
  "accountId": "6222026000000001",
  "timestamp": "2026-06-15T10:01:00+08:00"
}
```

## 3. 查询股票

Topic：`central.stock.query`

```json
{
  "stockCode": "600519",
  "queryId": "Q1710000000000",
  "timestamp": "2026-06-15T10:02:00+08:00"
}
```

## 4. 股票行情反馈

Topic：`client.stock.quote`

```json
{
  "stockCode": "600519",
  "stockName": "贵州茅台",
  "latestPrice": 1688.35,
  "previousClose": 1662.0,
  "highestPrice": 1696.8,
  "lowestPrice": 1651.2,
  "highLimit": 1850.00,
  "lowLimit": 1520.00,
  "bidPrice": 1688.2,
  "askPrice": 1688.5,
  "tradeStatus": "可交易",
  "notice": "年度股东大会公告已发布",
  "quoteTime": "2026-06-15T10:02:01+08:00"
}
```

也允许一次返回多只股票：

```json
{
  "stocks": [
    {
      "stockCode": "600519",
      "stockName": "贵州茅台",
      "latestPrice": 1688.35,
      "previousClose": 1662.0,
      "highestPrice": 1696.8,
      "lowestPrice": 1651.2,
      "bidPrice": 1688.2,
      "askPrice": 1688.5,
      "tradeStatus": "可交易",
      "notice": "",
      "quoteTime": "2026-06-15T10:02:01+08:00"
    }
  ]
}
```

如果股票代码不存在，也请返回到同一个 topic，并带上明确的不存在标记：

```json
{
  "stockCode": "601998",
  "found": false,
  "errorCode": "STOCK_NOT_FOUND",
  "message": "股票不存在",
  "quoteTime": "2026-06-15T10:02:01+08:00"
}
```

交易客户端也兼容 `exists: false`、`status: "NOT_FOUND"` 或 `tradeStatus: "不存在"`，但推荐使用 `found: false` 和 `errorCode: "STOCK_NOT_FOUND"`。

如果中央交易系统对不存在股票不返回任何消息，交易客户端会在 `KAFKA_STOCK_QUERY_TIMEOUT_MS` 后提示“股票不存在或中央交易系统未返回行情”。默认超时时间为 8000ms。

## 5. 成交反馈

Topic：`client.trade.report`

```json
{
  "tradeNo": "T202606150001",
  "buyerOrderId": "C1710000000000",
  "sellerOrderId": "C1710000000001",
  "stockCode": "600519",
  "tradePrice": 1688.35,
  "tradeQuantity": 100,
  "tradeTime": "2026-06-15T10:03:00+08:00"
}
```

如果成交只和我们的一笔委托有关，也可以只发：

```json
{
  "tradeNo": "T202606150001",
  "orderId": "C1710000000000",
  "stockCode": "600519",
  "tradePrice": 1688.35,
  "tradeQuantity": 100,
  "tradeTime": "2026-06-15T10:03:00+08:00"
}
```

## 6. 订单状态反馈

Topic：`client.order.report`

```json
{
  "orderId": "C1710000000000",
  "status": "CANCELED",
  "reason": "用户撤单成功",
  "timestamp": "2026-06-15T10:04:00+08:00"
}
```

状态枚举：

| 状态            | 含义   |
| ------------- | ---- |
| `SUBMITTED`   | 已提交  |
| `ACCEPTED`    | 已受理  |
| `PART_TRADED` | 部分成交 |
| `TRADED`      | 全部成交 |
| `CANCELED`    | 已撤单  |
| `EXPIRED`     | 已过期  |
| `REJECTED`    | 已拒绝  |

## 还需要中央交易系统提供

- Kafka broker 地址，例如 `127.0.0.1:9092`。
- 是否启用 SASL/SSL 认证。
