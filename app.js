const STORAGE_KEY = "stock-trading-client-state";
const SESSION_LIMIT_MS = 30 * 60 * 1000;
const API_CONFIG = {
  accountBaseUrl: localStorage.getItem("accountApiBase") || localStorage.getItem("fundAccountApiBase") || "",
  managementBaseUrl: localStorage.getItem("managementApiBase") || "",
  centralBaseUrl: localStorage.getItem("centralTradingApiBase") || "",
  endpoints: {
    login: "/api/fund-accounts/login",
    fundAccount: "/api/fund-accounts/{accountNo}",
    holdings: "/api/security-accounts/{accountNo}/holdings",
    changePassword: "/api/fund-accounts/{accountNo}/password",
    freezeFunds: "/api/fund-accounts/{accountNo}/freeze",
    releaseFunds: "/api/fund-accounts/{accountNo}/release",
    freezeHolding: "/api/security-accounts/{accountNo}/holdings/freeze",
    releaseHolding: "/api/security-accounts/{accountNo}/holdings/release",
    reviewOrder: "/api/trade-management/orders/review",
    quotes: "/api/central-trading/stocks",
    submitOrder: "/api/central-trading/orders",
    cancelOrder: "/api/central-trading/orders/{orderId}/cancel",
    orderResult: "/api/central-trading/orders/{orderId}/result",
  },
  timeoutMs: 5000,
};

const seedState = {
  currentAccount: null,
  accounts: {
    "6222026000000001": {
      accountNo: "6222026000000001",
      name: "演示投资者",
      tradePassword: "123456",
      withdrawPassword: "654321",
      status: "正常",
      firstLoginDone: false,
      failedAttempts: 0,
      availableCash: 228000.0,
      frozenCash: 0,
      holdings: [
        { stockCode: "600519", quantity: 200, sellable: 200, cost: 1520.0 },
        { stockCode: "000001", quantity: 3000, sellable: 3000, cost: 10.75 },
        { stockCode: "300750", quantity: 400, sellable: 400, cost: 171.2 },
      ],
    },
  },
  stocks: {
    "600519": {
      stockCode: "600519",
      name: "贵州茅台",
      latest: 1688.35,
      prevClose: 1662.0,
      high: 1696.8,
      low: 1651.2,
      buyOne: 1688.2,
      sellOne: 1688.5,
      status: "可交易",
      announcement: "年度股东大会公告已发布，关注现金分红安排。",
    },
    "000001": {
      stockCode: "000001",
      name: "平安银行",
      latest: 11.42,
      prevClose: 11.16,
      high: 11.55,
      low: 11.05,
      buyOne: 11.41,
      sellOne: 11.43,
      status: "可交易",
      announcement: "公司发布一季度经营情况简报。",
    },
    "300750": {
      stockCode: "300750",
      name: "宁德时代",
      latest: 186.7,
      prevClose: 183.4,
      high: 188.0,
      low: 181.5,
      buyOne: 186.62,
      sellOne: 186.75,
      status: "可交易",
      announcement: "新能源业务订单保持稳定增长。",
    },
    "600000": {
      stockCode: "600000",
      name: "浦发银行",
      latest: 8.27,
      prevClose: 8.31,
      high: 8.36,
      low: 8.18,
      buyOne: 8.26,
      sellOne: 8.28,
      status: "可交易",
      announcement: "债券发行结果公告。",
    },
    "002415": {
      stockCode: "002415",
      name: "海康威视",
      latest: 31.86,
      prevClose: 32.28,
      high: 32.45,
      low: 31.61,
      buyOne: 31.85,
      sellOne: 31.87,
      status: "暂停交易",
      announcement: "重大事项停牌，恢复交易时间另行公告。",
    },
  },
  orders: [],
  trades: [],
  alerts: [],
  session: null,
};

let state = loadState();

