import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/Alert";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/Button";
import {
  ArmchairIcon,
  CreditCardIcon,
  HandCoinsIcon,
  PrinterIcon,
  ReceiptIcon,
  UtensilsIcon,
} from "@/components/Icons";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { FullScreenLoader } from "@/components/Spinner";
import { SplitPaymentModal } from "@/components/SplitPaymentModal";
import type { SplitEntry } from "@/components/SplitPaymentModal";
import { WhatsAppShareModal } from "@/components/WhatsAppShareModal";
import { useToast } from "@/hooks/useToast";
import { getErrorMessage } from "@/services/api";
import { newPaymentRequestId, paymentsService, settingsService } from "@/services/billing";
import { ordersService } from "@/services/orders";
import { tipsService } from "@/services/tips";
import type { WaiterTipQr } from "@/services/tips";
import { resolveImageUrl } from "@/services/uploads";
import { PAYMENT_METHOD_LABELS, TIP_METHOD_LABELS } from "@/types";
import type {
  Order,
  PaymentMethod,
  PaymentSummary,
  RestaurantSettings,
  TipMethod,
  TipSummary,
} from "@/types";
import { formatCurrency, formatDateTime } from "@/utils/format";
import { buildBillMessage, whatsAppLinkFor } from "@/utils/whatsapp";

const METHODS: PaymentMethod[] = ["CASH", "UPI", "CARD"];

