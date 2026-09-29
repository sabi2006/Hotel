import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FoodTypeDot } from "@/components/FoodTypeDot";
import { BellIcon, CheckCircleIcon, ChefHatIcon, FlameIcon, InboxIcon, RefreshCwIcon, Volume2Icon, VolumeXIcon } from "@/components/Icons";
import { Select } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { usePolling } from "@/hooks/usePolling";
import { useRealtime } from "@/hooks/useRealtime";
import { useRipple } from "@/hooks/useRipple";
import { useToast } from "@/hooks/useToast";
import { getErrorMessage } from "@/services/api";
import { kitchenService } from "@/services/kitchen";
import type { KitchenBoard } from "@/services/kitchen";
import { RealtimeEvent } from "@/services/realtime";
import { CANCELLATION_REASON_LABELS } from "@/types";
import type { CancellationReason, Order, OrderItem } from "@/types";
import { soundManager } from "@/utils/sound";

const EMPTY_BOARD: KitchenBoard = { new: [], preparing: [], ready: [], completed: [] };

const COLUMNS = [
  { key: "new" as const, title: "New Orders", badgeBg: "bg-info", accent: "border-t-info", icon: <InboxIcon size={16} /> },
  { key: "preparing" as const, title: "In Preparation", badgeBg: "bg-warning", accent: "border-t-warning", icon: <FlameIcon size={16} /> },
  { key: "ready" as const, title: "Ready for Pickup", badgeBg: "bg-success", accent: "border-t-success", icon: <BellIcon size={16} /> },
  { key: "completed" as const, title: "Served & Done", badgeBg: "bg-subtle", accent: "border-t-subtle", icon: <CheckCircleIcon size={16} /> },
];

const ITEM_STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-surface-soft text-muted ring-1 ring-line",
  PREPARING: "bg-warning-soft text-warning ring-1 ring-warning-line",
  READY: "bg-success-soft text-success ring-1 ring-success-line font-bold",
  SERVED: "bg-surface-soft text-brand-700 ring-1 ring-warning-line",
  CANCELLED: "bg-danger-soft text-danger line-through ring-1 ring-danger-line",
};

