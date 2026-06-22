import { Navigate, Outlet, useLocation } from "react-router";
import { api } from "../lib/api";

type RequireAuthProps = {
  mode: "admin" | "user";
};

export function RequireAuth({ mode }: RequireAuthProps) {
  const location = useLocation();
  const isAllowed = mode === "admin" ? api.isStaffLoggedIn() : api.isClientLoggedIn();

  if (!isAllowed) {
    return <Navigate to="/login" replace state={{ from: location.pathname, mode }} />;
  }

  return <Outlet />;
}
