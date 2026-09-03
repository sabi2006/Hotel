import { api } from "@/services/api";

export interface DateWindow {
  fromDate: string;
  toDate: string;
  tzOffsetMinutes: number;
}

export interface SalesSummary {
  totalSales: number;
  netSales: number;
  totalGst: number;
  totalDiscount: number;
  totalOrders: number;
  cancelledOrders: number;
  itemsSold: number;
  averageOrderValue: number;
  totalCollected: number;
  cashAmount: number;
  upiAmount: number;
  cardAmount: number;
  pendingAmount: number;
  totalTips: number;
  cashTips: number;
  upiTips: number;
}

export interface SeriesPoint {
  label: string;
  sales: number;
  orders: number;
  collected: number;
}

export interface HourPoint {
  hour: number;
  label: string;
  sales: number;
  orders: number;
}

export interface ProductRow {
  productId: string | null;
  name: string;
  quantitySold: number;
  revenue: number;
}

export interface CategoryRow {
  name: string;
  quantitySold: number;
  revenue: number;
}

export interface WaiterRow {
  waiterId: string;
  name: string;
  orders: number;
  sales: number;
  averageOrderValue: number;
  tips: number;
}

export interface TableRow {
  tableNumber: string;
  orders: number;
  sales: number;
  averageOrderValue: number;
}

export interface KitchenReport {
  ordersPrepared: number;
  averageAcceptMinutes: number;
  averagePrepMinutes: number;
  averageTotalMinutes: number;
  slowestPrepMinutes: number;
}

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "custom";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This week",
  lastWeek: "Last week",
  thisMonth: "This month",
  lastMonth: "Last month",
  thisYear: "This year",
  custom: "Custom range",
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/** Monday-start week, which is how a restaurant week is usually counted. */
function startOfWeek(date: Date): Date {
  const copy = startOfDay(date);
  const weekday = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - weekday);
  return copy;
}

/**
 * Turn a preset into a UTC window.
 *
 * Boundaries are computed from the browser clock so "today" means the
 * restaurant local day, then sent as UTC. toISOString always ends in Z, which
 * also avoids the unencoded "+" that an ISO offset would put in a query string.
 */
export function windowForPreset(preset: PeriodPreset, custom?: { from: string; to: string }): DateWindow {
  const now = new Date();
  let from = startOfDay(now);
  let to = endOfDay(now);

  switch (preset) {
    case "yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      from = startOfDay(yesterday);
      to = endOfDay(yesterday);
      break;
    }
    case "thisWeek":
      from = startOfWeek(now);
      break;
    case "lastWeek": {
      const thisWeek = startOfWeek(now);
      from = new Date(thisWeek);
      from.setDate(from.getDate() - 7);
      to = new Date(thisWeek);
      to.setMilliseconds(-1);
      break;
    }
    case "thisMonth":
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      break;
    case "lastMonth":
      from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      break;
    case "thisYear":
      from = startOfDay(new Date(now.getFullYear(), 0, 1));
      break;
    case "custom":
      if (custom?.from) from = startOfDay(new Date(custom.from));
      if (custom?.to) to = endOfDay(new Date(custom.to));
      break;
    default:
      break;
  }

  return {
    fromDate: from.toISOString(),
    toDate: to.toISOString(),
    // Minutes to add to UTC to reach local time.
    tzOffsetMinutes: -now.getTimezoneOffset(),
  };
}

/** How many buckets make sense for the length of the window. */
export function granularityFor(window: DateWindow): "hour" | "day" | "month" {
  const days =
    (new Date(window.toDate).getTime() - new Date(window.fromDate).getTime()) / 86_400_000;
  if (days <= 2) return "hour";
  if (days <= 120) return "day";
  return "month";
}

export const reportsService = {
  async summary(window: DateWindow): Promise<SalesSummary> {
    const { data } = await api.get<SalesSummary>("/reports/summary", { params: window });
    return data;
  },

  async series(window: DateWindow, granularity: string): Promise<SeriesPoint[]> {
    const { data } = await api.get<SeriesPoint[]>("/reports/series", {
      params: { ...window, granularity },
    });
    return data;
  },

  async peakHours(window: DateWindow): Promise<HourPoint[]> {
    const { data } = await api.get<HourPoint[]>("/reports/peak-hours", { params: window });
    return data;
  },

  async products(window: DateWindow, limit = 10): Promise<ProductRow[]> {
    const { data } = await api.get<ProductRow[]>("/reports/products", {
      params: { ...window, limit },
    });
    return data;
  },

  async categories(window: DateWindow): Promise<CategoryRow[]> {
    const { data } = await api.get<CategoryRow[]>("/reports/categories", { params: window });
    return data;
  },

  async waiters(window: DateWindow): Promise<WaiterRow[]> {
    const { data } = await api.get<WaiterRow[]>("/reports/waiters", { params: window });
    return data;
  },

  async tables(window: DateWindow): Promise<TableRow[]> {
    const { data } = await api.get<TableRow[]>("/reports/tables", { params: window });
    return data;
  },

  async kitchen(window: DateWindow): Promise<KitchenReport> {
    const { data } = await api.get<KitchenReport>("/reports/kitchen", { params: window });
    return data;
  },
};
