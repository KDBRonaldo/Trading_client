const ORDER_OPEN_STATUSES = ["未成交", "部分成交", "撤单中"];
const CLIENT_SYNC_INTERVAL_MS = 5000;
const ALERT_CHECK_INTERVAL_MS = 15000;
const NOTIFICATION_SYNC_INTERVAL_MS = 15000;
const backgroundTimers = {
  orderSync: null,
  alertCheck: null,
  notificationSync: null,
};
const operationLocks = new Set();
const manualReviewTimers = new Map();

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
  if (!/^[A-Za-z0-9]{6,32}$/.test(accountNo)) return { ok: false, message: "账户号格式错误" };
  if (!password) return { ok: false, message: "请输入交易密码" };
  const authResult = await verifyFundAccount(accountNo, password);
  if (!authResult.ok) return authResult;

  const account = ensureLocalAccount(authResult.account);
  if (account.status === "锁定") return { ok: false, message: "账户已锁定，请联系客服" };
  if (account.status !== "正常") return { ok: false, message: `账户状态异常：${account.status}` };
  if (!authResult.account.securityAccountLinked) return { ok: false, message: "证券账户未关联" };

  account.failedAttempts = 0;
  const firstLogin = !account.firstLoginDone;
  account.firstLoginDone = true;
  const sessionResult = await createClientSession(account);
  if (!sessionResult.ok) return { ok: false, message: sessionResult.message || "交易客户端会话写入失败" };
  state.currentAccount = accountNo;
  state.session = {
    accountNo,
    sessionId: sessionResult.sessionId || authResult.token || crypto.randomUUID(),
    token: authResult.token || sessionResult.sessionId || crypto.randomUUID(),
    lastActiveAt: Date.now(),
  };
  await restoreClientState({ silent: true });
  saveState();
  return { ok: true, message: firstLogin ? "首次登录证书认证通过" : "登录成功" };
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
    securityAccountNo: remoteAccount.securityAccountNo || fallback.securityAccountNo || remoteAccount.accountNo,
    availableCash: remoteAccount.availableCash,
    frozenCash: remoteAccount.frozenCash,
    firstLoginDone: Boolean(fallback.firstLoginDone || remoteAccount.firstLoginDone),
    securityAccountLinked: remoteAccount.securityAccountLinked,
  };
  return state.accounts[remoteAccount.accountNo];
}

function logout(message = "") {
  if (state.session?.sessionId) updateClientSession(state.session.sessionId, "LOGOUT");
  stopClientBackgroundJobs();
  stopManualReviewPolling();
  state.currentAccount = null;
  state.session = null;
  saveState();
  dom.loginView.classList.remove("hidden");
  dom.terminalView.classList.add("hidden");
  if (message) setMessage(dom.loginMessage, message, "error");
}

async function bootSession() {
  if (state.session && Date.now() - state.session.lastActiveAt <= SESSION_LIMIT_MS) {
    state.currentAccount = state.session.accountNo;
    showTerminal();
    await restoreClientState({ silent: true });
    startClientBackgroundJobs();
  } else {
    logout();
  }
}

async function restoreClientState({ silent = false } = {}) {
  const account = currentAccount();
  if (!account || !API_CONFIG.clientBaseUrl) return;

  const [ordersResult, tradesResult, alertsResult, notificationsResult] =
    await Promise.all([
      fetchClientOrders(account),
      fetchClientTrades(account),
      fetchClientAlerts(account),
      fetchClientNotifications(account),
    ]);

  if (ordersResult.ok && !ordersResult.mock) {
    const localOrderMetadata = new Map();
    state.orders.forEach((order) => {
      localOrderMetadata.set(order.id, order);
      if (order.assetRef) localOrderMetadata.set(order.assetRef, order);
    });
    const remoteOrderIds = new Set(ordersResult.orders.map((order) => order.id));
    const mergedOrders = ordersResult.orders.map((remoteOrder) => {
      const localOrder = localOrderMetadata.get(remoteOrder.id);
      if (!localOrder) return remoteOrder;
      return {
        ...remoteOrder,
        assetRef: localOrder.assetRef || remoteOrder.assetRef,
        reviewId: localOrder.reviewId,
        userName: localOrder.userName,
        reviewStatus: localOrder.reviewStatus,
        reviewReason: localOrder.reviewReason,
        centralStatus: localOrder.centralStatus,
      };
    });
    const pendingLocalReviews = state.orders.filter(
      (order) =>
        order.reviewId &&
        !remoteOrderIds.has(order.id) &&
        ["正在审核", "人工审核中", "审核通过", "人工审核通过"].includes(order.reviewStatus),
    );
    state.orders = [...pendingLocalReviews, ...mergedOrders];
  }
  if (tradesResult.ok && !tradesResult.mock) state.trades = tradesResult.trades;
  if (alertsResult.ok && !alertsResult.mock) state.alerts = alertsResult.alerts;
  if (notificationsResult.ok && !notificationsResult.mock) {
    state.notifications = notificationsResult.notifications;
  }

  const failures = [ordersResult, tradesResult, alertsResult, notificationsResult]
    .filter((result) => !result.ok);
  if (failures.length && !silent) {
    toast(failures[0].message || "交易客户端历史数据恢复失败");
  }

  saveState();
  renderAll();
}

