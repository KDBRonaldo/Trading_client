async function createClientSession(account) {
  if (!API_CONFIG.clientBaseUrl) return { ok: true, mock: true };

  const sessionId = crypto.randomUUID();
  const result = await requestJson(
    API_CONFIG.clientBaseUrl,
    API_CONFIG.endpoints.clientSessions,
    {
      method: "POST",
      body: {
        sessionId,
        fundAccountNo: account.accountNo,
        securityAccountNo: account.securityAccountNo || account.accountNo,
      },
    },
  );

  if (!result.ok) return result;
  const payload = result.data.data || result.data;
  return { ok: true, sessionId: payload.sessionId || sessionId };
}

async function updateClientSession(sessionId, action = "touch") {
  if (!API_CONFIG.clientBaseUrl || !sessionId) return { ok: true, mock: true };

  return requestJson(
    API_CONFIG.clientBaseUrl,
    API_CONFIG.endpoints.clientSession,
    {
      params: { sessionId },
      method: "PATCH",
      body: { action },
    },
  );
}

function toClientOrderStatus(status) {
  const map = {
    "未成交": "UNTRADED",
    "部分成交": "PART_TRADED",
    "已成交": "ALL_TRADED",
    "已撤销": "CANCELED",
  };
  return map[status] || status || "SUBMITTED";
}

function toClientAlertStatus(status) {
  const map = {
    "启用": "ENABLED",
    "已触发": "TRIGGERED",
    "停用": "DISABLED",
  };
  return map[status] || status || "ENABLED";
}

async function createClientOrder(order, account) {
  if (!API_CONFIG.clientBaseUrl) return { ok: true, mock: true };

  const isBuy = order.side === "buy";
  const result = await requestJson(
    API_CONFIG.clientBaseUrl,
    API_CONFIG.endpoints.clientOrders,
    {
      method: "POST",
      body: {
        orderNo: order.id,
        fundAccountNo: account.accountNo,
        securityAccountNo: account.securityAccountNo || account.accountNo,
        stockCode: order.stockCode,
        orderSide: isBuy ? "BUY" : "SELL",
        orderPrice: order.price,
        orderQuantity: order.quantity,
        tradedQuantity: order.tradedQuantity || 0,
        remainingQuantity: order.remainingQuantity,
        frozenAmount: isBuy ? order.remainingQuantity * order.price : 0,
        frozenQuantity: isBuy ? 0 : order.remainingQuantity,
        orderStatus: toClientOrderStatus(order.status),
      },
    },
  );

  if (!result.ok) return result;
  const payload = result.data.data || result.data;
  return { ok: true, localOrderId: payload.localOrderId };
}

async function updateClientOrder(order, patch = {}) {
  if (!API_CONFIG.clientBaseUrl || !order.localOrderId) return { ok: true, mock: true };

  return requestJson(
    API_CONFIG.clientBaseUrl,
    API_CONFIG.endpoints.clientOrder,
    {
      params: { localOrderId: order.localOrderId },
      method: "PATCH",
      body: {
        tradedQuantity: order.tradedQuantity,
        remainingQuantity: order.remainingQuantity,
        orderStatus: toClientOrderStatus(order.status),
        ...patch,
      },
    },
  );
}

async function createClientTrade(trade, order) {
  if (!API_CONFIG.clientBaseUrl || !order.localOrderId) return { ok: true, mock: true };

  return requestJson(
    API_CONFIG.clientBaseUrl,
    API_CONFIG.endpoints.clientTrades,
    {
      method: "POST",
      body: {
        tradeNo: trade.id,
        localOrderId: order.localOrderId,
        orderNo: order.id,
        stockCode: trade.stockCode,
        tradePrice: trade.price,
        tradeQuantity: trade.quantity,
        tradeAmount: trade.amount,
      },
    },
  );
}

async function createClientAlert(alert, account) {
  if (!API_CONFIG.clientBaseUrl) return { ok: true, mock: true };

  const result = await requestJson(
    API_CONFIG.clientBaseUrl,
    API_CONFIG.endpoints.clientAlerts,
    {
      method: "POST",
      body: {
        fundAccountNo: account.accountNo,
        stockCode: alert.stockCode,
        alertDirection: alert.direction,
        alertPrice: alert.price,
        alertStatus: toClientAlertStatus(alert.status),
      },
    },
  );

  if (!result.ok) return result;
  const payload = result.data.data || result.data;
  return { ok: true, alertId: payload.alertId };
}

async function updateClientAlert(alert, patch = {}) {
  if (!API_CONFIG.clientBaseUrl || !alert.alertId) return { ok: true, mock: true };

  return requestJson(
    API_CONFIG.clientBaseUrl,
    API_CONFIG.endpoints.clientAlert,
    {
      params: { alertId: alert.alertId },
      method: "PATCH",
      body: {
        alertStatus: toClientAlertStatus(alert.status),
        ...patch,
      },
    },
  );
}

async function createClientNotification(alert, content) {
  if (!API_CONFIG.clientBaseUrl || !alert.alertId) return { ok: true, mock: true };

  return requestJson(
    API_CONFIG.clientBaseUrl,
    API_CONFIG.endpoints.clientNotifications,
    {
      method: "POST",
      body: {
        alertId: alert.alertId,
        notifyContent: content,
        readStatus: "UNREAD",
      },
    },
  );
}

async function markClientNotificationRead(notificationId) {
  if (!API_CONFIG.clientBaseUrl || !notificationId) return { ok: true, mock: true };

  return requestJson(
    API_CONFIG.clientBaseUrl,
    API_CONFIG.endpoints.clientNotification,
    {
      params: { notificationId },
      method: "PATCH",
      body: { readStatus: "READ" },
    },
  );
}
