import { useContext } from "react";

import { ToastContext } from "@/context/toast-context";
import type { ToastContextValue } from "@/context/toast-context";

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used inside a <ToastProvider>");
  }
  return context;
}