function startClientBackgroundJobs() {
  stopClientBackgroundJobs();
  if (!state.session) return;

  backgroundTimers.orderSync = setInterval(() => {
    syncOpenOrders({ silent: true });
  }, CLIENT_SYNC_INTERVAL_MS);
  backgroundTimers.alertCheck = setInterval(() => {
    refreshAlertMonitor({ silent: true });
  }, ALERT_CHECK_INTERVAL_MS);
  backgroundTimers.notificationSync = setInterval(() => {
    refreshClientNotifications({ silent: true });
  }, NOTIFICATION_SYNC_INTERVAL_MS);

  syncOpenOrders({ silent: true });
  refreshAlertMonitor({ silent: true });
  refreshClientNotifications({ silent: true });
  state.orders.filter((order) => order.reviewStatus === "人工审核中").forEach((order) => startManualReviewPolling(order.id));
}

function stopManualReviewPolling(orderId) {
  if (orderId) {
    const timer = manualReviewTimers.get(orderId);
    if (timer) clearTimeout(timer);
    manualReviewTimers.delete(orderId);
    return;
  }
  manualReviewTimers.forEach((timer) => clearTimeout(timer));
  manualReviewTimers.clear();
}

function startManualReviewPolling(orderId) {
  if (manualReviewTimers.has(orderId)) return;
  const poll = async () => {
    const order = state.orders.find((item) => item.id === orderId);
    if (!order || order.reviewStatus !== "人工审核中" || !order.reviewId) return stopManualReviewPolling(orderId);
    const result = await fetchManagementReviewResult(order.reviewId);
    if (result.ok && result.reviewStatus !== "PENDING_MANUAL") {
      stopManualReviewPolling(orderId);
      await applyManualReviewResult(order, result);
      return;
    }
    if (!result.ok) order.reviewReason = `等待人工审核结果：${result.message || "查询失败，将自动重试"}`;
    saveState();
    renderAll();
    manualReviewTimers.set(orderId, setTimeout(poll, 4000));
  };
  manualReviewTimers.set(orderId, setTimeout(poll, 4000));
}

function stopClientBackgroundJobs() {
  Object.keys(backgroundTimers).forEach((key) => {
    if (backgroundTimers[key]) clearInterval(backgroundTimers[key]);
    backgroundTimers[key] = null;
  });
}

