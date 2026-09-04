import { getAuthToken } from "@/services/api";

/** Event names must match app/realtime.py on the backend. */
export const RealtimeEvent = {
  CONNECTED: "connected",
  ORDER_NEW: "order:new",
  ORDER_UPDATED: "order:updated",
  ORDER_READY: "order:ready",
  ORDER_CLOSED: "order:closed",
} as const;
export type RealtimeEvent = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export interface OrderEventPayload {
  orderId: string;
  orderNumber?: number;
  invoiceNumber?: string;
  tableId: string;
  tableNumber: string | number;
  waiterId: string;
  waiterName: string;
  orderStatus: string;
  itemCount: number;
  grandTotal: number;
  recipientUserId?: string;
  notificationId?: string;
  id?: string;
  title?: string;
  message?: string;
  isRead?: boolean;
  createdAt?: string;
}

export interface RealtimeMessage {
  event: string;
  payload: OrderEventPayload & { rooms?: string[] };
}

type Listener = (message: RealtimeMessage) => void;

const PING_INTERVAL_MS = 25_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

function socketUrl(token: string): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) return `${configured}?token=${encodeURIComponent(token)}`;

  // Same origin as the page, so the Vite dev proxy handles it in development.
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}

/**
 * One shared WebSocket + BroadcastChannel client for the whole app.
 *
 * BroadcastChannel provides zero-latency cross-tab synchronization even when
 * WebSocket is unavailable on serverless hosts like Vercel.
 */
class RealtimeClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private shouldReconnect = true;
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        this.broadcastChannel = new BroadcastChannel("hotel_realtime_events");
        this.broadcastChannel.onmessage = (event) => {
          if (event.data && typeof event.data === "object") {
            this.emit(event.data as RealtimeMessage);
          }
        };
      } catch {
        // BroadcastChannel optional fallback
      }
    }
  }

  broadcast(event: string, payload: Partial<OrderEventPayload>): void {
    const message: RealtimeMessage = {
      event,
      payload: payload as OrderEventPayload,
    };
    this.emit(message);
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch {
        // BroadcastChannel post error ignored
      }
    }
  }

  private emit(message: RealtimeMessage): void {
    this.listeners.forEach((listener) => {
      try {
        listener(message);
      } catch {
        // listener error ignored
      }
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.connect();

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.close();
    };
  }

  private connect(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;

    const token = getAuthToken();
    if (!token) return;

    this.shouldReconnect = true;
    try {
      const socket = new WebSocket(socketUrl(token));
      this.socket = socket;

      socket.onopen = () => {
        this.attempts = 0;
        this.emit({ event: RealtimeEvent.CONNECTED, payload: {} as any });
        this.pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send("ping");
        }, PING_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as RealtimeMessage;
          if (message.event === "pong") return;
          this.emit(message);
        } catch {
          // A malformed frame is not worth tearing the connection down for.
        }
      };

      socket.onclose = () => {
        this.clearTimers();
        this.socket = null;
        if (this.shouldReconnect && this.listeners.size > 0) this.scheduleReconnect();
      };

      socket.onerror = () => socket.close();
    } catch {
      // WebSocket connection error handled gracefully
    }
  }

  private scheduleReconnect(): void {
    this.attempts += 1;
    const delay = Math.min(1000 * 2 ** (this.attempts - 1), MAX_RECONNECT_DELAY_MS);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
  }

  close(): void {
    this.shouldReconnect = false;
    this.clearTimers();
    this.socket?.close();
    this.socket = null;
    this.attempts = 0;
  }
}

export const realtime = new RealtimeClient();
