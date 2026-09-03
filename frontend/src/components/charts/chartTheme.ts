/**
 * Chart tokens.
 *
 * Warm luxury restaurant palette with strong contrast and readability.
 */

export const SERIES = {
  /** Slot 1 - Warm bronze luxury accent. */
  primary: "#B58D54",
  /** Slot 2 - Muted sage emerald. */
  secondary: "#3F8F68",
  /** Slot 3 - Soft mineral slate blue. */
  tertiary: "#6688A8",
} as const;

/** Fixed order. Never cycled, never generated. */
export const CATEGORICAL = [SERIES.primary, SERIES.secondary, SERIES.tertiary] as const;

/**
 * Colour follows the payment method.
 */
export const PAYMENT_COLOURS: Record<string, string> = {
  Cash: SERIES.primary,
  UPI: SERIES.secondary,
  Card: SERIES.tertiary,
};

export const CHART_INK = {
  surface: "#FFFFFF",
  grid: "#F0EBE1",
  axis: "#8E908C",
  textPrimary: "#1F2220",
  textSecondary: "#5F615D",
  textMuted: "#8E908C",
} as const;

/** Mark specs, applied identically across every chart. */
export const MARK = {
  barMaxSize: 24,
  barRadius: [6, 6, 0, 0] as [number, number, number, number],
  barRadiusHorizontal: [0, 6, 6, 0] as [number, number, number, number],
  lineWidth: 2.5,
  dotRadius: 4,
  /** The 2px surface ring that keeps a dot legible where it crosses the line. */
  dotRingWidth: 2,
} as const;

const compact = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Axis ticks: short, so they never collide. */
export const formatAxisCurrency = (value: number): string =>
  value === 0 ? "0" : `₹${compact.format(value)}`;

export const formatAxisNumber = (value: number): string =>
  value === 0 ? "0" : compact.format(value);

/** "2026-09-02" -> "2 Sep"; "2026-09" -> "Sep 2026"; passes anything else through. */
export function shortenSeriesLabel(label: string): string {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (dayMatch) {
    const date = new Date(`${label}T00:00:00`);
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(label);
  if (monthMatch) {
    const date = new Date(`${label}-01T00:00:00`);
    return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  }

  // Hourly buckets arrive as "2026-09-02 18:00".
  const hourMatch = /(\d{2}):00$/.exec(label);
  if (hourMatch) return `${hourMatch[1]}:00`;

  return label;
}
