import { api } from "@/services/api";
import type { CancellationReason, ItemKitchenStatus, Order } from "@/types";

export interface KitchenBoard {
  new: Order[];
  preparing: Order[];
  ready: Order[];
  completed: Order[];
}

export const kitchenService = {
  async board(): Promise<KitchenBoard> {
    const { data } = await api.get<KitchenBoard>("/kitchen/orders");
    return data;
  },

  async accept(orderId: string): Promise<Order> {
    const { data } = await api.post<Order>(`/kitchen/orders/${orderId}/accept`);
    return data;
  },

  async markReady(orderId: string): Promise<Order> {
    const { data } = await api.post<Order>(`/kitchen/orders/${orderId}/ready`);
    return data;
  },

  async setItemStatus(
    orderId: string,
    itemId: string,
    kitchenStatus: ItemKitchenStatus,
  ): Promise<Order> {
    const { data } = await api.patch<Order>(`/kitchen/orders/${orderId}/items/${itemId}`, {
      kitchenStatus,
    });
    return data;
  },

  async cancelItem(
    orderId: string,
    itemId: string,
    reason: CancellationReason,
  ): Promise<Order> {
    const { data } = await api.post<Order>(
      `/kitchen/orders/${orderId}/items/${itemId}/cancel`,
      { reason },
    );
    return data;
  },
};
