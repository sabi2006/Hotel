import { createContext } from "react";

import type { LoginPayload, RegisterPayload, User, UserRole } from "@/types";

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Landing route for each role, used after login and by the route guards. */
export const HOME_ROUTE_BY_ROLE: Record<UserRole, string> = {
  ADMIN: "/admin",
  WAITER: "/waiter",
  KITCHEN: "/kitchen",
};
