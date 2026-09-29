import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ArmchairIcon, BellIcon, FilterIcon } from "@/components/Icons";
import { SkeletonTiles } from "@/components/Skeleton";
import { useRealtime } from "@/hooks/useRealtime";
import { useRipple } from "@/hooks/useRipple";
import { useToast } from "@/hooks/useToast";
import { getErrorMessage } from "@/services/api";
import { tablesService } from "@/services/catalog";
import { ordersService } from "@/services/orders";
import type { Order, RestaurantTable } from "@/types";
import { formatCurrency, formatOrderNumber } from "@/utils/format";

type FilterKey = "ALL" | "FREE" | "OCCUPIED" | "READY";

export default function WaiterTablesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const spawnRipple = useRipple();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [ordersByTable, setOrdersByTable] = useState<Record<string, Order>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [busyTableId, setBusyTableId] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  useRealtime(() => setRefreshKey((prev) => prev + 1));

  async function load() {
    try {
      const [tableList, activeOrders] = await Promise.all([
        tablesService.list({ isActive: true }),
        ordersService.list({ openOnly: true, pageSize: 200 }),
      ]);
      setTables(tableList);

      const map: Record<string, Order> = {};
      for (const order of activeOrders.items) {
        map[order.tableId] = order;
      }
      setOrdersByTable(map);
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load tables"));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [refreshKey]);

  async function handleTableClick(table: RestaurantTable) {
    if (busyTableId) return;

    const existing = ordersByTable[table._id];
    if (existing) {
      navigate(`/waiter/order/${existing._id}`);
      return;
    }

    setBusyTableId(table._id);
    try {
      const created = await ordersService.open(table._id);
      navigate(`/waiter/order/${created._id}`);
    } catch (caught) {
      toast.error("Could not open table", getErrorMessage(caught, "Failed to start order"));
      setBusyTableId(null);
    }
  }

  const counts = useMemo(() => {
    let free = 0;
    let occupied = 0;
    let ready = 0;
    for (const table of tables) {
      const order = ordersByTable[table._id];
      const isTableOccupied = Boolean(order) || table.status === "OCCUPIED";
      if (order?.orderStatus === "READY") {
        ready++;
        occupied++;
      } else if (isTableOccupied) {
        occupied++;
      } else {
        free++;
      }
    }
    return { free, occupied, ready };
  }, [tables, ordersByTable]);

  const visibleTables = useMemo(() => {
    return tables.filter((table) => {
      const order = ordersByTable[table._id];
      const isTableOccupied = Boolean(order) || table.status === "OCCUPIED";
      if (filter === "FREE") return !isTableOccupied;
      if (filter === "OCCUPIED") return isTableOccupied;
      if (filter === "READY") return order?.orderStatus === "READY";
      return true;
    });
  }, [tables, ordersByTable, filter]);

  const FILTERS: { key: FilterKey; label: string; count: number }[] = [
    { key: "ALL", label: "All Tables", count: tables.length },
    { key: "FREE", label: "Free", count: counts.free },
    { key: "OCCUPIED", label: "Occupied", count: counts.occupied },
    { key: "READY", label: "Food Ready", count: counts.ready },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink font-sans">
            Take Order · Table Selection
          </h1>
          <p className="mt-0.5 text-xs font-medium text-muted">
            Tap a free table to start an order, or tap an occupied table to add food items.
          </p>
        </div>

        {counts.ready > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setFilter("READY")}
            className="shrink-0 bg-success hover:bg-success-strong shadow-sm gap-2"
          >
            <BellIcon size={16} />
            <span>{counts.ready} Ready to Serve</span>
          </Button>
        )}
      </header>

      {/* Summary Metrics Bar */}
      <div className="card grid grid-cols-3 divide-x divide-surface-sunken overflow-hidden shadow-xs bg-white border border-line">
        {[
          { label: "Free Tables", value: counts.free, accent: "text-success", bg: "bg-success", icon: null },
          { label: "Occupied", value: counts.occupied, accent: "text-warning", bg: "bg-warning", icon: null },
          { label: "Food Ready", value: counts.ready, accent: "text-brand-700", bg: "bg-brand-600", icon: null },
        ].map((stat) => (
          <div key={stat.label} className="relative px-4 py-4 sm:px-6 sm:py-4 select-none">
            <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${stat.bg}`} />
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">
                {stat.label}
              </p>
              <span aria-hidden className={`size-2 rounded-full ${stat.bg}`} />
            </div>
            <p className={`mt-1 text-2xl font-extrabold tabular-nums sm:text-3xl font-sans ${stat.accent}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-danger p-4 bg-white border-line">
          <div>
            <p className="text-sm font-bold text-ink">Something went wrong</p>
            <p className="mt-0.5 text-xs text-muted">{error}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 no-scrollbar select-none">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            onClick={() => setFilter(option.key)}
            className={[
              "pressable flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition select-none",
              filter === option.key
                ? "bg-ink text-white shadow-sm"
                : "bg-white text-muted ring-1 ring-line hover:bg-surface-soft hover:text-ink",
            ].join(" ")}
          >
            <span>{option.label}</span>
            <span
              className={[
                "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                filter === option.key ? "bg-white/20 text-white" : "bg-brand-100 text-brand-700",
              ].join(" ")}
            >
              {option.count}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <SkeletonTiles count={10} />
      ) : tables.length === 0 ? (
        <EmptyState
          title="No tables set up"
          description="An administrator needs to add tables before orders can be taken."
          icon={<ArmchairIcon size={28} />}
        />
      ) : visibleTables.length === 0 ? (
        <EmptyState
          title={`No ${filter.toLowerCase()} tables`}
          description="Nothing matches this filter right now."
          icon={<FilterIcon size={28} />}
          action={
            <Button size="sm" variant="secondary" onClick={() => setFilter("ALL")}>
              Show All Tables
            </Button>
          }
        />
      ) : (
        <div className="stagger grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {visibleTables.map((table, index) => {
            const order = ordersByTable[table._id];
            const isOccupied = Boolean(order) || table.status === "OCCUPIED";
            const isReady = order?.orderStatus === "READY";
            const isBusy = busyTableId === table._id;

            return (
              <button
                key={table._id}
                style={{ "--stagger-index": index } as CSSProperties}
                onPointerDown={spawnRipple}
                onClick={() => void handleTableClick(table)}
                disabled={isBusy}
                aria-label={`Table ${table.tableNumber}, ${
                  isReady ? "food ready" : isOccupied ? "occupied" : "free"
                }`}
                className={[
                  "ripple-host pressable-tile pressable group relative flex min-h-44 flex-col cursor-pointer",
                  "rounded-xl p-4 text-left ring-1 transition-all select-none",
                  "focus-ring",
                  "hover:-translate-y-1 hover:shadow-sm disabled:opacity-70",
                  isReady
                    ? "bg-success-soft ring-success-line hover:ring-success-line shadow-xs"
                    : isOccupied
                      ? "bg-warning-soft ring-warning-line hover:ring-warning-line shadow-xs"
                      : "bg-white ring-line hover:ring-brand-400 hover:bg-surface-soft shadow-2xs",
                ].join(" ")}
              >
                {/* Left side accent rail */}
                <span
                  aria-hidden
                  className={[
                    "absolute inset-y-3 left-0 w-1 rounded-r-full transition-all duration-200",
                    isReady
                      ? "bg-success"
                      : isOccupied
                        ? "bg-warning"
                        : "bg-line group-hover:bg-brand-500",
                  ].join(" ")}
                />

                <div className="flex items-start justify-between gap-2 pl-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                      Table
                    </span>
                    <p className="text-2xl font-extrabold leading-none tracking-tight text-ink font-sans">
                      {table.tableNumber}
                    </p>
                    <p className="mt-1 text-xs text-subtle font-medium">{table.capacity} seats</p>
                  </div>

                  {isReady ? (
                    <span
                      aria-hidden
                      className="flex size-7 items-center justify-center rounded-xl bg-success-soft text-success text-sm shadow-xs ring-1 ring-success-line"
                    ><BellIcon size={14} /></span>
                  ) : isBusy ? (
                    <span
                      aria-hidden
                      className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-ink"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-subtle group-hover:text-muted transition">
                      #{table.tableNumber}
                    </span>
                  )}
                </div>

                <div className="mt-auto space-y-2 pl-2 pt-3">
                  {order ? (
                    <>
                      <Badge
                        tone={
                          isReady ? "ready" : order.orderStatus === "PREPARING" ? "preparing" : "occupied"
                        }
                        dot
                        pulse={isReady}
                      >
                        {isReady
                          ? "Food Ready"
                          : order.orderStatus === "PREPARING"
                            ? "Kitchen Prep"
                            : "Occupied"}
                      </Badge>
                      <div className="flex items-baseline justify-between border-t border-surface-sunken pt-1.5 text-xs">
                        <span className="font-semibold text-subtle truncate">
                          {order.invoiceNumber || formatOrderNumber(order.orderNumber)}
                        </span>
                        <span className="font-extrabold text-ink tabular-nums">
                          {formatCurrency(order.grandTotal)}
                        </span>
                      </div>
                    </>
                  ) : isOccupied ? (
                    <Badge tone="occupied" dot>
                      Occupied
                    </Badge>
                  ) : (
                    <Badge tone="free" dot>
                      Available
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
