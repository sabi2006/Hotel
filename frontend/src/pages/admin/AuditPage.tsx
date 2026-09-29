import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { SearchIcon, ShieldCheckIcon } from "@/components/Icons";
import { Input, Select } from "@/components/Input";
import { Spinner } from "@/components/Spinner";
import { getErrorMessage } from "@/services/api";
import { auditService } from "@/services/audit";
import type { AuditLog } from "@/services/audit";
import { AUDIT_ACTION_LABELS } from "@/services/audit";
import { formatDateTime } from "@/utils/format";

const ACTION_CLASSES: Record<string, string> = {
  PAYMENT_ADDED: "bg-success-soft text-success-strong ring-success-line",
  PAYMENT_VOIDED: "bg-danger-soft text-danger-strong ring-danger-line",
  PAYMENT_EDITED: "bg-warning-soft text-warning-strong ring-warning-line",
  TIP_ADDED: "bg-warning-soft text-warning-strong ring-warning-line",
  TIP_VOIDED: "bg-danger-soft text-danger-strong ring-danger-line",
  ORDER_CANCELLED: "bg-danger-soft text-danger-strong ring-danger-line",
  ORDER_CLOSED: "bg-surface-sunken text-ink-soft ring-line",
  ORDER_CREATED: "bg-info-soft text-info-strong ring-info-line",
  ORDER_ITEM_DELETED: "bg-warning-soft text-warning-strong ring-warning-line",
  PRODUCT_PRICE_CHANGED: "bg-violet-50 text-violet-800 ring-violet-200",
  USER_CREATED: "bg-info-soft text-info-strong ring-info-line",
  USER_DISABLED: "bg-danger-soft text-danger-strong ring-danger-line",
  USER_PASSWORD_RESET: "bg-warning-soft text-warning-strong ring-warning-line",
};

function ValueList({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  if (!value || Object.keys(value).length === 0) return null;
  return (
    <div className="bg-surface-soft p-2 rounded-lg ring-1 ring-line/60">
      <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</span>
      <ul className="mt-0.5 space-y-0.5">
        {Object.entries(value).map(([key, entry]) => (
          <li key={key} className="text-xs text-muted">
            <span className="font-semibold text-muted">{key}:</span>{" "}
            <span className="font-bold text-ink">{String(entry)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");

  const pageSize = 50;

  const load = useCallback(async () => {
    try {
      const result = await auditService.list({
        action: action || undefined,
        entityType: entityType || undefined,
        search: search.trim() || undefined,
        page,
        pageSize,
      });
      setEntries(result.items);
      setTotal(result.total);
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load the audit trail"));
    } finally {
      setIsLoading(false);
    }
  }, [action, entityType, search, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  function applyFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6 select-none">
      <header>
        <div className="flex items-center gap-2">
          <ShieldCheckIcon size={24} className="text-brand-600" />
          <h1 className="text-2xl font-extrabold tracking-tight text-ink font-sans">
            Compliance &amp; Security Audit Logs
          </h1>
        </div>
        <p className="mt-0.5 text-xs font-medium text-muted">
          Append-only immutable record of all financial events, cancellations, voids, and staff operations.
        </p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      {/* Filter Controls */}
      <div className="card p-4 flex flex-wrap gap-4 items-end shadow-2xs">
        <div className="min-w-60 flex-1">
          <Input
            label="Search Audit Events"
            value={search}
            onChange={(e) => applyFilter(setSearch, e.target.value)}
            placeholder="Search invoice number, entity ID, or staff name..."
          />
        </div>
        <div className="min-w-52">
          <Select
            label="Action Type"
            value={action}
            onChange={(e) => applyFilter(setAction, e.target.value)}
          >
            <option value="">All Action Types</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-40">
          <Select
            label="Entity Type"
            value={entityType}
            onChange={(e) => applyFilter(setEntityType, e.target.value)}
          >
            <option value="">All Entities</option>
            <option value="order">Order</option>
            <option value="payment">Payment</option>
            <option value="tip">Tip</option>
            <option value="product">Product</option>
            <option value="user">User</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Spinner label="Loading immutable audit trail" />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No audit entries found"
          description="Operational and financial events will be recorded here automatically."
          icon={<ShieldCheckIcon size={28} />}
        />
      ) : (
        <>
          <div className="card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-sunken text-xs sm:text-sm">
                <thead className="bg-surface-soft/80 text-left text-[11px] font-bold uppercase tracking-wider text-subtle">
                  <tr>
                    <th className="px-5 py-3.5">Timestamp</th>
                    <th className="px-5 py-3.5">Action</th>
                    <th className="px-5 py-3.5">Target Entity</th>
                    <th className="px-5 py-3.5">Actor</th>
                    <th className="px-5 py-3.5">Change Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-sunken bg-white">
                  {entries.map((entry) => (
                    <tr key={entry._id} className="align-top hover:bg-surface-soft/80 transition-colors">
                      <td className="whitespace-nowrap px-5 py-3.5 font-medium text-muted text-xs">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${
                            ACTION_CLASSES[entry.action] ?? "bg-surface-sunken text-ink-soft ring-line"
                          }`}
                        >
                          {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-ink">
                          {entry.entityLabel ?? entry.entityId ?? "—"}
                        </div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{entry.entityType}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-ink">{entry.userName}</div>
                        {entry.userRole && (
                          <div className="text-xs text-subtle font-medium">{entry.userRole}</div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="space-y-1.5 min-w-56">
                          <ValueList label="Previous State" value={entry.oldValue} />
                          <ValueList label="Updated State" value={entry.newValue} />
                          {entry.note && (
                            <p className="text-xs italic text-warning-strong bg-warning-soft p-1.5 rounded-md font-medium">
                              Note: {entry.note}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-semibold text-muted px-1">
            <span>
              Showing {total} record{total === 1 ? "" : "s"} · Page {page} of {lastPage}
            </span>
            <div className="flex gap-2">
              <Button
                size="xs"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                ← Previous
              </Button>
              <Button
                size="xs"
                variant="secondary"
                disabled={page >= lastPage}
                onClick={() => setPage((current) => current + 1)}
              >
                Next →
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
