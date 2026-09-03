import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { FoodTypeDot } from "@/components/FoodTypeDot";
import {
  ChefHatIcon,
  MinusIcon,
  PlusIcon,
  ReceiptIcon,
  SearchIcon,
  SendIcon,
  Trash2Icon,
  UtensilsIcon,
} from "@/components/Icons";
import { Input, Select } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { ProductImage } from "@/components/ProductImage";
import { FullScreenLoader, Spinner } from "@/components/Spinner";
import { useRealtime } from "@/hooks/useRealtime";
import { useRipple } from "@/hooks/useRipple";
import { useToast } from "@/hooks/useToast";
import { getErrorMessage } from "@/services/api";
import { categoriesService, productsService } from "@/services/catalog";
import { ordersService } from "@/services/orders";
import { RealtimeEvent } from "@/services/realtime";
import { resolveImageUrl } from "@/services/uploads";
import { CANCELLATION_REASON_LABELS } from "@/types";
import type { CancellationReason, Category, Order, OrderItem, Product } from "@/types";
import { formatCurrency } from "@/utils/format";

const ITEM_STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700 ring-slate-200",
  PREPARING: "bg-amber-50 text-amber-800 ring-amber-200",
  READY: "bg-emerald-50 text-emerald-800 ring-emerald-300 font-bold animate-pulse",
  SERVED: "bg-teal-50 text-teal-800 ring-teal-200",
  CANCELLED: "bg-red-50 text-red-800 line-through ring-red-200",
};

