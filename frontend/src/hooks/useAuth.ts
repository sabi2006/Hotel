import { useContext } from "react";

import { AuthContext } from "@/context/auth-context";
import type { AuthContextValue } from "@/context/auth-context";

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used inside an <AuthProvider>");
  }
  return context;
}