/** How long the ticket has been with the kitchen. */
function elapsedSince(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just arrived";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

export default function KitchenDashboard() {
  const toast = useToast();
  const [board, setBoard] = useState<KitchenBoard>(EMPTY_BOARD);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [flashOrderId, setFlashOrderId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => soundManager.isSoundEnabled());
  const [, setTick] = useState(0);

  const [cancelTarget, setCancelTarget] = useState<{ order: Order; item: OrderItem } | null>(null);
  const [cancelReason, setCancelReason] = useState<CancellationReason>("OUT_OF_STOCK");
  const [isCancelling, setIsCancelling] = useState(false);
  const [activeColumnFilter, setActiveColumnFilter] = useState<"ALL" | "new" | "preparing" | "ready" | "completed">("ALL");

  const knownNewOrderIdsRef = useRef<Set<string> | null>(null);

  const spawnRipple = useRipple();

  const toggleSound = () => {
    const next = !isSoundEnabled;
    soundManager.setSoundEnabled(next);
    setIsSoundEnabled(next);
    if (next) {
      soundManager.testKitchenSound();
    }
  };

  const load = useCallback(async () => {
    try {
      const data = await kitchenService.board();
      setBoard(data);
      setError(null);
      setIsLive(true);

      const currentNewIds = new Set((data.new ?? []).map((o) => o._id));
      if (knownNewOrderIdsRef.current !== null) {
        // Find any newly arrived orders
        const freshOrders = (data.new ?? []).filter((o) => !knownNewOrderIdsRef.current!.has(o._id));
        if (freshOrders.length > 0) {
          const first = freshOrders[0];
          setFlashOrderId(first._id);
          void soundManager.playNewOrderChime(first._id);
          toast.push({
            tone: "info",
            title: `New Order · Table ${first.tableNumber}`,
            description: `Order #${first.orderNumber || first.invoiceNumber || ""} from ${first.waiterName || "Waiter"} (${first.items?.length || 0} items)`,
            duration: 7000,
          });
          setTimeout(() => setFlashOrderId(null), 6000);
        }
      }
      knownNewOrderIdsRef.current = currentNewIds;
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load the kitchen board"));
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
    soundManager.unlockAudio();
    setIsLive(true);
  }, [load]);

  // Safety-net poll for hosts where the WebSocket cannot stay open. It pauses
  // while the tab is hidden and refreshes as soon as the screen is back.
  usePolling(() => void load(), 4000);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  useRealtime((message) => {
    if (message.event === RealtimeEvent.CONNECTED) {
      setIsLive(true);
      return;
    }

    if (message.event === RealtimeEvent.ORDER_NEW) {
      const payload = message.payload;
      setFlashOrderId(payload.orderId);
      
      // Play 3-tone loud kitchen attention chime
      void soundManager.playNewOrderChime(payload.orderId);

      // Show toast
      toast.push({
        tone: "info",
        title: `New Order · Table ${payload.tableNumber}`,
        description: `Order #${payload.orderNumber || payload.invoiceNumber || ""} from ${payload.waiterName || "Waiter"} (${payload.itemCount || 0} items)`,
        duration: 7000,
      });

      setTimeout(() => setFlashOrderId(null), 6000);
    }

    // Every order event changes the board, so refetch the authoritative view immediately.
    void load();
  });

  async function runAction(orderId: string, action: () => Promise<unknown>) {
    setBusyOrderId(orderId);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "That did not work"));
      await load();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleCancelItem() {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      await kitchenService.cancelItem(
        cancelTarget.order._id,
        cancelTarget.item.itemId,
        cancelReason,
      );
      setCancelTarget(null);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not cancel that item"));
      setCancelTarget(null);
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="space-y-5 select-none">
      {/* Header */}
      <header className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5 shadow-xs bg-white border border-line">
        <div>
          <div className="flex items-center gap-2">
            <ChefHatIcon size={24} className="text-brand-700" />
            <h1 className="text-2xl font-extrabold tracking-tight text-ink font-sans">
              Kitchen Display System (KDS)
            </h1>
          </div>
          <p className="mt-0.5 text-xs font-medium text-muted">
            Real-time ticket arrival · Touch-friendly action cards
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleSound}
            title={isSoundEnabled ? "Sound is ON" : "Sound is MUTED"}
            className={[
              "pressable flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ring-1",
              isSoundEnabled
                ? "bg-success-soft text-success ring-success-line hover:bg-success-line"
                : "bg-surface-soft text-subtle ring-line hover:bg-brand-100",
            ].join(" ")}
          >
            {isSoundEnabled ? <Volume2Icon size={16} /> : <VolumeXIcon size={16} />}
            <span>{isSoundEnabled ? "Sound ON" : "Muted"}</span>
          </button>

          <button
            type="button"
            onClick={() => soundManager.testKitchenSound()}
            title="Test notification sound chime"
            className="pressable rounded-xl bg-warning-soft px-3.5 py-2 text-xs font-bold text-warning ring-1 ring-warning-line hover:bg-warning-soft transition"
          >
            Test Chime
          </button>

          <span
            className={[
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ring-1",
              isLive ? "bg-success-soft text-success ring-success-line" : "bg-surface-soft text-muted ring-line",
            ].join(" ")}
          >
            <span
              className={`size-2 rounded-full ${isLive ? " bg-success" : "bg-subtle"}`}
            />
            {isLive ? "Live Kitchen" : "Connecting"}
          </span>

          <Button variant="secondary" size="sm" onClick={() => void load()} className="gap-1.5">
            <RefreshCwIcon size={14} />
            <span>Refresh</span>
          </Button>
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      {/* Mobile / Tablet Column Switcher Tabs */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 no-scrollbar lg:hidden select-none">
        <button
          type="button"
          onClick={() => setActiveColumnFilter("ALL")}
          className={[
            "pressable flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition",
            activeColumnFilter === "ALL"
              ? "bg-ink text-white shadow-sm"
              : "bg-white text-muted ring-1 ring-line hover:bg-surface-soft hover:text-ink",
          ].join(" ")}
        >
          <span>All Stages</span>
          <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-extrabold">
            {board.new.length + board.preparing.length + board.ready.length + board.completed.length}
          </span>
        </button>

        {COLUMNS.map((column) => {
          const count = board[column.key].length;
          return (
            <button
              key={column.key}
              type="button"
              onClick={() => setActiveColumnFilter(column.key)}
              className={[
                "pressable flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition",
                activeColumnFilter === column.key
                  ? "bg-ink text-white shadow-sm"
                  : "bg-white text-muted ring-1 ring-line hover:bg-surface-soft hover:text-ink",
              ].join(" ")}
            >
              <span className="flex items-center gap-1.5">{column.icon} {column.title}</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold text-white ${column.badgeBg}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <Spinner label="Loading tickets" />
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 items-start">
          {COLUMNS.filter(
            (column) => activeColumnFilter === "ALL" || activeColumnFilter === column.key,
          ).map((column) => {
            const orders = board[column.key];
            return (
              <section
                key={column.key}
                className={`card flex flex-col border-t-4 p-4 shadow-sm min-h-[400px] lg:min-h-[calc(100dvh-240px)] lg:max-h-[calc(100dvh-240px)] bg-white border border-line ${column.accent}`}
              >
                <div className="mb-4 flex items-center justify-between border-b border-surface-sunken pb-2.5">
                  <div className="flex items-center gap-2">
                    <span>{column.icon}</span>
                    <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink-soft font-sans">
                      {column.title}
                    </h2>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold text-white ${column.badgeBg}`}>
                    {orders.length}
                  </span>
                </div>

                {orders.length === 0 ? (
                  <div className="py-12">
                    <EmptyState
                      title="No tickets"
                      description={`No orders in ${column.title.toLowerCase()} state.`}
                      icon={<span>{column.icon}</span>}
                    />
                  </div>
                ) : (
                  <div className="stagger space-y-3.5 flex-1 overflow-y-auto custom-scrollbar pr-0.5">
                    {orders.map((order, index) => (
                      <Ticket
                        key={order._id}
                        index={index}
                        onRipple={spawnRipple}
                        order={order}
                        column={column.key}
                        isBusy={busyOrderId === order._id}
                        isFlashing={flashOrderId === order._id}
                        onAccept={() =>
                          void runAction(order._id, () => kitchenService.accept(order._id))
                        }
                        onReady={() =>
                          void runAction(order._id, () => kitchenService.markReady(order._id))
                        }
                        onItemReady={(item) =>
                          void runAction(order._id, () =>
                            kitchenService.setItemStatus(order._id, item.itemId, "READY"),
                          )
                        }
                        onCancelItem={(item) => {
                          setCancelReason("OUT_OF_STOCK");
                          setCancelTarget({ order, item });
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Cancel Item Modal */}
      <Modal
        isOpen={cancelTarget !== null}
        title="Kitchen Item Cancellation"
        onClose={() => setCancelTarget(null)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCancelTarget(null)}
              disabled={isCancelling}
            >
              Keep Item
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleCancelItem()}
              isLoading={isCancelling}
            >
              Confirm Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            Cancel <strong>{cancelTarget?.item.name}</strong> from Table{" "}
            {cancelTarget?.order.tableNumber}? The bill will be adjusted automatically.
          </p>
          <Select
            label="Cancellation Reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value as CancellationReason)}
          >
            {Object.entries(CANCELLATION_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </Modal>
    </div>
  );
}

function Ticket({
  order,
  column,
  index,
  isBusy,
  isFlashing,
  onRipple,
  onAccept,
  onReady,
  onItemReady,
  onCancelItem,
}: {
  order: Order;
  column: "new" | "preparing" | "ready" | "completed";
  index: number;
  isBusy: boolean;
  isFlashing: boolean;
  onRipple: (event: ReactPointerEvent<HTMLElement>) => void;
  onAccept: () => void;
  onReady: () => void;
  onItemReady: (item: OrderItem) => void;
  onCancelItem: (item: OrderItem) => void;
}) {
  const sentItems = order.items.filter((item) => item.sentToKitchenAt !== null);

  return (
    <article
      style={{ "--stagger-index": index } as CSSProperties}
      className={[
        "rounded-xl p-4 ring-1 transition-all duration-200 select-none",
        isFlashing
          ? " bg-warning-soft ring-2 ring-warning shadow-lg"
          : "bg-surface-soft ring-line shadow-2xs hover:bg-white hover:shadow-sm",
      ].join(" ")}
    >
      <header className="flex items-start justify-between gap-2 border-b border-line pb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-ink text-white font-extrabold text-xs">
              T{order.tableNumber}
            </span>
            <p className="text-base font-extrabold text-ink font-sans">
              Table {order.tableNumber}
            </p>
          </div>
          <p className="text-xs text-subtle font-medium mt-1">
            #{order.orderNumber || ""} · Waiter: <span className="font-bold text-ink">{order.waiterName}</span>
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-bold text-muted bg-white px-2 py-0.5 rounded-md ring-1 ring-line">
          {elapsedSince(order.sentToKitchenAt)}
        </span>
      </header>

      <ul className="mt-3 space-y-2">
        {sentItems.map((item) => (
          <li key={item.itemId} className="flex items-start gap-2 bg-white p-2.5 rounded-xl ring-1 ring-line shadow-2xs">
            <FoodTypeDot foodType={item.foodType} />
            <div className="min-w-0 flex-1">
              <p
                className={`text-xs font-bold leading-tight ${
                  item.kitchenStatus === "CANCELLED"
                    ? "text-subtle line-through"
                    : "text-ink"
                }`}
              >
                {item.name} <span className="text-brand-700 font-extrabold">× {item.quantity}</span>
              </p>
              {item.notes && <p className="text-[11px] italic text-warning font-medium mt-0.5">Note: {item.notes}</p>}
              <span
                className={`mt-1 inline-flex rounded-full px-2 py-0.2 text-[10px] font-bold ${
                  ITEM_STATUS_CLASSES[item.kitchenStatus]
                }`}
              >
                {item.kitchenStatus}
              </span>
            </div>

            {column !== "completed" && item.kitchenStatus === "PREPARING" && (
              <button
                type="button"
                onPointerDown={onRipple}
                onClick={() => onItemReady(item)}
                disabled={isBusy}
                title="Mark just this item ready"
                className="ripple-host pressable shrink-0 rounded-lg bg-success-soft px-2.5 py-1 text-xs font-bold text-success hover:bg-success-line disabled:opacity-50 ring-1 ring-success-line"
              >
                Ready
              </button>
            )}
            {column === "new" && item.kitchenStatus === "PENDING" && (
              <button
                type="button"
                onClick={() => onCancelItem(item)}
                disabled={isBusy}
                title="Cannot cook this item"
                className="pressable shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-danger hover:bg-danger-soft disabled:opacity-50"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {column === "new" && (
        <Button fullWidth size="lg" className="mt-3.5" onClick={onAccept} isLoading={isBusy}>
          Accept Order
        </Button>
      )}
      {column === "preparing" && (
        <Button
          fullWidth
          size="lg"
          className="mt-3.5"
          onClick={onReady}
          isLoading={isBusy}
          variant="primary"
        >
          Mark All Ready
        </Button>
      )}
      {column === "ready" && (
        <div className="mt-3.5 rounded-xl bg-success-soft py-2.5 text-center text-xs font-bold text-success ring-1 ring-success-line">
          Assigned Waiter Notified
        </div>
      )}
    </article>
  );
}
