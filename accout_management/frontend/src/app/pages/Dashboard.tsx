import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Activity, Building, CreditCard, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { api, ApiError } from "../lib/api";

interface Stats {
  security_account_count: number;
  fund_account_count: number;
  today_new_accounts: number;
  abnormal_account_count: number;
}

interface LogEntry {
  log_id: number;
  staff_id: number;
  operation_type: string;
  target_type: string;
  target_id: string;
  security_acc_no?: string | null;
  fund_acc_no?: string | null;
  detail: string;
  operation_time: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [statsRes, logsRes] = await Promise.all([api.getDashboardStats(), api.getRecentLogs(10)]);
        setStats(statsRes);
        setLogs(Array.isArray(logsRes) ? logsRes : []);
      } catch (error) {
        console.error("获取 Dashboard 数据失败:", error);
        if (error instanceof ApiError && error.code === 1018) {
          navigate("/login", { replace: true, state: { mode: "admin" } });
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchDashboardData();
  }, [navigate]);

  const formatNumber = (num: number | null | undefined) => Number(num ?? 0).toLocaleString("zh-CN");

  const getActionDisplayName = (operationType: string) => {
    const actionMap: Record<string, string> = {
      证券开户: "证券账户开户",
      资金开户: "资金账户开户",
      挂失: "账户挂失",
      补办: "账户补办",
      销户: "账户销户",
      资金存款: "资金存款",
      资金取款: "资金取款",
      查询资金账户: "账户信息查询",
      查询资金流水: "资金流水查询",
      更新投资者信息: "投资者信息更新",
      绑定证券账户: "账户关联绑定",
      解绑证券账户: "账户关联解绑",
      修改密码: "密码修改",
    };
    return actionMap[operationType] || operationType;
  };

  const getLogStatus = (operationType: string) => {
    if (operationType.includes("销户") || operationType.includes("挂失")) return "warning";
    if (operationType.includes("失败") || operationType.includes("拒绝")) return "error";
    return "success";
  };

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours} 小时前`;
    return date.toLocaleDateString("zh-CN");
  };

  const buildAccountSummary = (log: LogEntry) => {
    const segments = [];
    if (log.security_acc_no) {
      segments.push(`证券账户：${log.security_acc_no}`);
    }
    if (log.fund_acc_no) {
      segments.push(`资金账户：${log.fund_acc_no}`);
    }
    if (segments.length > 0) {
      return segments.join(" | ");
    }
    if (log.target_id) {
      return `目标对象：${log.target_id}`;
    }
    return "";
  };

  const statItems = [
    {
      name: "证券账户总数",
      value: stats ? formatNumber(stats.security_account_count) : "-",
      icon: Users,
      color: "text-red-500",
      bg: "bg-red-100",
    },
    {
      name: "资金账户总数",
      value: stats ? formatNumber(stats.fund_account_count) : "-",
      icon: CreditCard,
      color: "text-red-500",
      bg: "bg-red-100",
    },
    {
      name: "今日新开户",
      value: stats ? formatNumber(stats.today_new_accounts) : "-",
      icon: Building,
      color: "text-red-500",
      bg: "bg-red-100",
    },
    {
      name: "异常账户提醒",
      value: stats ? formatNumber(stats.abnormal_account_count) : "-",
      icon: Activity,
      color: stats && stats.abnormal_account_count > 0 ? "text-orange-500" : "text-green-500",
      bg: stats && stats.abnormal_account_count > 0 ? "bg-orange-100" : "bg-green-100",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">账户业务总览</h2>
          <p className="text-slate-500">查看证券及资金账户概况与当前工作人员的近期操作。</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/securities"
            className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-red-700"
          >
            证券开户
          </Link>
          <Link
            to="/funds"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            资金开户
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statItems.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">{stat.name}</CardTitle>
              <div className={`${stat.bg} ${stat.color} rounded-full p-2`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "..." : stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最新操作记录</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading ? (
              <div className="py-4 text-center text-slate-500">加载中...</div>
            ) : logs.length === 0 ? (
              <div className="py-4 text-center text-slate-500">暂无操作记录</div>
            ) : (
              logs.map((log) => {
                const status = getLogStatus(log.operation_type);
                const accountSummary = buildAccountSummary(log);
                return (
                  <div
                    key={log.log_id}
                    className="flex items-start justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-900">{getActionDisplayName(log.operation_type)}</p>
                      {accountSummary && <p className="text-xs text-slate-600">{accountSummary}</p>}
                      <p className="text-xs text-slate-500">{log.detail || "无附加说明"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-slate-500">{formatTime(log.operation_time)}</p>
                      <span
                        className={`mt-1 inline-block rounded px-2 py-0.5 text-[10px] ${
                          status === "success"
                            ? "bg-green-100 text-green-700"
                            : status === "warning"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {status === "success" ? "完成" : status === "warning" ? "注意" : "异常"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
