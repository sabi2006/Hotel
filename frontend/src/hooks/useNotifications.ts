import { useContext } from "react";

import { NotificationContext } from "@/context/notification-context";
import type { NotificationContextValue } from "@/context/notification-context";

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used inside a <NotificationProvider>");
  }
  return context;
}
