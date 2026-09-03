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
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1F2220] font-sans">
            Take Order · Table Selection
          </h1>
          <p className="mt-0.5 text-xs font-medium text-[#6F716D]">
            Tap a free table to start an order, or tap an occupied table to add food items.
          </p>
        </div>

        {counts.ready > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setFilter("READY")}
            className="shrink-0 bg-emerald-700 hover:bg-emerald-800 shadow-md shadow-emerald-950/20 gap-2"
          >
            <BellIcon size={16} />
            <span>{counts.ready} Ready to Serve</span>
          </Button>
        )}
      </header>

      {/* Summary Metrics Bar */}
      <div className="card grid grid-cols-3 divide-x divide-[#F0EBE1] overflow-hidden shadow-xs bg-white border border-[#EBE7DF]">
        {[
          { label: "Free Tables", value: counts.free, accent: "text-[#276B49]", bg: "bg-[#276B49]", icon: "🟢" },
          { label: "Occupied", value: counts.occupied, accent: "text-[#9E6523]", bg: "bg-[#9E6523]", icon: "🟡" },
          { label: "Food Ready", value: counts.ready, accent: "text-brand-700", bg: "bg-brand-600", icon: "🔔" },
        ].map((stat) => (
          <div key={stat.label} className="relative px-4 py-4 sm:px-6 sm:py-4 select-none">
            <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${stat.bg}`} />
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                {stat.label}
              </p>
              <span className="text-xs">{stat.icon}</span>
            </div>
            <p className={`mt-1 text-2xl font-extrabold tabular-nums sm:text-3xl font-sans ${stat.accent}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-[#C24138] p-4 bg-white border-[#EBE7DF]">
          <div>
            <p className="text-sm font-bold text-[#1F2220]">Something went wrong</p>
            <p className="mt-0.5 text-xs text-[#6F716D]">{error}</p>
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
                ? "bg-[#202322] text-white shadow-md shadow-charcoal-950/20"
                : "bg-white text-[#5F615D] ring-1 ring-[#E8E3D8] hover:bg-[#FAF8F3] hover:text-[#1F2220]",
            ].join(" ")}
          >
            <span>{option.label}</span>
            <span
              className={[
                "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                filter === option.key ? "bg-white/20 text-white" : "bg-[#F3ECE0] text-[#805C2B]",
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
                  "rounded-2xl p-4 text-left ring-1 transition-all select-none",
                  "focus-ring",
                  "hover:-translate-y-1 hover:shadow-lg disabled:opacity-70 disabled:hover:translate-y-0",
                  isReady
                    ? "bg-gradient-to-br from-[#EBF5EE] to-white ring-[#BCE2CD] hover:ring-[#8AC8A5] shadow-xs"
                    : isOccupied
                      ? "bg-gradient-to-br from-[#FEF7EE]/60 to-white ring-[#FADFB8] hover:ring-[#E6BA80] shadow-xs"
                      : "bg-white ring-[#E8E3D8] hover:ring-brand-400 hover:bg-[#FAF8F3] shadow-2xs",
                ].join(" ")}
              >
                {/* Left side accent rail */}
                <span
                  aria-hidden
                  className={[
                    "absolute inset-y-3 left-0 w-1 rounded-r-full transition-all duration-200",
                    isReady
                      ? "bg-[#276B49]"
                      : isOccupied
                        ? "bg-[#9E6523]"
                        : "bg-[#E8E3D8] group-hover:bg-brand-500",
                  ].join(" ")}
                />

                <div className="flex items-start justify-between gap-2 pl-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#8E908C]">
                      Table
                    </span>
                    <p className="text-2xl font-extrabold leading-none tracking-tight text-[#1F2220] font-sans">
                      {table.tableNumber}
                    </p>
                    <p className="mt-1 text-xs text-[#8E908C] font-medium">{table.capacity} seats</p>
                  </div>

                  {isReady ? (
                    <span
                      aria-hidden
                      className="flex size-7 items-center justify-center rounded-xl bg-[#EBF5EE] text-[#276B49] animate-bounce text-sm shadow-xs ring-1 ring-[#BCE2CD]"
                    >
                      🔔
                    </span>
                  ) : isBusy ? (
                    <span
                      aria-hidden
                      className="size-4 animate-spin rounded-full border-2 border-[#D8CEBE] border-t-[#202322]"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-[#B8B9B5] group-hover:text-[#5F615D] transition">
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
                      <div className="flex items-baseline justify-between border-t border-[#F0EBE1] pt-1.5 text-xs">
                        <span className="font-semibold text-[#8E908C] truncate">
                          {order.invoiceNumber || formatOrderNumber(order.orderNumber)}
                        </span>
                        <span className="font-extrabold text-[#1F2220] tabular-nums">
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
