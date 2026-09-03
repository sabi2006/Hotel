import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { CreditCardIcon, HandCoinsIcon, ReceiptIcon, SearchIcon } from "@/components/Icons";
import { Input, Select } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { getErrorMessage } from "@/services/api";
import { paymentsService } from "@/services/billing";
import { PAYMENT_METHOD_LABELS } from "@/types";
import type { Payment, PaymentMethod } from "@/types";
import { formatCurrency, formatDateTime } from "@/utils/format";

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [methodFilter, setMethodFilter] = useState<"" | PaymentMethod>("");
  const [includeVoided, setIncludeVoided] = useState(false);
  const [search, setSearch] = useState("");

  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await paymentsService.list({
        method: methodFilter || undefined,
        includeVoided,
        pageSize: 200,
      });
      setPayments(page.items);
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load payments"));
    } finally {
      setIsLoading(false);
    }
  }, [methodFilter, includeVoided]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function handleVoid() {
    if (!voidTarget || voidReason.trim().length < 3) {
      setError("Please provide a void reason of at least 3 characters");
      return;
    }
    setIsVoiding(true);
    try {
      await paymentsService.void(voidTarget._id, voidReason.trim());
      setNotice(`Payment of ${formatCurrency(voidTarget.amount)} was voided.`);
      setVoidTarget(null);
      setVoidReason("");
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not void that payment"));
      setVoidTarget(null);
    } finally {
      setIsVoiding(false);
    }
  }

  const query = search.trim().toLowerCase();
  const visible = query
    ? payments.filter(
        (payment) =>
          payment.invoiceNumber.toLowerCase().includes(query) ||
          payment.tableNumber.toLowerCase().includes(query) ||
          (payment.reference ?? "").toLowerCase().includes(query),
      )
    : payments;

  const live = visible.filter((payment) => !payment.isVoided);
  const totalBy = (method: PaymentMethod) =>
    live.filter((p) => p.method === method).reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">
          Payment Transactions
        </h1>
        <p className="mt-0.5 text-xs font-medium text-slate-500">
          Audit trail of all tenders collected across Cash, UPI, and Card.
        </p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {/* Summary Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Collected"
          value={formatCurrency(live.reduce((sum, p) => sum + p.amount, 0))}
          tone="brand"
          icon={<ReceiptIcon size={20} className="text-brand-600" />}
          hint={`${live.length} valid transactions`}
        />
        <StatCard
          label="Cash Tenders"
          value={formatCurrency(totalBy("CASH"))}
          tone="emerald"
          icon={<HandCoinsIcon size={20} className="text-emerald-600" />}
        />
        <StatCard
          label="UPI Digital"
          value={formatCurrency(totalBy("UPI"))}
          tone="sky"
          icon={<CreditCardIcon size={20} className="text-sky-600" />}
        />
        <StatCard
          label="Card POS"
          value={formatCurrency(totalBy("CARD"))}
          tone="amber"
          icon={<CreditCardIcon size={20} className="text-amber-600" />}
        />
      </div>

      {/* Filters Bar */}
      <div className="card p-4 flex flex-wrap gap-4 items-end shadow-2xs">
        <div className="min-w-60 flex-1">
          <Input
            label="Search Transactions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice, table, or transaction reference..."
          />
        </div>
        <div className="min-w-44">
          <Select
            label="Payment Method"
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as "" | PaymentMethod)}
          >
            <option value="">All Methods</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-xs font-bold text-slate-700 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={includeVoided}
            onChange={(e) => setIncludeVoided(e.target.checked)}
            className="size-4 rounded-md border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          <span>Show Voided Payments</span>
        </label>
      </div>

      {isLoading ? (
        <Spinner label="Loading payment records" />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No transactions found"
          description="Payments recorded on waiter billing screens will appear here."
          icon={<CreditCardIcon size={28} />}
        />
      ) : (
        <div className="card overflow-hidden shadow-xs bg-white border border-[#EBE7DF]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#F0EBE1] text-xs sm:text-sm select-none">
              <thead className="bg-[#FAF8F5] text-left text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                <tr>
                  <th className="px-5 py-3.5">Invoice &amp; Ref</th>
                  <th className="px-5 py-3.5">Table</th>
                  <th className="px-5 py-3.5">Method</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                  <th className="px-5 py-3.5">Collected By</th>
                  <th className="px-5 py-3.5">Date &amp; Time</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1] bg-white">
                {visible.map((payment) => (
                  <tr
                    key={payment._id}
                    className={payment.isVoided ? "bg-red-50/40 text-[#8E908C]" : "hover:bg-[#FAF8F5] transition-colors"}
                  >
                    <td className="px-5 py-3.5">
                      <div className={`font-bold ${payment.isVoided ? "line-through text-[#8E908C]" : "text-[#1F2220]"}`}>
                        {payment.invoiceNumber}
                      </div>
                      {payment.reference && (
                        <div className="text-xs text-[#6F716D] font-medium">Ref: {payment.reference}</div>
                      )}
                      {payment.isVoided && (
                        <div className="text-[11px] font-bold text-[#C24138] mt-0.5">
                          Voided by {payment.voidedByName}: {payment.voidReason}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-[#424541]">Table {payment.tableNumber}</td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-lg bg-[#FAF8F5] px-2.5 py-1 text-xs font-bold text-[#5F615D] ring-1 ring-[#E8E3D8]">
                        {PAYMENT_METHOD_LABELS[payment.method]}
                      </span>
                    </td>
                    <td className={`px-5 py-3.5 text-right font-extrabold tabular-nums text-sm ${payment.isVoided ? "line-through text-[#8E908C]" : "text-[#1F2220]"}`}>
                      {formatCurrency(payment.amount)}
                      {payment.changeGiven ? (
                        <span className="block text-[11px] font-medium text-[#8E908C]">
                          change {formatCurrency(payment.changeGiven)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-[#5F615D]">{payment.receivedByName}</td>
                    <td className="px-5 py-3.5 text-[#8E908C] font-medium">{formatDateTime(payment.paidAt)}</td>
                    <td className="px-5 py-3.5 text-right">
                      {!payment.isVoided && (
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => {
                            setVoidReason("");
                            setVoidTarget(payment);
                          }}
                        >
                          Void
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Void Modal */}
      <Modal
        isOpen={voidTarget !== null}
        title="Void Payment Transaction"
        onClose={() => setVoidTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setVoidTarget(null)} disabled={isVoiding}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleVoid()} isLoading={isVoiding}>
              Confirm Void
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Voiding payment of <strong>{formatCurrency(voidTarget?.amount ?? 0)}</strong> on {voidTarget?.invoiceNumber} will restore this balance onto the order bill. The audit entry is preserved permanently.
          </p>
          <Input
            label="Reason for Voiding"
            required
            minLength={3}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="e.g. Card transaction charged to incorrect table"
          />
        </div>
      </Modal>
    </div>
  );
}