const dom = {
  loginView: document.querySelector("#loginView"),
  terminalView: document.querySelector("#terminalView"),
  loginForm: document.querySelector("#loginForm"),
  loginMessage: document.querySelector("#loginMessage"),
  accountNo: document.querySelector("#accountNo"),
  tradePassword: document.querySelector("#tradePassword"),
  sessionAccount: document.querySelector("#sessionAccount"),
  logoutBtn: document.querySelector("#logoutBtn"),
  navItems: document.querySelectorAll(".nav-item"),
  views: document.querySelectorAll(".view"),
  viewTitle: document.querySelector("#viewTitle"),
  clockText: document.querySelector("#clockText"),
  refreshBtn: document.querySelector("#refreshBtn"),
  toast: document.querySelector("#toast"),
  availableCash: document.querySelector("#availableCash"),
  frozenCash: document.querySelector("#frozenCash"),
  totalAsset: document.querySelector("#totalAsset"),
  accountStatus: document.querySelector("#accountStatus"),
  holdingSummary: document.querySelector("#holdingSummary"),
  holdingRows: document.querySelector("#holdingRows"),
  marketForm: document.querySelector("#marketForm"),
  marketKeyword: document.querySelector("#marketKeyword"),
  marketResult: document.querySelector("#marketResult"),
  buyForm: document.querySelector("#buyForm"),
  sellForm: document.querySelector("#sellForm"),
  orderRows: document.querySelector("#orderRows"),
  tradeRows: document.querySelector("#tradeRows"),
  alertForm: document.querySelector("#alertForm"),
  alertRows: document.querySelector("#alertRows"),
  alertSummary: document.querySelector("#alertSummary"),
  passwordForm: document.querySelector("#passwordForm"),
};

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored ? { ...seedState, ...stored } : structuredClone(seedState);
  } catch {
    return structuredClone(seedState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function buildApiUrl(baseUrl, endpoint, params = {}) {
  const path = endpoint.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(params[key] ?? ""));
  return `${baseUrl}${path}`;
}

async function requestJson(baseUrl, endpoint, { params = {}, method = "GET", body } = {}) {
  if (!baseUrl) return { ok: false, mock: true, message: "接口地址未配置" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);
  try {
    const response = await fetch(buildApiUrl(baseUrl, endpoint, params), {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, message: data.message || `接口请求失败：${response.status}` };
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      message: error.name === "AbortError" ? "接口请求超时，请稍后重试" : "接口连接失败，请检查服务地址",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function money(value) {
  return `¥${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function price(value) {
  return Number(value).toFixed(2);
}

function nowText() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function currentAccount() {
  return state.currentAccount ? state.accounts[state.currentAccount] : null;
}

function getLimits(stock) {
  return {
    upper: Number((stock.prevClose * 1.1).toFixed(2)),
    lower: Number((stock.prevClose * 0.9).toFixed(2)),
  };
}

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `form-message ${type}`.trim();
}

function toast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => dom.toast.classList.add("hidden"), 3200);
}

function validateSession() {
  if (!state.session || !state.currentAccount) return false;
  if (Date.now() - state.session.lastActiveAt > SESSION_LIMIT_MS) {
    logout("会话已超时，请重新登录");
    return false;
  }
  state.session.lastActiveAt = Date.now();
  saveState();
  return true;
}

async function login(accountNo, password) {
  if (!/^\d{16}$/.test(accountNo)) return { ok: false, message: "卡号格式错误，请输入16位数字" };
  if (!/^\d{6}$/.test(password)) return { ok: false, message: "密码格式错误，请输入6位数字" };
  const authResult = await verifyFundAccount(accountNo, password);
  if (!authResult.ok) return authResult;

  const account = ensureLocalAccount(authResult.account);
  if (account.status === "锁定") return { ok: false, message: "账户已锁定，请联系客服" };
  if (account.status !== "正常") return { ok: false, message: `账户状态异常：${account.status}` };
  if (!authResult.account.securityAccountLinked) return { ok: false, message: "证券账户未关联" };

  account.failedAttempts = 0;
  const firstLogin = !account.firstLoginDone;
  account.firstLoginDone = true;
  state.currentAccount = accountNo;
  state.session = { accountNo, token: authResult.token || crypto.randomUUID(), lastActiveAt: Date.now() };
  saveState();
  return { ok: true, message: firstLogin ? "首次登录证书认证通过" : "登录成功" };
}

async function verifyFundAccount(accountNo, password) {
  if (!API_CONFIG.accountBaseUrl) return verifyFundAccountMock(accountNo, password);

  const result = await requestJson(API_CONFIG.accountBaseUrl, API_CONFIG.endpoints.login, {
    method: "POST",
    body: { fundAccountNo: accountNo, tradePassword: password },
  });
  if (!result.ok) return { ok: false, message: result.message || "资金账户系统拒绝登录请求" };
  return normalizeFundAccountLogin(result.data, accountNo);
}

function normalizeFundAccountLogin(data, accountNo) {
  if (data.success === false || data.ok === false || data.code === "FAIL") {
    return { ok: false, message: data.message || "登录失败" };
  }
  const payload = data.data || data.account || data;
  const account = {
    accountNo: payload.fundAccountNo || payload.accountNo || accountNo,
    name: payload.investorName || payload.name || "投资者",
    status: payload.accountStatus || payload.status || "正常",
    availableCash: Number(payload.availableCash ?? payload.availableBalance ?? 0),
    frozenCash: Number(payload.frozenCash ?? payload.frozenBalance ?? 0),
    firstLoginDone: Boolean(payload.firstLoginDone ?? payload.certificated ?? true),
    securityAccountLinked: payload.securityAccountLinked !== false,
  };
  return { ok: true, account, token: payload.token || data.token };
}

function ensureLocalAccount(remoteAccount) {
  const existing = state.accounts[remoteAccount.accountNo];
  const fallback = existing || {
    accountNo: remoteAccount.accountNo,
    tradePassword: "",
    withdrawPassword: "",
    failedAttempts: 0,
    holdings: [],
  };
  state.accounts[remoteAccount.accountNo] = {
    ...fallback,
    name: remoteAccount.name,
    status: remoteAccount.status,
    availableCash: remoteAccount.availableCash,
    frozenCash: remoteAccount.frozenCash,
    firstLoginDone: Boolean(fallback.firstLoginDone || remoteAccount.firstLoginDone),
    securityAccountLinked: remoteAccount.securityAccountLinked,
  };
  return state.accounts[remoteAccount.accountNo];
}

function verifyFundAccountMock(accountNo, password) {
  const account = state.accounts[accountNo];
  if (!account) return { ok: false, message: "账户不存在或证券账户未关联" };
  if (account.status === "锁定") return { ok: false, message: "账户已锁定，请联系客服" };
  if (account.tradePassword !== password) {
    account.failedAttempts += 1;
    if (account.failedAttempts >= 5) account.status = "锁定";
    saveState();
    return { ok: false, message: account.status === "锁定" ? "账户已锁定，请联系客服" : "密码错误，请重新输入" };
  }
  return {
    ok: true,
    account: {
      accountNo: account.accountNo,
      name: account.name,
      status: account.status,
      availableCash: account.availableCash,
      frozenCash: account.frozenCash,
      firstLoginDone: account.firstLoginDone,
      securityAccountLinked: account.securityAccountLinked !== false,
    },
    token: crypto.randomUUID(),
  };
}

async function fetchFundAccount(accountNo) {
  if (!API_CONFIG.accountBaseUrl) {
    const account = state.accounts[accountNo];
    return {
      ok: true,
      account: {
        accountNo,
        availableCash: account.availableCash,
        frozenCash: account.frozenCash,
        status: account.status,
      },
    };
  }

  const result = await requestJson(API_CONFIG.accountBaseUrl, API_CONFIG.endpoints.fundAccount, { params: { accountNo } });
  if (!result.ok) return result;
  const payload = result.data.data || result.data.account || result.data;
  return {
    ok: true,
    account: {
      accountNo,
      availableCash: Number(payload.availableCash ?? payload.availableBalance ?? 0),
      frozenCash: Number(payload.frozenCash ?? payload.frozenBalance ?? 0),
      status: payload.accountStatus || payload.status || "正常",
    },
  };
}

async function fetchSecurityHoldings(accountNo) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true, holdings: state.accounts[accountNo].holdings };

  const result = await requestJson(API_CONFIG.accountBaseUrl, API_CONFIG.endpoints.holdings, { params: { accountNo } });
  if (!result.ok) return result;
  const payload = result.data.data || result.data.holdings || result.data;
  const rows = Array.isArray(payload) ? payload : [];
  return {
    ok: true,
    holdings: rows.map((item) => ({
      stockCode: item.stockCode,
      quantity: Number(item.quantity ?? item.holdingQuantity ?? 0),
      sellable: Number(item.sellable ?? item.sellableQuantity ?? item.availableQuantity ?? 0),
      cost: Number(item.cost ?? item.costPrice ?? 0),
    })),
  };
}

async function changePasswordViaAccountSystem(accountNo, type, oldPassword, newPassword) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true };
  return requestJson(API_CONFIG.accountBaseUrl, API_CONFIG.endpoints.changePassword, {
    params: { accountNo },
    method: "POST",
    body: { passwordType: type, oldPassword, newPassword },
  });
}

async function freezeFunds(accountNo, amount, orderRef) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true };
  return requestJson(API_CONFIG.accountBaseUrl, API_CONFIG.endpoints.freezeFunds, {
    params: { accountNo },
    method: "POST",
    body: { amount, orderRef },
  });
}

async function releaseFunds(accountNo, amount, orderRef) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true };
  return requestJson(API_CONFIG.accountBaseUrl, API_CONFIG.endpoints.releaseFunds, {
    params: { accountNo },
    method: "POST",
    body: { amount, orderRef },
  });
}

async function freezeHolding(accountNo, stockCode, quantity, orderRef) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true };
  return requestJson(API_CONFIG.accountBaseUrl, API_CONFIG.endpoints.freezeHolding, {
    params: { accountNo },
    method: "POST",
    body: { stockCode, quantity, orderRef },
  });
}

async function releaseHolding(accountNo, stockCode, quantity, orderRef) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true };
  return requestJson(API_CONFIG.accountBaseUrl, API_CONFIG.endpoints.releaseHolding, {
    params: { accountNo },
    method: "POST",
    body: { stockCode, quantity, orderRef },
  });
}

async function reviewOrderByManagement(orderPayload) {
  if (!API_CONFIG.managementBaseUrl) return { ok: true, approved: true };
  const result = await requestJson(API_CONFIG.managementBaseUrl, API_CONFIG.endpoints.reviewOrder, {
    method: "POST",
    body: orderPayload,
  });
  if (!result.ok) return result;
  const payload = result.data.data || result.data;
  return {
    ok: payload.approved !== false && result.data.success !== false,
    approved: payload.approved !== false,
    message: payload.message || result.data.message || "交易管理系统审查未通过",
  };
}

async function fetchQuotes(keyword = "") {
  if (!API_CONFIG.centralBaseUrl) {
    const result = searchStocks(keyword || "");
    if (result.error) return { ok: false, message: result.error };
    return { ok: true, stocks: result.stocks };
  }

  const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : "";
  const result = await requestJson(API_CONFIG.centralBaseUrl, `${API_CONFIG.endpoints.quotes}${query}`);
  if (!result.ok) return result;
  const payload = result.data.data || result.data.stocks || result.data;
  const stocks = (Array.isArray(payload) ? payload : []).map(normalizeStockQuote);
  return { ok: true, stocks };
}

function normalizeStockQuote(item) {
  return {
    stockCode: item.stockCode,
    name: item.name || item.stockName,
    latest: Number(item.latest ?? item.latestPrice ?? item.currentPrice ?? 0),
    prevClose: Number(item.prevClose ?? item.previousClose ?? item.latest ?? item.currentPrice ?? 0),
    high: Number(item.high ?? item.highestPrice ?? item.latest ?? item.currentPrice ?? 0),
    low: Number(item.low ?? item.lowestPrice ?? item.latest ?? item.currentPrice ?? 0),
    buyOne: Number(item.buyOne ?? item.bidPrice ?? item.latest ?? item.currentPrice ?? 0),
    sellOne: Number(item.sellOne ?? item.askPrice ?? item.latest ?? item.currentPrice ?? 0),
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
  if (!API_CONFIG.centralBaseUrl) return { ok: true, orderNo: `O${Date.now()}`, status: "未成交" };
  const result = await requestJson(API_CONFIG.centralBaseUrl, API_CONFIG.endpoints.submitOrder, {
    method: "POST",
    body: orderPayload,
  });
  if (!result.ok) return result;
  const payload = result.data.data || result.data.order || result.data;
  if (result.data.success === false || payload.accepted === false) {
    return { ok: false, message: result.data.message || payload.message || "中央交易系统拒绝委托" };
  }
  return {
    ok: true,
    orderNo: payload.orderNo || payload.orderId || `O${Date.now()}`,
    status: normalizeOrderStatus(payload.status),
  };
}

async function cancelOrderInCentral(orderId) {
  if (!API_CONFIG.centralBaseUrl) return { ok: true };
  const result = await requestJson(API_CONFIG.centralBaseUrl, API_CONFIG.endpoints.cancelOrder, {
    params: { orderId },
    method: "POST",
  });
  if (!result.ok) return result;
  const payload = result.data.data || result.data;
  if (result.data.success === false || payload.canceled === false) {
    return { ok: false, message: result.data.message || payload.message || "中央交易系统拒绝撤销" };
  }
  return { ok: true };
}

async function fetchOrderResultFromCentral(orderId) {
  if (!API_CONFIG.centralBaseUrl) return { ok: false, mock: true };
  const result = await requestJson(API_CONFIG.centralBaseUrl, API_CONFIG.endpoints.orderResult, { params: { orderId } });
  if (!result.ok) return result;
  return { ok: true, result: result.data.data || result.data };
}

function logout(message = "") {
  state.currentAccount = null;
  state.session = null;
  saveState();
  dom.loginView.classList.remove("hidden");
  dom.terminalView.classList.add("hidden");
  if (message) setMessage(dom.loginMessage, message, "error");
}

function bootSession() {
  if (state.session && Date.now() - state.session.lastActiveAt <= SESSION_LIMIT_MS) {
    state.currentAccount = state.session.accountNo;
    showTerminal();
  } else {
    logout();
  }
}

function showTerminal() {
  dom.loginView.classList.add("hidden");
  dom.terminalView.classList.remove("hidden");
  setMessage(dom.loginMessage, "");
  renderAll();
}

function renderAll() {
  renderAccount();
  renderHoldings();
  renderOrders();
  renderTrades();
  renderAlerts();
  dom.clockText.textContent = nowText();
  const account = currentAccount();
  dom.sessionAccount.textContent = account ? `${account.name} ${account.accountNo}` : "未登录";
}

function renderAccount() {
  const account = currentAccount();
  if (!account) return;
  const holdingValue = account.holdings.reduce((sum, item) => {
    const stock = state.stocks[item.stockCode];
    return sum + item.quantity * stock.latest;
  }, 0);
  dom.availableCash.textContent = money(account.availableCash);
  dom.frozenCash.textContent = money(account.frozenCash);
  dom.totalAsset.textContent = money(account.availableCash + account.frozenCash + holdingValue);
  dom.accountStatus.textContent = account.status;
}

function renderHoldings() {
  const account = currentAccount();
  if (!account) return;
  dom.holdingRows.innerHTML = "";
  account.holdings.forEach((item) => {
    const stock = state.stocks[item.stockCode];
    const profit = (stock.latest - item.cost) * item.quantity;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.stockCode}</td>
      <td>${stock.name}</td>
      <td>${item.quantity}</td>
      <td>${item.sellable}</td>
      <td>${money(item.cost)}</td>
      <td>${money(stock.latest)}</td>
      <td class="${profit >= 0 ? "gain" : "loss"}">${money(profit)}</td>
    `;
    dom.holdingRows.appendChild(row);
  });
  dom.holdingSummary.textContent = account.holdings.length ? `${account.holdings.length} 只股票` : "暂无持仓";
}

function searchStocks(keyword) {
  const query = keyword.trim();
  if (!query) return { error: "请输入股票名称或代码" };
  if (/^\d+$/.test(query) && !/^\d{6}$/.test(query)) return { error: "股票代码格式错误，请输入6位数字" };
  const stocks = Object.values(state.stocks).filter((stock) => stock.stockCode === query || stock.name.includes(query));
  if (!stocks.length) return { error: "未找到匹配的股票，请重新输入" };
  return { stocks };
}

function renderMarket(stocks) {
  dom.marketResult.innerHTML = "";
  stocks.forEach((stock) => {
    const limits = getLimits(stock);
    const change = stock.latest - stock.prevClose;
    const changeRate = (change / stock.prevClose) * 100;
    const card = document.createElement("article");
    card.className = "quote-card";
    card.innerHTML = `
      <div class="panel-header">
        <h3>${stock.name} ${stock.stockCode}</h3>
        <span>${stock.status}</span>
      </div>
      <div class="quote-grid">
        <div><span>最新价</span><strong>${money(stock.latest)}</strong></div>
        <div><span>涨跌幅</span><strong class="${change >= 0 ? "gain" : "loss"}">${changeRate.toFixed(2)}%</strong></div>
        <div><span>买一 / 卖一</span><strong>${price(stock.buyOne)} / ${price(stock.sellOne)}</strong></div>
        <div><span>最高 / 最低</span><strong>${price(stock.high)} / ${price(stock.low)}</strong></div>
        <div><span>涨停 / 跌停</span><strong>${price(limits.upper)} / ${price(limits.lower)}</strong></div>
      </div>
      <p class="hint">公告：${stock.announcement}</p>
    `;
    dom.marketResult.appendChild(card);
  });
}

function validateOrderInput(form, side) {
  const stockCode = form.stockCode.value.trim();
  const rawPrice = form.price.value.trim();
  const rawQuantity = form.quantity.value.trim();
  if (!/^\d{6}$/.test(stockCode)) return { error: "股票代码格式错误，请输入6位数字" };
  const stock = state.stocks[stockCode];
  if (!stock) return { error: side === "buy" ? "该股票代码不存在" : "您未持有该股票" };
  if (stock.status !== "可交易") return { error: "该股票当前暂停交易" };
  if (!/^\d+(\.\d{1,2})?$/.test(rawPrice)) return { error: "价格必须大于0，且最多保留2位小数" };
  const orderPrice = Number(rawPrice);
  if (orderPrice <= 0) return { error: "价格必须大于0" };
  const limits = getLimits(stock);
  if (orderPrice < limits.lower || orderPrice > limits.upper) return { error: "价格不能超出涨跌停限制范围" };
  if (!/^\d+$/.test(rawQuantity)) return { error: "数量必须为整数" };
  const quantity = Number(rawQuantity);
  if (quantity <= 0 || quantity % 100 !== 0) return { error: side === "buy" ? "购买数量必须为100的整数倍" : "出售数量必须为100的整数倍" };
  return { stock, stockCode, orderPrice, quantity };
}

async function refreshExternalData({ randomizeMockQuotes = false } = {}) {
  const account = currentAccount();
  if (!account) return;

  const fundResult = await fetchFundAccount(account.accountNo);
  if (fundResult.ok) {
    account.availableCash = fundResult.account.availableCash;
    account.frozenCash = fundResult.account.frozenCash;
    account.status = fundResult.account.status;
  } else {
    toast(fundResult.message || "资金账户信息刷新失败");
  }

  const holdingResult = await fetchSecurityHoldings(account.accountNo);
  if (holdingResult.ok) account.holdings = holdingResult.holdings;

  if (API_CONFIG.centralBaseUrl) {
    const quoteResult = await fetchQuotes();
    if (quoteResult.ok) {
      quoteResult.stocks.forEach((stock) => {
        state.stocks[stock.stockCode] = stock;
      });
    } else {
      toast(quoteResult.message || "中央交易系统行情刷新失败");
    }
  } else if (randomizeMockQuotes) {
    Object.values(state.stocks).forEach((stock) => {
      const drift = stock.latest * (Math.random() * 0.012 - 0.006);
      stock.latest = Number(Math.max(0.01, stock.latest + drift).toFixed(2));
      stock.buyOne = Number((stock.latest - 0.01).toFixed(2));
      stock.sellOne = Number((stock.latest + 0.01).toFixed(2));
      stock.high = Math.max(stock.high, stock.latest);
      stock.low = Math.min(stock.low, stock.latest);
    });
  }

  checkAlerts();
  saveState();
  renderAll();
}

async function submitOrder(form, side) {
  if (!validateSession()) return;
  const message = form.querySelector(".form-message");
  const account = currentAccount();
  const pendingStockCode = form.stockCode.value.trim();
  if (API_CONFIG.centralBaseUrl && /^\d{6}$/.test(pendingStockCode)) {
    const quoteResult = await fetchQuotes(pendingStockCode);
    if (quoteResult.ok) {
      quoteResult.stocks.forEach((stock) => {
        state.stocks[stock.stockCode] = stock;
      });
    }
  }
  const input = validateOrderInput(form, side);
  if (input.error) return setMessage(message, input.error, "error");

  const orderDraft = {
    fundAccountNo: account.accountNo,
    stockCode: input.stockCode,
    direction: side === "buy" ? "BUY" : "SELL",
    price: input.orderPrice,
    quantity: input.quantity,
  };

  const review = await reviewOrderByManagement(orderDraft);
  if (!review.ok || !review.approved) return setMessage(message, review.message || "交易管理系统审查未通过", "error");

  if (side === "buy") {
    const amount = input.orderPrice * input.quantity;
    if (amount > account.availableCash) return setMessage(message, "购买金额超出可用资金", "error");
    const freezeResult = await freezeFunds(account.accountNo, amount, `LOCAL-${Date.now()}`);
    if (!freezeResult.ok) return setMessage(message, freezeResult.message || "资金冻结失败", "error");
    account.availableCash -= amount;
    account.frozenCash += amount;
  } else {
    const holding = account.holdings.find((item) => item.stockCode === input.stockCode);
    if (!holding) return setMessage(message, "您未持有该股票", "error");
    if (input.quantity > holding.sellable) return setMessage(message, "出售数量超过可卖股数", "error");
    const freezeResult = await freezeHolding(account.accountNo, input.stockCode, input.quantity, `LOCAL-${Date.now()}`);
    if (!freezeResult.ok) return setMessage(message, freezeResult.message || "股票冻结失败", "error");
    holding.sellable -= input.quantity;
  }

  const centralResult = await submitOrderToCentral(orderDraft);
  if (!centralResult.ok) {
    if (side === "buy") {
      const amount = input.orderPrice * input.quantity;
      account.availableCash += amount;
      account.frozenCash -= amount;
      await releaseFunds(account.accountNo, amount, "CENTRAL_REJECT");
    } else {
      const holding = account.holdings.find((item) => item.stockCode === input.stockCode);
      if (holding) holding.sellable += input.quantity;
      await releaseHolding(account.accountNo, input.stockCode, input.quantity, "CENTRAL_REJECT");
    }
    saveState();
    renderAll();
    return setMessage(message, centralResult.message || "中央交易系统拒绝委托，冻结资源已释放", "error");
  }

  const order = {
    id: centralResult.orderNo,
    stockCode: input.stockCode,
    stockName: input.stock.name,
    side,
    price: input.orderPrice,
    quantity: input.quantity,
    tradedQuantity: 0,
    remainingQuantity: input.quantity,
    status: centralResult.status || "未成交",
    submitTime: nowText(),
  };
  state.orders.unshift(order);
  saveState();
  form.reset();
  setMessage(message, `委托已提交，编号 ${order.id}`, "ok");
  toast("委托已提交");
  renderAll();
}

async function cancelOrder(orderId) {
  if (!validateSession()) return;
  const order = state.orders.find((item) => item.id === orderId);
  if (!order || !["未成交", "部分成交"].includes(order.status)) {
    toast("指令已成交或已撤销，无法撤销");
    return;
  }
  const account = currentAccount();
  const centralResult = await cancelOrderInCentral(orderId);
  if (!centralResult.ok) {
    toast(centralResult.message || "中央交易系统撤销失败");
    return;
  }
  if (order.side === "buy") {
    const release = order.remainingQuantity * order.price;
    await releaseFunds(account.accountNo, release, order.id);
    account.frozenCash -= release;
    account.availableCash += release;
  } else {
    await releaseHolding(account.accountNo, order.stockCode, order.remainingQuantity, order.id);
    const holding = account.holdings.find((item) => item.stockCode === order.stockCode);
    if (holding) holding.sellable += order.remainingQuantity;
  }
  order.status = "已撤销";
  order.remainingQuantity = 0;
  saveState();
  toast("撤销成功，冻结资源已释放");
  renderAll();
}

async function simulateTrade(orderId) {
  if (!validateSession()) return;
  if (API_CONFIG.centralBaseUrl) {
    const result = await fetchOrderResultFromCentral(orderId);
    if (!result.ok) {
      toast(result.message || "中央交易系统暂无成交回报");
      return;
    }
    applyCentralTradeResult(orderId, result.result);
    return;
  }
  const order = state.orders.find((item) => item.id === orderId);
  if (!order || order.status !== "未成交") return;
  const account = currentAccount();
  order.tradedQuantity = order.quantity;
  order.remainingQuantity = 0;
  order.status = "已成交";
  const amount = order.quantity * order.price;

  if (order.side === "buy") {
    account.frozenCash -= amount;
    const holding = account.holdings.find((item) => item.stockCode === order.stockCode);
    if (holding) {
      const totalCost = holding.cost * holding.quantity + amount;
      holding.quantity += order.quantity;
      holding.sellable += order.quantity;
      holding.cost = totalCost / holding.quantity;
    } else {
      account.holdings.push({ stockCode: order.stockCode, quantity: order.quantity, sellable: order.quantity, cost: order.price });
    }
  } else {
    account.availableCash += amount;
    const holding = account.holdings.find((item) => item.stockCode === order.stockCode);
    if (holding) holding.quantity -= order.quantity;
    account.holdings = account.holdings.filter((item) => item.quantity > 0);
  }

  state.trades.unshift({
    id: `T${Date.now()}`,
    orderId: order.id,
    stockCode: order.stockCode,
    stockName: order.stockName,
    price: order.price,
    quantity: order.quantity,
    amount,
    time: nowText(),
  });
  saveState();
  toast("成交回报已接收，资产与持仓已刷新");
  renderAll();
}

function applyCentralTradeResult(orderId, result) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  const account = currentAccount();
  const tradedQuantity = Number(result.tradedQuantity ?? result.quantity ?? order.quantity);
  const tradePrice = Number(result.tradePrice ?? result.price ?? order.price);
  const amount = tradedQuantity * tradePrice;
  order.tradedQuantity = tradedQuantity;
  order.remainingQuantity = Math.max(0, order.quantity - tradedQuantity);
  order.status = result.status ? normalizeOrderStatus(result.status) : (order.remainingQuantity === 0 ? "已成交" : "部分成交");

  if (order.side === "buy") {
    account.frozenCash -= amount;
    const holding = account.holdings.find((item) => item.stockCode === order.stockCode);
    if (holding) {
      const totalCost = holding.cost * holding.quantity + amount;
      holding.quantity += tradedQuantity;
      holding.sellable += tradedQuantity;
      holding.cost = totalCost / holding.quantity;
    } else {
      account.holdings.push({ stockCode: order.stockCode, quantity: tradedQuantity, sellable: tradedQuantity, cost: tradePrice });
    }
  } else {
    account.availableCash += amount;
    const holding = account.holdings.find((item) => item.stockCode === order.stockCode);
    if (holding) holding.quantity -= tradedQuantity;
    account.holdings = account.holdings.filter((item) => item.quantity > 0);
  }

  state.trades.unshift({
    id: result.tradeNo || result.tradeId || `T${Date.now()}`,
    orderId: order.id,
    stockCode: order.stockCode,
    stockName: order.stockName,
    price: tradePrice,
    quantity: tradedQuantity,
    amount,
    time: result.tradeTime || nowText(),
  });
  saveState();
  toast("中央交易系统成交回报已同步");
  renderAll();
}

function renderOrders() {
  dom.orderRows.innerHTML = "";
  state.orders.forEach((order) => {
    const canCancel = ["未成交", "部分成交"].includes(order.status);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${order.id}</td>
      <td>${order.stockName} ${order.stockCode}</td>
      <td>${order.side === "buy" ? "买入" : "卖出"}</td>
      <td>${money(order.price)}</td>
      <td>${order.quantity}</td>
      <td>${order.tradedQuantity}</td>
      <td>${order.remainingQuantity}</td>
      <td>${order.status}</td>
      <td>
        <button class="secondary-btn" data-fill="${order.id}" ${order.status !== "未成交" ? "disabled" : ""}>${API_CONFIG.centralBaseUrl ? "同步" : "成交"}</button>
        <button class="ghost-btn" data-cancel="${order.id}" ${canCancel ? "" : "disabled"}>撤销</button>
      </td>
    `;
    dom.orderRows.appendChild(row);
  });
  if (!state.orders.length) dom.orderRows.innerHTML = `<tr><td colspan="9">暂无委托记录</td></tr>`;
}

function renderTrades() {
  dom.tradeRows.innerHTML = "";
  state.trades.forEach((trade) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${trade.id}</td>
      <td>${trade.orderId}</td>
      <td>${trade.stockName} ${trade.stockCode}</td>
      <td>${money(trade.price)}</td>
      <td>${trade.quantity}</td>
      <td>${money(trade.amount)}</td>
      <td>${trade.time}</td>
    `;
    dom.tradeRows.appendChild(row);
  });
  if (!state.trades.length) dom.tradeRows.innerHTML = `<tr><td colspan="7">暂无成交结果</td></tr>`;
}

function createAlert(form) {
  if (!validateSession()) return;
  const message = form.querySelector(".form-message");
  const stockCode = form.stockCode.value.trim();
  const stock = state.stocks[stockCode];
  const alertPrice = Number(form.price.value.trim());
  if (!/^\d{6}$/.test(stockCode) || !stock) return setMessage(message, "股票代码无效", "error");
  if (!/^\d+(\.\d{1,2})?$/.test(form.price.value.trim()) || alertPrice <= 0) return setMessage(message, "提醒价格必须大于0，且最多保留2位小数", "error");
  state.alerts.unshift({
    id: `A${Date.now()}`,
    stockCode,
    stockName: stock.name,
    direction: form.direction.value,
    price: alertPrice,
    status: "启用",
    createTime: nowText(),
    triggerTime: "",
  });
  saveState();
  form.reset();
  setMessage(message, "提醒规则已保存", "ok");
  checkAlerts();
  renderAlerts();
}

function checkAlerts() {
  state.alerts.forEach((alert) => {
    if (alert.status !== "启用") return;
    const stock = state.stocks[alert.stockCode];
    const matched = alert.direction === "ABOVE" ? stock.latest >= alert.price : stock.latest <= alert.price;
    if (matched) {
      alert.status = "已触发";
      alert.triggerTime = nowText();
      toast(`${alert.stockName} 已触发价格提醒`);
    }
  });
  saveState();
}

function deleteAlert(alertId) {
  state.alerts = state.alerts.filter((item) => item.id !== alertId);
  saveState();
  renderAlerts();
}

function renderAlerts() {
  dom.alertRows.innerHTML = "";
  state.alerts.forEach((alert) => {
    const item = document.createElement("article");
    item.className = "alert-item";
    item.innerHTML = `
      <div>
        <strong>${alert.stockName} ${alert.stockCode}</strong>
        <p class="hint">${alert.direction === "ABOVE" ? "高于或等于" : "低于或等于"} ${money(alert.price)} · ${alert.status} · ${alert.triggerTime || alert.createTime}</p>
      </div>
      <button class="ghost-btn" data-alert-delete="${alert.id}">删除</button>
    `;
    dom.alertRows.appendChild(item);
  });
  if (!state.alerts.length) dom.alertRows.innerHTML = `<p class="hint">暂无价格提醒</p>`;
  dom.alertSummary.textContent = `${state.alerts.length} 条规则`;
}

async function changePassword(form) {
  if (!validateSession()) return;
  const account = currentAccount();
  const message = form.querySelector(".form-message");
  const type = form.type.value;
  const oldPassword = form.oldPassword.value.trim();
  const newPassword = form.newPassword.value.trim();
  const confirmPassword = form.confirmPassword.value.trim();
  const key = type === "trade" ? "tradePassword" : "withdrawPassword";
  if (oldPassword !== account[key]) return setMessage(message, "原密码错误，请重新输入", "error");
  if (!/^\d{6}$/.test(newPassword) || /^(\d)\1{5}$/.test(newPassword)) return setMessage(message, "密码格式不符合要求", "error");
  if (newPassword === oldPassword) return setMessage(message, "新密码不能与原密码相同", "error");
  if (newPassword !== confirmPassword) return setMessage(message, "两次输入的密码不一致，请重新输入", "error");
  const result = await changePasswordViaAccountSystem(account.accountNo, type, oldPassword, newPassword);
  if (!result.ok) return setMessage(message, result.message || "资金账户系统修改密码失败", "error");
  account[key] = newPassword;
  saveState();
  form.reset();
  setMessage(message, "密码修改成功", "ok");
}

function setView(viewId) {
  if (!validateSession()) return;
  dom.navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === viewId));
  dom.views.forEach((view) => view.classList.toggle("active-view", view.id === viewId));
  const active = [...dom.navItems].find((item) => item.dataset.view === viewId);
  dom.viewTitle.textContent = active ? active.textContent : "账户资产";
}

