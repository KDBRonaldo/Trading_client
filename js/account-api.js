async function verifyFundAccount(accountNo, password) {
  if (!API_CONFIG.accountBaseUrl)
    return verifyFundAccountMock(accountNo, password);

  const result = await requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.login,
    {
      method: "POST",
      body: { fund_acc_no: accountNo, trade_password: password },
    },
  );
  if (!result.ok)
    return { ok: false, message: result.message || "资金账户系统拒绝登录请求" };
  return normalizeFundAccountLogin(result.data, accountNo);
}

function normalizeFundAccountLogin(data, accountNo) {
  if (data.success === false || data.ok === false || (data.code !== undefined && data.code !== 0)) {
    return { ok: false, message: data.message || "登录失败" };
  }
  const payload = data.data || data.account || data;
  const account = {
    accountNo: payload.fund_acc_no || accountNo,
    securityAccountNo: payload.sec_acc_no || accountNo,
    authToken: payload.auth_token || "",
    name: payload.investorName || payload.investor_name || payload.userName || payload.user_name || "投资者",
    status: normalizeAccountStatus(payload.status),
    availableCash: 0,
    frozenCash: 0,
    firstLoginDone: true,
    securityAccountLinked: !!payload.sec_acc_no,
  };
  return { ok: true, account };
}

function accountPayload(data) {
  return data?.data || data?.account || data || {};
}

function normalizeAccountStatus(status) {
  const statusMap = {
    NORMAL: "正常",
    LOSS_FROZEN: "挂失冻结",
    VIOLATION_FROZEN: "违规冻结",
    NO_FUND_FROZEN: "无资金账户冻结",
    PRE_CLOSE: "预销户",
    CLOSED: "已销户",
  };
  return statusMap[status] || status || "正常";
}

function accountSystemResult(result, fallbackMessage) {
  if (!result.ok) return result;
  if (result.data?.code !== undefined && Number(result.data.code) !== 0) {
    return { ok: false, message: result.data.message || fallbackMessage };
  }
  return { ok: true, data: accountPayload(result.data) };
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
    { params: { fund_acc_no: accountNo, auth_token: currentAccount()?.authToken } },
  );
  const accountResult = accountSystemResult(result, "查询资金账户失败");
  if (!accountResult.ok) return accountResult;
  const payload = accountResult.data;
  return {
    ok: true,
    account: {
      accountNo,
      availableCash: Number(payload.available_balance ?? 0),
      frozenCash: Number(payload.frozen_balance ?? 0),
      status: normalizeAccountStatus(payload.status),
    },
  };
}

async function fetchSecurityHoldings(accountNo) {
  if (!API_CONFIG.accountBaseUrl)
    return { ok: true, holdings: state.accounts[accountNo].holdings };

  const result = await requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.holdings,
    { params: { sec_acc_no: currentAccount()?.securityAccountNo, auth_token: currentAccount()?.authToken } },
  );
  const accountResult = accountSystemResult(result, "查询证券持仓失败");
  if (!accountResult.ok) return accountResult;
  const payload = accountResult.data;
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload.holdings) ? payload.holdings : [];
  return {
    ok: true,
    holdings: rows.map((item) => ({
      stockCode: item.stock_code,
      quantity: Number(item.quantity ?? 0),
      sellable: Number(item.available_quantity ?? 0),
      cost: Number(item.avg_cost ?? 0),
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
  const result = await requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.changePassword,
    {
      method: "PUT",
      body: { fund_acc_no: accountNo, auth_token: currentAccount()?.authToken, password_type: type, old_password: oldPassword, new_password: newPassword },
    },
  );
  return accountSystemResult(result, "资金账户系统修改密码失败");
}

async function updateFundBalance(accountNo, amount, orderRef, txnType) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true };
  const result = await requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.fundBalanceChange,
    {
      method: "POST",
      body: {
        fund_acc_no: accountNo,
        ref_order_id: orderRef,
        txn_type: txnType,
        amount,
      },
    },
  );
  return accountSystemResult(result, "资金账户变更失败");
}

async function updateSecurityHolding(accountNo, stockCode, stockName, quantity, price, orderRef, changeType) {
  if (!API_CONFIG.accountBaseUrl) return { ok: true };
  const result = await requestJson(
    API_CONFIG.accountBaseUrl,
    API_CONFIG.endpoints.securityHoldingChange,
    {
      method: "POST",
      body: {
        sec_acc_no: currentAccount()?.securityAccountNo || accountNo,
        stock_code: stockCode,
        stock_name: stockName || state.stocks[stockCode]?.name || stockCode,
        ref_order_id: orderRef,
        change_type: changeType,
        quantity,
        price,
      },
    },
  );
  return accountSystemResult(result, "证券持仓变更失败");
}

async function freezeFunds(accountNo, amount, orderRef) {
  return updateFundBalance(accountNo, amount, orderRef, "买入冻结");
}
async function releaseFunds(accountNo, amount, orderRef) {
  return updateFundBalance(accountNo, amount, orderRef, "撤单解冻");
}
async function freezeHolding(accountNo, stockCode, quantity, orderRef) {
  return updateSecurityHolding(accountNo, stockCode, "", quantity, null, orderRef, "卖出冻结");
}
async function releaseHolding(accountNo, stockCode, quantity, orderRef) {
  return updateSecurityHolding(accountNo, stockCode, "", quantity, null, orderRef, "撤单释放");
}
async function debitFunds(accountNo, amount, orderRef) {
  return updateFundBalance(accountNo, amount, orderRef, "买入扣款");
}
async function creditFunds(accountNo, amount, orderRef) {
  return updateFundBalance(accountNo, amount, orderRef, "卖出回款");
}
async function addHolding(accountNo, stockCode, stockName, quantity, price, orderRef) {
  return updateSecurityHolding(accountNo, stockCode, stockName, quantity, price, orderRef, "买入增加");
}
async function deductHolding(accountNo, stockCode, stockName, quantity, price, orderRef) {
  return updateSecurityHolding(accountNo, stockCode, stockName, quantity, price, orderRef, "卖出扣减");
}
