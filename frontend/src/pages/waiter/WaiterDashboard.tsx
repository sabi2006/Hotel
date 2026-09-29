import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import {
  ArmchairIcon,
  BellIcon,
  ChefHatIcon,
  CreditCardIcon,
  HandCoinsIcon,
  ReceiptIcon,
  UtensilsIcon,
} from "@/components/Icons";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";
import { getErrorMessage } from "@/services/api";
import { tablesService } from "@/services/catalog";
import { ordersService } from "@/services/orders";
import type { Order } from "@/types";
import { formatCurrency } from "@/utils/format";

interface Snapshot {
  freeTables: number;
  openOrders: Order[];
  readyOrders: Order[];
  todaySales: number;
  todayOrders: number;
}

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export default function WaiterDashboard() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  useRealtime(() => setRefreshKey((value) => value + 1));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [tables, open, everything] = await Promise.all([
          tablesService.list({ isActive: true }),
          ordersService.list({ openOnly: true, pageSize: 200 }),
          ordersService.list({ pageSize: 200 }),
        ]);
        if (cancelled) return;

        const mine = everything.items.filter(
          (order) => order.waiterId === user?._id && isToday(order.createdAt),
        );

        setSnapshot({
          freeTables: tables.filter((table) => table.status === "FREE").length,
          openOrders: open.items,
          readyOrders: open.items.filter((order) => order.orderStatus === "READY"),
          todayOrders: mine.length,
          todaySales: mine
            .filter((order) => order.orderStatus !== "CANCELLED")
            .reduce((sum, order) => sum + order.grandTotal, 0),
        });
      } catch (caught) {
        if (!cancelled) setError(getErrorMessage(caught, "Could not load your dashboard"));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?._id, refreshKey]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink font-sans">
            Waiter Station
          </h1>
          <p className="mt-0.5 text-xs font-medium text-muted">
            Welcome back, <span className="font-bold text-ink">{user?.name}</span> · Real-time service control center.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link to="/waiter/tables">
            <Button size="md" className="gap-2 shadow-xs">
              <UtensilsIcon size={18} />
              <span>Take Order</span>
            </Button>
          </Link>
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      {snapshot === null && !error ? (
        <Spinner label="Loading shift summary..." />
      ) : snapshot ? (
        <>
          {/* Shift Stat Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Free Tables"
              value={snapshot.freeTables}
              tone="emerald"
              icon={<ArmchairIcon size={20} className="text-success" />}
              hint="Ready for seating"
            />
            <StatCard
              label="Active Orders"
              value={snapshot.openOrders.length}
              tone="brand"
              icon={<ReceiptIcon size={20} className="text-brand-700" />}
              hint="Floor running tickets"
            />
            <StatCard
              label="Food Ready"
              value={snapshot.readyOrders.length}
              tone="amber"
              icon={<ChefHatIcon size={20} className="text-warning" />}
              hint={snapshot.readyOrders.length > 0 ? "Ready in Order Ready section" : "Kitchen preparing"}
            />
            <StatCard
              label="My Shift Sales"
              value={formatCurrency(snapshot.todaySales)}
              tone="sky"
              icon={<HandCoinsIcon size={20} className="text-info" />}
              hint={`${snapshot.todayOrders} total orders today`}
            />
          </div>

          {/* Quick Hub Navigation Cards */}
          <section className="space-y-3 pt-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-subtle">
              Quick Navigation &amp; Operations
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Take Order Card */}
              <Link
                to="/waiter/tables"
                className="card group flex flex-col justify-between p-5 hover:border-brand-400 hover:shadow-sm transition select-none bg-white border-line"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-success ring-1 ring-success-line">
                      <UtensilsIcon size={20} />
                    </div>
                    <span className="text-xs font-bold text-subtle group-hover:text-brand-700 transition">
                      Start →
                    </span>
                  </div>
                  <h3 className="mt-3.5 text-base font-bold text-ink font-sans">
                    Take Order
                  </h3>
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    Select a table and take customer food orders.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-surface-sunken flex items-center justify-between text-xs font-semibold text-muted">
                  <span>Available</span>
                  <span className="font-bold text-success">{snapshot.freeTables} Tables</span>
                </div>
              </Link>

              {/* Orders Directory Card */}
              <Link
                to="/waiter/orders"
                className="card group flex flex-col justify-between p-5 hover:border-brand-400 hover:shadow-sm transition select-none bg-white border-line"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-info-soft text-info ring-1 ring-info-line">
                      <ReceiptIcon size={20} />
                    </div>
                    <span className="text-xs font-bold text-subtle group-hover:text-brand-700 transition">
                      Manage →
                    </span>
                  </div>
                  <h3 className="mt-3.5 text-base font-bold text-ink font-sans">
                    All Orders
                  </h3>
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    Track in-flight order tickets &amp; items.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-surface-sunken flex items-center justify-between text-xs font-semibold text-muted">
                  <span>Running</span>
                  <span className="font-bold text-info">{snapshot.openOrders.length} Tickets</span>
                </div>
              </Link>

              {/* Order Ready Card */}
              <Link
                to="/waiter/order-ready"
                className="card group flex flex-col justify-between p-5 hover:border-brand-400 hover:shadow-sm transition select-none bg-white border-line"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-warning-soft text-warning ring-1 ring-warning-line">
                      <BellIcon size={20} />
                    </div>
                    {snapshot.readyOrders.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-0.5 text-[11px] font-extrabold text-white shadow-xs">
                        {snapshot.readyOrders.length} Ready
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-subtle group-hover:text-brand-700 transition">
                        Open →
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3.5 text-base font-bold text-ink font-sans">
                    Order Ready
                  </h3>
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    Deliver kitchen-prepared food to tables.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-surface-sunken flex items-center justify-between text-xs font-semibold text-muted">
                  <span>Ready Food</span>
                  <span className={`font-bold ${snapshot.readyOrders.length > 0 ? "text-success" : "text-subtle"}`}>
                    {snapshot.readyOrders.length > 0 ? `${snapshot.readyOrders.length} to Serve` : "None"}
                  </span>
                </div>
              </Link>

              {/* Close Order Card */}
              <Link
                to="/waiter/close-order"
                className="card group flex flex-col justify-between p-5 hover:border-brand-400 hover:shadow-sm transition select-none bg-white border-line"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-surface-soft text-brand-800 ring-1 ring-warning-line">
                      <CreditCardIcon size={20} />
                    </div>
                    <span className="text-xs font-bold text-subtle group-hover:text-brand-700 transition">
                      Open →
                    </span>
                  </div>
                  <h3 className="mt-3.5 text-base font-bold text-ink font-sans">
                    Close Order
                  </h3>
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    Collect payments, tips &amp; free tables.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-surface-sunken flex items-center justify-between text-xs font-semibold text-muted">
                  <span>Settlement</span>
                  <span className="font-bold text-brand-700">Pay &amp; Close</span>
                </div>
              </Link>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
