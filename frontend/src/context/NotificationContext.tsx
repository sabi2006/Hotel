import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { NotificationContext } from "@/context/notification-context";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { paymentsService } from "@/services/billing";
import { notificationsService } from "@/services/notifications";
import { ordersService } from "@/services/orders";
import { RealtimeEvent, realtime } from "@/services/realtime";
import type { Notification, Order } from "@/types";
import { soundManager } from "@/utils/sound";

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readyOrders, setReadyOrders] = useState<Order[]>([]);
  const [closeOrders, setCloseOrders] = useState<Order[]>([]);
  const [unreadReadyOrderIds, setUnreadReadyOrderIds] = useState<Set<string>>(new Set());
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => soundManager.isSoundEnabled());
  const [isBellPulsing, setIsBellPulsing] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      const data = await notificationsService.list(50);
      setNotifications(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // Gracefully handle failure
    }
  }, [user]);

  const loadReadyOrders = useCallback(async () => {
    if (!user || user.role !== "WAITER") {
      setReadyOrders([]);
      return;
    }
    try {
      const res = await ordersService.list({ openOnly: true, pageSize: 200 });
      // Filter for READY orders assigned to this logged-in waiter
      const filtered = res.items.filter(
        (order) => order.orderStatus === "READY" && (!user._id || order.waiterId === user._id),
      );
      setReadyOrders(filtered);
    } catch {
      // Gracefully handle failure
    }
  }, [user]);

  const loadCloseOrders = useCallback(async () => {
    if (!user || user.role !== "WAITER") {
      setCloseOrders([]);
      return;
    }
    try {
      const res = await ordersService.list({ openOnly: true, pageSize: 200 });
      // Filter for SERVED, PAYMENT_PENDING, or PAID orders assigned to this logged-in waiter
      const filtered = res.items.filter((order) => {
        const isMine = !user._id || order.waiterId === user._id;
        const isClosePending =
          order.orderStatus === "SERVED" ||
          order.orderStatus === "PAYMENT_PENDING" ||
          order.orderStatus === "PAID";
        return isMine && isClosePending;
      });
      setCloseOrders(filtered);
    } catch {
      // Gracefully handle failure
    }
  }, [user]);

  useEffect(() => {
    void loadNotifications();
    if (user?.role === "WAITER") {
      void loadReadyOrders();
      void loadCloseOrders();
    }

    const interval = setInterval(() => {
      void loadNotifications();
      if (user?.role === "WAITER") {
        void loadReadyOrders();
        void loadCloseOrders();
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [loadNotifications, loadReadyOrders, loadCloseOrders, user?.role]);

  useEffect(() => {
    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, []);

  const triggerBellPulse = useCallback(() => {
    setIsBellPulsing(true);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => {
      setIsBellPulsing(false);
    }, 2500);
  }, []);

  const toggleSound = useCallback(() => {
    const next = !isSoundEnabled;
    soundManager.setSoundEnabled(next);
    setIsSoundEnabled(next);
  }, [isSoundEnabled]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await notificationsService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Silently catch
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationsService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Silently catch
    }
  }, []);

  const markReadyOrdersViewed = useCallback(() => {
    setUnreadReadyOrderIds(new Set());
  }, []);

  const deliverOrder = useCallback(
    async (orderId: string) => {
      try {
        await ordersService.serve(orderId);
        // Instantly remove from local ready orders list
        setReadyOrders((prev) => prev.filter((o) => o._id !== orderId));
        setUnreadReadyOrderIds((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
        toast.push({
          tone: "success",
          title: "Order Delivered",
          description: "Food delivered to table. Moved to Close Order queue.",
          duration: 3500,
        });
        void loadNotifications();
        void loadReadyOrders();
        void loadCloseOrders();
      } catch (caught) {
        toast.push({
          tone: "error",
          title: "Could not deliver order",
          description: "Failed to mark order as served. Please try again.",
          duration: 4000,
        });
        throw caught;
      }
    },
    [toast, loadNotifications, loadReadyOrders, loadCloseOrders],
  );

  const settleAndCloseOrder = useCallback(
    async (orderId: string) => {
      try {
        await paymentsService.closeOrder(orderId);
        setCloseOrders((prev) => prev.filter((o) => o._id !== orderId));
        toast.push({
          tone: "success",
          title: "Order Closed",
          description: "Order completed and table is now free.",
          duration: 4000,
        });
        void loadNotifications();
        void loadCloseOrders();
      } catch (caught) {
        toast.push({
          tone: "error",
          title: "Could not close order",
          description: "Failed to close order. Ensure full payment is collected.",
          duration: 4000,
        });
        throw caught;
      }
    },
    [toast, loadNotifications, loadCloseOrders],
  );

  // Listen for real-time WebSocket events
  useEffect(() => {
    if (!user) return;

    const unsubscribe = realtime.subscribe((message) => {
      // 1. ORDER_READY Event (Strictly targeted for this assigned waiter)
      if (message.event === RealtimeEvent.ORDER_READY) {
        const payload = message.payload as unknown as Record<string, unknown>;
        const targetUserId = (payload.recipientUserId || payload.waiterId) as string | undefined;

        // Check if this notification is intended for the current assigned waiter ONLY
        const isForMe = (targetUserId === user._id || !targetUserId) && user.role === "WAITER";
        if (isForMe) {
          const orderId = String(payload.orderId || "");
          const invoiceNumber = (payload.invoiceNumber as string) || "";
          const orderNumber = payload.orderNumber as number | undefined;
          const tableNumber = (payload.tableNumber as string | number) || "";
          const customMessage = (payload.message as string) || "";

          // Play audio notification chime
          soundManager.playOrderReadyChime(orderId);

          // Bell pulse animation
          triggerBellPulse();

          // Show Toast notification
          const orderIdentifier = invoiceNumber || (orderNumber ? `#${orderNumber}` : "");
          toast.push({
            tone: "success",
            title: "🔔 Order Ready to Serve",
            description: customMessage || `Table ${tableNumber} · ${orderIdentifier} is ready!`,
            duration: 6000,
          });

          // Track unread ready order
          if (orderId) {
            setUnreadReadyOrderIds((prev) => new Set(prev).add(orderId));
          }

          // Add new notification item to state
          const newNotif: Notification = {
            _id: (payload.notificationId as string) || (payload.id as string) || `temp-${Date.now()}`,
            recipientUserId: targetUserId || user._id,
            type: (payload.type as string) || "ORDER_READY",
            orderId,
            orderNumber: orderNumber ?? null,
            invoiceNumber: invoiceNumber || null,
            tableId: String(payload.tableId || ""),
            tableNumber,
            title: (payload.title as string) || "Order Ready",
            message: customMessage || `Order ${orderIdentifier} for Table ${tableNumber} is ready to serve`,
            isRead: false,
            createdAt: (payload.createdAt as string) || new Date().toISOString(),
          };

          setNotifications((prev) => {
            // Deduplicate if already exists
            if (prev.some((n) => n._id === newNotif._id || (n.orderId === newNotif.orderId && !n.isRead))) {
              return prev;
            }
            return [newNotif, ...prev].slice(0, 100);
          });
          setUnreadCount((prev) => prev + 1);

          // Reload fresh ready orders list from backend
          void loadReadyOrders();
        }
      }

      // 2. ORDER_UPDATED or ORDER_CLOSED Event (Sync ready orders & close orders)
      if (
        user.role === "WAITER" &&
        (message.event === RealtimeEvent.ORDER_UPDATED || message.event === RealtimeEvent.ORDER_CLOSED)
      ) {
        void loadReadyOrders();
        void loadCloseOrders();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user, toast, triggerBellPulse, loadReadyOrders, loadCloseOrders]);

  const readyOrdersCount = readyOrders.length;
  const unreadReadyCount = unreadReadyOrderIds.size;
  const closeOrdersCount = closeOrders.length;

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      readyOrders,
      readyOrdersCount,
      unreadReadyCount,
      closeOrders,
      closeOrdersCount,
      isSoundEnabled,
      toggleSound,
      isBellPulsing,
      markAsRead,
      markAllAsRead,
      refreshNotifications: loadNotifications,
      refreshReadyOrders: loadReadyOrders,
      refreshCloseOrders: loadCloseOrders,
      deliverOrder,
      settleAndCloseOrder,
      markReadyOrdersViewed,
    }),
    [
      notifications,
      unreadCount,
      readyOrders,
      readyOrdersCount,
      unreadReadyCount,
      closeOrders,
      closeOrdersCount,
      isSoundEnabled,
      toggleSound,
      isBellPulsing,
      markAsRead,
      markAllAsRead,
      loadNotifications,
      loadReadyOrders,
      loadCloseOrders,
      deliverOrder,
      settleAndCloseOrder,
      markReadyOrdersViewed,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}


