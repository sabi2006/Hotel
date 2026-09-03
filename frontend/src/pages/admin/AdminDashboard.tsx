import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Alert } from "@/components/Alert";
import {
  ArmchairIcon,
  BarChartIcon,
  CreditCardIcon,
  HandCoinsIcon,
  ReceiptIcon,
  UtensilsIcon,
} from "@/components/Icons";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/services/api";
import { categoriesService, productsService, tablesService } from "@/services/catalog";
import { reportsService, windowForPreset } from "@/services/reports";
import type { ProductRow, SalesSummary, SeriesPoint } from "@/services/reports";
import { usersService } from "@/services/users";
import { UserRole } from "@/types";
import { formatCurrency } from "@/utils/format";

const DashboardCharts = lazy(() => import("@/pages/admin/DashboardCharts"));

interface Setup {
  waiters: number;
  kitchen: number;
  categories: number;
  products: number;
  tables: number;
  freeTables: number;
}

export default function AdminDashboard() {
  const { user } = useAuth();

  const [setup, setSetup] = useState<Setup | null>(null);
  const [today, setToday] = useState<SalesSummary | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [topProducts, setTopProducts] = useState<ProductRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const todayWindow = windowForPreset("today");
        const trendWindow = windowForPreset("custom", {
          from: new Date(Date.now() - 13 * 86_400_000).toISOString(),
          to: new Date().toISOString(),
        });

        const [waiters, kitchen, categories, products, tables, summary, points, best] =
          await Promise.all([
            usersService.list({ role: UserRole.WAITER, pageSize: 1 }),
            usersService.list({ role: UserRole.KITCHEN, pageSize: 1 }),
            categoriesService.list(),
            productsService.list({ pageSize: 1 }),
            tablesService.list(),
            reportsService.summary(todayWindow),
            reportsService.series(trendWindow, "day"),
            reportsService.products(todayWindow, 5),
          ]);

        if (cancelled) return;
        setSetup({
          waiters: waiters.total,
          kitchen: kitchen.total,
          categories: categories.length,
          products: products.total,
          tables: tables.length,
          freeTables: tables.filter((table) => table.status === "FREE").length,
        });
        setToday(summary);
        setSeries(points);
        setTopProducts(best);
      } catch (caught) {
        if (!cancelled) setError(getErrorMessage(caught, "Could not load the dashboard"));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setupSteps = setup
    ? [
        { label: "Configure Food Categories", done: setup.categories > 0, to: "/admin/categories" },
        { label: "Add Menu Products & Rates", done: setup.products > 0, to: "/admin/products" },
        { label: "Setup Restaurant Tables", done: setup.tables > 0, to: "/admin/tables" },
        { label: "Create Waiter & Kitchen Staff", done: setup.waiters + setup.kitchen > 0, to: "/admin/staff" },
      ]
    : [];
  const remaining = setupSteps.filter((step) => !step.done);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1F2220] font-sans">
            Executive Dashboard
          </h1>
          <p className="mt-0.5 text-xs font-medium text-[#6F716D]">
            Welcome, <span className="font-bold text-[#1F2220]">{user?.name}</span> · Live hospitality analytics &amp; revenue summary.
          </p>
        </div>
        <Link
          to="/admin/reports"
          className="flex items-center gap-1.5 text-xs font-bold text-brand-800 hover:text-brand-900 bg-[#FAF6EE] px-3.5 py-2 rounded-xl ring-1 ring-[#E8DCB8] transition shadow-2xs"
        >
          <BarChartIcon size={14} />
          <span>Full Analytics Reports →</span>
        </Link>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      {today === null && !error ? (
        <Spinner label="Loading today's metrics" />
      ) : today ? (
        <>
          {/* Primary Revenue Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Today's Sales"
              value={formatCurrency(today.totalSales)}
              tone="brand"
              icon={<ReceiptIcon size={20} className="text-brand-700" />}
              hint={`${today.totalOrders} total orders processed`}
            />
            <StatCard
              label="Collected Revenue"
              value={formatCurrency(today.totalCollected)}
              tone="emerald"
              icon={<CreditCardIcon size={20} className="text-[#276B49]" />}
              hint={
                today.pendingAmount > 0
                  ? `${formatCurrency(today.pendingAmount)} balance pending`
                  : "All orders settled"
              }
            />
            <StatCard
              label="Average Order Value"
              value={formatCurrency(today.averageOrderValue)}
              tone="sky"
              icon={<UtensilsIcon size={20} className="text-[#365D7B]" />}
              hint={`${today.itemsSold} items sold today`}
            />
            <StatCard
              label="Staff Tips Collected"
              value={formatCurrency(today.totalTips)}
              tone="amber"
              icon={<HandCoinsIcon size={20} className="text-[#9E6523]" />}
              hint="Direct staff gratuity"
            />
          </div>

          {/* Payment Method Distribution */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Cash Collected" value={formatCurrency(today.cashAmount)} />
            <StatCard label="UPI Digital" value={formatCurrency(today.upiAmount)} />
            <StatCard label="Card POS" value={formatCurrency(today.cardAmount)} />
            <StatCard
              label="Table Occupancy"
              value={setup ? `${setup.tables - setup.freeTables} / ${setup.tables}` : "-"}
              tone="purple"
              icon={<ArmchairIcon size={20} className="text-[#6B4F8C]" />}
              hint={setup ? `${setup.freeTables} tables free now` : ""}
            />
          </div>

          {/* Analytical Charts */}
          <Suspense fallback={<Spinner label="Loading visual charts" />}>
            <DashboardCharts series={series} topProducts={topProducts} summary={today} />
          </Suspense>

          {/* Setup Checklist */}
          {remaining.length > 0 && (
            <section className="card p-6 space-y-4 shadow-sm select-none bg-white border border-[#EBE7DF]">
              <div>
                <h2 className="text-base font-bold text-[#1F2220] font-sans">Restaurant Setup Guide</h2>
                <p className="mt-0.5 text-xs text-[#6F716D]">
                  Complete these initial setup steps before taking customer orders on the floor.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {setupSteps.map((step) => (
                  <div
                    key={step.to}
                    className={`flex items-center justify-between p-3.5 rounded-xl ring-1 transition ${
                      step.done
                        ? "bg-[#EBF5EE]/60 ring-[#BCE2CD]"
                        : "bg-[#FAF8F5] ring-[#E8E3D8] hover:bg-white hover:ring-brand-400"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex size-6 items-center justify-center rounded-lg text-xs font-bold ${
                          step.done ? "bg-[#276B49] text-white" : "bg-[#FAF8F5] text-[#5F615D] ring-1 ring-[#E8E3D8]"
                        }`}
                      >
                        {step.done ? "✓" : "•"}
                      </span>
                      <span className={`text-xs font-bold ${step.done ? "text-[#8E908C] line-through" : "text-[#1F2220]"}`}>
                        {step.label}
                      </span>
                    </div>
                    {!step.done && (
                      <Link to={step.to} className="text-xs font-bold text-brand-800 hover:text-brand-900">
                        Set up →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