function searchStocks(keyword) {
  const query = keyword.trim();
  if (!query) return { error: "请输入股票名称或代码" };
  if (/^\d+$/.test(query) && !/^\d{6}$/.test(query)) return { error: "股票代码格式错误，请输入6位数字" };
  const stocks = Object.values(state.stocks).filter((stock) => stock.stockCode === query || stock.name.includes(query));
  if (!stocks.length) return { error: "未找到匹配的股票，请重新输入" };
  return { stocks };
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

  if (API_CONFIG.centralBaseUrl || (API_CONFIG.clientBaseUrl && API_CONFIG.centralKafkaEnabled)) {
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

  await checkAlerts();
  saveState();
  renderAll();
}

function centralTradingManagesAssets() {
  return Boolean(
    !API_CONFIG.accountBaseUrl &&
      (API_CONFIG.centralBaseUrl ||
        (API_CONFIG.clientBaseUrl && API_CONFIG.centralKafkaEnabled)),
  );
}

async function persistOrderReview(order, account) {
  if (!API_CONFIG.clientBaseUrl) return { ok: true, mock: true };
  const auditFields = {
    reviewId: order.reviewId || null,
    reviewStatus: order.reviewStatus || null,
    reviewReason: order.reviewReason || null,
    centralStatus: order.centralStatus || null,
  };
  if (order.localOrderId) return updateClientOrder(order, auditFields);
  const result = await createClientOrder(order, account);
  if (result.ok && result.localOrderId) order.localOrderId = result.localOrderId;
  return result;
}

async function submitOrder(form, side) {
  if (!validateSession()) return;
  const lockKey = `submit:${side}`;
  if (operationLocks.has(lockKey)) return;
  operationLocks.add(lockKey);
  const submitButton = form.querySelector("button[type='submit']");
  const previousButtonText = submitButton?.textContent;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "提交中";
  }
  const message = form.querySelector(".form-message");
  try {
    const account = currentAccount();
    const pendingStockCode = form.stockCode.value.trim();
    if ((API_CONFIG.centralBaseUrl || (API_CONFIG.clientBaseUrl && API_CONFIG.centralKafkaEnabled)) && /^\d{6}$/.test(pendingStockCode)) {
      const quoteResult = await fetchQuotes(pendingStockCode);
      if (!quoteResult.ok) {
        const fallback = quoteResult.pending
          ? "正在等待中央交易系统返回最新行情，请稍后再次提交"
          : "无法获取中央交易系统最新行情，已阻止委托提交";
        return setMessage(message, quoteResult.message || fallback, "error");
      }
      quoteResult.stocks.forEach((stock) => {
        state.stocks[stock.stockCode] = stock;
      });
    }
    const input = validateOrderInput(form, side);
    if (input.error) return setMessage(message, input.error, "error");

    const orderSeed = Date.now();
    const orderId = `C${orderSeed}`;
    const limits = getLimits(input.stock);
    const orderDraft = {
      reviewId: `R${orderSeed}`,
      orderId,
      orderNo: orderId,
      fundAccountNo: account.accountNo,
      securityAccountNo: account.securityAccountNo || account.accountNo,
      userName: account.name || "",
      stockCode: input.stockCode,
      stockName: input.stock.name || "",
      direction: side === "buy" ? "BUY" : "SELL",
      price: input.orderPrice,
      quantity: input.quantity,
      highLimit: limits.upper,
      lowLimit: limits.lower,
      clientTime: new Date().toISOString(),
    };
    const order = {
      id: orderId,
      assetRef: orderId,
      reviewId: orderDraft.reviewId,
      fundAccountNo: orderDraft.fundAccountNo,
      securityAccountNo: orderDraft.securityAccountNo,
      userName: orderDraft.userName,
      stockCode: input.stockCode,
      stockName: input.stock.name,
      side,
      price: input.orderPrice,
      quantity: input.quantity,
      tradedQuantity: 0,
      remainingQuantity: input.quantity,
      status: "审核中",
      reviewStatus: "正在审核",
      reviewReason: "已发送至交易管理系统，等待审核结果",
      centralStatus: "尚未发送",
      submitTime: nowText(),
    };
    state.orders.unshift(order);
    await persistOrderReview(order, account);
    saveState();
    renderAll();

    setMessage(message, "正在等待交易管理系统审核，请稍候…", "pending");
    const review = await reviewOrderByManagement(orderDraft);
    if (!review.ok) {
      order.reviewStatus = "审核失败";
      order.reviewReason = review.message || "未收到审核结果";
      order.status = "审核失败";
      await persistOrderReview(order, account);
      saveState();
      renderAll();
      return setMessage(message, `交易管理系统审核失败：${review.message || "未收到审核结果"}`, "error");
    }
    if (!review.approved) {
      const prefix = review.reviewStatus === "PENDING_MANUAL" ? "审核暂缓，等待人工审核" : "审核不通过";
      const code = review.rejectCode ? `（${review.rejectCode}）` : "";
      order.reviewStatus = review.reviewStatus === "PENDING_MANUAL" ? "人工审核中" : "审核不通过";
      order.reviewReason = `${code}${review.message || "交易管理系统未说明原因"}`;
      order.status = review.reviewStatus === "PENDING_MANUAL" ? "审核暂缓" : "审核拒绝";
      await persistOrderReview(order, account);
      saveState();
      renderAll();
      if (review.reviewStatus === "PENDING_MANUAL") startManualReviewPolling(order.id);
      return setMessage(message, `${prefix}${code}：${review.message || "交易管理系统未说明原因"}`, "error");
    }

    order.reviewStatus = "审核通过";
    order.reviewReason = `风险等级：${review.riskLevel || "LOW"}`;
    order.centralStatus = "准备发送";
    await persistOrderReview(order, account);
    renderAll();

    const centralOwnsAssets = centralTradingManagesAssets();
    if (side === "buy") {
      const amount = input.orderPrice * input.quantity;
      if (amount > account.availableCash) {
        order.status = "资金不足";
        order.centralStatus = "未发送";
        order.reviewReason = "审核通过，但购买金额超过可用资金";
        saveState();
        renderAll();
        return setMessage(message, "购买金额超出可用资金", "error");
      }
      const freezeResult = centralOwnsAssets ? { ok: true } : await freezeFunds(account.accountNo, amount, orderId);
      if (!freezeResult.ok) {
        order.status = "资金冻结失败";
        order.centralStatus = "未发送";
        order.reviewReason = `审核通过，但${freezeResult.message || "资金冻结失败"}`;
        saveState();
        renderAll();
        return setMessage(message, freezeResult.message || "资金冻结失败", "error");
      }
      if (!centralOwnsAssets) {
        account.availableCash -= amount;
        account.frozenCash += amount;
      }
    } else {
      const holding = account.holdings.find((item) => item.stockCode === input.stockCode);
      if (!holding) {
        order.status = "持仓不足";
        order.centralStatus = "未发送";
        order.reviewReason = "审核通过，但未持有该股票";
        saveState();
        renderAll();
        return setMessage(message, "您未持有该股票", "error");
      }
      if (input.quantity > holding.sellable) {
        order.status = "持仓不足";
        order.centralStatus = "未发送";
        order.reviewReason = "审核通过，但出售数量超过可卖股数";
        saveState();
        renderAll();
        return setMessage(message, "出售数量超过可卖股数", "error");
      }
      const freezeResult = centralOwnsAssets ? { ok: true } : await freezeHolding(account.accountNo, input.stockCode, input.quantity, orderId);
      if (!freezeResult.ok) {
        order.status = "股票冻结失败";
        order.centralStatus = "未发送";
        order.reviewReason = `审核通过，但${freezeResult.message || "股票冻结失败"}`;
        saveState();
        renderAll();
        return setMessage(message, freezeResult.message || "股票冻结失败", "error");
      }
      if (!centralOwnsAssets) holding.sellable -= input.quantity;
    }

    const centralChannel = API_CONFIG.centralBaseUrl
      ? "中央交易系统"
      : API_CONFIG.clientBaseUrl && API_CONFIG.centralKafkaEnabled
        ? "中央交易系统（Kafka）"
        : "中央交易系统模拟通道";
    order.centralStatus = `正在发送至${centralChannel}`;
    saveState();
    renderAll();
    setMessage(message, "审核已通过，正在发送中央交易系统…", "pending");
    const centralResult = await submitOrderToCentral(orderDraft);
    if (!centralResult.ok) {
      if (side === "buy") {
        const amount = input.orderPrice * input.quantity;
        if (!centralOwnsAssets) {
          account.availableCash += amount;
          account.frozenCash -= amount;
          await releaseFunds(account.accountNo, amount, `${orderId}:REJECT`);
        }
      } else {
        const holding = account.holdings.find((item) => item.stockCode === input.stockCode);
        if (!centralOwnsAssets) {
          if (holding) holding.sellable += input.quantity;
          await releaseHolding(account.accountNo, input.stockCode, input.quantity, `${orderId}:REJECT`);
        }
      }
      saveState();
      order.status = "中央提交失败";
      order.centralStatus = "中央交易系统未接受";
      order.reviewReason = centralResult.message || "冻结资源已释放";
      saveState();
      renderAll();
      return setMessage(message, `审核已通过，但中央交易系统未接受：${centralResult.message || "冻结资源已释放"}`, "error");
    }

    order.id = centralResult.orderNo;
    order.status = centralResult.status || "未成交";
    order.centralStatus = `已发送至${centralChannel}`;
    order.reviewReason = `审核通过；中央状态：${order.status}`;
    const clientOrderResult = await persistOrderReview(order, account);
    if (!clientOrderResult.ok) {
      toast(clientOrderResult.message || "委托记录写入交易客户端数据库失败");
    }
    saveState();
    form.reset();
    setMessage(message, `审核已通过，已发送至${centralChannel}，委托编号 ${order.id}`, "ok");
    toast(`审核已通过，已发送至${centralChannel}`);
    renderAll();
  } finally {
    operationLocks.delete(lockKey);
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = previousButtonText;
    }
  }
}

