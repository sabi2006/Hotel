import { api } from "@/services/api";
import type { CancellationReason, CustomerInfo, Order, OrderStatus, Page } from "@/types";

export interface OrderListParams {
  orderStatus?: OrderStatus;
  tableId?: string;
  waiterId?: string;
  openOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export const ordersService = {
  async list(params: OrderListParams = {}): Promise<Page<Order>> {
    const { data } = await api.get<Page<Order>>("/orders", { params });
    return data;
  },

  async get(id: string): Promise<Order> {
    const { data } = await api.get<Order>(`/orders/${id}`);
    return data;
  },

  async getActiveForTable(tableId: string): Promise<Order> {
    const { data } = await api.get<Order>(`/orders/by-table/${tableId}`);
    return data;
  },

  async open(tableId: string, customer?: CustomerInfo): Promise<Order> {
    const { data } = await api.post<Order>("/orders", { tableId, customer });
    return data;
  },

  async update(id: string, payload: { customer?: CustomerInfo; discount?: number }): Promise<Order> {
    const { data } = await api.patch<Order>(`/orders/${id}`, payload);
    return data;
  },

  async addItem(
    id: string,
    payload: { productId: string; quantity?: number; notes?: string },
  ): Promise<Order> {
    const { data } = await api.post<Order>(`/orders/${id}/items`, payload);
    return data;
  },

  async setItemQuantity(id: string, itemId: string, quantity: number): Promise<Order> {
    const { data } = await api.patch<Order>(`/orders/${id}/items/${itemId}`, { quantity });
    return data;
  },

  async removeItem(id: string, itemId: string): Promise<Order> {
    const { data } = await api.delete<Order>(`/orders/${id}/items/${itemId}`);
    return data;
  },

  async sendToKitchen(id: string): Promise<Order> {
    const { data } = await api.post<Order>(`/orders/${id}/send-kitchen`);
    return data;
  },

  async serve(id: string): Promise<Order> {
    const { data } = await api.post<Order>(`/orders/${id}/serve`);
    return data;
  },

  async cancel(id: string, reason: CancellationReason, note?: string): Promise<Order> {
    const { data } = await api.post<Order>(`/orders/${id}/cancel`, { reason, note });
    return data;
  },

  async close(id: string): Promise<Order> {
    const { data } = await api.post<Order>(`/orders/${id}/close`);
    return data;
  },

  async discardDraft(id: string): Promise<void> {
    await api.delete(`/orders/${id}`);
  },
};
