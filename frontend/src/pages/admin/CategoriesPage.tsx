import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { GridIcon, PlusIcon } from "@/components/Icons";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { getErrorMessage } from "@/services/api";
import { categoriesService } from "@/services/catalog";
import type { CategoryPayload } from "@/services/catalog";
import type { Category } from "@/types";

const EMPTY_FORM: CategoryPayload = {
  name: "",
  description: "",
  displayOrder: 0,
  isActive: true,
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryPayload>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setCategories(await categoriesService.list());
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load categories"));
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

  function openEdit(category: Category) {
    setEditing(category);
    setForm({
      name: category.name,
      description: category.description ?? "",
      displayOrder: category.displayOrder,
      isActive: category.isActive,
    });
    setError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const payload: CategoryPayload = {
      ...form,
      name: form.name.trim(),
      description: form.description?.trim() || null,
    };

    try {
      if (editing) {
        await categoriesService.update(editing._id, payload);
        setNotice(`${payload.name} updated.`);
      } else {
        await categoriesService.create(payload);
        setNotice(`${payload.name} created.`);
      }
      setIsModalOpen(false);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not save the category"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      await categoriesService.remove(pendingDelete._id);
      setNotice(`${pendingDelete.name} deleted.`);
      setPendingDelete(null);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not delete the category"));
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
            Menu Categories
          </h1>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Organize restaurant menu sections and display priority for waiters.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <PlusIcon size={16} />
          <span>Add Category</span>
        </Button>
      </header>

      {error && !isModalOpen && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {isLoading ? (
        <Spinner label="Loading categories" />
      ) : categories.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Create your first food category (e.g. Starters, Main Course, Desserts, Beverages) to start adding dishes."
          icon={<GridIcon size={28} />}
          action={<Button onClick={openCreate}>Create First Category</Button>}
        />
      ) : (
        <div className="card overflow-hidden shadow-xs bg-white border border-[#EBE7DF]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#F0EBE1] text-xs sm:text-sm">
              <thead className="bg-[#FAF8F5] text-left text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                <tr>
                  <th className="px-5 py-3.5">Display Order</th>
                  <th className="px-5 py-3.5">Category Name</th>
                  <th className="px-5 py-3.5">Total Products</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1] bg-white">
                {categories.map((category) => (
                  <tr key={category._id} className="hover:bg-[#FAF8F5] transition-colors">
                    <td className="px-5 py-3.5 font-bold text-[#8E908C] tabular-nums">#{category.displayOrder}</td>
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-[#1F2220]">{category.name}</div>
                      {category.description && (
                        <div className="text-xs text-[#6F716D] font-normal">{category.description}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-[#5F615D]">
                      {category.productCount} dish{category.productCount === 1 ? "" : "es"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={[
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1",
                          category.isActive
                            ? "bg-[#EBF5EE] text-[#276B49] ring-[#BCE2CD]"
                            : "bg-[#FAF8F5] text-[#8E908C] ring-[#E8E3D8]",
                        ].join(" ")}
                      >
                        <span className={`size-1.5 rounded-full ${category.isActive ? "bg-[#276B49]" : "bg-[#8E908C]"}`} />
                        {category.isActive ? "Active" : "Hidden"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="xs" variant="secondary" onClick={() => openEdit(category)}>
                          Edit
                        </Button>
                        <Button size="xs" variant="danger" onClick={() => setPendingDelete(category)}>
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

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        title={editing ? `Edit Category: ${editing.name}` : "New Menu Category"}
        onClose={() => setIsModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button form="category-form" type="submit" isLoading={isSaving}>
              {editing ? "Save Changes" : "Create Category"}
            </Button>
          </>
        }
      >
        <form id="category-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}

          <Input
            label="Category Name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Starters & Appetizers"
          />
          <Input
            label="Description"
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="e.g. Fresh veg & non-veg starters"
            hint="Optional"
          />
          <Input
            label="Display Sort Priority"
            type="number"
            min={0}
            value={form.displayOrder ?? 0}
            onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
            hint="Lower numbers appear first on POS screens"
          />
          <label className="flex items-center gap-3 text-xs font-bold text-slate-700 select-none cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={form.isActive ?? true}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="size-4 rounded-md border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            <span>Active &amp; Visible to Waiters on POS</span>
          </label>
        </form>
      </Modal>

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete Menu Category"
        message={
          pendingDelete
            ? `Are you sure you want to delete "${pendingDelete.name}"? Categories containing active menu items cannot be removed.`
            : ""
        }
        confirmLabel="Delete Category"
        isBusy={isDeleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