async function applyManualReviewResult(order, result) {
  const account = currentAccount();
  if (!account) return;
  if (!result.approved || result.reviewStatus !== "MANUAL_APPROVED") {
    order.reviewStatus = "人工审核拒绝";
    order.status = "审核拒绝";
    order.reviewReason = `${result.rejectCode ? `（${result.rejectCode}）` : ""}${result.message || "人工审核未通过"}`;
    order.centralStatus = "未发送";
    await persistOrderReview(order, account);
    saveState();
    renderAll();
    toast(`人工审核未通过：${result.message || "未说明原因"}`);
    return;
  }

  order.reviewStatus = "人工审核通过";
  order.reviewReason = result.message || "人工审核通过";
  order.status = "准备提交";
  const amount = Number(order.price) * Number(order.quantity);
  const centralOwnsAssets = centralTradingManagesAssets();

  if (order.side === "buy") {
    if (amount > account.availableCash) {
      order.status = "资金不足";
      order.centralStatus = "未发送";
      order.reviewReason = "人工审核通过，但购买金额超过可用资金";
      saveState(); renderAll(); return;
    }
    const frozen = centralOwnsAssets ? { ok: true } : await freezeFunds(account.accountNo, amount, order.assetRef);
    if (!frozen.ok) {
      order.status = "资金冻结失败";
      order.centralStatus = "未发送";
      order.reviewReason = frozen.message || "人工审核通过后资金冻结失败";
      saveState(); renderAll(); return;
    }
    if (!centralOwnsAssets) { account.availableCash -= amount; account.frozenCash += amount; }
  } else {
    const holding = account.holdings.find((item) => item.stockCode === order.stockCode);
    if (!holding || Number(order.quantity) > Number(holding.sellable)) {
      order.status = "持仓不足";
      order.centralStatus = "未发送";
      order.reviewReason = "人工审核通过，但可卖持仓不足";
      saveState(); renderAll(); return;
    }
    const frozen = centralOwnsAssets ? { ok: true } : await freezeHolding(account.accountNo, order.stockCode, order.quantity, order.assetRef);
    if (!frozen.ok) {
      order.status = "股票冻结失败";
      order.centralStatus = "未发送";
      order.reviewReason = frozen.message || "人工审核通过后股票冻结失败";
      saveState(); renderAll(); return;
    }
    if (!centralOwnsAssets) holding.sellable -= Number(order.quantity);
  }

  const centralChannel = API_CONFIG.centralBaseUrl ? "中央交易系统" : API_CONFIG.clientBaseUrl && API_CONFIG.centralKafkaEnabled ? "中央交易系统（Kafka）" : "中央交易系统模拟通道";
  order.centralStatus = `正在发送至${centralChannel}`;
  saveState(); renderAll();
  const centralResult = await submitOrderToCentral({
    reviewId: order.reviewId,
    orderId: order.assetRef,
    orderNo: order.assetRef,
    fundAccountNo: order.fundAccountNo || account.accountNo,
    securityAccountNo: order.securityAccountNo || account.securityAccountNo || account.accountNo,
    userName: order.userName || account.name || "",
    stockCode: order.stockCode,
    stockName: order.stockName,
    direction: order.side === "buy" ? "BUY" : "SELL",
    price: order.price,
    quantity: order.quantity,
    clientTime: new Date().toISOString(),
  });
  if (!centralResult.ok) {
    order.status = "中央提交失败";
    order.centralStatus = "中央交易系统未接受";
    order.reviewReason = centralResult.message || "人工审核通过后中央提交失败";
    saveState(); renderAll(); toast(order.reviewReason); return;
  }
  order.id = centralResult.orderNo;
  order.status = centralResult.status || "未成交";
  order.centralStatus = `已发送至${centralChannel}`;
  order.reviewReason = `人工审核通过；中央状态：${order.status}`;
  await persistOrderReview(order, account);
  saveState();
  renderAll();
  toast(`人工审核通过，已发送至${centralChannel}`);
}

