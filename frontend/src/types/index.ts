/** Domain vocabulary shared with the backend (app/models/enums.py). */

export const UserRole = {
  ADMIN: "ADMIN",
  WAITER: "WAITER",
  KITCHEN: "KITCHEN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const OrderStatus = {
  DRAFT: "DRAFT",
  SENT_TO_KITCHEN: "SENT_TO_KITCHEN",
  PREPARING: "PREPARING",
  READY: "READY",
  SERVED: "SERVED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
  CLOSED: "CLOSED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ItemKitchenStatus = {
  PENDING: "PENDING",
  PREPARING: "PREPARING",
  READY: "READY",
  SERVED: "SERVED",
  CANCELLED: "CANCELLED",
} as const;
export type ItemKitchenStatus = (typeof ItemKitchenStatus)[keyof typeof ItemKitchenStatus];

export const TableStatus = { FREE: "FREE", OCCUPIED: "OCCUPIED" } as const;
export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus];

export const PaymentMethod = { CASH: "CASH", UPI: "UPI", CARD: "CARD" } as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const FoodType = {
  VEG: "VEG",
  NON_VEG: "NON_VEG",
  EGG: "EGG",
  OTHER: "OTHER",
} as const;
export type FoodType = (typeof FoodType)[keyof typeof FoodType];

export const MealType = {
  BREAKFAST: "BREAKFAST",
  LUNCH: "LUNCH",
  DINNER: "DINNER",
  SNACKS: "SNACKS",
  BEVERAGE: "BEVERAGE",
  ALL_DAY: "ALL_DAY",
} as const;
export type MealType = (typeof MealType)[keyof typeof MealType];

export interface User {
  _id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  tipUpiId: string | null;
  tipQrImage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresInMinutes: number;
  user: User;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  name: string;
  phone?: string;
  role: Exclude<UserRole, "ADMIN">;
}

export interface Category {
  _id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  _id: string;
  name: string;
  description: string | null;
  image: string | null;
  price: number;
  gstPercentage: number;
  quantityAvailable: number;
  categoryId: string;
  categoryName: string | null;
  foodType: FoodType;
  mealType: MealType;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantTable {
  _id: string;
  tableNumber: string;
  capacity: number;
  status: TableStatus;
  activeOrderId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const FOOD_TYPE_LABELS: Record<FoodType, string> = {
  VEG: "Veg",
  NON_VEG: "Non-veg",
  EGG: "Egg",
  OTHER: "Other",
};

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACKS: "Snacks",
  BEVERAGE: "Beverage",
  ALL_DAY: "All day",
};

export const CancellationReason = {
  WRONG_ITEM: "WRONG_ITEM",
  CUSTOMER_CANCELLED: "CUSTOMER_CANCELLED",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  OTHER: "OTHER",
} as const;
export type CancellationReason = (typeof CancellationReason)[keyof typeof CancellationReason];

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  WRONG_ITEM: "Wrong item",
  CUSTOMER_CANCELLED: "Customer cancelled",
  OUT_OF_STOCK: "Out of stock",
  OTHER: "Other",
};

export const PaymentStatus = {
  PENDING: "PENDING",
  PARTIAL: "PARTIAL",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export interface CustomerInfo {
  name: string | null;
  phone: string | null;
}

export interface OrderItem {
  itemId: string;
  productId: string;
  name: string;
  price: number;
  gstPercentage: number;
  quantity: number;
  subtotal: number;
  gstAmount: number;
  total: number;
  foodType: FoodType;
  notes: string | null;
  kitchenStatus: ItemKitchenStatus;
  sentToKitchenAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  cancellationReason: CancellationReason | null;
}

export interface Order {
  _id: string;
  orderNumber: number;
  invoiceNumber: string;
  tableId: string;
  tableNumber: string;
  waiterId: string;
  waiterName: string;
  customer: CustomerInfo;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  gstAmount: number;
  grandTotal: number;
  amountPaid: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  sentToKitchenAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  closedAt: string | null;
  cancellationReason: CancellationReason | null;
  cancellationNote: string | null;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Draft",
  SENT_TO_KITCHEN: "Sent to kitchen",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED: "Served",
  PAYMENT_PENDING: "Payment pending",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  CLOSED: "Closed",
};

export const ORDER_STATUS_CLASSES: Record<OrderStatus, string> = {
  DRAFT: "bg-[#EDEDEB] text-[#5F615D] ring-1 ring-[#DCDDDA]",
  SENT_TO_KITCHEN: "bg-[#F0F5F9] text-[#365D7B] ring-1 ring-[#CFE0ED]",
  PREPARING: "bg-[#FEF7EE] text-[#9E6523] ring-1 ring-[#FADFB8]",
  READY: "bg-[#EBF5EE] text-[#276B49] ring-1 ring-[#BCE2CD]",
  SERVED: "bg-[#FAF6EE] text-[#805C2B] ring-1 ring-[#E8DCB8]",
  PAYMENT_PENDING: "bg-[#FEF7EE] text-[#A66C24] ring-1 ring-[#FCE4C3]",
  PAID: "bg-[#EBF5EE] text-[#1E5C3B] ring-1 ring-[#A8DBC0]",
  CANCELLED: "bg-[#FDF2F1] text-[#A8352D] ring-1 ring-[#F7C6C3]",
  CLOSED: "bg-[#F7F7F6] text-[#6F716D] ring-1 ring-[#E0E1DE]",
};


export interface Payment {
  _id: string;
  orderId: string;
  invoiceNumber: string;
  tableNumber: string;
  method: PaymentMethod;
  amount: number;
  receivedAmount: number | null;
  changeGiven: number | null;
  reference: string | null;
  note: string | null;
  receivedById: string;
  receivedByName: string;
  paidAt: string;
  isVoided: boolean;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
}

export interface PaymentSummary {
  grandTotal: number;
  amountPaid: number;
  amountDue: number;
  isFullyPaid: boolean;
  payments: Payment[];
}

export interface RestaurantSettings {
  restaurantName: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  gstNumber: string | null;
  fssaiNumber: string | null;
  upiId: string | null;
  upiQrImage: string | null;
  invoiceFooterNote: string;
  currencySymbol: string;
  whatsappCountryCode: string;
  updatedAt: string | null;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
};


export const TipMethod = { CASH: "CASH", UPI: "UPI" } as const;
export type TipMethod = (typeof TipMethod)[keyof typeof TipMethod];

export const TIP_METHOD_LABELS: Record<TipMethod, string> = {
  CASH: "Cash tip",
  UPI: "UPI tip",
};

export interface Tip {
  _id: string;
  orderId: string;
  invoiceNumber: string;
  tableNumber: string;
  waiterId: string;
  waiterName: string;
  amount: number;
  method: TipMethod;
  reference: string | null;
  note: string | null;
  recordedById: string;
  recordedByName: string;
  createdAt: string;
  isVoided: boolean;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
}

export interface TipSummary {
  totalTips: number;
  tips: Tip[];
}

export const NotificationType = {
  ORDER_READY: "ORDER_READY",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export interface Notification {
  _id: string;
  recipientUserId: string;
  type: NotificationType | string;
  orderId: string;
  orderNumber: number | null;
  invoiceNumber: string | null;
  tableId: string;
  tableNumber: string | number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  items: Notification[];
  unreadCount: number;
}

