import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { FoodTypeDot } from "@/components/FoodTypeDot";
import { PlusIcon, SearchIcon, UtensilsIcon } from "@/components/Icons";
import { ImageUploader } from "@/components/ImageUploader";
import { Input, Select } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { ProductImage } from "@/components/ProductImage";
import { Spinner } from "@/components/Spinner";
import { getErrorMessage } from "@/services/api";
import { categoriesService, productsService } from "@/services/catalog";
import type { ProductPayload } from "@/services/catalog";
import { resolveImageUrl } from "@/services/uploads";
import { FOOD_TYPE_LABELS, MEAL_TYPE_LABELS } from "@/types";
import type { Category, FoodType, MealType, Product } from "@/types";
import { formatCurrency } from "@/utils/format";

const EMPTY_FORM: ProductPayload = {
  name: "",
  description: "",
  image: "",
  price: 0,
  gstPercentage: 5,
  quantityAvailable: 0,
  categoryId: "",
  foodType: "VEG",
  mealType: "ALL_DAY",
  isAvailable: true,
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [foodTypeFilter, setFoodTypeFilter] = useState<"" | FoodType>("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductPayload>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    categoriesService
      .list()
      .then(setCategories)
      .catch((caught) => setError(getErrorMessage(caught, "Could not load categories")));
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const page = await productsService.list({
        search: search.trim() || undefined,
        categoryId: categoryFilter || undefined,
        foodType: foodTypeFilter || undefined,
        pageSize: 200,
      });
      setProducts(page.items);
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load products"));
    } finally {
      setIsLoading(false);
    }
  }, [search, categoryFilter, foodTypeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  function openCreate() {
    if (categories.length === 0) {
      setError("Create a menu category first before adding products.");
      return;
    }
    setEditing(null);
    setForm({ ...EMPTY_FORM, categoryId: categories[0]._id });
    setError(null);
    setIsModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm({
      name: product.name,
      description: product.description ?? "",
      image: product.image ?? "",
      price: product.price,
      gstPercentage: product.gstPercentage,
      quantityAvailable: product.quantityAvailable,
      categoryId: product.categoryId,
      foodType: product.foodType,
      mealType: product.mealType,
      isAvailable: product.isAvailable,
    });
    setError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const payload: ProductPayload = {
      ...form,
      name: form.name.trim(),
      description: form.description?.trim() || null,
      image: form.image?.trim() || null,
    };

    try {
      if (editing) {
        await productsService.update(editing._id, payload);
        setNotice(`${payload.name} updated successfully.`);
      } else {
        await productsService.create(payload);
        setNotice(`${payload.name} added to the menu.`);
      }
      setIsModalOpen(false);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not save the product"));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleAvailability(product: Product) {
    setError(null);
    try {
      await productsService.update(product._id, { isAvailable: !product.isAvailable });
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not update availability"));
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      await productsService.remove(pendingDelete._id);
      setNotice(`${pendingDelete.name} removed from menu.`);
      setPendingDelete(null);
      await load();
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not delete the product"));
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  const priceWithGst = form.price * (1 + form.gstPercentage / 100);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">
            Menu Items &amp; Products
          </h1>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Manage food catalog dishes, prices, GST tax rates, photos, and live availability.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <PlusIcon size={16} />
          <span>Add Dish</span>
        </Button>
      </header>

      {error && !isModalOpen && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {/* Search & Filters */}
      <div className="card p-4 flex flex-wrap gap-4 items-end shadow-2xs">
        <div className="min-w-60 flex-1">
          <Input
            label="Search Dishes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dish name, ingredients..."
          />
        </div>
        <div className="min-w-48">
          <Select
            label="Category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-40">
          <Select
            label="Dietary Type"
            value={foodTypeFilter}
            onChange={(e) => setFoodTypeFilter(e.target.value as "" | FoodType)}
          >
            <option value="">All Types</option>
            {Object.entries(FOOD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Spinner label="Loading products" />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products found"
          description={
            categories.length === 0
              ? "Create a category first, then add your menu items."
              : "Try adjusting your filters or add a new menu dish."
          }
          icon={<UtensilsIcon size={28} />}
          action={<Button onClick={openCreate}>Add First Product</Button>}
        />
      ) : (
        <div className="card overflow-hidden shadow-xs bg-white border border-[#EBE7DF]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#F0EBE1] text-xs sm:text-sm">
              <thead className="bg-[#FAF8F5] text-left text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                <tr>
                  <th className="px-5 py-3.5">Dish Details</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Meal Type</th>
                  <th className="px-5 py-3.5 text-right">Base Price</th>
                  <th className="px-5 py-3.5 text-right">GST Rate</th>
                  <th className="px-5 py-3.5">Availability</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1] bg-white">
                {products.map((product) => (
                  <tr key={product._id} className="hover:bg-[#FAF8F5] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="size-11 shrink-0 overflow-hidden rounded-xl ring-1 ring-[#E8E3D8] bg-[#FAF8F5]">
                          <ProductImage
                            src={product.image}
                            alt={product.name}
                            className="size-full object-cover"
                            fallbackClassName="size-full flex items-center justify-center bg-[#FAF6EE] text-lg"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FoodTypeDot foodType={product.foodType} />
                            <span className="font-bold text-[#1F2220] text-sm">{product.name}</span>
                          </div>
                          {product.description && (
                            <div className="truncate text-xs text-[#6F716D] font-normal">
                              {product.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-[#5F615D]">
                      <span className="rounded-lg bg-[#FAF8F5] px-2.5 py-1 text-xs font-semibold text-[#5F615D] ring-1 ring-[#E8E3D8]">
                        {product.categoryName ?? "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[#5F615D] font-medium">
                      {MEAL_TYPE_LABELS[product.mealType]}
                    </td>
                    <td className="px-5 py-3.5 text-right font-extrabold text-[#1F2220] tabular-nums">
                      {formatCurrency(product.price)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[#5F615D] tabular-nums font-medium">
                      {product.gstPercentage}%
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => void toggleAvailability(product)}
                        className={[
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold transition ring-1 cursor-pointer",
                          product.isAvailable
                            ? "bg-[#EBF5EE] text-[#276B49] ring-[#BCE2CD] hover:bg-[#D4EBDC]"
                            : "bg-[#FAF8F5] text-[#8E908C] ring-[#E8E3D8] hover:bg-[#F3ECE0]",
                        ].join(" ")}
                      >
                        <span className={`size-1.5 rounded-full ${product.isAvailable ? "bg-[#276B49]" : "bg-[#8E908C]"}`} />
                        {product.isAvailable ? "In Stock" : "Unavailable"}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="xs" variant="secondary" onClick={() => openEdit(product)}>
                          Edit
                        </Button>
                        <Button size="xs" variant="danger" onClick={() => setPendingDelete(product)}>
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

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={isModalOpen}
        size="lg"
        title={editing ? `Edit Dish: ${editing.name}` : "New Menu Dish"}
        onClose={() => setIsModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button form="product-form" type="submit" isLoading={isSaving}>
              {editing ? "Save Changes" : "Add Dish to Menu"}
            </Button>
          </>
        }
      >
        <form id="product-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          {error && (
            <div className="sm:col-span-2">
              <Alert tone="error">{error}</Alert>
            </div>
          )}

          <div className="sm:col-span-2">
            <Input
              label="Dish Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Hyderabadi Chicken Biriyani"
            />
          </div>

          <div className="sm:col-span-2">
            <Input
              label="Description / Ingredients"
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Fragrant basmati rice cooked with tender marinated chicken"
              hint="Optional"
            />
          </div>

          <Select
            label="Category"
            required
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </Select>

          <Select
            label="Meal Type"
            value={form.mealType}
            onChange={(e) => setForm({ ...form, mealType: e.target.value as MealType })}
          >
            {Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <Input
            label="Base Price (₹)"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.price}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
          />

          <Input
            label="GST Percentage (%)"
            type="number"
            min={0}
            max={100}
            step="0.01"
            required
            value={form.gstPercentage}
            onChange={(e) => setForm({ ...form, gstPercentage: Number(e.target.value) })}
            hint={`Customer pays ${formatCurrency(priceWithGst)} (incl. GST)`}
          />

          <Select
            label="Dietary Classification"
            value={form.foodType}
            onChange={(e) => setForm({ ...form, foodType: e.target.value as FoodType })}
          >
            {Object.entries(FOOD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <Input
            label="Stock Quantity Available"
            type="number"
            min={0}
            value={form.quantityAvailable}
            onChange={(e) =>
              setForm({ ...form, quantityAvailable: Number(e.target.value) })
            }
            hint="Indicative inventory"
          />

          {/* Dish Photo Uploader with Drag and Drop */}
          <div className="sm:col-span-2">
            <ImageUploader
              label="Dish Photo"
              value={form.image}
              onChange={(url) => setForm({ ...form, image: url ?? "" })}
            />
          </div>

          <label className="flex items-center gap-3 text-xs font-bold text-slate-700 sm:col-span-2 select-none cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
              className="size-4 rounded-md border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            <span>Available for Ordering on POS Right Now</span>
          </label>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete Menu Dish"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.name}" from the active menu? Past invoices will preserve their original records.`
            : ""
        }
        confirmLabel="Delete Dish"
        isBusy={isDeleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