async function cancelOrder(orderId) {
  if (!validateSession()) return;
  const lockKey = `cancel:${orderId}`;
  if (operationLocks.has(lockKey)) return;
  operationLocks.add(lockKey);
  const order = state.orders.find((item) => item.id === orderId);
  if (!order || !["未成交", "部分成交"].includes(order.status)) {
    operationLocks.delete(lockKey);
    toast("指令已成交或已撤销，无法撤销");
    return;
  }
  const account = currentAccount();
  const previousStatus = order.status;
  const previousRemainingQuantity = order.remainingQuantity;
  order.status = "撤单中";
  await updateClientOrder(order);
  saveState();
  renderAll();

  const centralResult = await cancelOrderInCentral(orderId);
  if (!centralResult.ok) {
    order.status = previousStatus;
    order.remainingQuantity = previousRemainingQuantity;
    await updateClientOrder(order);
    saveState();
    renderAll();
    operationLocks.delete(lockKey);
    toast(centralResult.message || "中央交易系统撤销失败");
    return;
  }
  if (centralTradingManagesAssets()) {
    const synced = await syncOrderResult(orderId, { silent: true });
    if (!synced || state.orders.find((item) => item.id === orderId)?.status === "撤单中") {
      toast("撤单请求已提交，等待中央交易系统回报");
    }
    operationLocks.delete(lockKey);
    return;
  }

  if (!centralTradingManagesAssets()) {
    let releaseResult;
    if (order.side === "buy") {
      const release = order.remainingQuantity * order.price;
      releaseResult = await releaseFunds(account.accountNo, release, `${order.assetRef || order.id}:CANCEL`);
      if (!releaseResult.ok) {
        operationLocks.delete(lockKey);
        toast(releaseResult.message || "资金账户解冻失败，订单状态等待同步");
        return;
      }
      account.frozenCash -= release;
      account.availableCash += release;
    } else {
      releaseResult = await releaseHolding(account.accountNo, order.stockCode, order.remainingQuantity, `${order.assetRef || order.id}:CANCEL`);
      if (!releaseResult.ok) {
        operationLocks.delete(lockKey);
        toast(releaseResult.message || "证券账户解冻失败，订单状态等待同步");
        return;
      }
      const holding = account.holdings.find((item) => item.stockCode === order.stockCode);
      if (holding) holding.sellable += order.remainingQuantity;
    }
  }
  order.status = "已撤销";
  order.remainingQuantity = 0;
  await updateClientOrder(order);
  saveState();
  toast("撤销成功，冻结资源已释放");
  renderAll();
  operationLocks.delete(lockKey);
}

