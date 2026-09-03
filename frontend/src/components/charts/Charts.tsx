import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/charts/ChartCard";
import {
  CHART_INK,
  MARK,
  PAYMENT_COLOURS,
  SERIES,
  formatAxisCurrency,
  formatAxisNumber,
  shortenSeriesLabel,
} from "@/components/charts/chartTheme";
import { formatCurrency } from "@/utils/format";

const AXIS_PROPS = {
  stroke: CHART_INK.axis,
  tick: { fill: CHART_INK.textMuted, fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

/** One hairline grid, solid and recessive. Never dashed. */
function Grid({ horizontal = true, vertical = false }) {
  return (
    <CartesianGrid
      horizontal={horizontal}
      vertical={vertical}
      stroke={CHART_INK.grid}
      strokeWidth={1}
    />
  );
}

interface SeriesDatum {
  label: string;
  sales: number;
  orders: number;
  collected: number;
}

/** Trend over time. One series, so no legend - the card title names it. */
export function SalesTrendChart({ data }: { data: SeriesDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <Grid />
        <XAxis dataKey="label" tickFormatter={shortenSeriesLabel} {...AXIS_PROPS} />
        <YAxis tickFormatter={formatAxisCurrency} width={56} {...AXIS_PROPS} />
        <Tooltip
          cursor={{ stroke: CHART_INK.axis, strokeWidth: 1 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <ChartTooltip
                label={shortenSeriesLabel(String(label))}
                entries={[
                  {
                    name: "Sales",
                    value: formatCurrency(Number(payload[0].value)),
                    color: SERIES.primary,
                  },
                ]}
              />
            ) : null
          }
        />
        <Line
          type="monotone"
          dataKey="sales"
          stroke={SERIES.primary}
          strokeWidth={MARK.lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={{
            r: MARK.dotRadius + 1,
            fill: SERIES.primary,
            stroke: CHART_INK.surface,
            strokeWidth: MARK.dotRingWidth,
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Order counts. A separate chart from sales - never a second y-axis. */
export function OrdersChart({ data }: { data: SeriesDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <Grid />
        <XAxis dataKey="label" tickFormatter={shortenSeriesLabel} {...AXIS_PROPS} />
        <YAxis tickFormatter={formatAxisNumber} width={40} allowDecimals={false} {...AXIS_PROPS} />
        <Tooltip
          cursor={{ fill: CHART_INK.grid, fillOpacity: 0.5 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <ChartTooltip
                label={shortenSeriesLabel(String(label))}
                entries={[
                  { name: "Orders", value: String(payload[0].value), color: SERIES.primary },
                ]}
              />
            ) : null
          }
        />
        <Bar
          dataKey="orders"
          fill={SERIES.primary}
          maxBarSize={MARK.barMaxSize}
          radius={MARK.barRadius}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface NamedValue {
  name: string;
  value: number;
}

/**
 * Horizontal bars for magnitude with long names - top products, categories.
 * Values are labelled at the tip, which is also the relief the palette requires.
 */
export function RankedBarChart({
  data,
  color = SERIES.primary,
  isCurrency = true,
}: {
  data: NamedValue[];
  color?: string;
  isCurrency?: boolean;
}) {
  const height = Math.max(180, data.length * 34 + 40);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 64, bottom: 4, left: 8 }}
      >
        <Grid horizontal={false} vertical />
        <XAxis
          type="number"
          tickFormatter={isCurrency ? formatAxisCurrency : formatAxisNumber}
          {...AXIS_PROPS}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={130}
          tick={{ fill: CHART_INK.textSecondary, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: CHART_INK.grid, fillOpacity: 0.5 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <ChartTooltip
                label={String(payload[0].payload.name)}
                entries={[
                  {
                    name: isCurrency ? "Revenue" : "Quantity",
                    value: isCurrency
                      ? formatCurrency(Number(payload[0].value))
                      : String(payload[0].value),
                    color,
                  },
                ]}
              />
            ) : null
          }
        />
        <Bar
          dataKey="value"
          fill={color}
          maxBarSize={MARK.barMaxSize}
          radius={MARK.barRadiusHorizontal}
          label={{
            position: "right",
            fill: CHART_INK.textSecondary,
            fontSize: 11,
            formatter: (value: unknown) =>
              isCurrency ? formatCurrency(Number(value)) : String(value),
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Part-to-whole across the payment methods.
 *
 * A horizontal bar per method rather than a pie: three slices are easier to
 * compare as lengths than as angles, and each carries its own value label.
 */
export function PaymentSplitChart({ data }: { data: NamedValue[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(150, data.length * 44 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 76, bottom: 4, left: 8 }}>
        <Grid horizontal={false} vertical />
        <XAxis type="number" tickFormatter={formatAxisCurrency} {...AXIS_PROPS} />
        <YAxis
          type="category"
          dataKey="name"
          width={64}
          tick={{ fill: CHART_INK.textSecondary, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: CHART_INK.grid, fillOpacity: 0.5 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <ChartTooltip
                label={String(payload[0].payload.name)}
                entries={[
                  { name: "Collected", value: formatCurrency(Number(payload[0].value)) },
                ]}
              />
            ) : null
          }
        />
        <Bar
          dataKey="value"
          maxBarSize={MARK.barMaxSize}
          radius={MARK.barRadiusHorizontal}
          label={{
            position: "right",
            fill: CHART_INK.textSecondary,
            fontSize: 11,
            formatter: (value: unknown) => formatCurrency(Number(value)),
          }}
        >
          {/* Fixed slot order, so a method keeps its colour as the data changes. */}
          {data.map((entry) => (
            <Cell key={entry.name} fill={PAYMENT_COLOURS[entry.name] ?? SERIES.primary} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Trade through the day. Every hour present, so there are no gaps. */
export function PeakHoursChart({ data }: { data: { label: string; sales: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <Grid />
        <XAxis
          dataKey="label"
          interval={2}
          {...AXIS_PROPS}
        />
        <YAxis tickFormatter={formatAxisCurrency} width={56} {...AXIS_PROPS} />
        <Tooltip
          cursor={{ fill: CHART_INK.grid, fillOpacity: 0.5 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <ChartTooltip
                label={String(label)}
                entries={[
                  {
                    name: "Sales",
                    value: formatCurrency(Number(payload[0].value)),
                    color: SERIES.primary,
                  },
                ]}
              />
            ) : null
          }
        />
        <Bar
          dataKey="sales"
          fill={SERIES.primary}
          maxBarSize={MARK.barMaxSize}
          radius={MARK.barRadius}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
