import { api } from "@/services/api";
import type {
  Order,
  Page,
  Payment,
  PaymentMethod,
  PaymentSummary,
  RestaurantSettings,
} from "@/types";

export interface PaymentPayload {
  method: PaymentMethod;
  amount: number;
  receivedAmount?: number;
  reference?: string;
  note?: string;
  /**
   * Generated once per intended payment. The backend refuses a second insert
   * with the same key, so a double-tap or a retry after a flaky connection
   * cannot take the customer money twice.
   */
  clientRequestId?: string;
}

/** A key that is unique per attempt, without needing a crypto polyfill. */
export function newPaymentRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const paymentsService = {
  async forOrder(orderId: string): Promise<PaymentSummary> {
    const { data } = await api.get<PaymentSummary>(`/orders/${orderId}/payments`);
    return data;
  },

  /** Call once per tender. Two calls make a split payment. */
  async add(orderId: string, payload: PaymentPayload): Promise<PaymentSummary> {
    const { data } = await api.post<PaymentSummary>(`/orders/${orderId}/payments`, payload);
    return data;
  },

  /** Submit multiple payments sequentially to settle or partially pay a bill across multiple tenders. */
  async addSplit(orderId: string, payloads: PaymentPayload[]): Promise<PaymentSummary> {
    let lastSummary: PaymentSummary | null = null;
    for (const payload of payloads) {
      lastSummary = await paymentsService.add(orderId, payload);
    }
    if (!lastSummary) {
      return await paymentsService.forOrder(orderId);
    }
    return lastSummary;
  },

  async void(paymentId: string, reason: string): Promise<PaymentSummary> {
    const { data } = await api.post<PaymentSummary>(`/payments/${paymentId}/void`, { reason });
    return data;
  },

  async list(
    params: { method?: PaymentMethod; includeVoided?: boolean; page?: number; pageSize?: number } = {},
  ): Promise<Page<Payment>> {
    const { data } = await api.get<Page<Payment>>("/payments", { params });
    return data;
  },

  async closeOrder(orderId: string): Promise<Order> {
    const { data } = await api.post<Order>(`/orders/${orderId}/close`);
    return data;
  },
};

export const settingsService = {
  async get(): Promise<RestaurantSettings> {
    const { data } = await api.get<RestaurantSettings>("/settings");
    return data;
  },

  async update(payload: Partial<RestaurantSettings>): Promise<RestaurantSettings> {
    const { data } = await api.patch<RestaurantSettings>("/settings", payload);
    return data;
  },
};
