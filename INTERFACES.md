# 交易客户端接口预留说明

当前前端已经把外部交互拆到独立接口文件。其他模块接口确定后，优先改 `js/config.js` 中的 `API_CONFIG.endpoints` 和对应接口文件里的 `normalize...` 函数，不需要重写页面业务流程。

## 接口地址配置

默认不配置任何地址，系统使用本地 mock 演示数据。需要联调时，在浏览器控制台配置：

```js
localStorage.setItem("accountApiBase", "http://localhost:8080");
localStorage.setItem("managementApiBase", "http://localhost:8081");
localStorage.setItem("centralTradingApiBase", "http://localhost:8082");
location.reload();
```

取消联调、恢复本地演示：

```js
localStorage.removeItem("accountApiBase");
localStorage.removeItem("managementApiBase");
localStorage.removeItem("centralTradingApiBase");
localStorage.removeItem("fundAccountApiBase");
location.reload();
```

## 资金账户/证券账户系统

同一个小组负责资金账户和证券账户时，可以共用 `accountApiBase`。

### 登录校验

```http
POST /api/fund-accounts/login
```

请求：

```json
{
  "fundAccountNo": "6222026000000001",
  "tradePassword": "123456"
}
```

建议返回：

```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "fundAccountNo": "6222026000000001",
    "investorName": "演示投资者",
    "accountStatus": "正常",
    "availableCash": 228000,
    "frozenCash": 0,
    "securityAccountLinked": true,
    "firstLoginDone": true,
    "token": "server-session-token"
  }
}
```

### 查询资金账户

```http
GET /api/fund-accounts/{accountNo}
```

前端读取字段：`availableCash`、`frozenCash`、`accountStatus/status`。

### 查询证券持仓

```http
GET /api/security-accounts/{accountNo}/holdings
```

建议返回数组字段：

```json
[
  {
    "stockCode": "600519",
    "quantity": 200,
    "sellable": 200,
    "cost": 1520
  }
]
```

### 修改密码

```http
POST /api/fund-accounts/{accountNo}/password
```

请求：

```json
{
  "passwordType": "trade",
  "oldPassword": "123456",
  "newPassword": "234567"
}
```

`passwordType` 为 `trade` 或 `withdraw`。

### 冻结/释放资金

```http
POST /api/fund-accounts/{accountNo}/freeze
POST /api/fund-accounts/{accountNo}/release
```

请求：

```json
{
  "amount": 500,
  "orderRef": "O123456"
}
```

### 冻结/释放股票

```http
POST /api/security-accounts/{accountNo}/holdings/freeze
POST /api/security-accounts/{accountNo}/holdings/release
```

请求：

```json
{
  "stockCode": "600519",
  "quantity": 100,
  "orderRef": "O123456"
}
```

## 交易管理系统

交易客户端本地校验通过后，先请求交易管理系统审查。

```http
POST /api/trade-management/orders/review
```

请求：

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
  "amount": 168835,
  "clientTime": "2026-06-15T10:00:00+08:00"
}
```

建议返回：

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

正式契约见 `MANAGEMENT_CONTRACT.md`。

## 中央交易系统

当前文档中中央交易系统负责行情、委托最终成交、撤单结果。

### 查询行情

```http
GET /api/central-trading/stocks?keyword=600519
```

建议返回数组字段：

```json
[
  {
    "stockCode": "600519",
    "stockName": "贵州茅台",
    "latestPrice": 1688.35,
    "previousClose": 1662,
    "highestPrice": 1696.8,
    "lowestPrice": 1651.2,
    "bidPrice": 1688.2,
    "askPrice": 1688.5,
    "tradeStatus": "可交易",
    "notice": "年度股东大会公告已发布"
  }
]
```

### 提交委托

```http
POST /api/central-trading/orders
```

请求同交易管理审查请求。

建议返回：

```json
{
  "success": true,
  "data": {
    "accepted": true,
    "orderNo": "O123456",
    "status": "SUBMITTED"
  }
}
```

### 撤销委托

```http
POST /api/central-trading/orders/{orderId}/cancel
```

建议返回：

```json
{
  "success": true,
  "data": {
    "canceled": true
  }
}
```

### 查询成交回报

```http
GET /api/central-trading/orders/{orderId}/result
```

建议返回：

```json
{
  "success": true,
  "data": {
    "tradeNo": "T123456",
    "status": "TRADED",
    "tradePrice": 1688.35,
    "tradedQuantity": 100,
    "tradeTime": "2026-06-02 22:50:00"
  }
}
```

正式集成时，最好由中央交易系统通过 WebSocket 或后端回调推送成交回报；当前前端先预留了主动查询接口，方便早期联调。

## 代码适配点

### 通用请求

文件：`js/api.js`

- `requestJson()`：统一 HTTP 请求、超时、错误处理。
- `buildApiUrl()`：路径参数替换。

### 资金账户/证券账户系统

文件：`js/account-api.js`

- `verifyFundAccount()`：登录校验。
- `fetchFundAccount()`：查询资金账户。
- `fetchSecurityHoldings()`：查询证券持仓。
- `changePasswordViaAccountSystem()`：修改密码。
- `freezeFunds()` / `releaseFunds()`：冻结/释放资金。
- `freezeHolding()` / `releaseHolding()`：冻结/释放股票。
- `normalizeFundAccountLogin()`：登录返回字段映射。

### 交易管理系统

文件：`js/management-api.js`

- `reviewOrderByManagement()`：买卖委托审查。

### 中央交易系统

文件：`js/central-api.js`

- `fetchQuotes()`：行情查询。
- `submitOrderToCentral()`：提交委托。
- `cancelOrderInCentral()`：撤销委托。
- `fetchOrderResultFromCentral()`：同步成交回报。
- `normalizeStockQuote()`：行情字段映射。
- `normalizeOrderStatus()`：委托/成交状态字段映射。
