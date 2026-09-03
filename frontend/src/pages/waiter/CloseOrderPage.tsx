import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import {
  CheckIcon,
  CreditCardIcon,
  ReceiptIcon,
  RefreshCwIcon,
  SearchIcon,
  UtensilsIcon,
} from "@/components/Icons";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { useNotifications } from "@/hooks/useNotifications";
import { useToast } from "@/hooks/useToast";
import { getErrorMessage } from "@/services/api";
import type { Order } from "@/types";
import { formatCurrency } from "@/utils/format";

type FilterType = "ALL" | "UNPAID" | "PARTIAL" | "PAID";

export default function CloseOrderPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const {
    closeOrders,
    closeOrdersCount,
    refreshCloseOrders,
    settleAndCloseOrder,
  } = useNotifications();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("ALL");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orderToClose, setOrderToClose] = useState<Order | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  async function handleRefresh() {
    setIsRefreshing(true);
    setError(null);
    try {
      await refreshCloseOrders();
      toast.push({
        tone: "info",
        title: "Close Orders Refreshed",
        description: "Checked for served orders pending payment/closure.",
        duration: 2500,
      });
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not refresh close orders"));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleConfirmClose() {
    if (!orderToClose) return;
    setIsClosing(true);
    try {
      await settleAndCloseOrder(orderToClose._id);
      setOrderToClose(null);
    } catch (caught) {
      toast.error("Could not close order", getErrorMessage(caught, "Ensure full payment is received."));
    } finally {
      setIsClosing(false);
    }
  }

  // Filter & Search
  const filteredOrders = useMemo(() => {
    let result = [...closeOrders];

    // Search query
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (o) =>
          o.tableNumber.toLowerCase().includes(q) ||
          o.invoiceNumber.toLowerCase().includes(q) ||
          String(o.orderNumber).includes(q) ||
          (o.customer?.name && o.customer.name.toLowerCase().includes(q)),
      );
    }

    // Tab filter
    if (filter === "UNPAID") {
      result = result.filter((o) => o.amountPaid <= 0);
    } else if (filter === "PARTIAL") {
      result = result.filter((o) => o.amountPaid > 0 && o.amountPaid < o.grandTotal);
    } else if (filter === "PAID") {
      result = result.filter((o) => o.amountPaid >= o.grandTotal);
    }

    // Sort: Fully paid first (ready to close), then newest served
    return result.sort((a, b) => {
      const aPaid = a.amountPaid >= a.grandTotal;
      const bPaid = b.amountPaid >= b.grandTotal;
      if (aPaid && !bPaid) return -1;
      if (!aPaid && bPaid) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [closeOrders, search, filter]);

  const counts = useMemo(() => {
    const unpaid = closeOrders.filter((o) => o.amountPaid <= 0).length;
    const partial = closeOrders.filter((o) => o.amountPaid > 0 && o.amountPaid < o.grandTotal).length;
    const paid = closeOrders.filter((o) => o.amountPaid >= o.grandTotal).length;
    const totalRemaining = closeOrders.reduce(
      (acc, o) => acc + Math.max(0, o.grandTotal - o.amountPaid),
      0,
    );
    const totalGrand = closeOrders.reduce((acc, o) => acc + o.grandTotal, 0);

    return { unpaid, partial, paid, totalRemaining, totalGrand };
  }, [closeOrders]);

  const FILTER_TABS: { key: FilterType; label: string; count: number }[] = [
    { key: "ALL", label: "All Pending", count: closeOrders.length },
    { key: "UNPAID", label: "Unpaid", count: counts.unpaid },
    { key: "PARTIAL", label: "Partially Paid", count: counts.partial },
    { key: "PAID", label: "Fully Paid (Ready to Close)", count: counts.paid },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-brand-100 text-brand-700 shadow-xs">
              <CheckIcon size={18} />
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">
              Close Order
            </h1>
            {closeOrdersCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-600 text-white shadow-xs tabular-nums">
                {closeOrdersCount} {closeOrdersCount === 1 ? "Pending" : "Pending"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Complete payment, tips, and close served orders to free tables.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
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

      {/* Summary Metrics Strip */}
      {closeOrdersCount > 0 && (
        <div className="card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#F0EBE1] overflow-hidden shadow-xs bg-white border border-[#EBE7DF]">
          <div className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-md shadow-brand-950/20 text-lg font-bold">
              📑
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                Served Orders
              </p>
              <p className="text-2xl font-black tabular-nums text-[#1F2220] font-sans">
                {closeOrdersCount} {closeOrdersCount === 1 ? "Order" : "Orders"}
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#FAF8F5] text-[#5F615D] ring-1 ring-[#E8E3D8] text-lg font-bold">
              💰
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                Total Bill Value
              </p>
              <p className="text-2xl font-black tabular-nums text-[#1F2220] font-sans">
                {formatCurrency(counts.totalGrand)}
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5 flex items-center gap-4">
            <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-lg font-bold ${counts.totalRemaining > 0 ? "bg-[#FEF7EE] text-[#9E6523] ring-1 ring-[#FADFB8]" : "bg-[#EBF5EE] text-[#276B49] ring-1 ring-[#BCE2CD]"}`}>
              {counts.totalRemaining > 0 ? "⏳" : "✓"}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                Remaining Balance
              </p>
              <p className={`text-2xl font-black tabular-nums font-sans ${counts.totalRemaining > 0 ? "text-[#9E6523]" : "text-[#276B49]"}`}>
                {formatCurrency(counts.totalRemaining)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      {closeOrdersCount > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Filter Tabs */}
          <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 custom-scrollbar select-none">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={[
                  "pressable flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition select-none",
                  filter === tab.key
                    ? "bg-[#202322] text-white shadow-sm shadow-charcoal-950/20"
                    : "bg-white text-[#5F615D] ring-1 ring-[#E8E3D8] hover:bg-[#FAF8F3] hover:text-[#1F2220]",
                ].join(" ")}
              >
                <span>{tab.label}</span>
                <span
                  className={[
                    "rounded-full px-1.5 py-0.2 text-[10px] font-extrabold tabular-nums",
                    filter === tab.key ? "bg-white/20 text-white" : "bg-[#F3ECE0] text-[#805C2B]",
                  ].join(" ")}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="w-full sm:w-64">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table, invoice #..."
              className="text-xs"
            />
          </div>
        </div>
      )}

      {/* Orders List / Cards */}
      {closeOrders.length === 0 ? (
        <EmptyState
          title="No orders waiting to close"
          description="All served orders have been settled and closed. When food is delivered to a table, it will appear here for final billing."
          icon={<span className="text-3xl">✓</span>}
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
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="No matching orders"
          description="No served orders match the current filter or search criteria."
          icon={<SearchIcon size={28} />}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setFilter("ALL");
                setSearch("");
              }}
            >
              Reset Filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredOrders.map((order) => {
            const isFullyPaid = order.amountPaid >= order.grandTotal;
            const remaining = Math.max(0, order.grandTotal - order.amountPaid);
            const isPartial = order.amountPaid > 0 && !isFullyPaid;

            return (
              <div
                key={order._id}
                className={[
                  "card group relative flex flex-col justify-between overflow-hidden p-5 transition-all duration-200 select-none bg-white",
                  isFullyPaid
                    ? "border-2 border-[#BCE2CD] shadow-sm hover:shadow-lg"
                    : isPartial
                      ? "border-2 border-[#FADFB8] shadow-sm hover:shadow-lg"
                      : "border border-[#EBE7DF] shadow-xs hover:border-[#D8CEBE] hover:shadow-md",
                  "animate-[pop_0.3s_var(--ease-settle)_both]",
                ].join(" ")}
              >
                {/* Top Accent Strip */}
                <div
                  className={`absolute inset-x-0 top-0 h-1.5 ${
                    isFullyPaid
                      ? "bg-gradient-to-r from-[#276B49] to-teal-600"
                      : isPartial
                        ? "bg-gradient-to-r from-[#C58A3A] to-amber-600"
                        : "bg-gradient-to-r from-brand-500 to-brand-700"
                  }`}
                />

                <div>
                  {/* Card Header: Table & Status */}
                  <div className="flex items-start justify-between gap-2 border-b border-[#F0EBE1] pb-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex size-12 shrink-0 items-center justify-center rounded-2xl font-black text-base shadow-sm ring-2 ${
                          isFullyPaid
                            ? "bg-[#276B49] text-white ring-[#CFE7D9]"
                            : isPartial
                              ? "bg-[#9E6523] text-white ring-[#FADFB8]"
                              : "bg-[#202322] text-white ring-[#323634]"
                        }`}
                      >
                        T{order.tableNumber}
                      </div>
                      <div className="min-w-0">
                        <span className="text-base font-extrabold text-[#1F2220] font-sans truncate">
                          Table {order.tableNumber}
                        </span>
                        <p className="text-xs font-bold text-[#8E908C] truncate">
                          {order.invoiceNumber || `#${order.orderNumber}`}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isFullyPaid ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EBF5EE] px-2.5 py-1 text-[11px] font-extrabold text-[#276B49] ring-1 ring-[#BCE2CD]">
                          <CheckIcon size={12} className="text-[#276B49] stroke-[3]" />
                          FULLY PAID
                        </span>
                      ) : isPartial ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF7EE] px-2.5 py-1 text-[11px] font-bold text-[#9E6523] ring-1 ring-[#FADFB8]">
                          PARTIALLY PAID
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F0F5F9] px-2.5 py-1 text-[11px] font-bold text-[#365D7B] ring-1 ring-[#CFE0ED]">
                          PENDING PAYMENT
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Customer / Items Preview */}
                  <div className="mt-3.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-[#8E908C] font-medium">
                      <span>{order.items.length} dishes served</span>
                      <span>Waiter: {order.waiterName}</span>
                    </div>

                    <div className="rounded-xl bg-[#FAF8F5] p-2.5 ring-1 ring-[#E8E3D8] max-h-24 overflow-y-auto custom-scrollbar text-xs">
                      {order.items.slice(0, 3).map((item) => (
                        <div key={item.itemId} className="flex justify-between py-0.5 text-[#424541]">
                          <span className="truncate">{item.name} × {item.quantity}</span>
                          <span className="font-semibold tabular-nums text-[#6F716D]">{formatCurrency(item.total)}</span>
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <p className="text-[10px] text-[#8E908C] font-bold mt-0.5">
                          + {order.items.length - 3} more items...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Financial Overview Box */}
                  <div
                    className={`mt-3.5 rounded-xl p-3 space-y-1.5 text-xs ring-1 ${
                      isFullyPaid
                        ? "bg-[#EBF5EE]/80 ring-[#BCE2CD] text-[#1E5C3B]"
                        : isPartial
                          ? "bg-[#FEF7EE]/80 ring-[#FADFB8] text-[#805C2B]"
                          : "bg-[#FAF8F5] ring-[#E8E3D8] text-[#1F2220]"
                    }`}
                  >
                    <div className="flex justify-between font-medium text-[#5F615D]">
                      <span>Grand Total</span>
                      <span className="font-bold text-[#1F2220] tabular-nums">{formatCurrency(order.grandTotal)}</span>
                    </div>
                    <div className="flex justify-between font-medium text-[#5F615D]">
                      <span>Amount Paid</span>
                      <span className="font-bold text-[#276B49] tabular-nums">{formatCurrency(order.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between border-t border-[#E8E3D8] pt-1 text-xs font-extrabold">
                      <span>Remaining</span>
                      <span
                        className={`tabular-nums ${
                          isFullyPaid
                            ? "text-[#276B49] font-bold"
                            : "text-[#9E6523] font-bold"
                        }`}
                      >
                        {isFullyPaid ? "₹0.00 (Settled)" : formatCurrency(remaining)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-5 border-t border-[#F0EBE1] pt-4">
                  {isFullyPaid ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/waiter/billing/${order._id}`)}
                        className="w-full justify-center text-xs font-bold gap-1.5"
                      >
                        <CreditCardIcon size={14} />
                        <span>View Bill</span>
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setOrderToClose(order)}
                        className="w-full justify-center bg-[#276B49] hover:bg-[#1E5C3B] text-white font-extrabold shadow-md shadow-emerald-950/20 text-xs gap-1.5"
                      >
                        <CheckIcon size={15} />
                        <span>Close Order</span>
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="primary"
                      size="md"
                      fullWidth
                      onClick={() => navigate(`/waiter/billing/${order._id}`)}
                      className="w-full justify-center text-sm font-bold gap-2 shadow-sm py-2.5"
                    >
                      <CreditCardIcon size={16} />
                      <span>Pay Bill →</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal to Close Order & Free Table */}
      {orderToClose && (
        <Modal
          isOpen={true}
          size="md"
          title={`Close Order: Table ${orderToClose.tableNumber}`}
          onClose={() => !isClosing && setOrderToClose(null)}
          footer={
            <div className="flex w-full items-center justify-end gap-2.5">
              <Button
                variant="secondary"
                size="sm"
                disabled={isClosing}
                onClick={() => setOrderToClose(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={isClosing}
                onClick={() => void handleConfirmClose()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-bold shadow-md shadow-emerald-950/20"
              >
                {isClosing ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <CheckIcon size={16} />
                )}
                <span>{isClosing ? "Closing Order..." : "Confirm & Free Table"}</span>
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50/80 p-4 border border-emerald-200">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500 text-white font-bold text-base shadow-sm">
                  ✓
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-950">
                    Order is fully paid and ready to close
                  </h4>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Closing will finalize the bill and free Table {orderToClose.tableNumber} for new guests.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Invoice #</span>
                <span className="font-bold text-slate-900">{orderToClose.invoiceNumber || `#${orderToClose.orderNumber}`}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Table</span>
                <span className="font-bold text-slate-900">Table {orderToClose.tableNumber}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Total Amount</span>
                <span className="font-bold text-slate-900 tabular-nums">{formatCurrency(orderToClose.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-bold border-t border-slate-200 pt-2">
                <span>Total Paid</span>
                <span className="tabular-nums">{formatCurrency(orderToClose.amountPaid)}</span>
              </div>
              <div className="flex justify-between text-slate-500 font-medium">
                <span>Remaining</span>
                <span className="tabular-nums">₹0.00</span>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Are you sure you want to close this order and release Table {orderToClose.tableNumber}? All invoice and payment records will be preserved in order history.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
