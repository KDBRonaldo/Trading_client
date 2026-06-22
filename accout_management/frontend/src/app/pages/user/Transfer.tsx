import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRightLeft, RefreshCw, Wallet } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { api, ApiError } from "../../lib/api";

type AccountSnapshot = {
  fundAccNo: string;
  availableBalance: number;
  frozenBalance: number;
};

export default function Transfer() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [direction, setDirection] = useState<"bank_to_securities" | "securities_to_bank">("bank_to_securities");
  const [amount, setAmount] = useState("");
  const [withdrawPassword, setWithdrawPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  useEffect(() => {
    void loadAccount();
  }, []);

  const loadAccount = async () => {
    setLoading(true);
    try {
      const data = await api.getMyAccount();
      setAccount({
        fundAccNo: data.fund_acc_no || api.getCurrentFundAccountNo(),
        availableBalance: Number(data.available_balance || 0),
        frozenBalance: Number(data.frozen_balance || 0),
      });
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 1018) {
        navigate("/login", { replace: true, state: { mode: "user" } });
        return;
      }
      showMessage(err.message || "加载账户失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg: string, type: "success" | "error") => {
    setMessage(msg);
    setMessageType(type);
    window.setTimeout(() => setMessage(""), 5000);
  };

  const handleTransfer = async () => {
    if (!amount) {
      showMessage("请输入转账金额", "error");
      return;
    }

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      showMessage("转账金额必须大于 0", "error");
      return;
    }

    if (direction === "securities_to_bank") {
      if (!withdrawPassword || withdrawPassword.length !== 6) {
        showMessage("请输入 6 位取款密码", "error");
        return;
      }
      if (numAmount > Number(account?.availableBalance || 0)) {
        showMessage("转出金额不能超过当前可用余额", "error");
        return;
      }
    }

    setSubmitting(true);
    try {
      // 当前后端仍未提供真正的投资者银证转账接口。
      // 第二轮测试先保证余额展示、登录态和交互提示正确，避免误调内部柜台接口。
      throw new ApiError("当前版本暂未开放投资者自助银证转账接口，请通过柜台办理");
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 1018) {
        navigate("/login", { replace: true, state: { mode: "user" } });
        return;
      }
      showMessage(err.message || "转账失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <h2 className="text-2xl font-bold">银证转账</h2>
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-red-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">银证转账</h2>
        <p className="text-slate-500">查看资金账户可用余额，并准备后续银证转账联调</p>
      </div>

      {message && (
        <div
          className={`rounded-md p-4 ${
            messageType === "success"
              ? "border border-green-200 bg-green-50 text-green-700"
              : "border border-red-200 bg-red-50 text-red-600"
          }`}
        >
          {message}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-red-600" />
              <span>账户信息</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between border-b py-2">
                <span className="text-slate-500">资金账号</span>
                <span className="font-mono font-medium">{account?.fundAccNo}</span>
              </div>
              <div className="flex justify-between border-b py-2">
                <span className="text-slate-500">可用资金</span>
                <span className="font-mono font-semibold text-red-600">
                  {Number(account?.availableBalance || 0).toLocaleString("zh-CN", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">冻结资金</span>
                <span className="font-mono text-slate-500">
                  {Number(account?.frozenBalance || 0).toLocaleString("zh-CN", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-red-600" />
              <span>转账操作</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="mb-4 flex gap-3">
                <Button
                  className={`flex-1 ${
                    direction === "bank_to_securities" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                  onClick={() => setDirection("bank_to_securities")}
                >
                  银转证
                </Button>
                <Button
                  className={`flex-1 ${
                    direction === "securities_to_bank" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                  onClick={() => setDirection("securities_to_bank")}
                >
                  证转银
                </Button>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {direction === "bank_to_securities" ? "转入金额" : "转出金额"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="请输入金额"
                />
                {direction === "securities_to_bank" && account && (
                  <p className="mt-1 text-xs text-slate-400">
                    最大可转出：
                    {Number(account.availableBalance).toLocaleString("zh-CN", {
                      minimumFractionDigits: 2,
                    })}
                    元
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">取款密码</label>
                <input
                  type="password"
                  value={withdrawPassword}
                  onChange={(e) => setWithdrawPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="请输入 6 位取款密码"
                  maxLength={6}
                />
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                当前版本仅支持展示余额与校验输入，真实投资者银证转账接口仍待后端联调开放。
              </div>

              <Button
                className="w-full bg-red-600 text-white hover:bg-red-700"
                onClick={handleTransfer}
                disabled={submitting}
              >
                {submitting ? "处理中..." : "确认转账"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
