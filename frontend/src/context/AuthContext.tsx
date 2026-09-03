import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { AuthContext } from "@/context/auth-context";
import type { AuthContextValue } from "@/context/auth-context";
import { getAuthToken, removeAuthToken, setAuthToken, UNAUTHORIZED_EVENT } from "@/services/api";
import { authService } from "@/services/auth";
import type { LoginPayload, RegisterPayload, User, UserRole } from "@/types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    removeAuthToken();
    setUser(null);
  }, []);

  // Restore the session on a hard refresh by validating the stored token.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!getAuthToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await authService.me();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  // An expired token anywhere in the app drops us back to the login screen.
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, clearSession);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, clearSession);
  }, [clearSession]);

  const login = useCallback(async (payload: LoginPayload) => {
    const response = await authService.login(payload);
    setAuthToken(response.accessToken);
    setUser(response.user);
    return response.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const response = await authService.register(payload);
    setAuthToken(response.accessToken);
    setUser(response.user);
    return response.user;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout: clearSession,
      hasRole: (...roles: UserRole[]) => (user ? roles.includes(user.role) : false),
    }),
    [user, isLoading, login, register, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
