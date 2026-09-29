import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { CreditCardIcon, HandCoinsIcon } from "@/components/Icons";
import { Input, Select } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { getErrorMessage } from "@/services/api";
import { tipsService } from "@/services/tips";
import { usersService } from "@/services/users";
import { TIP_METHOD_LABELS, UserRole } from "@/types";
import type { Tip, User } from "@/types";
import { formatCurrency, formatDateTime } from "@/utils/format";

export default function TipsPage() {
  const [tips, setTips] = useState<Tip[]>([]);
  const [waiters, setWaiters] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [waiterFilter, setWaiterFilter] = useState("");
  const [includeVoided, setIncludeVoided] = useState(false);

  const [voidTarget, setVoidTarget] = useState<Tip | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);

  useEffect(() => {
    usersService
      .list({ role: UserRole.WAITER, pageSize: 100 })
      .then((page) => setWaiters(page.items))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      const page = await tipsService.list({
        waiterId: waiterFilter || undefined,
        includeVoided,
        pageSize: 200,
      });
      setTips(page.items);
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load tips"));
    } finally {
      setIsLoading(false);
    }
  }, [waiterFilter, includeVoided]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function handleVoid() {
    if (!voidTarget || voidReason.trim().length < 3) {
      setError("Provide a reason of at least 3 characters");
      return;
    }
    setIsVoiding(true);
    try {
      await tipsService.void(voidTarget._id, voidReason.trim());
      setNotice(`Tip of ${formatCurrency(voidTarget.amount)} voided.`);
      setVoidTarget(null);
      setVoidReason("");
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not void that tip"));
      setVoidTarget(null);
    } finally {
      setIsVoiding(false);
    }
  }

  const live = tips.filter((tip) => !tip.isVoided);
  const total = live.reduce((sum, tip) => sum + tip.amount, 0);
  const cashTotal = live
    .filter((tip) => tip.method === "CASH")
    .reduce((sum, tip) => sum + tip.amount, 0);

  const byWaiter = Object.entries(
    live.reduce<Record<string, number>>((totals, tip) => {
      totals[tip.waiterName] = (totals[tip.waiterName] ?? 0) + tip.amount;
      return totals;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink font-sans">
          Staff Tips &amp; Gratuity
        </h1>
        <p className="mt-0.5 text-xs font-medium text-muted">
          Direct staff rewards tracked separately from restaurant food revenue.
        </p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Staff Tips"
          value={formatCurrency(total)}
          tone="amber"
          icon={<HandCoinsIcon size={20} className="text-warning" />}
          hint={`${live.length} tip contributions`}
        />
        <StatCard
          label="Cash Tips"
          value={formatCurrency(cashTotal)}
          tone="emerald"
          icon={<HandCoinsIcon size={20} className="text-success" />}
        />
        <StatCard
          label="Digital UPI Tips"
          value={formatCurrency(total - cashTotal)}
          tone="sky"
          icon={<CreditCardIcon size={20} className="text-info" />}
        />
      </div>

      {/* Leaderboard per Waiter */}
      {byWaiter.length > 0 && (
        <section className="card p-5 space-y-3 shadow-xs bg-white border border-line">
          <h2 className="text-xs font-bold uppercase tracking-wider text-subtle font-sans">
            Tips Distribution by Waiter
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {byWaiter.map(([name, amount]) => (
              <div
                key={name}
                className="flex items-center justify-between p-3.5 rounded-xl bg-warning-soft ring-1 ring-warning-line"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-surface-soft font-bold text-warning text-xs ring-1 ring-warning-line"><HandCoinsIcon size={20} /></span>
                  <span className="text-xs font-bold text-ink">{name}</span>
                </div>
                <span className="text-sm font-extrabold text-warning tabular-nums font-sans">
                  {formatCurrency(amount)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filter Controls */}
      <div className="card p-4 flex flex-wrap gap-4 items-end shadow-2xs bg-white border border-line">
        <div className="min-w-56">
          <Select
            label="Filter by Waiter"
            value={waiterFilter}
            onChange={(e) => setWaiterFilter(e.target.value)}
          >
            <option value="">All Waiters</option>
            {waiters.map((waiter) => (
              <option key={waiter._id} value={waiter._id}>
                {waiter.name}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-xs font-bold text-muted select-none cursor-pointer">
          <input
            type="checkbox"
            checked={includeVoided}
            onChange={(e) => setIncludeVoided(e.target.checked)}
            className="size-4 rounded-md border-line text-brand-700 focus:ring-brand-700"
          />
          <span>Show Voided Tips</span>
        </label>
      </div>

      {isLoading ? (
        <Spinner label="Loading tip records" />
      ) : tips.length === 0 ? (
        <EmptyState
          title="No tips recorded"
          description="Tips added by waiters on the billing screen will appear here."
          icon={<HandCoinsIcon size={28} />}
        />
      ) : (
        <div className="card overflow-hidden shadow-xs bg-white border border-line">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-sunken text-xs sm:text-sm select-none">
              <thead className="bg-surface-soft text-left text-[11px] font-bold uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-5 py-3.5">Staff Recipient</th>
                  <th className="px-5 py-3.5">Invoice &amp; Table</th>
                  <th className="px-5 py-3.5">Tip Method</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                  <th className="px-5 py-3.5">Date &amp; Time</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-sunken bg-white">
                {tips.map((tip) => (
                  <tr key={tip._id} className={tip.isVoided ? "bg-danger-soft/40" : "hover:bg-surface-soft transition-colors"}>
                    <td className="px-5 py-3.5">
                      <div className={`font-bold ${tip.isVoided ? "line-through text-subtle" : "text-ink"}`}>
                        {tip.waiterName}
                      </div>
                      {tip.isVoided && (
                        <div className="text-[11px] font-bold text-danger">
                          Voided by {tip.voidedByName}: {tip.voidReason}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-bold text-ink-soft">{tip.invoiceNumber}</span>
                      <span className="block text-[11px] text-subtle">Table {tip.tableNumber}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-lg bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning ring-1 ring-warning-line">
                        {TIP_METHOD_LABELS[tip.method]}
                      </span>
                    </td>
                    <td className={`px-5 py-3.5 text-right font-extrabold tabular-nums text-sm ${tip.isVoided ? "line-through text-subtle" : "text-ink"}`}>
                      {formatCurrency(tip.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-subtle font-medium">{formatDateTime(tip.createdAt)}</td>
                    <td className="px-5 py-3.5 text-right">
                      {!tip.isVoided && (
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => {
                            setVoidReason("");
                            setVoidTarget(tip);
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

      {/* Void Tip Modal */}
      <Modal
        isOpen={voidTarget !== null}
        title="Void Staff Tip"
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
          <p className="text-xs text-muted leading-relaxed">
            Voiding tip of <strong>{formatCurrency(voidTarget?.amount ?? 0)}</strong> recorded for {voidTarget?.waiterName} will adjust their tip earnings. The record is permanently kept for audit compliance.
          </p>
          <Input
            label="Reason for Voiding"
            required
            minLength={3}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="e.g. Duplicate entry recorded"
          />
        </div>
      </Modal>
    </div>
  );
}
