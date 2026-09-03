import { createContext } from "react";
import type { Notification, Order } from "@/types";

export interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  readyOrders: Order[];
  readyOrdersCount: number;
  unreadReadyCount: number;
  closeOrders: Order[];
  closeOrdersCount: number;
  isSoundEnabled: boolean;
  toggleSound: () => void;
  isBellPulsing: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshReadyOrders: () => Promise<void>;
  refreshCloseOrders: () => Promise<void>;
  deliverOrder: (orderId: string) => Promise<void>;
  settleAndCloseOrder: (orderId: string) => Promise<void>;
  markReadyOrdersViewed: () => void;
}

export const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

