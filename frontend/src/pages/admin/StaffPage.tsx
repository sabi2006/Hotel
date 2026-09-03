import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { EditIcon, PlusIcon, SearchIcon, UsersIcon } from "@/components/Icons";
import { Input, Select } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { getErrorMessage } from "@/services/api";
import { usersService } from "@/services/users";
import type { CreateUserPayload } from "@/services/users";
import type { User, UserRole } from "@/types";
import { formatDateTime, humanizeEnum, initialsOf } from "@/utils/format";

const EMPTY_FORM: CreateUserPayload = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "WAITER",
};

interface EditFormState {
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  newPassword: string;
}

const EMPTY_EDIT_FORM: EditFormState = {
  name: "",
  email: "",
  phone: "",
  role: "WAITER",
  isActive: true,
  newPassword: "",
};

const ROLE_BADGE_STYLES: Record<string, string> = {
  ADMIN: "bg-purple-50 text-purple-700 ring-purple-200",
  WAITER: "bg-brand-50 text-brand-700 ring-brand-200",
  KITCHEN: "bg-amber-50 text-amber-700 ring-amber-200",
};

export default function StaffPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | UserRole>("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<CreateUserPayload>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_EDIT_FORM);
  const [isUpdating, setIsUpdating] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const page = await usersService.list({
        search: search.trim() || undefined,
        role: roleFilter || undefined,
        pageSize: 100,
      });
      setUsers(page.items);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load staff"));
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  function openEditModal(staff: User) {
    setEditingStaff(staff);
    setEditForm({
      name: staff.name,
      email: staff.email,
      phone: staff.phone ?? "",
      role: staff.role,
      isActive: staff.isActive,
      newPassword: "",
    });
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await usersService.create({ ...form, phone: form.phone?.trim() || undefined });
      setNotice(`${form.name} was added successfully.`);
      setForm(EMPTY_FORM);
      setIsFormOpen(false);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not create staff account"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdate(event: FormEvent) {
    event.preventDefault();
    if (!editingStaff) return;
    setIsUpdating(true);
    setError(null);
    try {
      await usersService.update(editingStaff._id, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || undefined,
        role: editForm.role,
        isActive: editForm.isActive,
      });

      if (editForm.newPassword.trim()) {
        await usersService.resetPassword(editingStaff._id, editForm.newPassword.trim());
      }

      setNotice(`${editForm.name} was updated successfully.`);
      setEditingStaff(null);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not update staff member"));
    } finally {
      setIsUpdating(false);
    }
  }

  async function toggleActive(target: User) {
    setError(null);
    try {
      if (target.isActive) {
        await usersService.disable(target._id);
      } else {
        await usersService.update(target._id, { isActive: true });
      }
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not update account status"));
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      await usersService.remove(pendingDelete._id);
      setNotice(`${pendingDelete.name} was removed.`);
      setPendingDelete(null);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not delete staff member"));
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">
            Staff Directory
          </h1>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Manage waiter floor accounts, kitchen display terminals, and administrators.
          </p>
        </div>
        <Button onClick={() => setIsFormOpen((open) => !open)} variant={isFormOpen ? "secondary" : "primary"} className="gap-2">
          <PlusIcon size={16} />
          <span>{isFormOpen ? "Cancel Form" : "Add Staff Member"}</span>
        </Button>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {/* Add Staff Form Panel */}
      {isFormOpen && (
        <form
          onSubmit={handleCreate}
          className="card p-6 space-y-4 shadow-md bg-white border border-brand-200"
        >
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 font-sans">Create Staff Account</h2>
            <p className="text-xs text-slate-500 font-medium">Add credentials for a waiter, chef, or administrator.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Nivas Kumar"
            />
            <Input
              label="Email Address (Login Username)"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="nivas@restaurant.com"
            />
            <Input
              label="Mobile Phone"
              type="tel"
              hint="Optional"
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="9876543210"
            />
            <Select
              label="Role Assignment"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <option value="WAITER">Waiter (Floor Orders &amp; Billing)</option>
              <option value="KITCHEN">Kitchen Staff (KDS Display &amp; Preparation)</option>
              <option value="ADMIN">Administrator (Full Access &amp; Reports)</option>
            </Select>
            <div className="sm:col-span-2">
              <Input
                label="Initial Password"
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                hint="Minimum 6 characters for staff authentication"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving}>
              Create Account
            </Button>
          </div>
        </form>
      )}

      {/* Search & Role Filter */}
      <div className="card p-4 flex flex-wrap gap-4 items-end shadow-2xs">
        <div className="min-w-64 flex-1">
          <Input
            label="Search Staff"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or mobile..."
          />
        </div>
        <div className="min-w-48">
          <Select
            label="Role Filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as "" | UserRole)}
          >
            <option value="">All Roles</option>
            <option value="WAITER">Waiters</option>
            <option value="KITCHEN">Kitchen Staff</option>
            <option value="ADMIN">Administrators</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Spinner label="Loading staff accounts" />
      ) : users.length === 0 ? (
        <EmptyState
          title="No staff accounts found"
          description="Try a different search query or add a new staff member."
          icon={<UsersIcon size={28} />}
        />
      ) : (
        <div className="card overflow-hidden shadow-xs bg-white border border-[#EBE7DF]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#F0EBE1] text-xs sm:text-sm">
              <thead className="bg-[#FAF8F5] text-left text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                <tr>
                  <th className="px-5 py-3.5">Staff Member</th>
                  <th className="px-5 py-3.5">Assigned Role</th>
                  <th className="px-5 py-3.5">Contact Details</th>
                  <th className="px-5 py-3.5">Account Status</th>
                  <th className="px-5 py-3.5">Registered</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1] bg-white">
                {users.map((staff) => (
                  <tr key={staff._id} className="hover:bg-[#FAF8F5] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#FAF8F5] font-bold text-[#1F2220] ring-1 ring-[#E8E3D8]">
                          {initialsOf(staff.name)}
                        </span>
                        <div>
                          <p className="font-bold text-[#1F2220]">{staff.name}</p>
                          <p className="text-xs text-[#6F716D] font-normal">{staff.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${
                          ROLE_BADGE_STYLES[staff.role] ?? "bg-slate-100 text-slate-700 ring-slate-200"
                        }`}
                      >
                        {humanizeEnum(staff.role)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-600">
                      {staff.phone ? <span>{staff.phone}</span> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={[
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1",
                          staff.isActive
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-slate-100 text-slate-500 ring-slate-200",
                        ].join(" ")}
                      >
                        <span className={`size-1.5 rounded-full ${staff.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {staff.isActive ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 font-medium">{formatDateTime(staff.createdAt)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end items-center gap-1.5">
                        <Button
                          size="xs"
                          variant="secondary"
                          className="gap-1 bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100 font-semibold"
                          onClick={() => openEditModal(staff)}
                        >
                          <EditIcon size={12} />
                          <span>Modify</span>
                        </Button>
                        <Button
                          size="xs"
                          variant={staff.isActive ? "secondary" : "primary"}
                          onClick={() => void toggleActive(staff)}
                        >
                          {staff.isActive ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => setPendingDelete(staff)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit / Modify Staff Modal */}
      <Modal
        isOpen={editingStaff !== null}
        title={`Modify Staff Member: ${editingStaff?.name ?? ""}`}
        onClose={() => setEditingStaff(null)}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingStaff(null)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-staff-form"
              isLoading={isUpdating}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <form
          id="edit-staff-form"
          onSubmit={handleUpdate}
          className="space-y-4 py-1"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full Name"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="Staff full name"
            />
            <Input
              label="Email Address (Login Username)"
              type="email"
              required
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              placeholder="staff@restaurant.com"
            />
            <Input
              label="Mobile Phone"
              type="tel"
              hint="Optional"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              placeholder="9876543210"
            />
            <Select
              label="Assigned Role"
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
            >
              <option value="WAITER">Waiter (Floor Orders &amp; Billing)</option>
              <option value="KITCHEN">Kitchen Staff (KDS Display &amp; Preparation)</option>
              <option value="ADMIN">Administrator (Full Access &amp; Reports)</option>
            </Select>
            <Select
              label="Account Status"
              value={editForm.isActive ? "true" : "false"}
              onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === "true" })}
            >
              <option value="true">Active (Can Sign In)</option>
              <option value="false">Disabled (Suspended Access)</option>
            </Select>
            <Input
              label="Reset Password"
              type="password"
              minLength={6}
              value={editForm.newPassword}
              onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
              placeholder="Leave blank to keep current"
              hint="Only fill if you want to change this staff's password"
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete Staff Account"
        message={
          pendingDelete
            ? `Permanently remove account for ${pendingDelete.name} (${pendingDelete.email})? Historical order and settlement records will remain linked in the database.`
            : ""
        }
        confirmLabel="Delete Staff"
        isBusy={isDeleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
