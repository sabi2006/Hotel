import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/Alert";
import {
  BarChartIcon,
  ChefHatIcon,
  CreditCardIcon,
  HandCoinsIcon,
  ReceiptIcon,
  UsersIcon,
  UtensilsIcon,
} from "@/components/Icons";
import { Input } from "@/components/Input";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { ChartCard } from "@/components/charts/ChartCard";
import {
  OrdersChart,
  PaymentSplitChart,
  PeakHoursChart,
  RankedBarChart,
  SalesTrendChart,
} from "@/components/charts/Charts";
import { SERIES, shortenSeriesLabel } from "@/components/charts/chartTheme";
import { getErrorMessage } from "@/services/api";
import {
  PERIOD_LABELS,
  granularityFor,
  reportsService,
  windowForPreset,
} from "@/services/reports";
import type {
  CategoryRow,
  HourPoint,
  KitchenReport,
  PeriodPreset,
  ProductRow,
  SalesSummary,
  SeriesPoint,
  TableRow,
  WaiterRow,
} from "@/services/reports";
import { formatCurrency } from "@/utils/format";

const PRESETS: PeriodPreset[] = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "custom",
];

interface ReportData {
  summary: SalesSummary;
  series: SeriesPoint[];
  hours: HourPoint[];
  products: ProductRow[];
  categories: CategoryRow[];
  waiters: WaiterRow[];
  tables: TableRow[];
  kitchen: KitchenReport;
}

function minutesLabel(value: number): string {
  if (value <= 0) return "-";
  if (value < 60) return `${value.toFixed(1)} min`;
  return `${Math.floor(value / 60)}h ${Math.round(value % 60)}m`;
}

