import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FoodTypeDot } from "@/components/FoodTypeDot";
import { ChefHatIcon, RefreshCwIcon, Volume2Icon, VolumeXIcon } from "@/components/Icons";
import { Select } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
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
  { key: "new" as const, title: "New Orders", badgeBg: "bg-[#4A6B82]", accent: "border-t-[#4A6B82]", icon: "📥" },
  { key: "preparing" as const, title: "In Preparation", badgeBg: "bg-[#C58A3A]", accent: "border-t-[#C58A3A]", icon: "🍳" },
  { key: "ready" as const, title: "Ready for Pickup", badgeBg: "bg-[#276B49]", accent: "border-t-[#276B49]", icon: "🔔" },
  { key: "completed" as const, title: "Served & Done", badgeBg: "bg-[#8E908C]", accent: "border-t-[#8E908C]", icon: "✅" },
];

const ITEM_STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-[#FAF8F5] text-[#5F615D] ring-1 ring-[#E8E3D8]",
  PREPARING: "bg-[#FEF7EE] text-[#9E6523] ring-1 ring-[#FADFB8]",
  READY: "bg-[#EBF5EE] text-[#276B49] ring-1 ring-[#BCE2CD] font-bold",
  SERVED: "bg-[#FAF6EE] text-[#805C2B] ring-1 ring-[#E8DCB8]",
  CANCELLED: "bg-[#FDF2F1] text-[#C24138] line-through ring-1 ring-[#F7C6C3]",
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
      setBoard(await kitchenService.board());
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load the kitchen board"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
    soundManager.unlockAudio();
  }, [load]);

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
        title: `🔔 New Order · Table ${payload.tableNumber}`,
        description: `Order #${payload.orderNumber || payload.invoiceNumber || ""} from ${payload.waiterName || "Waiter"} (${payload.itemCount || 0} items)`,
        duration: 7000,
      });

      setTimeout(() => setFlashOrderId(null), 6000);
    }

    // Every order event changes the board, so refetch the authoritative view.
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
      <header className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5 shadow-xs bg-white border border-[#EBE7DF]">
        <div>
          <div className="flex items-center gap-2">
            <ChefHatIcon size={24} className="text-brand-700" />
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1F2220] font-sans">
              Kitchen Display System (KDS)
            </h1>
          </div>
          <p className="mt-0.5 text-xs font-medium text-[#6F716D]">
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
                ? "bg-[#EBF5EE] text-[#276B49] ring-[#BCE2CD] hover:bg-[#D4EBDC]"
                : "bg-[#FAF8F5] text-[#8E908C] ring-[#E8E3D8] hover:bg-[#F3ECE0]",
            ].join(" ")}
          >
            {isSoundEnabled ? <Volume2Icon size={16} /> : <VolumeXIcon size={16} />}
            <span>{isSoundEnabled ? "Sound ON" : "Muted"}</span>
          </button>

          <button
            type="button"
            onClick={() => soundManager.testKitchenSound()}
            title="Test notification sound chime"
            className="pressable rounded-xl bg-[#FEF7EE] px-3.5 py-2 text-xs font-bold text-[#9E6523] ring-1 ring-[#FADFB8] hover:bg-[#FDEED9] transition"
          >
            🔔 Test Chime
          </button>

          <span
            className={[
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ring-1",
              isLive ? "bg-[#EBF5EE] text-[#276B49] ring-[#BCE2CD]" : "bg-[#FAF8F5] text-[#5F615D] ring-[#E8E3D8]",
            ].join(" ")}
          >
            <span
              className={`size-2 rounded-full ${isLive ? "animate-pulse bg-[#276B49]" : "bg-[#8E908C]"}`}
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
              ? "bg-[#202322] text-white shadow-md shadow-charcoal-950/20"
              : "bg-white text-[#5F615D] ring-1 ring-[#E8E3D8] hover:bg-[#FAF8F3] hover:text-[#1F2220]",
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
                  ? "bg-[#202322] text-white shadow-md shadow-charcoal-950/20"
                  : "bg-white text-[#5F615D] ring-1 ring-[#E8E3D8] hover:bg-[#FAF8F3] hover:text-[#1F2220]",
              ].join(" ")}
            >
              <span>{column.icon} {column.title}</span>
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
                className={`card flex flex-col border-t-4 p-4 shadow-sm min-h-[400px] lg:min-h-[calc(100dvh-240px)] lg:max-h-[calc(100dvh-240px)] bg-white border border-[#EBE7DF] ${column.accent}`}
              >
                <div className="mb-4 flex items-center justify-between border-b border-[#F0EBE1] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span>{column.icon}</span>
                    <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#424541] font-sans">
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
          <p className="text-xs text-[#5F615D] leading-relaxed">
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
        "rounded-2xl p-4 ring-1 transition-all duration-200 select-none",
        isFlashing
          ? "animate-attention bg-[#FEF7EE] ring-2 ring-[#C58A3A] shadow-lg"
          : "bg-[#FAF8F5] ring-[#E8E3D8] shadow-2xs hover:bg-white hover:shadow-md",
      ].join(" ")}
    >
      <header className="flex items-start justify-between gap-2 border-b border-[#E8E3D8] pb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[#202322] text-white font-extrabold text-xs">
              T{order.tableNumber}
            </span>
            <p className="text-base font-extrabold text-[#1F2220] font-sans">
              Table {order.tableNumber}
            </p>
          </div>
          <p className="text-xs text-[#8E908C] font-medium mt-1">
            #{order.orderNumber || ""} · Waiter: <span className="font-bold text-[#1F2220]">{order.waiterName}</span>
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-bold text-[#5F615D] bg-white px-2 py-0.5 rounded-md ring-1 ring-[#E8E3D8]">
          {elapsedSince(order.sentToKitchenAt)}
        </span>
      </header>

      <ul className="mt-3 space-y-2">
        {sentItems.map((item) => (
          <li key={item.itemId} className="flex items-start gap-2 bg-white p-2.5 rounded-xl ring-1 ring-[#E8E3D8] shadow-2xs">
            <FoodTypeDot foodType={item.foodType} />
            <div className="min-w-0 flex-1">
              <p
                className={`text-xs font-bold leading-tight ${
                  item.kitchenStatus === "CANCELLED"
                    ? "text-[#8E908C] line-through"
                    : "text-[#1F2220]"
                }`}
              >
                {item.name} <span className="text-brand-700 font-extrabold">× {item.quantity}</span>
              </p>
              {item.notes && <p className="text-[11px] italic text-[#9E6523] font-medium mt-0.5">Note: {item.notes}</p>}
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
                className="ripple-host pressable shrink-0 rounded-lg bg-[#EBF5EE] px-2.5 py-1 text-xs font-bold text-[#276B49] hover:bg-[#D4EBDC] disabled:opacity-50 ring-1 ring-[#BCE2CD]"
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
                className="pressable shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-[#C24138] hover:bg-red-50 disabled:opacity-50"
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
        <div className="mt-3.5 rounded-xl bg-[#EBF5EE] py-2.5 text-center text-xs font-bold text-[#276B49] ring-1 ring-[#BCE2CD]">
          🔔 Assigned Waiter Notified
        </div>
      )}
    </article>
  );
}
