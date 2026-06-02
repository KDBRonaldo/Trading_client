const STORAGE_KEY = "stock-trading-client-state";
const SESSION_LIMIT_MS = 30 * 60 * 1000;

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

function login(accountNo, password) {
  if (!/^\d{16}$/.test(accountNo)) return { ok: false, message: "卡号格式错误，请输入16位数字" };
  if (!/^\d{6}$/.test(password)) return { ok: false, message: "密码格式错误，请输入6位数字" };
  const account = state.accounts[accountNo];
  if (!account) return { ok: false, message: "账户不存在或证券账户未关联" };
  if (account.status === "锁定") return { ok: false, message: "账户已锁定，请联系客服" };
  if (account.tradePassword !== password) {
    account.failedAttempts += 1;
    if (account.failedAttempts >= 5) account.status = "锁定";
    saveState();
    return { ok: false, message: account.status === "锁定" ? "账户已锁定，请联系客服" : "密码错误，请重新输入" };
  }
  account.failedAttempts = 0;
  const firstLogin = !account.firstLoginDone;
  account.firstLoginDone = true;
  state.currentAccount = accountNo;
  state.session = { accountNo, token: crypto.randomUUID(), lastActiveAt: Date.now() };
  saveState();
  return { ok: true, message: firstLogin ? "首次登录证书认证通过" : "登录成功" };
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

function submitOrder(form, side) {
  if (!validateSession()) return;
  const message = form.querySelector(".form-message");
  const account = currentAccount();
  const input = validateOrderInput(form, side);
  if (input.error) return setMessage(message, input.error, "error");

  if (side === "buy") {
    const amount = input.orderPrice * input.quantity;
    if (amount > account.availableCash) return setMessage(message, "购买金额超出可用资金", "error");
    account.availableCash -= amount;
    account.frozenCash += amount;
  } else {
    const holding = account.holdings.find((item) => item.stockCode === input.stockCode);
    if (!holding) return setMessage(message, "您未持有该股票", "error");
    if (input.quantity > holding.sellable) return setMessage(message, "出售数量超过可卖股数", "error");
    holding.sellable -= input.quantity;
  }

  const order = {
    id: `O${Date.now()}`,
    stockCode: input.stockCode,
    stockName: input.stock.name,
    side,
    price: input.orderPrice,
    quantity: input.quantity,
    tradedQuantity: 0,
    remainingQuantity: input.quantity,
    status: "未成交",
    submitTime: nowText(),
  };
  state.orders.unshift(order);
  saveState();
  form.reset();
  setMessage(message, `委托已提交，编号 ${order.id}`, "ok");
  toast("委托已提交");
  renderAll();
}

function cancelOrder(orderId) {
  if (!validateSession()) return;
  const order = state.orders.find((item) => item.id === orderId);
  if (!order || !["未成交", "部分成交"].includes(order.status)) {
    toast("指令已成交或已撤销，无法撤销");
    return;
  }
  const account = currentAccount();
  if (order.side === "buy") {
    const release = order.remainingQuantity * order.price;
    account.frozenCash -= release;
    account.availableCash += release;
  } else {
    const holding = account.holdings.find((item) => item.stockCode === order.stockCode);
    if (holding) holding.sellable += order.remainingQuantity;
  }
  order.status = "已撤销";
  order.remainingQuantity = 0;
  saveState();
  toast("撤销成功，冻结资源已释放");
  renderAll();
}

function simulateTrade(orderId) {
  if (!validateSession()) return;
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
        <button class="secondary-btn" data-fill="${order.id}" ${order.status !== "未成交" ? "disabled" : ""}>成交</button>
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

function changePassword(form) {
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

dom.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = login(dom.accountNo.value.trim(), dom.tradePassword.value.trim());
  if (!result.ok) return setMessage(dom.loginMessage, result.message, "error");
  setMessage(dom.loginMessage, result.message, "ok");
  showTerminal();
});

dom.logoutBtn.addEventListener("click", () => logout());

dom.navItems.forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));

dom.refreshBtn.addEventListener("click", () => {
  if (!validateSession()) return;
  Object.values(state.stocks).forEach((stock) => {
    const drift = stock.latest * (Math.random() * 0.012 - 0.006);
    stock.latest = Number(Math.max(0.01, stock.latest + drift).toFixed(2));
    stock.buyOne = Number((stock.latest - 0.01).toFixed(2));
    stock.sellOne = Number((stock.latest + 0.01).toFixed(2));
    stock.high = Math.max(stock.high, stock.latest);
    stock.low = Math.min(stock.low, stock.latest);
  });
  checkAlerts();
  renderAll();
  toast("行情与账户数据已刷新");
});

dom.marketForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validateSession()) return;
  const result = searchStocks(dom.marketKeyword.value);
  if (result.error) {
    dom.marketResult.innerHTML = `<p class="form-message error">${result.error}</p>`;
    return;
  }
  renderMarket(result.stocks);
});

dom.buyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitOrder(dom.buyForm, "buy");
});

dom.sellForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitOrder(dom.sellForm, "sell");
});

dom.orderRows.addEventListener("click", (event) => {
  const cancelId = event.target.dataset.cancel;
  const fillId = event.target.dataset.fill;
  if (cancelId) cancelOrder(cancelId);
  if (fillId) simulateTrade(fillId);
});

dom.alertForm.addEventListener("submit", (event) => {
  event.preventDefault();
  createAlert(dom.alertForm);
});

dom.alertRows.addEventListener("click", (event) => {
  const alertId = event.target.dataset.alertDelete;
  if (alertId) deleteAlert(alertId);
});

dom.passwordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  changePassword(dom.passwordForm);
});

setInterval(() => {
  dom.clockText.textContent = nowText();
}, 1000);

bootSession();