export default function ReportsPage() {
  const [preset, setPreset] = useState<PeriodPreset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [data, setData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const window = useMemo(
    () => windowForPreset(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo],
  );

  const load = useCallback(async () => {
    try {
      const granularity = granularityFor(window);
      const [summary, series, hours, products, categories, waiters, tables, kitchen] =
        await Promise.all([
          reportsService.summary(window),
          reportsService.series(window, granularity),
          reportsService.peakHours(window),
          reportsService.products(window, 10),
          reportsService.categories(window),
          reportsService.waiters(window),
          reportsService.tables(window),
          reportsService.kitchen(window),
        ]);
      setData({ summary, series, hours, products, categories, waiters, tables, kitchen });
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load reports"));
    } finally {
      setIsLoading(false);
    }
  }, [window]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [load]);

  const paymentRows = data
    ? [
        { name: "Cash", value: data.summary.cashAmount },
        { name: "UPI", value: data.summary.upiAmount },
        { name: "Card", value: data.summary.cardAmount },
      ].filter((row) => row.value > 0)
    : [];

  return (
    <div className="space-y-6 select-none">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChartIcon size={24} className="text-brand-600" />
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">
              Analytics &amp; Performance Reports
            </h1>
          </div>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Revenue trends, peak hours, menu popularity, waiter efficiency, and kitchen speed.
          </p>
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      {/* Date Presets Bar */}
      <div className="card p-3 sm:p-4 space-y-3 shadow-2xs bg-white border border-[#EBE7DF]">
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 no-scrollbar sm:flex-wrap">
          {PRESETS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPreset(option)}
              aria-pressed={preset === option}
              className={[
                "pressable shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition select-none",
                preset === option
                  ? "bg-[#202322] text-white shadow-md shadow-charcoal-950/20"
                  : "bg-white text-[#5F615D] ring-1 ring-[#E8E3D8] hover:bg-[#FAF8F3] hover:text-[#1F2220]",
              ].join(" ")}
            >
              {PERIOD_LABELS[option]}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
            <div className="min-w-44">
              <Input
                label="Date Range From"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div className="min-w-44">
              <Input
                label="Date Range To"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <Spinner label="Generating analytical reports" />
      ) : data ? (
        <>
          {/* Headline Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Gross Sales"
              value={formatCurrency(data.summary.totalSales)}
              tone="brand"
              icon={<ReceiptIcon size={20} className="text-brand-600" />}
              hint={`${data.summary.totalOrders} total orders`}
            />
            <StatCard
              label="Revenue Collected"
              value={formatCurrency(data.summary.totalCollected)}
              tone="emerald"
              icon={<CreditCardIcon size={20} className="text-emerald-600" />}
              hint={
                data.summary.pendingAmount > 0
                  ? `${formatCurrency(data.summary.pendingAmount)} still due`
                  : "All settled"
              }
            />
            <StatCard
              label="Average Order Value"
              value={formatCurrency(data.summary.averageOrderValue)}
              tone="sky"
              icon={<UtensilsIcon size={20} className="text-sky-600" />}
              hint={`${data.summary.itemsSold} items sold`}
            />
            <StatCard
              label="Staff Tips Collected"
              value={formatCurrency(data.summary.totalTips)}
              tone="amber"
              icon={<HandCoinsIcon size={20} className="text-amber-600" />}
              hint="Direct gratuity"
            />
          </div>

          {/* Tax and Discount Breakdown */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Net Sales (Excl. GST)" value={formatCurrency(data.summary.netSales)} />
            <StatCard label="GST Tax Collected" value={formatCurrency(data.summary.totalGst)} />
            <StatCard label="Discounts Given" value={formatCurrency(data.summary.totalDiscount)} />
            <StatCard
              label="Cancelled Orders"
              value={data.summary.cancelledOrders}
              hint="Excluded from total"
            />
          </div>

          {/* Charts Row 1: Sales & Orders */}
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Revenue Velocity"
              subtitle="Sales and collections across selected timeframe"
              rows={data.series}
              columns={[
                { header: "Period", value: (row) => shortenSeriesLabel(row.label) },
                {
                  header: "Sales",
                  value: (row) => formatCurrency(row.sales),
                  align: "right",
                },
                {
                  header: "Collected",
                  value: (row) => formatCurrency(row.collected),
                  align: "right",
                },
              ]}
            >
              <SalesTrendChart data={data.series} />
            </ChartCard>

            <ChartCard
              title="Order Volume"
              subtitle="Order counts processed per time bucket"
              rows={data.series}
              columns={[
                { header: "Period", value: (row) => shortenSeriesLabel(row.label) },
                { header: "Orders", value: (row) => row.orders, align: "right" },
              ]}
            >
              <OrdersChart data={data.series} />
            </ChartCard>
          </div>

          {/* Charts Row 2: Payments & Peak Hours */}
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Payment Tender Distribution"
              subtitle="Revenue breakdown across tender methods"
              rows={paymentRows}
              columns={[
                { header: "Method", value: (row) => row.name },
                {
                  header: "Amount",
                  value: (row) => formatCurrency(row.value),
                  align: "right",
                },
              ]}
            >
              <PaymentSplitChart data={paymentRows} />
            </ChartCard>

            <ChartCard
              title="Peak Dining Hours"
              subtitle="Order rush and sales volume by hour of day"
              rows={data.hours.filter((hour) => hour.sales > 0)}
              columns={[
                { header: "Hour", value: (row) => row.label },
                { header: "Orders", value: (row) => row.orders, align: "right" },
                {
                  header: "Sales",
                  value: (row) => formatCurrency(row.sales),
                  align: "right",
                },
              ]}
            >
              <PeakHoursChart data={data.hours} />
            </ChartCard>
          </div>

          {/* Charts Row 3: Top Products & Categories */}
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Top Selling Dishes"
              subtitle="Highest revenue generating menu items"
              rows={data.products}
              columns={[
                { header: "Product", value: (row) => row.name },
                { header: "Qty", value: (row) => row.quantitySold, align: "right" },
                {
                  header: "Revenue",
                  value: (row) => formatCurrency(row.revenue),
                  align: "right",
                },
              ]}
            >
              <RankedBarChart
                data={data.products.map((row) => ({ name: row.name, value: row.revenue }))}
              />
            </ChartCard>

            <ChartCard
              title="Category Performance"
              subtitle="Revenue by menu sections"
              rows={data.categories}
              columns={[
                { header: "Category", value: (row) => row.name },
                { header: "Qty", value: (row) => row.quantitySold, align: "right" },
                {
                  header: "Revenue",
                  value: (row) => formatCurrency(row.revenue),
                  align: "right",
                },
              ]}
            >
              <RankedBarChart
                data={data.categories.map((row) => ({ name: row.name, value: row.revenue }))}
                color={SERIES.secondary}
              />
            </ChartCard>
          </div>

          {/* Staff and Kitchen Operational Metrics */}
          <section className="grid gap-5 xl:grid-cols-2">
            {/* Waiter Leaderboard */}
            <div className="card p-5 space-y-3 shadow-xs">
              <div className="flex items-center gap-2">
                <UsersIcon size={18} className="text-brand-600" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 font-sans">
                  Waiter Sales &amp; Tip Metrics
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs sm:text-sm">
                  <thead className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="py-2.5">Waiter</th>
                      <th className="py-2.5 text-right">Orders</th>
                      <th className="py-2.5 text-right">Sales</th>
                      <th className="py-2.5 text-right">Avg Order</th>
                      <th className="py-2.5 text-right">Tips</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.waiters.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400 font-medium">
                          No waiter activity in this timeframe
                        </td>
                      </tr>
                    ) : (
                      data.waiters.map((row) => (
                        <tr key={row.waiterId}>
                          <td className="py-2.5 font-bold text-slate-900">{row.name}</td>
                          <td className="py-2.5 text-right text-slate-600 font-medium">{row.orders}</td>
                          <td className="py-2.5 text-right font-extrabold text-slate-900 tabular-nums">
                            {formatCurrency(row.sales)}
                          </td>
                          <td className="py-2.5 text-right text-slate-600 tabular-nums">
                            {formatCurrency(row.averageOrderValue)}
                          </td>
                          <td className="py-2.5 text-right font-bold text-amber-600 tabular-nums">
                            {formatCurrency(row.tips)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Kitchen and Table Turnaround */}
            <div className="space-y-5">
              <div className="card p-5 space-y-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <ChefHatIcon size={18} className="text-brand-600" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 font-sans">
                    Kitchen Preparation Turnaround
                  </h2>
                </div>
                <dl className="grid grid-cols-2 gap-4 text-xs sm:text-sm">
                  <div className="p-3 bg-slate-50 rounded-xl ring-1 ring-slate-200/70">
                    <dt className="text-slate-500 font-medium">Orders Prepared</dt>
                    <dd className="mt-1 text-lg font-extrabold text-slate-900 font-sans">
                      {data.kitchen.ordersPrepared} tickets
                    </dd>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl ring-1 ring-slate-200/70">
                    <dt className="text-slate-500 font-medium">Avg Kitchen Pickup</dt>
                    <dd className="mt-1 text-lg font-extrabold text-slate-900 font-sans">
                      {minutesLabel(data.kitchen.averageAcceptMinutes)}
                    </dd>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl ring-1 ring-slate-200/70">
                    <dt className="text-slate-500 font-medium">Avg Cook Time</dt>
                    <dd className="mt-1 text-lg font-extrabold text-slate-900 font-sans">
                      {minutesLabel(data.kitchen.averagePrepMinutes)}
                    </dd>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl ring-1 ring-slate-200/70">
                    <dt className="text-slate-500 font-medium">Slowest Ticket Time</dt>
                    <dd className="mt-1 text-lg font-extrabold text-slate-900 font-sans">
                      {minutesLabel(data.kitchen.slowestPrepMinutes)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