dom.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = dom.loginForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "正在登录";
  const result = await login(dom.accountNo.value.trim(), dom.tradePassword.value.trim());
  submitButton.disabled = false;
  submitButton.textContent = "登录";
  if (!result.ok) return setMessage(dom.loginMessage, result.message, "error");
  setMessage(dom.loginMessage, result.message, "ok");
  showTerminal();
});

dom.logoutBtn.addEventListener("click", () => logout());

dom.navItems.forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));

dom.refreshBtn.addEventListener("click", async () => {
  if (!validateSession()) return;
  await refreshExternalData({ randomizeMockQuotes: true });
  toast("行情与账户数据已刷新");
});

dom.marketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateSession()) return;
  const result = await fetchQuotes(dom.marketKeyword.value.trim());
  if (!result.ok) {
    dom.marketResult.innerHTML = `<p class="form-message error">${result.message}</p>`;
    return;
  }
  result.stocks.forEach((stock) => {
    state.stocks[stock.stockCode] = stock;
  });
  saveState();
  renderMarket(result.stocks);
});

dom.buyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitOrder(dom.buyForm, "buy");
});

dom.sellForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitOrder(dom.sellForm, "sell");
});

dom.orderRows.addEventListener("click", async (event) => {
  const cancelId = event.target.dataset.cancel;
  const fillId = event.target.dataset.fill;
  if (cancelId) await cancelOrder(cancelId);
  if (fillId) await simulateTrade(fillId);
});

dom.alertForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createAlert(dom.alertForm);
});

dom.alertRows.addEventListener("click", (event) => {
  const alertId = event.target.dataset.alertDelete;
  if (alertId) deleteAlert(alertId);
});

dom.passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await changePassword(dom.passwordForm);
});

setInterval(() => {
  dom.clockText.textContent = nowText();
}, 1000);

bootSession();
