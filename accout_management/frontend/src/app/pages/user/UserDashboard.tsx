import { useEffect, useState } from "react";
import { ArrowRightLeft, Wallet } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ApiError, api } from "../../lib/api";

type AccountSnapshot = {
  accountNo: string;
  availableBalance: number;
  frozenBalance: number;
  status: string;
};

type HoldingSnapshot = {
  stock_code?: string;
  stock_name?: string;
  quantity?: number;
  frozen_quantity?: number;
  available_quantity?: number;
  avg_cost?: number;
};

export default function UserDashboard() {
  const navigate = useNavigate();
  const [holdings, setHoldings] = useState<HoldingSnapshot[]>([]);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const accountData = await api.getFundSnapshot();
      setAccount({
        accountNo: accountData.fund_acc_no || api.getCurrentFundAccountNo(),
        availableBalance: Number(accountData.available_balance || 0),
        frozenBalance: Number(accountData.frozen_balance || 0),
        status: accountData.status || "unknown",
      });

      try {
        const securityData = await api.getSecuritySnapshot();
        setHoldings(Array.isArray(securityData.holdings) ? securityData.holdings : []);
      } catch (holdingError: any) {
        if (holdingError instanceof ApiError && holdingError.code === 1018) {
          navigate("/login", { replace: true, state: { mode: "user" } });
          return;
        }
        setHoldings([]);
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 1018) {
        navigate("/login", { replace: true, state: { mode: "user" } });
        return;
      }
      setError(err.message || "加载数据失败");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-red-600" />
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <h2 className="text-2xl font-bold">我的账户</h2>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-600">
          {error || "账户信息不存在"}
        </div>
        <Button onClick={() => void loadData()}>重试</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">我的账户</h2>
          <p className="text-slate-500">查看资金账户与证券持仓信息</p>
        </div>
        <Button onClick={() => navigate("/user/transfer")}>
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          银证转账
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">可用资金</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold font-mono">
            {account.availableBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">冻结资金</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold font-mono">
            {account.frozenBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">账户状态</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-xl font-bold">
            <Wallet className="h-5 w-5 text-red-600" />
            {account.status}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">证券持仓记录</CardTitle>
          <p className="text-sm text-slate-500">资金账号：{account.accountNo}</p>
        </CardHeader>
        <CardContent>
          {holdings.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed bg-slate-50">
              <p className="text-slate-500">暂无持仓记录</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>证券名称</TableHead>
                  <TableHead>证券代码</TableHead>
                  <TableHead className="text-right">持仓数量</TableHead>
                  <TableHead className="text-right">冻结数量</TableHead>
                  <TableHead className="text-right">可用数量</TableHead>
                  <TableHead className="text-right">平均成本</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((holding) => (
                  <TableRow key={holding.stock_code}>
                    <TableCell>{holding.stock_name || holding.stock_code}</TableCell>
                    <TableCell className="font-mono">{holding.stock_code}</TableCell>
                    <TableCell className="text-right">{holding.quantity || 0}</TableCell>
                    <TableCell className="text-right">{holding.frozen_quantity || 0}</TableCell>
                    <TableCell className="text-right">{holding.available_quantity || 0}</TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(holding.avg_cost || 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
