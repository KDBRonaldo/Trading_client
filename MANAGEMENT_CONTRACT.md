# 交易客户端与交易管理系统接口契约

本文档由交易客户端定义，交易管理系统按此格式适配。

## 基本约定

- 协议：HTTP。
- 数据格式：JSON UTF-8。
- 调用方式：交易客户端发起买入/卖出委托后，先调用交易管理系统审查；只有审查通过才会继续冻结资金/股票并提交中央交易系统。
- 交易管理系统只负责审查，不负责冻结资金、不负责撮合成交、不负责写入中央交易委托。

## 环境配置

交易客户端前端通过浏览器 `localStorage` 配置交易管理系统地址：

```js
localStorage.setItem("managementApiBase", "http://localhost:8081");
location.reload();
```

实际联调时，`http://localhost:8081` 替换为交易管理系统提供的地址。

## 1. 委托审查

接口：

```http
POST /api/trade-management/orders/review
Content-Type: application/json
```

请求示例：

```json
{
  "reviewId": "R1710000000000",
  "orderId": "C1710000000000",
  "accountId": "6222026000000001",
  "fundAccountNo": "6222026000000001",
  "securityAccountNo": "A000001",
  "stockCode": "600519",
  "side": "BUY",
  "price": 1688.35,
  "quantity": 100,
  "amount": 168835.00,
  "clientTime": "2026-06-15T10:00:00+08:00"
}
```

字段说明：

| 字段                  | 类型     | 必填  | 说明                           |
| ------------------- | ------ | --- | ---------------------------- |
| `reviewId`          | string | 是   | 本次审查请求 ID，由交易客户端生成           |
| `orderId`           | string | 是   | 委托号，由交易客户端生成，后续会继续发给中央交易系统   |
| `accountId`         | string | 是   | 资金账户号，兼容交易管理系统只需要一个账户 ID 的场景 |
| `fundAccountNo`     | string | 是   | 资金账户号                        |
| `securityAccountNo` | string | 是   | 证券账户号                        |
| `stockCode`         | string | 是   | 6 位股票代码                      |
| `side`              | string | 是   | `BUY` 或 `SELL`               |
| `price`             | number | 是   | 委托价格，最多两位小数                  |
| `quantity`          | number | 是   | 委托数量，单位为股                    |
| `amount`            | number | 是   | 委托金额，等于 `price * quantity`   |
| `clientTime`        | string | 是   | 客户端提交审查时间，ISO 8601 字符串       |

## 成功通过响应

```json
{
  "success": true,
  "data": {
    "reviewId": "R1710000000000",
    "orderId": "C1710000000000",
    "approved": true,
    "riskLevel": "LOW",
    "message": "审查通过"
  }
}
```

## 审查拒绝响应

审查拒绝也建议返回 HTTP 200，因为这是一次成功完成的业务审查，只是结果为不通过。

```json
{
  "success": true,
  "data": {
    "reviewId": "R1710000000000",
    "orderId": "C1710000000000",
    "approved": false,
    "riskLevel": "HIGH",
    "rejectCode": "PRICE_ABNORMAL",
    "reason": "委托价格偏离当前行情过大"
  }
}
```

## 系统异常响应

只有交易管理系统自身无法完成审查时，才返回非 2xx 状态码或 `success: false`。

```json
{
  "success": false,
  "message": "交易管理系统暂时不可用"
}
```

## 状态和枚举

`side`：

```text
BUY, SELL
```

`riskLevel`：

```text
LOW, MEDIUM, HIGH
```

建议的 `rejectCode`：

| rejectCode            | 含义      |
| --------------------- | ------- |
| `ACCOUNT_RESTRICTED`  | 账户被限制交易 |
| `STOCK_RESTRICTED`    | 股票被限制交易 |
| `PRICE_ABNORMAL`      | 委托价格异常  |
| `QUANTITY_ABNORMAL`   | 委托数量异常  |
| `RISK_LIMIT_EXCEEDED` | 超出风控额度  |
| `DUPLICATE_ORDER`     | 重复委托    |
| `OTHER`               | 其他原因    |
