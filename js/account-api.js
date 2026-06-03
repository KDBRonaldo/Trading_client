async function verifyFundAccount(accountNo, password) {
  if (!API_CONFIG.accountBaseUrl)
    return verifyFundAccountMock(accountNo, password);

  const result = await requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.login,
    {
      method: "POST",
      body: { fundAccountNo: accountNo, tradePassword: password },
    },
  );
  if (!result.ok)
    return { ok: false, message: result.message || "资金账户系统拒绝登录请求" };
  return normalizeFundAccountLogin(result.data, accountNo);
}

function normalizeFundAccountLogin(data, accountNo) {
  if (data.success === false || data.ok === false || data.code === "FAIL") {
    return { ok: false, message: data.message || "登录失败" };
  }
  const payload = data.data || data.account || data;
  const account = {
    accountNo: payload.fundAccountNo || payload.accountNo || accountNo,
    securityAccountNo: payload.securityAccountNo || payload.stockAccountNo || payload.securitiesAccountNo || accountNo,
    name: payload.investorName || payload.name || "投资者",
    status: payload.accountStatus || payload.status || "正常",
    availableCash: Number(
      payload.availableCash ?? payload.availableBalance ?? 0,
    ),
    frozenCash: Number(payload.frozenCash ?? payload.frozenBalance ?? 0),
    firstLoginDone: Boolean(
      payload.firstLoginDone ?? payload.certificated ?? true,
    ),
    securityAccountLinked: payload.securityAccountLinked !== false,
  };
  return { ok: true, account, token: payload.token || data.token };
}

function verifyFundAccountMock(accountNo, password) {
  const account = state.accounts[accountNo];
  if (!account) return { ok: false, message: "账户不存在或证券账户未关联" };
  if (account.status === "锁定")
    return { ok: false, message: "账户已锁定，请联系客服" };
  if (account.tradePassword !== password) {
    account.failedAttempts += 1;
    if (account.failedAttempts >= 5) account.status = "锁定";
    saveState();
    return {
      ok: false,
      message:
        account.status === "锁定"
          ? "账户已锁定，请联系客服"
          : "密码错误，请重新输入",
    };
  }
  return {
    ok: true,
    account: {
      accountNo: account.accountNo,
      securityAccountNo: account.securityAccountNo || account.accountNo,
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

  const result = await requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.fundAccount,
    { params: { accountNo } },
  );
  if (!result.ok) return result;
  const payload = result.data.data || result.data.account || result.data;
  return {
    ok: true,
    account: {
      accountNo,
      availableCash: Number(
        payload.availableCash ?? payload.availableBalance ?? 0,
      ),
      frozenCash: Number(payload.frozenCash ?? payload.frozenBalance ?? 0),
      status: payload.accountStatus || payload.status || "正常",
    },
  };
}

async function fetchSecurityHoldings(accountNo) {
  if (!API_CONFIG.accountBaseUrl)
    return { ok: true, holdings: state.accounts[accountNo].holdings };

  const result = await requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.holdings,
    { params: { accountNo } },
  );
  if (!result.ok) return result;
  const payload = result.data.data || result.data.holdings || result.data;
  const rows = Array.isArray(payload) ? payload : [];
  return {
    ok: true,
    holdings: rows.map((item) => ({
      stockCode: item.stockCode,
      quantity: Number(item.quantity ?? item.holdingQuantity ?? 0),
      sellable: Number(
        item.sellable ?? item.sellableQuantity ?? item.availableQuantity ?? 0,
      ),
      cost: Number(item.cost ?? item.costPrice ?? 0),
    })),
  };
}

async function changePasswordViaAccountSystem(
  accountNo,
  type,
  oldPassword,
  newPassword,
) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true };
  return requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.changePassword,
    {
      params: { accountNo },
      method: "POST",
      body: { passwordType: type, oldPassword, newPassword },
    },
  );
}

async function freezeFunds(accountNo, amount, orderRef) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true };
  return requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.freezeFunds,
    {
      params: { accountNo },
      method: "POST",
      body: { amount, orderRef },
    },
  );
}

async function releaseFunds(accountNo, amount, orderRef) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true };
  return requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.releaseFunds,
    {
      params: { accountNo },
      method: "POST",
      body: { amount, orderRef },
    },
  );
}

async function freezeHolding(accountNo, stockCode, quantity, orderRef) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true };
  return requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.freezeHolding,
    {
      params: { accountNo },
      method: "POST",
      body: { stockCode, quantity, orderRef },
    },
  );
}

async function releaseHolding(accountNo, stockCode, quantity, orderRef) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true };
  return requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.releaseHolding,
    {
      params: { accountNo },
      method: "POST",
      body: { stockCode, quantity, orderRef },
    },
  );
}
