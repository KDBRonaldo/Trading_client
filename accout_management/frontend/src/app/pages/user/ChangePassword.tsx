import { useState } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, Key, Lock } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api, ApiError } from "../../lib/api";

export default function ChangePassword() {
  const navigate = useNavigate();
  const [passwordType, setPasswordType] = useState<"trade" | "withdraw">("trade");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    if (!oldPassword || oldPassword.length !== 6) {
      setError("请输入 6 位原密码");
      return;
    }
    if (!newPassword || newPassword.length !== 6) {
      setError("新密码必须为 6 位数字");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    if (oldPassword === newPassword) {
      setError("新密码不能与旧密码相同");
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(oldPassword, newPassword, passwordType);
      setSuccess(`${passwordType === "trade" ? "交易" : "取款"}密码修改成功`);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 1018) {
        navigate("/login", { replace: true, state: { mode: "user" } });
        return;
      }
      setError(err.message || "密码修改失败，请检查原密码是否正确");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">修改密码</h2>
        <p className="text-slate-500">修改您的交易密码或取款密码</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-600" />
            密码修改
          </CardTitle>
          <CardDescription>请选择要修改的密码类型，并输入原密码和新密码</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>密码类型</Label>
            <div className="flex gap-4">
              <button
                onClick={() => setPasswordType("trade")}
                className={`flex-1 rounded-lg border-2 px-4 py-3 transition-all ${
                  passwordType === "trade"
                    ? "border-red-600 bg-red-50 text-red-700"
                    : "border-slate-200 hover:border-red-300"
                }`}
                type="button"
              >
                <div className="font-medium">交易密码</div>
                <div className="mt-1 text-xs text-slate-500">用于登录和交易</div>
              </button>
              <button
                onClick={() => setPasswordType("withdraw")}
                className={`flex-1 rounded-lg border-2 px-4 py-3 transition-all ${
                  passwordType === "withdraw"
                    ? "border-red-600 bg-red-50 text-red-700"
                    : "border-slate-200 hover:border-red-300"
                }`}
                type="button"
              >
                <div className="font-medium">取款密码</div>
                <div className="mt-1 text-xs text-slate-500">用于资金提取</div>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="oldPassword">原{passwordType === "trade" ? "交易" : "取款"}密码</Label>
            <div className="relative">
              <Input
                id="oldPassword"
                type={showOldPassword ? "text" : "password"}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="请输入 6 位原密码"
                maxLength={6}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowOldPassword(!showOldPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showOldPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">新{passwordType === "trade" ? "交易" : "取款"}密码</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入 6 位新密码"
                maxLength={6}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500">密码必须为 6 位数字</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">确认新密码</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="请再次输入新密码"
              maxLength={6}
            />
          </div>

          {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
          {success && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-600">{success}</div>
          )}

          <Button className="w-full bg-red-600 hover:bg-red-700" onClick={handleSubmit} disabled={loading}>
            {loading ? "修改中..." : "确认修改"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="pt-6">
          <h3 className="mb-2 flex items-center gap-2 font-medium text-slate-900">
            <Key className="h-4 w-4" />
            密码安全提示
          </h3>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
            <li>交易密码用于登录系统和进行证券交易</li>
            <li>取款密码用于从资金账户提取现金</li>
            <li>建议定期更换密码，避免使用简单数字组合</li>
            <li>请勿将密码告知他人</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
