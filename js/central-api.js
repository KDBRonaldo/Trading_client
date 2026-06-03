async function fetchQuotes(keyword = "") {
  if (!API_CONFIG.centralBaseUrl) {
    const result = searchStocks(keyword || "");
    if (result.error) return { ok: false, message: result.error };
    return { ok: true, stocks: result.stocks };
  }

  const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : "";
  const result = await requestJson(
    API_CONFIG.centralBaseUrl,
    `${API_CONFIG.endpoints.quotes}${query}`,
  );
  if (!result.ok) return result;
  const payload = result.data.data || result.data.stocks || result.data;
  const stocks = (Array.isArray(payload) ? payload : []).map(
    normalizeStockQuote,
  );
  return { ok: true, stocks };
}

function normalizeStockQuote(item) {
  return {
    stockCode: item.stockCode,
    name: item.name || item.stockName,
    latest: Number(item.latest ?? item.latestPrice ?? item.currentPrice ?? 0),
    prevClose: Number(
      item.prevClose ??
        item.previousClose ??
        item.latest ??
        item.currentPrice ??
        0,
    ),
    high: Number(
      item.high ?? item.highestPrice ?? item.latest ?? item.currentPrice ?? 0,
    ),
    low: Number(
      item.low ?? item.lowestPrice ?? item.latest ?? item.currentPrice ?? 0,
    ),
    buyOne: Number(
      item.buyOne ?? item.bidPrice ?? item.latest ?? item.currentPrice ?? 0,
    ),
    sellOne: Number(
      item.sellOne ?? item.askPrice ?? item.latest ?? item.currentPrice ?? 0,
    ),
    status: item.status || item.tradeStatus || "可交易",
    announcement: item.announcement || item.notice || "",
  };
}

function normalizeOrderStatus(status) {
  const statusMap = {
    SUBMITTED: "未成交",
    ACCEPTED: "未成交",
    UNTRADED: "未成交",
    PART_TRADED: "部分成交",
    PARTIAL_FILLED: "部分成交",
    TRADED: "已成交",
    FILLED: "已成交",
    CANCELED: "已撤销",
    CANCELLED: "已撤销",
    REJECTED: "已拒绝",
  };
  return statusMap[status] || status || "未成交";
}

async function submitOrderToCentral(orderPayload) {
  if (!API_CONFIG.centralBaseUrl)
    return { ok: true, orderNo: `O${Date.now()}`, status: "未成交" };
  const result = await requestJson(
    API_CONFIG.centralBaseUrl,
    API_CONFIG.endpoints.submitOrder,
    {
      method: "POST",
      body: orderPayload,
    },
  );
  if (!result.ok) return result;
  const payload = result.data.data || result.data.order || result.data;
  if (result.data.success === false || payload.accepted === false) {
    return {
      ok: false,
      message: result.data.message || payload.message || "中央交易系统拒绝委托",
    };
  }
  return {
    ok: true,
    orderNo: payload.orderNo || payload.orderId || `O${Date.now()}`,
    status: normalizeOrderStatus(payload.status),
  };
}

async function cancelOrderInCentral(orderId) {
  if (!API_CONFIG.centralBaseUrl) return { ok: true };
  const result = await requestJson(
    API_CONFIG.centralBaseUrl,
    API_CONFIG.endpoints.cancelOrder,
    {
      params: { orderId },
      method: "POST",
    },
  );
  if (!result.ok) return result;
  const payload = result.data.data || result.data;
  if (result.data.success === false || payload.canceled === false) {
    return {
      ok: false,
      message: result.data.message || payload.message || "中央交易系统拒绝撤销",
    };
  }
  return { ok: true };
}

async function fetchOrderResultFromCentral(orderId) {
  if (!API_CONFIG.centralBaseUrl) return { ok: false, mock: true };
  const result = await requestJson(
    API_CONFIG.centralBaseUrl,
    API_CONFIG.endpoints.orderResult,
    { params: { orderId } },
  );
  if (!result.ok) return result;
  return { ok: true, result: result.data.data || result.data };
}
