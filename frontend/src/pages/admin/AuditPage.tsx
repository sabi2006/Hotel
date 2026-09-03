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
  PAYMENT_ADDED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  PAYMENT_VOIDED: "bg-red-50 text-red-800 ring-red-200",
  PAYMENT_EDITED: "bg-amber-50 text-amber-800 ring-amber-200",
  TIP_ADDED: "bg-amber-50 text-amber-800 ring-amber-200",
  TIP_VOIDED: "bg-red-50 text-red-800 ring-red-200",
  ORDER_CANCELLED: "bg-red-50 text-red-800 ring-red-200",
  ORDER_CLOSED: "bg-slate-100 text-slate-700 ring-slate-200",
  ORDER_CREATED: "bg-sky-50 text-sky-800 ring-sky-200",
  ORDER_ITEM_DELETED: "bg-orange-50 text-orange-800 ring-orange-200",
  PRODUCT_PRICE_CHANGED: "bg-violet-50 text-violet-800 ring-violet-200",
  USER_CREATED: "bg-sky-50 text-sky-800 ring-sky-200",
  USER_DISABLED: "bg-red-50 text-red-800 ring-red-200",
  USER_PASSWORD_RESET: "bg-amber-50 text-amber-800 ring-amber-200",
};

function ValueList({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  if (!value || Object.keys(value).length === 0) return null;
  return (
    <div className="bg-slate-50 p-2 rounded-lg ring-1 ring-slate-200/60">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <ul className="mt-0.5 space-y-0.5">
        {Object.entries(value).map(([key, entry]) => (
          <li key={key} className="text-xs text-slate-600">
            <span className="font-semibold text-slate-500">{key}:</span>{" "}
            <span className="font-bold text-slate-900">{String(entry)}</span>
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
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">
            Compliance &amp; Security Audit Logs
          </h1>
        </div>
        <p className="mt-0.5 text-xs font-medium text-slate-500">
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
              <table className="min-w-full divide-y divide-slate-100 text-xs sm:text-sm">
                <thead className="bg-slate-50/80 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-5 py-3.5">Timestamp</th>
                    <th className="px-5 py-3.5">Action</th>
                    <th className="px-5 py-3.5">Target Entity</th>
                    <th className="px-5 py-3.5">Actor</th>
                    <th className="px-5 py-3.5">Change Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {entries.map((entry) => (
                    <tr key={entry._id} className="align-top hover:bg-slate-50/80 transition-colors">
                      <td className="whitespace-nowrap px-5 py-3.5 font-medium text-slate-500 text-xs">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${
                            ACTION_CLASSES[entry.action] ?? "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">
                          {entry.entityLabel ?? entry.entityId ?? "—"}
                        </div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{entry.entityType}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800">{entry.userName}</div>
                        {entry.userRole && (
                          <div className="text-xs text-slate-400 font-medium">{entry.userRole}</div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="space-y-1.5 min-w-56">
                          <ValueList label="Previous State" value={entry.oldValue} />
                          <ValueList label="Updated State" value={entry.newValue} />
                          {entry.note && (
                            <p className="text-xs italic text-amber-800 bg-amber-50 p-1.5 rounded-md font-medium">
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

          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 px-1">
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
