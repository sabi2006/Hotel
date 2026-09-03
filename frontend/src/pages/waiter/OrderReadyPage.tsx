import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FoodTypeDot } from "@/components/FoodTypeDot";
import {
  ArmchairIcon,
  BellIcon,
  CheckIcon,
  ClockIcon,
  ReceiptIcon,
  RefreshCwIcon,
  UtensilsIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { SkeletonCards } from "@/components/Skeleton";
import { useNotifications } from "@/hooks/useNotifications";
import { useRipple } from "@/hooks/useRipple";
import { useToast } from "@/hooks/useToast";
import { getErrorMessage } from "@/services/api";
import type { Order } from "@/types";
import { formatCurrency, formatDateTime, timeAgo } from "@/utils/format";
import { soundManager } from "@/utils/sound";

export default function OrderReadyPage() {
  const navigate = useNavigate();
  const spawnRipple = useRipple();
  const toast = useToast();

  const {
    readyOrders,
    readyOrdersCount,
    refreshReadyOrders,
    deliverOrder,
    markReadyOrdersViewed,
    isSoundEnabled,
    toggleSound,
  } = useNotifications();

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [servingOrderId, setServingOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [, setTick] = useState(0);

  // Mark all ready notifications viewed when entering this dedicated screen
  useEffect(() => {
    markReadyOrdersViewed();
  }, [markReadyOrdersViewed]);

  // Periodic tick every 30s to update "ready 2 min ago" relative timestamps
  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function handleRefresh() {
    setIsRefreshing(true);
    setError(null);
    try {
      await refreshReadyOrders();
      toast.push({
        tone: "info",
        title: "Ready Orders Refreshed",
        description: "Checked kitchen for ready orders.",
        duration: 2500,
      });
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not refresh ready orders"));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleDeliver(order: Order, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setServingOrderId(order._id);
    try {
      await deliverOrder(order._id);
      if (selectedOrder?._id === order._id) {
        setSelectedOrder(null);
      }
    } catch (caught) {
      toast.error("Failed to deliver", getErrorMessage(caught, "Could not mark order as served"));
    } finally {
      setServingOrderId(null);
    }
  }

  function handleTestChime() {
    soundManager.testWaiterSound();
    toast.push({
      tone: "info",
      title: "Chime Test Played",
      description: "Audio bell triggered.",
      duration: 2000,
    });
  }

  // Sort: Newest ready order first
  const sortedOrders = useMemo(() => {
    return [...readyOrders].sort((a, b) => {
      const timeA = new Date(a.readyAt || a.updatedAt || a.createdAt).getTime();
      const timeB = new Date(b.readyAt || b.updatedAt || b.createdAt).getTime();
      return timeB - timeA;
    });
  }, [readyOrders]);

  const totalItems = useMemo(() => {
    return readyOrders.reduce((acc, o) => acc + o.items.length, 0);
  }, [readyOrders]);

  const totalSales = useMemo(() => {
    return readyOrders.reduce((acc, o) => acc + o.grandTotal, 0);
  }, [readyOrders]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-xs">
              <BellIcon size={18} />
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">
              Order Ready
            </h1>
            {readyOrdersCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-xs animate-pulse tabular-nums">
                {readyOrdersCount} {readyOrdersCount === 1 ? "Order" : "Orders"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Orders prepared by the kitchen and ready to be served.
          </p>
        </div>

        {/* Audio controls & actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={toggleSound}
            onPointerDown={spawnRipple}
            title={isSoundEnabled ? "Notification sound is ON" : "Notification sound is MUTED"}
            className={[
              "ripple-host pressable inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ring-1 cursor-pointer",
              isSoundEnabled
                ? "bg-emerald-50 text-emerald-800 ring-emerald-300 hover:bg-emerald-100 shadow-xs"
                : "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200",
            ].join(" ")}
          >
            {isSoundEnabled ? <Volume2Icon size={15} className="text-emerald-600" /> : <VolumeXIcon size={15} />}
            <span>{isSoundEnabled ? "Sound ON" : "Sound OFF"}</span>
          </button>

          {/* Test Chime */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTestChime}
            className="gap-1.5 text-xs font-bold"
          >
            <BellIcon size={14} />
            <span>Test Chime</span>
          </Button>

          {/* Refresh Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            className="gap-1.5 text-xs font-bold"
          >
            <RefreshCwIcon size={14} className={isRefreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </Button>
        </div>
      </header>

      {error && (
        <Alert tone="error" action={<Button size="xs" onClick={() => void handleRefresh()}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {/* Summary Metrics Bar (when ready orders exist) */}
      {readyOrdersCount > 0 && (
        <div className="card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#F0EBE1] overflow-hidden shadow-xs bg-white border border-[#EBE7DF]">
          <div className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#276B49] text-white shadow-md shadow-emerald-950/20 text-lg font-bold">
              🔔
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                Ready to Serve
              </p>
              <p className="text-2xl font-black tabular-nums text-[#1F2220] font-sans">
                {readyOrdersCount} {readyOrdersCount === 1 ? "Ticket" : "Tickets"}
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#FAF8F5] text-[#5F615D] ring-1 ring-[#E8E3D8] text-lg font-bold">
              🍽️
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                Prepared Items
              </p>
              <p className="text-2xl font-black tabular-nums text-[#1F2220] font-sans">
                {totalItems} {totalItems === 1 ? "Dish" : "Dishes"}
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#EBF5EE] text-[#276B49] ring-1 ring-[#BCE2CD] text-lg font-bold">
              💰
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                Total Value
              </p>
              <p className="text-2xl font-black tabular-nums text-[#276B49] font-sans">
                {formatCurrency(totalSales)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Ready Orders Grid */}
      {isLoading ? (
        <SkeletonCards count={4} />
      ) : sortedOrders.length === 0 ? (
        <EmptyState
          title="No orders waiting to serve"
          description="Kitchen has no completed orders waiting for you. When an order is prepared, it will arrive here live."
          icon={<span className="text-3xl">✅</span>}
          action={
            <div className="flex items-center gap-3">
              <Link to="/waiter/tables">
                <Button size="sm" className="gap-2">
                  <UtensilsIcon size={16} />
                  <span>Take Order</span>
                </Button>
              </Link>
              <Link to="/waiter/orders">
                <Button size="sm" variant="secondary" className="gap-2">
                  <ReceiptIcon size={16} />
                  <span>All Orders</span>
                </Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sortedOrders.map((order) => {
            const isDelivering = servingOrderId === order._id;
            const readyTimestamp = order.readyAt || order.updatedAt || order.createdAt;

            return (
              <div
                key={order._id}
                className={[
                  "card group relative flex flex-col justify-between overflow-hidden p-5 transition-all duration-200 select-none bg-white",
                  "border-2 border-[#BCE2CD] shadow-sm hover:border-[#8AC8A5] hover:shadow-lg",
                  "animate-[pop_0.3s_var(--ease-settle)_both]",
                ].join(" ")}
              >
                {/* Top Accent Bar */}
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#276B49] via-[#3F8F68] to-teal-600" />

                <div>
                  {/* Card Header: Table & Invoice */}
                  <div className="flex items-start justify-between gap-2 border-b border-[#F0EBE1] pb-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#276B49] text-white font-black text-base shadow-sm ring-2 ring-[#CFE7D9]">
                        T{order.tableNumber}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-extrabold text-[#1F2220] font-sans truncate">
                            Table {order.tableNumber}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-[#8E908C] truncate">
                          {order.invoiceNumber || `#${order.orderNumber}`}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5EE] px-2.5 py-1 text-[11px] font-bold text-[#276B49] ring-1 ring-[#BCE2CD]">
                        <span className="size-2 rounded-full bg-[#276B49] animate-ping" />
                        READY TO SERVE
                      </span>
                      <p className="mt-1 flex items-center justify-end gap-1 text-[11px] font-medium text-[#8E908C]">
                        <ClockIcon size={12} />
                        <span>Ready {timeAgo(readyTimestamp)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Food Items List */}
                  <div className="mt-3.5 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                      Dishes Ready ({order.items.length})
                    </p>

                    <div className="divide-y divide-[#F0EBE1] rounded-xl bg-[#FAF8F5] p-2.5 ring-1 ring-[#E8E3D8] max-h-48 overflow-y-auto custom-scrollbar">
                      {order.items.map((item) => (
                        <div
                          key={item.itemId}
                          className="flex items-center justify-between gap-2 py-1.5 text-xs first:pt-0.5 last:pb-0.5"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FoodTypeDot foodType={item.foodType} />
                            <span className="font-bold text-[#1F2220] truncate">
                              {item.name}
                            </span>
                            <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 font-bold text-[#276B49] ring-1 ring-[#E8E3D8] text-[11px]">
                              × {item.quantity}
                            </span>
                          </div>
                          <span className="shrink-0 font-extrabold text-[#5F615D] tabular-nums">
                            {formatCurrency(item.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Financial Total */}
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-[#FAF6EE] px-3.5 py-2.5 ring-1 ring-[#E8DCB8]">
                    <span className="text-xs font-bold text-brand-900">Grand Total</span>
                    <span className="text-base font-extrabold text-brand-900 tabular-nums font-sans">
                      {formatCurrency(order.grandTotal)}
                    </span>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-[#F0EBE1] pt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedOrder(order)}
                    className="w-full justify-center text-xs font-bold"
                  >
                    View Order
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isDelivering}
                    onClick={(e) => void handleDeliver(order, e)}
                    className="w-full justify-center bg-[#276B49] hover:bg-[#1E5C3B] text-white font-extrabold shadow-md shadow-emerald-950/20 text-xs gap-1.5"
                  >
                    {isDelivering ? (
                      <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <CheckIcon size={15} />
                    )}
                    <span>{isDelivering ? "Serving..." : "Deliver to Table"}</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Order Details Modal (View Order) */}
      {selectedOrder && (
        <Modal
          isOpen={true}
          size="lg"
          title={`Order #${selectedOrder.invoiceNumber || selectedOrder.orderNumber} · Table ${selectedOrder.tableNumber}`}
          onClose={() => setSelectedOrder(null)}
          footer={
            <div className="flex w-full items-center justify-between gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const id = selectedOrder._id;
                  setSelectedOrder(null);
                  navigate(`/waiter/order/${id}`);
                }}
              >
                Open Full Order
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setSelectedOrder(null)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={servingOrderId === selectedOrder._id}
                  onClick={() => void handleDeliver(selectedOrder)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-bold"
                >
                  <CheckIcon size={16} />
                  <span>Deliver to Table</span>
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl bg-slate-50 p-3.5 text-xs">
              <div>
                <p className="text-slate-400 font-medium">Table</p>
                <p className="font-bold text-slate-900 text-sm">Table {selectedOrder.tableNumber}</p>
              </div>
              <div>
                <p className="text-slate-400 font-medium">Waiter</p>
                <p className="font-bold text-slate-900 truncate">{selectedOrder.waiterName || "Assigned"}</p>
              </div>
              <div>
                <p className="text-slate-400 font-medium">Kitchen Status</p>
                <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  READY
                </span>
              </div>
              <div>
                <p className="text-slate-400 font-medium">Order Placed</p>
                <p className="font-semibold text-slate-700">{formatDateTime(selectedOrder.createdAt)}</p>
              </div>
            </div>

            {/* Items Table */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                Itemized Dishes ({selectedOrder.items.length})
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="px-3.5 py-2.5 text-left">Item</th>
                      <th className="px-3.5 py-2.5 text-center">Qty</th>
                      <th className="px-3.5 py-2.5 text-right">Price</th>
                      <th className="px-3.5 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {selectedOrder.items.map((item) => (
                      <tr key={item.itemId}>
                        <td className="px-3.5 py-2.5 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <FoodTypeDot foodType={item.foodType} />
                            <span>{item.name}</span>
                          </div>
                          {item.notes && <p className="text-[11px] font-normal text-slate-400 italic">Note: {item.notes}</p>}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-bold text-slate-700">{item.quantity}</td>
                        <td className="px-3.5 py-2.5 text-right text-slate-600 tabular-nums">{formatCurrency(item.price)}</td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-slate-900 tabular-nums">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financials Breakdown */}
            <div className="rounded-xl bg-slate-50 p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="tabular-nums font-semibold">{formatCurrency(selectedOrder.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>GST Tax</span>
                <span className="tabular-nums font-semibold">{formatCurrency(selectedOrder.gstAmount)}</span>
              </div>
              {selectedOrder.discount > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Discount</span>
                  <span className="tabular-nums">-{formatCurrency(selectedOrder.discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-extrabold text-slate-900 font-sans">
                <span>Grand Total</span>
                <span className="tabular-nums text-emerald-900">{formatCurrency(selectedOrder.grandTotal)}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
