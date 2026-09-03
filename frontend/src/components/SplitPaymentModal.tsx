import { useMemo, useState } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { PAYMENT_METHOD_LABELS } from "@/types";
import type { PaymentMethod } from "@/types";
import { formatCurrency } from "@/utils/format";
import { parseAmountToPaise, sumPaise, toPaise, toRupees } from "@/utils/money";

const METHODS: PaymentMethod[] = ["CASH", "UPI", "CARD"];

interface Row {
  /** Stable across re-renders so an input keeps focus while it is typed into. */
  key: string;
  method: PaymentMethod;
  amount: string;
  reference: string;
}

export interface SplitEntry {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

function newRow(method: PaymentMethod, amountPaise: number): Row {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method,
    amount: amountPaise > 0 ? String(toRupees(amountPaise)) : "",
    reference: "",
  };
}

interface SplitProps {
  isOpen: boolean;
  grandTotal: number;
  alreadyPaid: number;
  amountDue: number;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: (entries: SplitEntry[]) => void;
}

/**
 * Mounts the form only while it is open.
 *
 * That is what lets the rows below initialise straight from the balance owed,
 * rather than being reset by an effect watching `isOpen` - so reopening after
 * a part payment always starts from the amount that is actually still due.
 */
export function SplitPaymentModal(props: SplitProps) {
  if (!props.isOpen) return null;
  return <SplitPaymentForm {...props} />;
}

function SplitPaymentForm({
  isOpen,
  grandTotal,
  alreadyPaid,
  amountDue,
  isSaving,
  onClose,
  onConfirm,
}: SplitProps) {
  const duePaise = toPaise(amountDue);
  const [rows, setRows] = useState<Row[]>(() => [newRow("UPI", duePaise)]);

  const enteredPaise = useMemo(
    () => sumPaise(rows.map((row) => parseAmountToPaise(row.amount))),
    [rows],
  );

  const remainingPaise = duePaise - enteredPaise;
  const isOver = remainingPaise < 0;
  const settlesBill = remainingPaise === 0 && enteredPaise > 0;
  const canConfirm = enteredPaise > 0 && !isOver && !isSaving;

  function update(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    // Prefill whatever is still outstanding, so the common two-way split is
    // one tap rather than a second amount to type.
    setRows((current) => [...current, newRow("CASH", Math.max(0, remainingPaise))]);
  }

  function handleConfirm() {
    onConfirm(
      rows
        .filter((row) => parseAmountToPaise(row.amount) > 0)
        .map((row) => ({
          method: row.method,
          amount: toRupees(parseAmountToPaise(row.amount)),
          reference: row.reference.trim() || undefined,
        })),
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      size="lg"
      title="Split this bill"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} isLoading={isSaving} disabled={!canConfirm}>
            {settlesBill
              ? `Settle ${formatCurrency(toRupees(enteredPaise))}`
              : `Record ${formatCurrency(toRupees(enteredPaise))}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* The three numbers a waiter needs, in the order they think about them. */}
        <div className="grid grid-cols-3 divide-x divide-[#F0EBE1] overflow-hidden rounded-xl bg-[#FAF8F5] ring-1 ring-[#E8E3D8]">
          {[
            { label: "Bill total", value: grandTotal, tone: "text-[#1F2220]" },
            {
              label: alreadyPaid > 0 ? "Paid so far" : "Entering now",
              value: alreadyPaid > 0 ? alreadyPaid : toRupees(enteredPaise),
              tone: "text-[#1F2220]",
            },
            {
              label: "Remaining",
              value: toRupees(Math.max(0, remainingPaise)),
              tone: isOver ? "text-[#C24138]" : settlesBill ? "text-[#276B49]" : "text-[#9E6523]",
            },
          ].map((cell) => (
            <div key={cell.label} className="px-3 py-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8E908C]">
                {cell.label}
              </p>
              <p className={`mt-1 text-lg font-black tabular-nums font-sans ${cell.tone}`}>
                {formatCurrency(cell.value)}
              </p>
            </div>
          ))}
        </div>

        {isOver && (
          <Alert tone="error">
            Payment exceeds the balance by{" "}
            <strong>{formatCurrency(toRupees(-remainingPaise))}</strong>. Reduce an amount, or
            record the extra as a tip instead.
          </Alert>
        )}

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.key} className="rounded-xl bg-white p-3 ring-1 ring-[#E8E3D8]">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-[#8E908C]">
                  Payment {index + 1}
                </span>
                {rows.length > 1 && (
                  <button
                    onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                    className="pressable rounded-md px-2 py-1 text-xs font-bold text-[#C24138] hover:bg-red-50"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                {/* Buttons rather than a dropdown: one tap, not two. */}
                <div className="flex gap-1.5 w-full sm:w-auto">
                  {METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => update(row.key, { method })}
                      className={[
                        "pressable flex-1 sm:flex-initial sm:min-w-16 rounded-lg px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-bold transition text-center",
                        row.method === method
                          ? "bg-[#202322] text-white shadow-sm shadow-charcoal-950/20"
                          : "bg-[#FAF8F5] text-[#5F615D] hover:bg-[#F3ECE0] hover:text-[#1F2220] ring-1 ring-[#E8E3D8]",
                      ].join(" ")}
                    >
                      {PAYMENT_METHOD_LABELS[method]}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[#8E908C]">
                    ₹
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={row.amount}
                    onChange={(event) => update(row.key, { amount: event.target.value })}
                    aria-label={`Payment ${index + 1} amount`}
                    className="block w-full rounded-lg border-0 bg-white py-2 pl-7 pr-3 text-right text-lg font-semibold tabular-nums text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
                  />
                </div>
              </div>

              {row.method !== "CASH" && (
                <input
                  value={row.reference}
                  onChange={(event) => update(row.key, { reference: event.target.value })}
                  placeholder={
                    row.method === "UPI"
                      ? "UPI reference (optional)"
                      : "Card reference (optional)"
                  }
                  aria-label={`Payment ${index + 1} reference`}
                  className="mt-2 block w-full rounded-lg border-0 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
                />
              )}
            </div>
          ))}
        </div>

        <Button variant="secondary" fullWidth onClick={addRow} disabled={remainingPaise <= 0}>
          + Add another payment
          {remainingPaise > 0 ? ` (${formatCurrency(toRupees(remainingPaise))} left)` : ""}
        </Button>

        {!settlesBill && !isOver && enteredPaise > 0 && (
          <Alert tone="warning">
            This leaves <strong>{formatCurrency(toRupees(remainingPaise))}</strong> outstanding.
            The table stays occupied and the balance can be collected later.
          </Alert>
        )}
      </div>
    </Modal>
  );
}
