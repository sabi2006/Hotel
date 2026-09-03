import { Navigate, Outlet, useLocation } from "react-router-dom";

import { FullScreenLoader } from "@/components/Spinner";
import { HOME_ROUTE_BY_ROLE } from "@/context/auth-context";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types";

/**
 * Frontend guard: keeps users out of panels that are not theirs.
 * The backend enforces the same rules independently - this is only UX.
 */
export function ProtectedRoute({ allowedRoles }: { allowedRoles?: UserRole[] }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullScreenLoader label="Checking your session" />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={HOME_ROUTE_BY_ROLE[user.role]} replace />;
  }

  return <Outlet />;
}

/** Sends an already-logged-in user straight to their own panel. */
export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenLoader label="Checking your session" />;
  }
  if (user) {
    return <Navigate to={HOME_ROUTE_BY_ROLE[user.role]} replace />;
  }
  return <Outlet />;
}
