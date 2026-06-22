import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { Bell, Briefcase, Key, LayoutDashboard, LogOut, Menu, Settings, Wallet } from "lucide-react";
import { api } from "../lib/api";

export function UserLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fundAccNo, setFundAccNo] = useState("");
  const [secAccNo, setSecAccNo] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    setFundAccNo(api.getCurrentFundAccountNo());
    setSecAccNo(api.getCurrentSecurityAccountNo());
  }, []);

  const displayName = useMemo(() => fundAccNo || "投资者", [fundAccNo]);

  const handleLogout = () => {
    api.clearClientSession();
    navigate("/login", { replace: true, state: { mode: "user" } });
  };

  const handleSwitchToAdmin = () => {
    api.clearClientSession();
    navigate("/login", { replace: true, state: { mode: "admin" } });
  };

  const navigation = [
    { name: "我的账户", href: "/user", icon: LayoutDashboard, end: true },
    { name: "银证转账", href: "/user/transfer", icon: Wallet },
    { name: "修改密码", href: "/user/password", icon: Key },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <div
        className={`flex flex-shrink-0 flex-col bg-red-900 text-red-100 transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        <div className="flex h-16 items-center justify-center border-b border-red-800">
          <div className="flex items-center gap-2 text-xl font-bold text-white">
            <Briefcase className="text-white" />
            {sidebarOpen && <span>账户服务</span>}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {navigation.map((item) => (
              <li key={item.name}>
                <NavLink
                  to={item.href}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors ${
                      isActive
                        ? "bg-white/20 font-medium text-white"
                        : "hover:bg-red-800 hover:text-white"
                    }`
                  }
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {sidebarOpen && <span>{item.name}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-red-800 p-4">
          <button
            onClick={handleSwitchToAdmin}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-red-200 transition-colors hover:bg-red-800 hover:text-white"
          >
            <LayoutDashboard className="h-5 w-5 flex-shrink-0" />
            {sidebarOpen && <span>返回管理端</span>}
          </button>
          <button className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-red-200 transition-colors hover:bg-red-800 hover:text-white">
            <Settings className="h-5 w-5 flex-shrink-0" />
            {sidebarOpen && <span>系统设置</span>}
          </button>
          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-red-200 transition-colors hover:bg-red-800 hover:text-white"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {sidebarOpen && <span>安全退出</span>}
          </button>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-500 transition-colors hover:text-red-600"
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex items-center gap-4">
            <div className="hidden items-center rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 sm:flex">
              <span className="mr-2 h-2 w-2 rounded-full bg-green-500" />
              账户服务
            </div>
            <button className="relative text-slate-500 transition-colors hover:text-red-600">
              <Bell className="h-5 w-5" />
              <span className="absolute right-0 top-0 h-2 w-2 rounded-full border-2 border-white bg-red-500" />
            </button>
            <NavLink to="/user/password" className="flex items-center gap-2 text-slate-500 transition-colors hover:text-red-600">
              <Key className="h-5 w-5" />
            </NavLink>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 font-bold text-red-700">
              {displayName.charAt(0)}
            </div>
            <div className="hidden text-sm font-medium text-slate-700 sm:block">
              {displayName}
              {secAccNo ? ` / ${secAccNo}` : ""}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