async function simulateTrade(orderId) {
  if (!validateSession()) return;
  if (API_CONFIG.centralBaseUrl || (API_CONFIG.clientBaseUrl && API_CONFIG.centralKafkaEnabled)) {
    await syncOrderResult(orderId, { silent: false });
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

  const trade = {
    id: `T${Date.now()}`,
    orderId: order.id,
    stockCode: order.stockCode,
    stockName: order.stockName,
    price: order.price,
    quantity: order.quantity,
    amount,
    time: nowText(),
  };
  state.trades.unshift(trade);
  await createClientTrade(trade, order);
  await updateClientOrder(order);
  saveState();
  toast("成交回报已接收，资产与持仓已刷新");
  renderAll();
}

async function syncOrderResult(orderId, { silent = false } = {}) {
  const lockKey = `sync:${orderId}`;
  if (operationLocks.has(lockKey)) return false;
  operationLocks.add(lockKey);
  try {
    const result = await fetchOrderResultFromCentral(orderId);
    if (!result.ok) {
      if (!silent) toast(result.message || "中央交易系统暂无成交回报");
      return false;
    }
    return applyCentralTradeResult(orderId, result.result, { silent });
  } finally {
    operationLocks.delete(lockKey);
  }
}

async function syncOpenOrders({ silent = true } = {}) {
  if (!state.session || !(API_CONFIG.centralBaseUrl || (API_CONFIG.clientBaseUrl && API_CONFIG.centralKafkaEnabled))) {
    return;
  }
  const openOrders = state.orders.filter((order) => ORDER_OPEN_STATUSES.includes(order.status));
  for (const order of openOrders) {
    await syncOrderResult(order.id, { silent });
  }
}

async function applyCentralTradeResult(orderId, result, { silent = false } = {}) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order || !result) return false;
  const account = currentAccount();
  const previousTradedQuantity = Number(order.tradedQuantity || 0);
  const previousStatus = order.status;
  const previousRemainingQuantity = Number(order.remainingQuantity || 0);
  const normalizedStatus = result.status ? normalizeOrderStatus(result.status) : "";
  const tradedQuantity = Number(
    result.tradedQuantity ??
      result.filledQuantity ??
      result.quantity ??
      (normalizedStatus === "已成交" ? order.quantity : previousTradedQuantity),
  );
  const tradePrice = Number(result.tradePrice ?? result.price ?? order.price);
  const incrementalQuantity = Math.max(0, tradedQuantity - previousTradedQuantity);
  const amount = incrementalQuantity * tradePrice;
  const nextRemainingQuantity = Number(
    result.remainingQuantity ??
      (["已撤销", "已过期", "已拒绝"].includes(normalizedStatus)
        ? 0
        : Math.max(0, order.quantity - tradedQuantity)),
  );
  const assetRef = order.assetRef || order.id;

  if (!centralTradingManagesAssets() && incrementalQuantity > 0) {
    const settlementRef = `${assetRef}:FILL:${tradedQuantity}`;
    const settlement = order.side === "buy"
      ? await debitFunds(account.accountNo, amount, settlementRef)
      : await deductHolding(account.accountNo, order.stockCode, order.stockName, incrementalQuantity, tradePrice, settlementRef);
    if (!settlement.ok) {
      if (!silent) toast(settlement.message || "账户系统成交清算失败");
      return false;
    }
    const counterpart = order.side === "buy"
      ? await addHolding(account.accountNo, order.stockCode, order.stockName, incrementalQuantity, tradePrice, settlementRef)
      : await creditFunds(account.accountNo, amount, settlementRef);
    if (!counterpart.ok) {
      if (!silent) toast(counterpart.message || "账户系统成交清算失败");
      return false;
    }
  }

  if (!centralTradingManagesAssets() && ["已撤销", "已过期", "已拒绝"].includes(normalizedStatus)) {
    const releaseQuantity = Math.max(0, order.quantity - tradedQuantity);
    if (releaseQuantity > 0 && previousStatus !== normalizedStatus) {
      const release = order.side === "buy"
        ? await releaseFunds(account.accountNo, releaseQuantity * order.price, `${assetRef}:CANCEL`)
        : await releaseHolding(account.accountNo, order.stockCode, releaseQuantity, `${assetRef}:CANCEL`);
      if (!release.ok) {
        if (!silent) toast(release.message || "账户系统撤单解冻失败");
        return false;
      }
    }
  }

  order.tradedQuantity = tradedQuantity;
  order.remainingQuantity = nextRemainingQuantity;
  order.status = normalizedStatus || (order.remainingQuantity === 0 ? "已成交" : "部分成交");

  if (!centralTradingManagesAssets() && incrementalQuantity > 0 && order.side === "buy") {
    account.frozenCash -= amount;
    const holding = account.holdings.find((item) => item.stockCode === order.stockCode);
    if (holding) {
      const totalCost = holding.cost * holding.quantity + amount;
      holding.quantity += incrementalQuantity;
      holding.sellable += incrementalQuantity;
      holding.cost = totalCost / holding.quantity;
    } else {
      account.holdings.push({ stockCode: order.stockCode, quantity: incrementalQuantity, sellable: incrementalQuantity, cost: tradePrice });
    }
  } else if (!centralTradingManagesAssets() && incrementalQuantity > 0) {
    account.availableCash += amount;
    const holding = account.holdings.find((item) => item.stockCode === order.stockCode);
    if (holding) holding.quantity -= incrementalQuantity;
    account.holdings = account.holdings.filter((item) => item.quantity > 0);
  }

  if (incrementalQuantity > 0) {
    const reportTrades = Array.isArray(result.trades) && result.trades.length
      ? result.trades
      : [{
          tradeNo: result.tradeNo || result.tradeId,
          tradePrice,
          tradeQuantity: incrementalQuantity,
          tradeAmount: amount,
          tradeTime: result.tradeTime,
        }];

    for (const item of reportTrades) {
      const trade = {
        id: item.tradeNo || item.tradeId || `T${Date.now()}${Math.floor(Math.random() * 1000)}`,
        orderId: order.id,
        stockCode: item.stockCode || order.stockCode,
        stockName: order.stockName,
        price: Number(item.tradePrice ?? tradePrice),
        quantity: Number(item.tradeQuantity ?? incrementalQuantity),
        amount: Number(item.tradeAmount ?? Number(item.tradePrice ?? tradePrice) * Number(item.tradeQuantity ?? incrementalQuantity)),
        time: item.tradeTime || result.tradeTime || nowText(),
      };
      if (!state.trades.some((existing) => existing.id === trade.id && existing.orderId === trade.orderId)) {
        state.trades.unshift(trade);
        await createClientTrade(trade, order);
      }
    }
  }
  await updateClientOrder(order);
  saveState();
  const changed =
    incrementalQuantity > 0 ||
    previousStatus !== order.status ||
    previousRemainingQuantity !== Number(order.remainingQuantity || 0);
  if (changed && !silent) toast("中央交易系统订单回报已同步");
  renderAll();
  return changed;
}

