import { api } from "@/services/api";
import type { Page, UserRole } from "@/types";

export interface AuditLog {
  _id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  userId: string | null;
  userName: string;
  userRole: UserRole | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  note: string | null;
  createdAt: string;
}

/** Mirrors AuditAction in app/models/enums.py. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  ORDER_CREATED: "Order opened",
  ORDER_MODIFIED: "Order modified",
  ORDER_ITEM_DELETED: "Item removed",
  ORDER_CANCELLED: "Order cancelled",
  ORDER_CLOSED: "Order closed",
  PAYMENT_ADDED: "Payment taken",
  PAYMENT_EDITED: "Payment edited",
  PAYMENT_VOIDED: "Payment voided",
  TIP_ADDED: "Tip recorded",
  TIP_VOIDED: "Tip voided",
  PRODUCT_PRICE_CHANGED: "Price changed",
  USER_CREATED: "Staff added",
  USER_DISABLED: "Staff disabled",
  USER_PASSWORD_RESET: "Password reset",
};

export interface AuditListParams {
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export const auditService = {
  async list(params: AuditListParams = {}): Promise<Page<AuditLog>> {
    const { data } = await api.get<Page<AuditLog>>("/audit-logs", { params });
    return data;
  },
};
