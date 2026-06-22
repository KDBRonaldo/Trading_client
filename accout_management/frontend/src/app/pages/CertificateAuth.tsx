import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { api } from "../lib/api";

export default function CertificateAuth() {
  const navigate = useNavigate();
  const [certificateCode, setCertificateCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pending = api.getPendingCertificate();

  useEffect(() => {
    if (!pending) {
      navigate("/login", { replace: true });
    }
  }, [navigate, pending]);

  const handleSubmit = async () => {
    const trimmedCode = certificateCode.trim();
    if (!trimmedCode) {
      setError("请输入安全证书认证码");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await api.completeCertificate(trimmedCode);
      navigate(result.mode === "admin" ? "/" : "/user", { replace: true });
    } catch (err: any) {
      setError(err.message || "安全证书认证失败");
    } finally {
      setLoading(false);
    }
  };

  if (!pending) {
    return null;
  }

  const isAdmin = pending.mode === "admin";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#fee2e2,_#f8fafc_55%)] p-4">
      <Card className="w-full max-w-lg border-red-100 shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <div>
            <CardTitle className="text-2xl">首次登录安全证书认证</CardTitle>
            <CardDescription className="mt-2">
              {isAdmin ? "工作人员" : "投资者"}首次登录前，需要先完成一次安全证书认证。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div>认证对象：{pending.subjectKey}</div>
            <div>演示认证码：`CERT-123456`</div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">安全证书认证码</label>
            <input
              data-testid="certificate-code"
              type="password"
              value={certificateCode}
              onChange={(e) => setCertificateCode(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="请输入安全证书认证码"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                api.clearAllSessions();
                navigate("/login", { replace: true });
              }}
            >
              返回登录
            </Button>
            <Button
              data-testid="certificate-submit"
              className="flex-1 bg-red-600 text-white hover:bg-red-700"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "认证中..." : "完成认证"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