async function createAlert(form) {
  if (!validateSession()) return;
  const message = form.querySelector(".form-message");
  const stockCode = form.stockCode.value.trim();
  const stock = state.stocks[stockCode];
  const alertPrice = Number(form.price.value.trim());
  if (!/^\d{6}$/.test(stockCode) || !stock) return setMessage(message, "股票代码无效", "error");
  if (!/^\d+(\.\d{1,2})?$/.test(form.price.value.trim()) || alertPrice <= 0) return setMessage(message, "提醒价格必须大于0，且最多保留2位小数", "error");
  const account = currentAccount();
  const alert = {
    id: `A${Date.now()}`,
    stockCode,
    stockName: stock.name,
    direction: form.direction.value,
    price: alertPrice,
    status: "启用",
    createTime: nowText(),
    triggerTime: "",
  };
  const clientAlertResult = await createClientAlert(alert, account);
  if (clientAlertResult.ok && clientAlertResult.alertId) {
    alert.alertId = clientAlertResult.alertId;
  } else if (!clientAlertResult.ok) {
    toast(clientAlertResult.message || "价格提醒写入交易客户端数据库失败");
  }
  state.alerts.unshift(alert);
  saveState();
  form.reset();
  setMessage(message, "提醒规则已保存", "ok");
  await checkAlerts();
  renderAlerts();
}