export default function BillingPage() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amount, setAmount] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [reference, setReference] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const [isSplitSaving, setIsSplitSaving] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isServing, setIsServing] = useState(false);

  const [tips, setTips] = useState<TipSummary | null>(null);
  const [isTipOpen, setIsTipOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [tipMethod, setTipMethod] = useState<TipMethod>("CASH");
  const [tipReference, setTipReference] = useState("");
  const [isSavingTip, setIsSavingTip] = useState(false);

  const [waiterQr, setWaiterQr] = useState<WaiterTipQr | null>(null);
  const [isWaiterQrOpen, setIsWaiterQrOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [loadedOrder, loadedSummary, loadedTips] = await Promise.all([
        ordersService.get(orderId),
        paymentsService.forOrder(orderId),
        tipsService.forOrder(orderId),
      ]);
      setOrder(loadedOrder);
      setSummary(loadedSummary);
      setTips(loadedTips);
      setAmount(loadedSummary.amountDue > 0 ? String(loadedSummary.amountDue) : "");
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load this bill"));
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    settingsService
      .get()
      .then(setSettings)
      .catch(() => undefined);
  }, []);

  async function handlePay() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than zero");
      return;
    }

    setIsPaying(true);
    setError(null);
    try {
      const updated = await paymentsService.add(orderId, {
        method,
        amount: value,
        receivedAmount:
          method === "CASH" && receivedAmount ? Number(receivedAmount) : undefined,
        reference: reference.trim() || undefined,
        clientRequestId: newPaymentRequestId(),
      });
      setSummary(updated);
      setOrder(await ordersService.get(orderId));
      setAmount(updated.amountDue > 0 ? String(updated.amountDue) : "");
      setReceivedAmount("");
      setReference("");
      if (updated.isFullyPaid) {
        toast.success("Bill settled in full", "The order can now be closed and table released.");
      } else {
        toast.info("Payment recorded", `${formatCurrency(updated.amountDue)} balance remaining.`);
      }
    } catch (caught) {
      toast.error("Payment not recorded", getErrorMessage(caught, "Could not record that payment"));
    } finally {
      setIsPaying(false);
    }
  }

  async function handleSplitConfirm(entries: SplitEntry[]) {
    setIsSplitSaving(true);
    setError(null);
    try {
      const updated = await paymentsService.addSplit(
        orderId,
        entries.map((entry) => ({
          method: entry.method,
          amount: entry.amount,
          receivedAmount: entry.receivedAmount,
          reference: entry.reference?.trim() || undefined,
          clientRequestId: newPaymentRequestId(),
        })),
      );
      setSummary(updated);
      setOrder(await ordersService.get(orderId));
      setAmount(updated.amountDue > 0 ? String(updated.amountDue) : "");
      setIsSplitOpen(false);
      if (updated.isFullyPaid) {
        toast.success("Split payment recorded", "Bill settled in full.");
      } else {
        toast.info("Split payment recorded", `${formatCurrency(updated.amountDue)} still due.`);
      }
    } catch (caught) {
      toast.error("Could not record split", getErrorMessage(caught, "Split payment failed"));
    } finally {
      setIsSplitSaving(false);
    }
  }

  async function handleAddTip() {
    const value = Number(tipAmount);
    if (!Number.isFinite(value) || value <= 0) return;
    setIsSavingTip(true);
    setError(null);
    try {
      const updated = await tipsService.record(orderId, {
        method: tipMethod,
        amount: value,
        reference: tipReference.trim() || undefined,
      });
      setTips(updated);
      setIsTipOpen(false);
      setTipAmount("");
      setTipReference("");
      toast.success("Tip recorded", `Thank you for tipping ${order?.waiterName}!`);
    } catch (caught) {
      toast.error("Could not save tip", getErrorMessage(caught, "Could not record that tip"));
    } finally {
      setIsSavingTip(false);
    }
  }

  async function openWaiterQr() {
    if (!order) return;
    try {
      const info = await tipsService.getWaiterQr(order.waiterId);
      setWaiterQr(info);
      setIsWaiterQrOpen(true);
    } catch (caught) {
      toast.error("Could not load tip QR", getErrorMessage(caught, "Could not fetch QR"));
    }
  }

  async function handleServeReady() {
    setIsServing(true);
    try {
      const updated = await ordersService.serve(orderId);
      setOrder(updated);
      setNotice("All prepared items have been marked as served.");
      toast.success("Items served", "All ready items marked as served.");
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not mark items as served"));
    } finally {
      setIsServing(false);
    }
  }

  function handleShareOnWhatsApp(phone: string) {
    const normalisedPhone = phone.replace(/\D/g, "");
    const link = whatsAppLinkFor(normalisedPhone, billMessage);
    window.open(link, "_blank", "noopener,noreferrer");
    setIsShareOpen(false);
    toast.success("WhatsApp opened", "Please click Send in WhatsApp to deliver the bill.");

    if (!order?.customer.phone) {
      void ordersService
        .update(orderId, {
          customer: { name: order?.customer.name ?? null, phone: normalisedPhone },
        })
        .then(setOrder)
        .catch(() => undefined);
    }
  }

  async function handleClose() {
    if (isClosing) return;
    setIsClosing(true);
    setError(null);
    try {
      await paymentsService.closeOrder(orderId);
      toast.success(
        "Order Closed",
        `✓ Order ${order?.invoiceNumber || "#" + (order?.orderNumber || "")} closed. Table ${order?.tableNumber} is now free.`,
      );
      navigate("/waiter/close-order", { replace: true });
    } catch (caught) {
      toast.error(
        "Could not close the order",
        getErrorMessage(caught, "Ensure all items are served and payment is fully collected."),
      );
    } finally {
      setIsClosing(false);
    }
  }

  if (isLoading) return <FullScreenLoader label="Loading invoice and payment details" />;

  if (!order || !summary) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error ?? "Bill not found"}</Alert>
        <Button variant="secondary" onClick={() => navigate("/waiter/tables")}>
          Back to tables
        </Button>
      </div>
    );
  }

  const activeItems = order.items.filter((item) => item.kitchenStatus !== "CANCELLED");
  const unservedItems = activeItems.filter(
    (item) => item.sentToKitchenAt !== null && item.kitchenStatus !== "SERVED",
  );
  const readyToServe = unservedItems.filter((item) => item.kitchenStatus === "READY");
  const stillCooking = unservedItems.filter((item) => item.kitchenStatus !== "READY");
  const canClose = summary.isFullyPaid && unservedItems.length === 0;

  const billMessage = buildBillMessage(order, settings, {
    payments: summary.payments,
    totalTips: tips?.totalTips ?? 0,
  });

  const changeDue =
    method === "CASH" && receivedAmount && Number(receivedAmount) > Number(amount)
      ? Number(receivedAmount) - Number(amount)
      : 0;

  return (
    <div className="space-y-5">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .print-only-bill { position: absolute; inset: 0; margin: 0; box-shadow: none !important; ring: 0 !important; }
        }
      `}</style>

      {/* Top Header */}
      <header className="no-print card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => navigate(`/waiter/order/${orderId}`)}
            className="pressable flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm font-bold"
            title="Back to Order"
          >
            ←
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-extrabold text-slate-900 font-sans">
                Billing &amp; Settlement · Table {order.tableNumber}
              </h1>
              <OrderStatusBadge status={order.orderStatus} />
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Invoice: <span className="font-bold text-slate-700">{order.invoiceNumber}</span> · Waiter: {order.waiterName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="secondary" size="md" onClick={() => window.print()} className="gap-2">
            <PrinterIcon size={16} />
            <span>Print Invoice</span>
          </Button>
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-5 lg:grid-cols-5 items-start">
        {/* Left: Invoice Receipt Card */}
        <section className="print-only-bill card p-6 sm:p-8 lg:col-span-3 space-y-5 shadow-sm bg-white">
          {/* Restaurant Header */}
          <div className="border-b border-dashed border-slate-200 pb-5 text-center flex flex-col items-center">
            <BrandLogo variant="full" size="md" className="mb-2 max-w-[170px]" />
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900 font-sans">
              {settings?.restaurantName ?? "SPICE GARDEN"}
            </h2>
            <p className="text-[10px] font-bold text-brand-700 uppercase tracking-widest mt-0.5">
              Hospitality &amp; Point of Sale
            </p>
            {settings?.addressLine1 && (
              <p className="text-xs text-slate-500 mt-1 font-medium">{settings.addressLine1}</p>
            )}
            {settings?.city && <p className="text-xs text-slate-500 font-medium">{settings.city}</p>}
            {settings?.phone && <p className="text-xs text-slate-500 font-medium">Phone: {settings.phone}</p>}
            {settings?.gstNumber && (
              <p className="mt-1 text-xs font-bold text-slate-700 uppercase tracking-wider">
                GSTIN: {settings.gstNumber}
              </p>
            )}
          </div>

          {/* Invoice Metadata */}
          <dl className="grid grid-cols-2 gap-y-1.5 py-1 text-xs sm:text-sm">
            <dt className="text-slate-500">Invoice Number</dt>
            <dd className="text-right font-bold text-slate-900">{order.invoiceNumber}</dd>
            <dt className="text-slate-500">Date &amp; Time</dt>
            <dd className="text-right font-medium text-slate-700">{formatDateTime(order.createdAt)}</dd>
            <dt className="text-slate-500">Table Number</dt>
            <dd className="text-right font-bold text-slate-900">Table {order.tableNumber}</dd>
            <dt className="text-slate-500">Staff / Waiter</dt>
            <dd className="text-right font-medium text-slate-700">{order.waiterName}</dd>
            {order.customer.name && (
              <>
                <dt className="text-slate-500">Customer Name</dt>
                <dd className="text-right font-semibold text-slate-900">{order.customer.name}</dd>
              </>
            )}
            {order.customer.phone && (
              <>
                <dt className="text-slate-500">Customer Phone</dt>
                <dd className="text-right font-semibold text-slate-900">{order.customer.phone}</dd>
              </>
            )}
          </dl>

          {/* Items Table */}
          <div className="overflow-x-auto border-y border-dashed border-slate-200 py-3">
            <table className="min-w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-2">Item Description</th>
                  <th className="pb-2 text-center">Qty</th>
                  <th className="pb-2 text-right">Price</th>
                  <th className="pb-2 text-right">GST</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeItems.map((item) => (
                  <tr key={item.itemId} className="font-medium text-slate-800">
                    <td className="py-2.5 pr-2 font-bold text-slate-900">{item.name}</td>
                    <td className="py-2.5 text-center text-slate-600">{item.quantity}</td>
                    <td className="py-2.5 text-right text-slate-600 tabular-nums">
                      {formatCurrency(item.price)}
                    </td>
                    <td className="py-2.5 text-right text-slate-500 tabular-nums text-xs">
                      {item.gstPercentage}%
                    </td>
                    <td className="py-2.5 text-right font-bold text-slate-900 tabular-nums">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <dl className="space-y-1.5 pt-1 text-xs sm:text-sm">
            <div className="flex justify-between text-slate-600">
              <dt>Subtotal</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{formatCurrency(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>GST Amount</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{formatCurrency(order.gstAmount)}</dd>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-emerald-700 font-bold">
                <dt>Discount Applied</dt>
                <dd className="tabular-nums">−{formatCurrency(order.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-900/10 pt-2.5 text-base font-extrabold text-slate-900">
              <dt>Grand Total</dt>
              <dd className="tabular-nums text-brand-600 text-lg">{formatCurrency(order.grandTotal)}</dd>
            </div>
            {summary.amountPaid > 0 && (
              <>
                <div className="flex justify-between text-slate-600">
                  <dt>Amount Paid</dt>
                  <dd className="font-bold tabular-nums text-emerald-700">{formatCurrency(summary.amountPaid)}</dd>
                </div>
                <div className="flex justify-between font-extrabold pt-1">
                  <dt className={summary.amountDue > 0 ? "text-red-600" : "text-emerald-600"}>
                    {summary.amountDue > 0 ? "Balance Remaining" : "Status: Fully Settled"}
                  </dt>
                  <dd className={`tabular-nums ${summary.amountDue > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {formatCurrency(summary.amountDue)}
                  </dd>
                </div>
              </>
            )}
          </dl>

          <p className="border-t border-dashed border-slate-200 pt-4 text-center text-xs text-slate-400 font-medium">
            {settings?.invoiceFooterNote ?? "Thank you for dining with us! Please visit again."}
          </p>
        </section>

        {/* Right: Payment & Settlement Controls */}
        <section className="no-print space-y-4 lg:col-span-2 select-none">
          {/* Payment Box */}
          <div className="card p-5 space-y-4 shadow-sm">
            <div className="flex items-baseline justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 font-sans">Payment Collection</h2>
                <p className="text-xs text-slate-500 font-medium">
                  {summary.amountDue > 0 ? "Outstanding balance" : "Invoice settled in full"}
                </p>
              </div>
              <span
                className={`text-xl font-extrabold tabular-nums font-sans ${
                  summary.amountDue > 0 ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {formatCurrency(summary.amountDue)}
              </span>
            </div>

            {summary.amountDue > 0 && (
              <div className="space-y-4">
                {/* Method selector */}
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setMethod(option)}
                      className={[
                        "pressable rounded-xl px-3 py-2.5 text-xs font-bold transition",
                        method === option
                          ? "bg-brand-600 text-white shadow-md shadow-brand-950/20"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                      ].join(" ")}
                    >
                      {PAYMENT_METHOD_LABELS[option]}
                    </button>
                  ))}
                </div>

                {/* Split CTA */}
                <button
                  type="button"
                  onClick={() => setIsSplitOpen(true)}
                  className="pressable flex w-full items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-left text-xs font-bold text-white hover:bg-slate-800 shadow-sm"
                >
                  <div>
                    <p className="font-bold">Split Across Multiple Methods</p>
                    <p className="text-[11px] font-medium text-slate-400 mt-0.5">Part Cash, Part UPI, Part Card</p>
                  </div>
                  <span className="text-base">→</span>
                </button>

                <Input
                  label="Amount to Collect (₹)"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  hint={`Pay less than ${formatCurrency(summary.amountDue)} to record partial payment`}
                />

                {method === "CASH" && (
                  <>
                    <Input
                      label="Cash Tendered / Received (₹)"
                      type="number"
                      min={0}
                      step="0.01"
                      value={receivedAmount}
                      onChange={(e) => setReceivedAmount(e.target.value)}
                      placeholder="e.g. 500"
                      hint="Optional — calculates change to return"
                    />
                    {changeDue > 0 && (
                      <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200 text-xs font-bold text-amber-900 flex justify-between">
                        <span>Change to return:</span>
                        <span className="text-sm font-extrabold">{formatCurrency(changeDue)}</span>
                      </div>
                    )}
                  </>
                )}

                {method === "UPI" && (
                  <div className="space-y-2.5 rounded-xl bg-sky-50/80 p-3.5 ring-1 ring-sky-200">
                    <p className="text-xs text-sky-950 font-medium">
                      Display the restaurant QR code, wait for customer confirmation, then record payment.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onClick={() => setIsQrOpen(true)}
                    >
                      Show Restaurant UPI QR
                    </Button>
                    <Input
                      label="UPI Transaction Ref / UTR"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="e.g. 123456789012"
                      hint="Optional"
                    />
                  </div>
                )}

                {method === "CARD" && (
                  <Input
                    label="Card Transaction Slip Ref"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. TXN-9988"
                    hint="Optional"
                  />
                )}

                <Button fullWidth size="lg" onClick={() => void handlePay()} isLoading={isPaying}>
                  Record {PAYMENT_METHOD_LABELS[method]} Payment
                </Button>
              </div>
            )}
          </div>

          {/* Payments Taken History */}
          {summary.payments.length > 0 && (
            <div className="card p-5 space-y-3 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Payment History ({summary.payments.length})
              </h3>
              <ul className="space-y-2">
                {summary.payments.map((payment) => (
                  <li
                    key={payment._id}
                    className={[
                      "flex items-start justify-between gap-2 rounded-xl p-3 text-xs ring-1",
                      payment.isVoided
                        ? "bg-red-50/60 ring-red-200"
                        : "bg-slate-50 ring-slate-200/80",
                    ].join(" ")}
                  >
                    <div>
                      <p className={`font-bold text-sm ${payment.isVoided ? "text-slate-400 line-through" : "text-slate-900"}`}>
                        {PAYMENT_METHOD_LABELS[payment.method]}
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        By {payment.receivedByName} · {formatDateTime(payment.paidAt)}
                      </p>
                      {payment.reference && (
                        <p className="text-[11px] text-slate-400">Ref: {payment.reference}</p>
                      )}
                    </div>
                    <span className={`font-extrabold text-sm tabular-nums ${payment.isVoided ? "text-slate-400 line-through" : "text-slate-900"}`}>
                      {formatCurrency(payment.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Waiter Tip Box */}
          <div className="card p-5 space-y-3 shadow-sm">
            <div className="flex items-baseline justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 font-sans">
                  Staff Tip ({order.waiterName})
                </h3>
                <p className="text-[11px] text-slate-400">Direct gratuity for staff service</p>
              </div>
              <span className="font-extrabold text-amber-700 tabular-nums">
                {formatCurrency(tips?.totalTips ?? 0)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTipMethod("CASH");
                  setTipAmount("");
                  setIsTipOpen(true);
                }}
              >
                💵 Cash Tip
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void openWaiterQr()}>
                📱 Waiter QR
              </Button>
            </div>
          </div>

          {/* WhatsApp Share Button */}
          <div className="card p-4 text-center">
            <Button
              fullWidth
              size="lg"
              onClick={() => setIsShareOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-950/20 gap-2"
            >
              <span>💬</span>
              <span>Send Bill via WhatsApp</span>
            </Button>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Opens WhatsApp with preformatted digital invoice.
            </p>
          </div>

          {/* Close Order Box */}
          <div className="card p-5 space-y-3 shadow-sm">
            {readyToServe.length > 0 && (
              <div className="rounded-xl bg-emerald-50 p-3.5 ring-1 ring-emerald-200">
                <p className="text-xs font-bold text-emerald-900">
                  🔔 {readyToServe.length} item{readyToServe.length === 1 ? " is" : "s are"} ready but not marked served
                </p>
                <Button
                  fullWidth
                  size="sm"
                  variant="success"
                  className="mt-2.5"
                  isLoading={isServing}
                  onClick={() => void handleServeReady()}
                >
                  Mark All as Served
                </Button>
              </div>
            )}

            {stillCooking.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                <p className="text-xs font-bold text-amber-900">
                  Kitchen is still preparing {stillCooking.length} item{stillCooking.length === 1 ? "" : "s"}
                </p>
              </div>
            )}

            <Button
              fullWidth
              size="lg"
              variant={canClose ? "primary" : "secondary"}
              disabled={!canClose}
              isLoading={isClosing}
              onClick={() => void handleClose()}
              className="shadow-md"
            >
              <ArmchairIcon size={18} />
              <span>Close Order &amp; Free Table {order.tableNumber}</span>
            </Button>

            {!summary.isFullyPaid ? (
              <p className="text-center text-[11px] font-medium text-slate-500">
                ⚠️ Settle the full bill amount before closing the order.
              </p>
            ) : unservedItems.length > 0 ? (
              <p className="text-center text-[11px] font-medium text-slate-500">
                ⚠️ Deliver all prepared items to table before releasing.
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {/* WhatsApp Share Modal */}
      <WhatsAppShareModal
        isOpen={isShareOpen}
        initialPhone={order.customer.phone}
        defaultCountryCode={settings?.whatsappCountryCode ?? "91"}
        message={billMessage}
        onClose={() => setIsShareOpen(false)}
        onConfirm={handleShareOnWhatsApp}
      />

      {/* Split Payment Modal */}
      <SplitPaymentModal
        isOpen={isSplitOpen}
        grandTotal={summary.grandTotal}
        alreadyPaid={summary.amountPaid}
        amountDue={summary.amountDue}
        isSaving={isSplitSaving}
        onClose={() => setIsSplitOpen(false)}
        onConfirm={(entries) => void handleSplitConfirm(entries)}
      />

      {/* Tip Modal */}
      <Modal
        isOpen={isTipOpen}
        title="Record Staff Tip"
        onClose={() => setIsTipOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsTipOpen(false)} disabled={isSavingTip}>
              Cancel
            </Button>
            <Button onClick={() => void handleAddTip()} isLoading={isSavingTip}>
              Record Tip
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="info">
            Tip goes directly to {order.waiterName} and is tracked separately from food revenue.
          </Alert>

          <div className="grid grid-cols-2 gap-2">
            {(["CASH", "UPI"] as TipMethod[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTipMethod(option)}
                className={[
                  "rounded-xl px-3 py-2.5 text-xs font-bold transition",
                  tipMethod === option
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                ].join(" ")}
              >
                {TIP_METHOD_LABELS[option]}
              </button>
            ))}
          </div>

          <Input
            label="Tip Amount (₹)"
            type="number"
            min={0}
            step="0.01"
            value={tipAmount}
            onChange={(e) => setTipAmount(e.target.value)}
            placeholder="e.g. 100"
          />
          {tipMethod === "UPI" && (
            <Input
              label="UPI Ref / UTR"
              value={tipReference}
              onChange={(e) => setTipReference(e.target.value)}
              hint="Confirm UPI transfer received"
            />
          )}
        </div>
      </Modal>

      {/* Waiter Tip QR Modal */}
      <Modal
        isOpen={isWaiterQrOpen}
        title={`Staff Tip QR: ${waiterQr?.name ?? order.waiterName}`}
        onClose={() => setIsWaiterQrOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsWaiterQrOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setIsWaiterQrOpen(false);
                setTipMethod("UPI");
                setTipAmount("");
                setIsTipOpen(true);
              }}
            >
              Record Received Tip
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-center">
          {waiterQr?.tipQrImage ? (
            <img
              src={waiterQr.tipQrImage}
              alt={`Tip QR for ${waiterQr.name}`}
              className="mx-auto max-h-72 rounded-2xl ring-1 ring-slate-200 shadow-md"
            />
          ) : (
            <Alert tone="warning">
              {waiterQr?.name ?? "This waiter"} has not configured a personal tip QR in their profile yet.
            </Alert>
          )}
          {waiterQr?.tipUpiId && (
            <p className="text-xs text-slate-600 font-medium">
              UPI ID: <span className="font-bold text-slate-900">{waiterQr.tipUpiId}</span>
            </p>
          )}
        </div>
      </Modal>

      {/* Restaurant UPI QR Modal */}
      <Modal isOpen={isQrOpen} title="Restaurant UPI Payment QR" onClose={() => setIsQrOpen(false)}>
        <div className="space-y-4 text-center">
          {settings?.upiId ? (
            <div className="flex flex-col items-center justify-center">
              {/* Dynamic QR Code */}
              <div className="p-3 bg-white rounded-2xl ring-1 ring-slate-200 shadow-md">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
                    `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(
                      settings.restaurantName || "Spice Garden",
                    )}&am=${(Number(amount) || summary.amountDue).toFixed(2)}&cu=INR&tn=${encodeURIComponent(
                      `Invoice ${order.invoiceNumber || order.orderNumber}`,
                    )}`,
                  )}`}
                  alt="Dynamic UPI QR Code"
                  className="size-52 sm:size-60 mx-auto object-contain"
                />
              </div>

              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-3.5 py-1.5 rounded-full ring-1 ring-emerald-200 font-bold">
                <span>⚡ Auto-fills exact bill amount</span>
                <span className="tabular-nums font-extrabold">{formatCurrency(Number(amount) || summary.amountDue)}</span>
              </div>
            </div>
          ) : settings?.upiQrImage ? (
            <div className="p-2 bg-white rounded-2xl ring-1 ring-slate-200 shadow-md">
              <img
                src={resolveImageUrl(settings.upiQrImage) ?? settings.upiQrImage}
                alt="Restaurant UPI QR Standee"
                className="mx-auto max-h-72 rounded-xl object-contain"
              />
            </div>
          ) : (
            <Alert tone="warning">
              No Restaurant UPI ID or QR code configured. Please configure your UPI VPA in <strong>Admin → Settings</strong>.
            </Alert>
          )}

          {settings?.upiId && (
            <div className="flex items-center justify-between gap-2 text-xs bg-slate-50 py-2 px-3.5 rounded-xl ring-1 ring-slate-200 text-left">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">UPI ID (VPA)</p>
                <p className="font-mono font-bold text-slate-900 select-all">{settings.upiId}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (settings.upiId) {
                    void navigator.clipboard.writeText(settings.upiId);
                    toast.success("UPI ID copied to clipboard!");
                  }
                }}
                className="pressable rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
              >
                Copy
              </button>
            </div>
          )}

          <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Payable Balance:</span>
            <span className="text-lg font-black text-slate-900 tabular-nums">
              {formatCurrency(Number(amount) || summary.amountDue)}
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