export default function OrderPage() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const spawnRipple = useRipple();
  const toast = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("");

  const [isCustomerOpen, setIsCustomerOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", discount: 0 });
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<CancellationReason>("CUSTOMER_CANCELLED");
  const [cancelNote, setCancelNote] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const loadOrder = useCallback(async () => {
    try {
      setOrder(await ordersService.get(orderId));
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load this order"));
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    categoriesService
      .list({ isActive: true })
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      productsService
        .list({
          search: search.trim() || undefined,
          categoryId: activeCategory || undefined,
          isAvailable: true,
          pageSize: 200,
        })
        .then((page) => setProducts(page.items))
        .catch((caught) => setError(getErrorMessage(caught, "Could not load the menu")))
        .finally(() => setIsProductsLoading(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [search, activeCategory]);

  // Follow this order live: the kitchen moving an item updates the cart in place.
  useRealtime((message) => {
    if (message.payload?.orderId !== orderId) return;
    if (message.event === RealtimeEvent.ORDER_READY) {
      setNotice("🔔 The kitchen says this order is ready to serve!");
    }
    void loadOrder();
  });

  const unsentItems = useMemo(
    () => (order?.items ?? []).filter((item) => item.sentToKitchenAt === null),
    [order],
  );
  const sentItems = useMemo(
    () => (order?.items ?? []).filter((item) => item.sentToKitchenAt !== null),
    [order],
  );
  const readyItems = useMemo(
    () => sentItems.filter((item) => item.kitchenStatus === "READY"),
    [sentItems],
  );

  const isSettled =
    order !== null && ["PAID", "CLOSED", "CANCELLED"].includes(order.orderStatus);

  async function runAction(action: () => Promise<Order>, itemId?: string) {
    setBusyItemId(itemId ?? null);
    setError(null);
    try {
      setOrder(await action());
    } catch (caught) {
      setError(getErrorMessage(caught, "That did not work"));
      await loadOrder();
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleSend() {
    setIsSending(true);
    setError(null);
    try {
      const updated = await ordersService.sendToKitchen(orderId);
      setOrder(updated);
      toast.success(
        "Sent to the kitchen",
        `Order #${updated.orderNumber} for table ${updated.tableNumber}.`,
      );
    } catch (caught) {
      const message = getErrorMessage(caught, "Could not send this order to the kitchen");
      setError(message);
      toast.error("Could not send to the kitchen", message);
    } finally {
      setIsSending(false);
    }
  }

  function openCustomerModal() {
    if (!order) return;
    setCustomerForm({
      name: order.customer.name ?? "",
      phone: order.customer.phone ?? "",
      discount: order.discount,
    });
    setIsCustomerOpen(true);
  }

  async function saveCustomer() {
    setIsSavingCustomer(true);
    setError(null);
    try {
      setOrder(
        await ordersService.update(orderId, {
          customer: {
            name: customerForm.name.trim() || null,
            phone: customerForm.phone.trim() || null,
          },
          discount: customerForm.discount,
        }),
      );
      setIsCustomerOpen(false);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not save those details"));
    } finally {
      setIsSavingCustomer(false);
    }
  }

  async function handleCancel() {
    setIsCancelling(true);
    try {
      await ordersService.cancel(orderId, cancelReason, cancelNote.trim() || undefined);
      navigate("/waiter/tables", { replace: true });
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not cancel this order"));
      setIsCancelOpen(false);
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleDiscard() {
    setIsDiscarding(true);
    try {
      await ordersService.discardDraft(orderId);
      navigate("/waiter/tables", { replace: true });
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not discard this order"));
      setIsDiscardOpen(false);
    } finally {
      setIsDiscarding(false);
    }
  }

  if (isLoading) return <FullScreenLoader label="Loading table order" />;

  if (!order) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error ?? "Order not found"}</Alert>
        <Button variant="secondary" onClick={() => navigate("/waiter/tables")}>
          Back to tables
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-32 lg:pb-0">
      {/* Top Context Bar */}
      <header className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => navigate("/waiter/tables")}
            className="pressable flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm font-bold"
            title="Back to Take Order"
          >
            ←
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-extrabold text-slate-900 font-sans">
                Table {order.tableNumber}
              </h1>
              <OrderStatusBadge status={order.orderStatus} />
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {order.invoiceNumber || (order.orderNumber ? `#${order.orderNumber}` : "")} · Waiter: {order.waiterName}
              {order.customer.name ? ` · Customer: ${order.customer.name}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={openCustomerModal} disabled={isSettled}>
            👤 Customer &amp; Discount
          </Button>

          {order.orderStatus === "DRAFT" && order.sentToKitchenAt === null ? (
            <Button variant="danger" size="sm" onClick={() => setIsDiscardOpen(true)}>
              Discard
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsCancelOpen(true)}
              disabled={isSettled}
            >
              Cancel Order
            </Button>
          )}
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {readyItems.length > 0 && (
        <Alert tone="success">
          🔔 {readyItems.length} item{readyItems.length === 1 ? " is" : "s are"} ready to serve!
        </Alert>
      )}

      {/* Main POS Ordering Layout */}
      <div className="grid gap-5 lg:grid-cols-5 items-start">
        {/* Left: Food Catalog */}
        <section className="space-y-4 lg:col-span-3">
          {/* Search bar */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#9E9F9B]">
              <SearchIcon size={18} />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes, drinks, appetizers..."
              className="w-full rounded-xl bg-white pl-10 pr-4 py-2.5 text-sm font-medium text-[#1F2220] ring-1 ring-[#E8E3D8] shadow-2xs placeholder:text-[#9E9F9B] focus-ring"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs text-[#8E908C] hover:text-[#1F2220]"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Chips Bar */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar select-none">
            <button
              onClick={() => setActiveCategory("")}
              className={[
                "pressable flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition select-none",
                activeCategory === ""
                  ? "bg-[#202322] text-white shadow-md shadow-charcoal-950/20"
                  : "bg-white text-[#5F615D] ring-1 ring-[#E8E3D8] hover:bg-[#FAF8F3] hover:text-[#1F2220]",
              ].join(" ")}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat._id}
                onClick={() => setActiveCategory(cat._id)}
                className={[
                  "pressable flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition select-none",
                  activeCategory === cat._id
                    ? "bg-[#202322] text-white shadow-md shadow-charcoal-950/20"
                    : "bg-white text-[#5F615D] ring-1 ring-[#E8E3D8] hover:bg-[#FAF8F3] hover:text-[#1F2220]",
                ].join(" ")}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Food Items Grid */}
          {isProductsLoading ? (
            <Spinner label="Loading menu items" />
          ) : products.length === 0 ? (
            <EmptyState
              title="No items found"
              description="Try another search term or pick a different category."
              icon={<UtensilsIcon size={24} />}
            />
          ) : (
            <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <button
                  key={product._id}
                  disabled={isSettled || busyItemId === product._id}
                  onPointerDown={spawnRipple}
                  onClick={() =>
                    void runAction(
                      () => ordersService.addItem(orderId, { productId: product._id }),
                      product._id,
                    )
                  }
                  className={[
                    "card-interactive group flex flex-col justify-between p-3 sm:p-3.5 text-left select-none relative overflow-hidden bg-white border border-[#EBE7DF] min-h-[92px]",
                    "hover:border-brand-400 hover:ring-1 hover:ring-brand-300/40 disabled:opacity-60",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3 w-full">
                    <div className="size-16 sm:size-18 shrink-0 overflow-hidden rounded-xl ring-1 ring-[#E8E3D8] group-hover:scale-105 transition-transform duration-200 bg-[#FAF8F5]">
                      <ProductImage
                        src={product.image}
                        alt={product.name}
                        className="size-full object-cover"
                        fallbackClassName="size-full flex items-center justify-center bg-[#FAF6EE] text-2xl"
                      />
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <FoodTypeDot foodType={product.foodType} />
                          <p className="truncate font-bold text-[#1F2220] text-sm leading-snug">
                            {product.name}
                          </p>
                        </div>

                        <p className="mt-0.5 text-xs text-[#8E908C] line-clamp-1 font-normal">
                          {product.description || "Freshly prepared"}
                        </p>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-sm sm:text-base font-extrabold text-[#1F2220] tabular-nums">
                          {formatCurrency(product.price)}
                        </span>
                        <span className="flex size-7 sm:size-8 items-center justify-center rounded-lg bg-[#FAF6EE] text-brand-800 ring-1 ring-[#E8DCB8] font-bold text-base group-hover:bg-brand-600 group-hover:text-white transition-colors shadow-2xs">
                          +
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Right: Sticky Cart Panel (Desktop only) */}
        <section className="hidden lg:block lg:col-span-2">
          <div className="card p-5 lg:sticky lg:top-20 space-y-4 shadow-sm select-none bg-white border border-[#EBE7DF]">
            <div className="flex items-center justify-between border-b border-[#F0EBE1] pb-3">
              <div className="flex items-center gap-2">
                <ReceiptIcon size={18} className="text-brand-700" />
                <h2 className="text-base font-bold text-[#1F2220] font-sans">Current Ticket</h2>
              </div>
              <span className="rounded-full bg-[#FAF6EE] px-2.5 py-0.5 text-xs font-bold text-brand-800 ring-1 ring-[#E8DCB8]">
                {order.items.length} items
              </span>
            </div>

            {order.items.length === 0 ? (
              <EmptyState
                title="Cart is empty"
                description="Tap menu items on the left to add them to this table's order."
                icon={<UtensilsIcon size={24} />}
              />
            ) : (
              <>
                <div className="max-h-[42vh] overflow-y-auto space-y-3 custom-scrollbar pr-1">
                  {/* Unsent items */}
                  {unsentItems.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#9E6523] bg-[#FEF7EE] px-2.5 py-1 rounded-lg ring-1 ring-[#FADFB8]">
                        <span>New Items (Ready to Send)</span>
                        <span>{unsentItems.length}</span>
                      </div>
                      {unsentItems.map((item) => (
                        <CartRow
                          key={item.itemId}
                          item={item}
                          isBusy={busyItemId === item.itemId}
                          isEditable={!isSettled}
                          onChangeQuantity={(qty) =>
                            void runAction(
                              () => ordersService.setItemQuantity(orderId, item.itemId, qty),
                              item.itemId,
                            )
                          }
                        />
                      ))}
                    </div>
                  )}

                  {/* Sent to kitchen items */}
                  {sentItems.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#5F615D] bg-[#FAF8F5] px-2.5 py-1 rounded-lg ring-1 ring-[#E8E3D8]">
                        <span>With Kitchen</span>
                        <span>{sentItems.length}</span>
                      </div>
                      {sentItems.map((item) => (
                        <CartRow key={item.itemId} item={item} isEditable={false} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Price Breakdown */}
                <dl className="space-y-1.5 border-t border-[#F0EBE1] pt-3 text-xs">
                  <div className="flex justify-between text-[#5F615D]">
                    <dt>Subtotal</dt>
                    <dd className="font-semibold tabular-nums text-[#1F2220]">{formatCurrency(order.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between text-[#5F615D]">
                    <dt>GST Tax</dt>
                    <dd className="font-semibold tabular-nums text-[#1F2220]">{formatCurrency(order.gstAmount)}</dd>
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between text-[#276B49] font-medium">
                      <dt>Discount</dt>
                      <dd className="font-bold tabular-nums">−{formatCurrency(order.discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-[#E8E3D8] pt-2 text-base font-extrabold text-[#1F2220]">
                    <dt>Grand Total</dt>
                    <dd className="tabular-nums text-brand-700 font-sans">{formatCurrency(order.grandTotal)}</dd>
                  </div>
                </dl>
              </>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              {/* Send to Kitchen button */}
              <Button
                fullWidth
                size="lg"
                variant="primary"
                onClick={() => void handleSend()}
                isLoading={isSending}
                disabled={unsentItems.length === 0 || isSettled}
                className="gap-2 shadow-md shadow-brand-950/20"
              >
                <SendIcon size={18} />
                <span>
                  {unsentItems.length > 0
                    ? `Send ${unsentItems.length} Item${unsentItems.length === 1 ? "" : "s"} to Kitchen`
                    : "Sent to Kitchen"}
                </span>
              </Button>

              {/* Ready items serve button */}
              {readyItems.length > 0 && (
                <Button
                  fullWidth
                  size="sm"
                  variant="success"
                  onClick={() => void runAction(() => ordersService.serve(orderId))}
                  className="gap-1.5"
                >
                  <ChefHatIcon size={16} />
                  <span>Mark {readyItems.length} Ready Item{readyItems.length === 1 ? "" : "s"} as Served</span>
                </Button>
              )}
            </div>

            {order.amountPaid > 0 && (
              <p className="text-center text-xs font-bold text-[#276B49] bg-[#EBF5EE] py-1.5 rounded-lg ring-1 ring-[#BCE2CD]">
                ✅ {formatCurrency(order.amountPaid)} already collected
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Floating Bottom Cart Bar for Mobile & Tablets (< 1024px) */}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-[#161817] text-[#FAF8F5] px-4 py-3 border-t border-[#2A2D2C] shadow-2xl lg:hidden flex items-center justify-between gap-3 pb-safe">
        <button
          type="button"
          onClick={() => setIsMobileCartOpen(true)}
          className="flex items-center gap-3 text-left focus:outline-none min-w-0 flex-1"
        >
          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm ring-1 ring-brand-400/40">
            <ReceiptIcon size={20} />
            {order.items.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-extrabold text-white shadow-xs">
                {order.items.length}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[#FAF8F5] truncate">Ticket</span>
              {unsentItems.length > 0 && (
                <span className="text-[10px] font-extrabold uppercase tracking-wide bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded shrink-0">
                  {unsentItems.length} New
                </span>
              )}
            </div>
            <p className="text-sm font-extrabold tabular-nums text-brand-300">
              {formatCurrency(order.grandTotal)}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {unsentItems.length > 0 && !isSettled ? (
            <Button
              size="md"
              variant="primary"
              onClick={() => void handleSend()}
              isLoading={isSending}
              className="gap-1.5 text-xs font-extrabold px-3.5 shadow-sm"
            >
              <SendIcon size={15} />
              <span>Send ({unsentItems.length})</span>
            </Button>
          ) : (
            <Button
              size="md"
              variant="secondary"
              onClick={() => setIsMobileCartOpen(true)}
              className="text-xs font-extrabold px-3.5"
            >
              View Ticket
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Cart Drawer Modal */}
      <Modal
        isOpen={isMobileCartOpen}
        title={`Current Ticket · Table ${order.tableNumber}`}
        onClose={() => setIsMobileCartOpen(false)}
        size="md"
      >
        <div className="space-y-4">
          {order.items.length === 0 ? (
            <EmptyState
              title="Cart is empty"
              description="Tap menu items to add them to this table's order."
              icon={<UtensilsIcon size={24} />}
            />
          ) : (
            <>
              <div className="max-h-[50vh] overflow-y-auto space-y-3 custom-scrollbar pr-1">
                {/* Unsent items */}
                {unsentItems.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#9E6523] bg-[#FEF7EE] px-2.5 py-1 rounded-lg ring-1 ring-[#FADFB8]">
                      <span>New Items (Ready to Send)</span>
                      <span>{unsentItems.length}</span>
                    </div>
                    {unsentItems.map((item) => (
                      <CartRow
                        key={item.itemId}
                        item={item}
                        isBusy={busyItemId === item.itemId}
                        isEditable={!isSettled}
                        onChangeQuantity={(qty) =>
                          void runAction(
                            () => ordersService.setItemQuantity(orderId, item.itemId, qty),
                            item.itemId,
                          )
                        }
                      />
                    ))}
                  </div>
                )}

                {/* Sent to kitchen items */}
                {sentItems.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#5F615D] bg-[#FAF8F5] px-2.5 py-1 rounded-lg ring-1 ring-[#E8E3D8]">
                      <span>With Kitchen</span>
                      <span>{sentItems.length}</span>
                    </div>
                    {sentItems.map((item) => (
                      <CartRow key={item.itemId} item={item} isEditable={false} />
                    ))}
                  </div>
                )}
              </div>

              {/* Price Breakdown */}
              <dl className="space-y-1.5 border-t border-[#F0EBE1] pt-3 text-xs">
                <div className="flex justify-between text-[#5F615D]">
                  <dt>Subtotal</dt>
                  <dd className="font-semibold tabular-nums text-[#1F2220]">{formatCurrency(order.subtotal)}</dd>
                </div>
                <div className="flex justify-between text-[#5F615D]">
                  <dt>GST Tax</dt>
                  <dd className="font-semibold tabular-nums text-[#1F2220]">{formatCurrency(order.gstAmount)}</dd>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-[#276B49] font-medium">
                    <dt>Discount</dt>
                    <dd className="font-bold tabular-nums">−{formatCurrency(order.discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-[#E8E3D8] pt-2 text-base font-extrabold text-[#1F2220]">
                  <dt>Grand Total</dt>
                  <dd className="tabular-nums text-brand-700 font-sans">{formatCurrency(order.grandTotal)}</dd>
                </div>
              </dl>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <Button
                  fullWidth
                  size="lg"
                  variant="primary"
                  onClick={() => {
                    void handleSend();
                    setIsMobileCartOpen(false);
                  }}
                  isLoading={isSending}
                  disabled={unsentItems.length === 0 || isSettled}
                  className="gap-2"
                >
                  <SendIcon size={18} />
                  <span>
                    {unsentItems.length > 0
                      ? `Send ${unsentItems.length} Item${unsentItems.length === 1 ? "" : "s"} to Kitchen`
                      : "Sent to Kitchen"}
                  </span>
                </Button>

                {readyItems.length > 0 && (
                  <Button
                    fullWidth
                    size="md"
                    variant="success"
                    onClick={() => void runAction(() => ordersService.serve(orderId))}
                    className="gap-1.5"
                  >
                    <ChefHatIcon size={16} />
                    <span>Mark {readyItems.length} Ready as Served</span>
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Customer & Discount Modal */}
      <Modal
        isOpen={isCustomerOpen}
        title="Customer & Discount Details"
        onClose={() => setIsCustomerOpen(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsCustomerOpen(false)}
              disabled={isSavingCustomer}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveCustomer()} isLoading={isSavingCustomer}>
              Save Details
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Customer Name"
            value={customerForm.name}
            onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
            placeholder="John Doe"
            hint="Optional"
          />
          <Input
            label="Phone Number"
            type="tel"
            value={customerForm.phone}
            onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
            placeholder="9876543210"
            hint="Optional — used for WhatsApp invoice sharing"
          />
          <Input
            label="Discount Amount (₹)"
            type="number"
            min={0}
            step="0.01"
            value={customerForm.discount}
            onChange={(e) =>
              setCustomerForm({ ...customerForm, discount: Number(e.target.value) })
            }
          />
        </div>
      </Modal>

      {/* Cancel Order Modal */}
      <Modal
        isOpen={isCancelOpen}
        title="Cancel Active Order"
        onClose={() => setIsCancelOpen(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsCancelOpen(false)}
              disabled={isCancelling}
            >
              Keep Order
            </Button>
            <Button variant="danger" onClick={() => void handleCancel()} isLoading={isCancelling}>
              Cancel Order
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Cancelling this order will record the cancellation reason in the audit log and instantly free Table {order.tableNumber}.
          </p>
          <Select
            label="Cancellation Reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value as CancellationReason)}
          >
            {Object.entries(CANCELLATION_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            label="Additional Notes"
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
            placeholder="e.g., Customer changed mind"
            hint="Optional"
          />
        </div>
      </Modal>

      {/* Discard Draft Dialog */}
      <ConfirmDialog
        isOpen={isDiscardOpen}
        title="Discard Draft"
        message={`Discard this empty draft and release Table ${order.tableNumber}?`}
        confirmLabel="Discard"
        isBusy={isDiscarding}
        onConfirm={() => void handleDiscard()}
        onCancel={() => setIsDiscardOpen(false)}
      />
    </div>
  );
}

function CartRow({
  item,
  isEditable,
  isBusy = false,
  onChangeQuantity,
}: {
  item: OrderItem;
  isEditable: boolean;
  isBusy?: boolean;
  onChangeQuantity?: (quantity: number) => void;
}) {
  return (
    <div className="animate-rise flex items-center justify-between gap-3 rounded-xl bg-slate-50/80 p-2.5 ring-1 ring-slate-100 hover:bg-slate-100/80 transition">
      <div className="flex items-center gap-2 min-w-0">
        <FoodTypeDot foodType={item.foodType} />
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-900">{item.name}</p>
          <p className="text-[11px] text-slate-500 font-medium">
            {formatCurrency(item.price)} × {item.quantity}
          </p>
          {!isEditable && (
            <span
              className={`mt-1 inline-flex rounded-full px-2 py-0.2 text-[10px] font-bold ring-1 ${
                ITEM_STATUS_CLASSES[item.kitchenStatus] ?? "bg-slate-100 text-slate-700 ring-slate-200"
              }`}
            >
              {item.kitchenStatus}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs font-extrabold text-slate-900 tabular-nums">
          {formatCurrency(item.total)}
        </span>

        {isEditable && onChangeQuantity && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={isBusy}
              onClick={() => onChangeQuantity(item.quantity - 1)}
              className="pressable flex size-6 items-center justify-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 hover:ring-slate-300 disabled:opacity-50 text-xs font-bold"
            >
              {item.quantity === 1 ? <Trash2Icon size={12} className="text-red-500" /> : <MinusIcon size={12} />}
            </button>
            <span
              key={item.quantity}
              className="w-5 animate-pop text-center text-xs font-bold tabular-nums text-slate-800"
            >
              {item.quantity}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={isBusy}
              onClick={() => onChangeQuantity(item.quantity + 1)}
              className="pressable flex size-6 items-center justify-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 hover:ring-slate-300 disabled:opacity-50 text-xs font-bold"
            >
              <PlusIcon size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
