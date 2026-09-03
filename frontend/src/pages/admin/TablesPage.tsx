import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ArmchairIcon, PlusIcon } from "@/components/Icons";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { getErrorMessage } from "@/services/api";
import { tablesService } from "@/services/catalog";
import type { TablePayload } from "@/services/catalog";
import type { RestaurantTable } from "@/types";

const EMPTY_FORM: TablePayload = { tableNumber: "", capacity: 4, isActive: true };

export default function TablesPage() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [form, setForm] = useState<TablePayload>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<RestaurantTable | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setTables(await tablesService.list());
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load tables"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setIsModalOpen(true);
  }

  function openEdit(table: RestaurantTable) {
    setEditing(table);
    setForm({
      tableNumber: table.tableNumber,
      capacity: table.capacity,
      isActive: table.isActive,
    });
    setError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const payload: TablePayload = { ...form, tableNumber: form.tableNumber.trim() };

    try {
      if (editing) {
        await tablesService.update(editing._id, payload);
        setNotice(`Table ${payload.tableNumber} updated.`);
      } else {
        await tablesService.create(payload);
        setNotice(`Table ${payload.tableNumber} created.`);
      }
      setIsModalOpen(false);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not save the table"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await tablesService.remove(pendingDelete._id);
      setNotice(`Table ${pendingDelete.tableNumber} deleted.`);
      setPendingDelete(null);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not delete the table"));
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  const freeCount = tables.filter((table) => table.status === "FREE").length;
  const occupiedCount = tables.filter((table) => table.status === "OCCUPIED").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">
            Dining Tables
          </h1>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Configure floor capacity, table numbering, and service status.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <PlusIcon size={16} />
          <span>Add Table</span>
        </Button>
      </header>

      {error && !isModalOpen && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Tables"
          value={tables.length}
          icon={<ArmchairIcon size={20} className="text-slate-600" />}
          hint="Dining room configuration"
        />
        <StatCard
          label="Free & Ready"
          value={freeCount}
          tone="emerald"
          icon={<ArmchairIcon size={20} className="text-emerald-600" />}
          hint="Available for guests"
        />
        <StatCard
          label="Occupied Tables"
          value={occupiedCount}
          tone="amber"
          icon={<ArmchairIcon size={20} className="text-amber-600" />}
          hint="Active party seated"
        />
      </div>

      {isLoading ? (
        <Spinner label="Loading tables" />
      ) : tables.length === 0 ? (
        <EmptyState
          title="No tables configured"
          description="Add the dining tables on your floor so waiters can start seating guests and opening tickets."
          icon={<ArmchairIcon size={28} />}
          action={<Button onClick={openCreate}>Create First Table</Button>}
        />
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 select-none">
          {tables.map((table) => {
            const isOccupied = table.status === "OCCUPIED";
            return (
              <div
                key={table._id}
                className={[
                  "card-interactive flex flex-col justify-between p-4.5 ring-1 relative overflow-hidden bg-white border border-[#EBE7DF]",
                  !table.isActive
                    ? "bg-[#FAF8F5] ring-[#E8E3D8] opacity-60"
                    : isOccupied
                      ? "bg-gradient-to-br from-[#FEF7EE]/60 to-white ring-[#FADFB8]"
                      : "bg-white ring-[#E8E3D8] hover:ring-brand-400",
                ].join(" ")}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#8E908C]">
                        Table
                      </span>
                      <p className="text-2xl font-extrabold text-[#1F2220] font-sans leading-none mt-0.5">
                        {table.tableNumber}
                      </p>
                    </div>

                    <span
                      className={[
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1",
                        isOccupied
                          ? "bg-[#FEF7EE] text-[#9E6523] ring-[#FADFB8]"
                          : "bg-[#EBF5EE] text-[#276B49] ring-[#BCE2CD]",
                      ].join(" ")}
                    >
                      <span className={`size-1.5 rounded-full ${isOccupied ? "bg-[#9E6523]" : "bg-[#276B49]"}`} />
                      {table.status}
                    </span>
                  </div>

                  <p className="mt-2 text-xs font-semibold text-[#6F716D]">
                    Capacity: <span className="text-[#1F2220] font-bold">{table.capacity} Guests</span>
                  </p>
                  {!table.isActive && (
                    <p className="mt-1 text-[11px] font-bold text-[#C24138]">Out of Service</p>
                  )}
                </div>

                <div className="mt-5 flex gap-2 pt-3 border-t border-[#F0EBE1]">
                  <Button
                    size="xs"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => openEdit(table)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    variant="danger"
                    onClick={() => setPendingDelete(table)}
                    disabled={isOccupied}
                    title={isOccupied ? "Close active order before deleting" : undefined}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Table Modal */}
      <Modal
        isOpen={isModalOpen}
        title={editing ? `Edit Table ${editing.tableNumber}` : "New Dining Table"}
        onClose={() => setIsModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button form="table-form" type="submit" isLoading={isSaving}>
              {editing ? "Save Changes" : "Create Table"}
            </Button>
          </>
        }
      >
        <form id="table-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}

          <Input
            label="Table Number / Name"
            required
            value={form.tableNumber}
            onChange={(e) => setForm({ ...form, tableNumber: e.target.value })}
            placeholder="e.g. 1 or A1"
            hint="Numbers sort naturally on waiter screens"
          />
          <Input
            label="Guest Capacity"
            type="number"
            min={1}
            max={50}
            required
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            placeholder="4"
            hint="Number of guest seats"
          />
          <label className="flex items-center gap-3 text-xs font-bold text-slate-700 select-none cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={form.isActive ?? true}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="size-4 rounded-md border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            <span>Active in Service for Seating</span>
          </label>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete Dining Table"
        message={
          pendingDelete
            ? `Delete Table ${pendingDelete.tableNumber}? This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete Table"
        isBusy={isDeleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
