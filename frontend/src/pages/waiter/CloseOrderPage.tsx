import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { CheckCircleIcon, CheckIcon, ClockIcon, CreditCardIcon, ReceiptIcon, RefreshCwIcon, SearchIcon, UtensilsIcon } from "@/components/Icons";
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
            <h1 className="text-2xl font-extrabold tracking-tight text-ink font-sans">
              Close Order
            </h1>
            {closeOrdersCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-600 text-white shadow-xs tabular-nums">
                {closeOrdersCount} {closeOrdersCount === 1 ? "Pending" : "Pending"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-medium text-muted">
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
        <div className="card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-surface-sunken overflow-hidden shadow-xs bg-white border border-line">
          <div className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm text-lg font-bold"><ReceiptIcon size={20} /></div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">
                Served Orders
              </p>
              <p className="text-2xl font-black tabular-nums text-ink font-sans">
                {closeOrdersCount} {closeOrdersCount === 1 ? "Order" : "Orders"}
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5 flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-soft text-muted ring-1 ring-line text-lg font-bold"><CreditCardIcon size={20} /></div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">
                Total Bill Value
              </p>
              <p className="text-2xl font-black tabular-nums text-ink font-sans">
                {formatCurrency(counts.totalGrand)}
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5 flex items-center gap-4">
            <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${counts.totalRemaining > 0 ? "bg-warning-soft text-warning ring-1 ring-warning-line" : "bg-success-soft text-success ring-1 ring-success-line"}`}>
              {counts.totalRemaining > 0 ? <ClockIcon size={20} /> : <CheckIcon size={20} />}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">
                Remaining Balance
              </p>
              <p className={`text-2xl font-black tabular-nums font-sans ${counts.totalRemaining > 0 ? "text-warning" : "text-success"}`}>
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
                    ? "bg-ink text-white shadow-sm"
                    : "bg-white text-muted ring-1 ring-line hover:bg-surface-soft hover:text-ink",
                ].join(" ")}
              >
                <span>{tab.label}</span>
                <span
                  className={[
                    "rounded-full px-1.5 py-0.2 text-[10px] font-extrabold tabular-nums",
                    filter === tab.key ? "bg-white/20 text-white" : "bg-brand-100 text-brand-700",
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
          icon={<CheckCircleIcon size={22} />}
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
                    ? "border-2 border-success-line shadow-sm hover:shadow-sm"
                    : isPartial
                      ? "border-2 border-warning-line shadow-sm hover:shadow-sm"
                      : "border border-line shadow-xs hover:border-line-strong hover:shadow-sm",
                  "animate-[pop_0.3s_var(--ease-settle)_both]",
                ].join(" ")}
              >
                {/* Top Accent Strip */}
                <div
                  className={`absolute inset-x-0 top-0 h-1.5 ${
                    isFullyPaid
                      ? "bg-success"
                      : isPartial
                        ? "bg-warning"
                        : "bg-brand-500"
                  }`}
                />

                <div>
                  {/* Card Header: Table & Status */}
                  <div className="flex items-start justify-between gap-2 border-b border-surface-sunken pb-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex size-12 shrink-0 items-center justify-center rounded-xl font-black text-base shadow-sm ring-2 ${
                          isFullyPaid
                            ? "bg-success text-white ring-success-line"
                            : isPartial
                              ? "bg-warning text-white ring-warning-line"
                              : "bg-ink text-white ring-charcoal-700"
                        }`}
                      >
                        T{order.tableNumber}
                      </div>
                      <div className="min-w-0">
                        <span className="text-base font-extrabold text-ink font-sans truncate">
                          Table {order.tableNumber}
                        </span>
                        <p className="text-xs font-bold text-subtle truncate">
                          {order.invoiceNumber || `#${order.orderNumber}`}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isFullyPaid ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-extrabold text-success ring-1 ring-success-line">
                          <CheckIcon size={12} className="text-success stroke-[3]" />
                          FULLY PAID
                        </span>
                      ) : isPartial ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-bold text-warning ring-1 ring-warning-line">
                          PARTIALLY PAID
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2.5 py-1 text-[11px] font-bold text-info ring-1 ring-info-line">
                          PENDING PAYMENT
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Customer / Items Preview */}
                  <div className="mt-3.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-subtle font-medium">
                      <span>{order.items.length} dishes served</span>
                      <span>Waiter: {order.waiterName}</span>
                    </div>

                    <div className="rounded-xl bg-surface-soft p-2.5 ring-1 ring-line max-h-24 overflow-y-auto custom-scrollbar text-xs">
                      {order.items.slice(0, 3).map((item) => (
                        <div key={item.itemId} className="flex justify-between py-0.5 text-ink-soft">
                          <span className="truncate">{item.name} × {item.quantity}</span>
                          <span className="font-semibold tabular-nums text-muted">{formatCurrency(item.total)}</span>
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <p className="text-[10px] text-subtle font-bold mt-0.5">
                          + {order.items.length - 3} more items...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Financial Overview Box */}
                  <div
                    className={`mt-3.5 rounded-xl p-3 space-y-1.5 text-xs ring-1 ${
                      isFullyPaid
                        ? "bg-success-soft/80 ring-success-line text-success-strong"
                        : isPartial
                          ? "bg-warning-soft/80 ring-warning-line text-brand-700"
                          : "bg-surface-soft ring-line text-ink"
                    }`}
                  >
                    <div className="flex justify-between font-medium text-muted">
                      <span>Grand Total</span>
                      <span className="font-bold text-ink tabular-nums">{formatCurrency(order.grandTotal)}</span>
                    </div>
                    <div className="flex justify-between font-medium text-muted">
                      <span>Amount Paid</span>
                      <span className="font-bold text-success tabular-nums">{formatCurrency(order.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between border-t border-line pt-1 text-xs font-extrabold">
                      <span>Remaining</span>
                      <span
                        className={`tabular-nums ${
                          isFullyPaid
                            ? "text-success font-bold"
                            : "text-warning font-bold"
                        }`}
                      >
                        {isFullyPaid ? "₹0.00 (Settled)" : formatCurrency(remaining)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-5 border-t border-surface-sunken pt-4">
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
                        className="w-full justify-center bg-success hover:bg-success-strong text-white font-extrabold shadow-sm text-xs gap-1.5"
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
                className="bg-success hover:bg-success text-white gap-1.5 font-bold shadow-sm"
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
            <div className="rounded-xl bg-success-soft/80 p-4 border border-success-line">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-success text-white font-bold text-base shadow-sm">
                  ✓
                </div>
                <div>
                  <h4 className="text-sm font-bold text-success-strong">
                    Order is fully paid and ready to close
                  </h4>
                  <p className="text-xs text-success-strong mt-0.5">
                    Closing will finalize the bill and free Table {orderToClose.tableNumber} for new guests.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-surface-soft p-3.5 space-y-2 text-xs">
              <div className="flex justify-between text-muted">
                <span>Invoice #</span>
                <span className="font-bold text-ink">{orderToClose.invoiceNumber || `#${orderToClose.orderNumber}`}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Table</span>
                <span className="font-bold text-ink">Table {orderToClose.tableNumber}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Total Amount</span>
                <span className="font-bold text-ink tabular-nums">{formatCurrency(orderToClose.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-success font-bold border-t border-line pt-2">
                <span>Total Paid</span>
                <span className="tabular-nums">{formatCurrency(orderToClose.amountPaid)}</span>
              </div>
              <div className="flex justify-between text-muted font-medium">
                <span>Remaining</span>
                <span className="tabular-nums">₹0.00</span>
              </div>
            </div>

            <p className="text-xs text-muted">
              Are you sure you want to close this order and release Table {orderToClose.tableNumber}? All invoice and payment records will be preserved in order history.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
