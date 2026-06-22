import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Briefcase } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { api } from "../lib/api";

type LoginMode = "user" | "admin";

type LocationState = {
  from?: string;
  mode?: LoginMode;
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as LocationState | null) ?? null;

  const [accountNo, setAccountNo] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<LoginMode>(locationState?.mode ?? "user");

  useEffect(() => {
    if (api.getPendingCertificate()) {
      navigate("/certificate", { replace: true });
      return;
    }

    const loginMode = api.getLoginMode();
    if (loginMode === "admin") {
      navigate("/", { replace: true });
      return;
    }
    if (loginMode === "user") {
      navigate("/user", { replace: true });
    }
  }, [navigate]);

  const handleLogin = async () => {
    const trimmedAccountNo = accountNo.trim();
    const trimmedPassword = password.trim();

    if (!trimmedAccountNo || !trimmedPassword) {
      setError("请输入完整的账号和密码");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (mode === "user") {
        const result = await api.userLogin(trimmedAccountNo, trimmedPassword);
        if (result.requires_certificate) {
          navigate("/certificate", { replace: true });
          return;
        }
        if (!result.auth_token) {
          throw new Error("登录失败，未获取到认证令牌");
        }
        navigate("/user", { replace: true });
      } else {
        const result = await api.adminLogin(trimmedAccountNo, trimmedPassword);
        if (result.requires_certificate) {
          navigate("/certificate", { replace: true });
          return;
        }
        if (!result.auth_token) {
          throw new Error("登录失败，未获取到认证令牌");
        }
        const target = locationState?.from && locationState.from !== "/login" ? locationState.from : "/";
        navigate(target, { replace: true });
      }
    } catch (err: any) {
      setError(err.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-slate-100 p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-lg">
        <CardHeader className="pb-2 text-center">
          <div className="mb-3 flex justify-center">
            <div className="rounded-full bg-red-600 p-3">
              <Briefcase className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl">账户管理系统</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "user" ? "投资者账户登录" : "工作人员后台登录"}
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
            <button
              data-testid="login-mode-user"
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === "user" ? "bg-white text-red-600 shadow" : "text-slate-500"
              }`}
              onClick={() => setMode("user")}
              type="button"
            >
              投资者端
            </button>
            <button
              data-testid="login-mode-admin"
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === "admin" ? "bg-white text-red-600 shadow" : "text-slate-500"
              }`}
              onClick={() => setMode("admin")}
              type="button"
            >
              管理端
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {mode === "user" ? "资金账号" : "工作人员账号"}
              </label>
              <input
                data-testid="login-account"
                type="text"
                value={accountNo}
                onChange={(e) => setAccountNo(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder={mode === "user" ? "请输入资金账号" : "请输入工作人员账号"}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">密码</label>
              <input
                data-testid="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="请输入密码"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <Button
              data-testid="login-submit"
              className="w-full bg-red-600 text-white hover:bg-red-700"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? "登录中..." : "登录"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
