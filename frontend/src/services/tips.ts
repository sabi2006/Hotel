import { api } from "@/services/api";
import type { Page, Tip, TipMethod, TipSummary, User } from "@/types";

export interface WaiterTipQr {
  _id: string;
  name: string;
  tipUpiId: string | null;
  tipQrImage: string | null;
}

export interface TipPayload {
  amount: number;
  method: TipMethod;
  waiterId?: string;
  reference?: string;
  note?: string;
}

export const tipsService = {
  async forOrder(orderId: string): Promise<TipSummary> {
    const { data } = await api.get<TipSummary>(`/orders/${orderId}/tips`);
    return data;
  },

  async add(orderId: string, payload: TipPayload): Promise<TipSummary> {
    const { data } = await api.post<TipSummary>(`/orders/${orderId}/tips`, payload);
    return data;
  },

  async void(tipId: string, reason: string): Promise<TipSummary> {
    const { data } = await api.post<TipSummary>(`/tips/${tipId}/void`, { reason });
    return data;
  },

  /** Admins see every tip; a waiter is scoped to their own by the backend. */
  async list(
    params: { waiterId?: string; includeVoided?: boolean; page?: number; pageSize?: number } = {},
  ): Promise<Page<Tip>> {
    const { data } = await api.get<Page<Tip>>("/tips", { params });
    return data;
  },

  async updateMyTipQr(payload: { tipUpiId?: string; tipQrImage?: string }): Promise<User> {
    const { data } = await api.patch<User>("/auth/me/tip-qr", payload);
    return data;
  },

  /** Just enough of a waiter record to show their QR at the table. */
  async waiterTipQr(waiterId: string): Promise<WaiterTipQr> {
    const { data } = await api.get<WaiterTipQr>(`/users/${waiterId}/tip-qr`);
    return data;
  },

  /** Alias for add */
  async record(orderId: string, payload: TipPayload): Promise<TipSummary> {
    return this.add(orderId, payload);
  },

  /** Alias for waiterTipQr */
  async getWaiterQr(waiterId: string): Promise<WaiterTipQr> {
    return this.waiterTipQr(waiterId);
  },
};
