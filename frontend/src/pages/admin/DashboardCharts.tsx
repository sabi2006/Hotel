import { ChartCard } from "@/components/charts/ChartCard";
import { PaymentSplitChart, RankedBarChart, SalesTrendChart } from "@/components/charts/Charts";
import { shortenSeriesLabel } from "@/components/charts/chartTheme";
import type { ProductRow, SalesSummary, SeriesPoint } from "@/services/reports";
import { formatCurrency } from "@/utils/format";

/**
 * The dashboard charts, in their own chunk.
 *
 * Three, deliberately: a trend, a split, and a ranking. More than that on one
 * screen and none of them get read.
 */
export default function DashboardCharts({
  series,
  topProducts,
  summary,
}: {
  series: SeriesPoint[];
  topProducts: ProductRow[];
  summary: SalesSummary;
}) {
  const paymentRows = [
    { name: "Cash", value: summary.cashAmount },
    { name: "UPI", value: summary.upiAmount },
    { name: "Card", value: summary.cardAmount },
  ].filter((row) => row.value > 0);

  return (
    <>
      <ChartCard
        title="Sales, last 14 days"
        subtitle="Order value per day"
        rows={series}
        columns={[
          { header: "Day", value: (row) => shortenSeriesLabel(row.label) },
          { header: "Sales", value: (row) => formatCurrency(row.sales), align: "right" },
          { header: "Orders", value: (row) => row.orders, align: "right" },
        ]}
      >
        <SalesTrendChart data={series} />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="How customers paid today"
          rows={paymentRows}
          columns={[
            { header: "Method", value: (row) => row.name },
            { header: "Amount", value: (row) => formatCurrency(row.value), align: "right" },
          ]}
        >
          <PaymentSplitChart data={paymentRows} />
        </ChartCard>

        <ChartCard
          title="Best sellers today"
          subtitle="By revenue"
          rows={topProducts}
          columns={[
            { header: "Product", value: (row) => row.name },
            { header: "Qty", value: (row) => row.quantitySold, align: "right" },
            { header: "Revenue", value: (row) => formatCurrency(row.revenue), align: "right" },
          ]}
        >
          <RankedBarChart
            data={topProducts.map((row) => ({ name: row.name, value: row.revenue }))}
          />
        </ChartCard>
      </div>
    </>
  );
}
