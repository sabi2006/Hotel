import { api } from "@/services/api";
import type { Notification, NotificationListResponse } from "@/types";

export const notificationsService = {
  async list(limit = 50): Promise<NotificationListResponse> {
    const { data } = await api.get<NotificationListResponse>("/notifications", {
      params: { limit },
    });
    return data;
  },

  async markAsRead(id: string): Promise<Notification> {
    const { data } = await api.patch<Notification>(`/notifications/${id}/read`);
    return data;
  },

  async markAllAsRead(): Promise<{ message: string }> {
    const { data } = await api.post<{ message: string }>("/notifications/mark-all-read");
    return data;
  },
};
