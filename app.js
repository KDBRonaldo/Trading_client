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
  startClientBackgroundJobs();
});

dom.logoutBtn.addEventListener("click", () => logout());

dom.navItems.forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));

dom.refreshBtn.addEventListener("click", async () => {
  if (!validateSession()) return;
  await refreshExternalData({ randomizeMockQuotes: true });
  await restoreClientState({ silent: true });
  await syncOpenOrders({ silent: true });
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

dom.alertForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createAlert(dom.alertForm);
});

dom.alertRows.addEventListener("click", async (event) => {
  const alertId = event.target.dataset.alertDelete;
  if (alertId) await deleteAlert(alertId);
});

dom.notificationRows.addEventListener("click", async (event) => {
  const notificationId = event.target.dataset.notificationRead;
  if (notificationId) await markNotificationRead(notificationId);
});

dom.passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await changePassword(dom.passwordForm);
});

setInterval(() => {
  dom.clockText.textContent = nowText();
}, 1000);

bootSession();