async function checkAlerts() {
  for (const alert of state.alerts) {
    if (alert.status !== "启用") continue;
    const stock = state.stocks[alert.stockCode];
    if (!stock) continue;
    const matched = alert.direction === "ABOVE" ? stock.latest >= alert.price : stock.latest <= alert.price;
    if (matched) {
      alert.status = "已触发";
      alert.triggerTime = nowText();
      const content = `${alert.stockName} 已触发价格提醒`;
      await updateClientAlert(alert, { alertStatus: "TRIGGERED", triggerNow: true });
      const notificationResult = await createClientNotification(alert, content);
      const notification = {
        id: notificationResult.notificationId ? `N${notificationResult.notificationId}` : `N${Date.now()}`,
        notificationId: notificationResult.notificationId,
        alertId: alert.alertId,
        content,
        readStatus: "UNREAD",
        time: nowText(),
      };
      if (!state.notifications.some((item) => item.id === notification.id)) {
        state.notifications.unshift(notification);
      }
      toast(content);
    }
  }
  saveState();
}

async function refreshAlertMonitor({ silent = true } = {}) {
  if (!state.session) return;
  const activeAlerts = state.alerts.filter((alert) => alert.status === "启用");
  if (!activeAlerts.length) return;

  const stockCodes = [...new Set(activeAlerts.map((alert) => alert.stockCode))];
  for (const stockCode of stockCodes) {
    const quoteResult = await fetchQuotes(stockCode);
    if (quoteResult.ok) {
      quoteResult.stocks.forEach((stock) => {
        state.stocks[stock.stockCode] = stock;
      });
    } else if (!silent) {
      toast(quoteResult.message || "价格提醒行情检查失败");
    }
  }
  await checkAlerts();
  renderAll();
}

async function refreshClientNotifications({ silent = true } = {}) {
  const account = currentAccount();
  if (!account || !API_CONFIG.clientBaseUrl) return;

  const result = await fetchClientNotifications(account);
  if (!result.ok) {
    if (!silent) toast(result.message || "通知刷新失败");
    return;
  }
  if (!result.mock) state.notifications = result.notifications;
  saveState();
  renderNotifications();
}

async function markNotificationRead(notificationId) {
  const notification = state.notifications.find((item) => String(item.id) === String(notificationId));
  if (!notification || notification.readStatus === "READ") return;

  const result = await markClientNotificationRead(notification.notificationId);
  if (!result.ok) {
    toast(result.message || "通知状态更新失败");
    return;
  }
  notification.readStatus = "READ";
  saveState();
  renderNotifications();
}

async function deleteAlert(alertId) {
  const alert = state.alerts.find((item) => item.id === alertId);
  if (alert) {
    alert.status = "停用";
    await updateClientAlert(alert, { alertStatus: "DISABLED" });
  }
  state.alerts = state.alerts.filter((item) => item.id !== alertId);
  saveState();
  renderAlerts();
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
  if (!oldPassword || !newPassword) return setMessage(message, "请输入原密码和新密码", "error");
  if (newPassword !== confirmPassword) return setMessage(message, "两次输入的密码不一致，请重新输入", "error");
  const result = await changePasswordViaAccountSystem(account.accountNo, type, oldPassword, newPassword);
  if (!result.ok) return setMessage(message, result.message || "资金账户系统修改密码失败", "error");
  account[key] = newPassword;
  saveState();
  form.reset();
  setMessage(message, "密码修改成功", "ok");
}
