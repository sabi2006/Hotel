"""Domain vocabulary shared across the whole system.

Defined up front so every phase (orders, kitchen, billing) speaks the same
language. Phase 1 only consumes UserRole, but the rest is the agreed contract.
"""

from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    WAITER = "WAITER"
    KITCHEN = "KITCHEN"


class TableStatus(StrEnum):
    FREE = "FREE"
    OCCUPIED = "OCCUPIED"


class OrderStatus(StrEnum):
    DRAFT = "DRAFT"
    SENT_TO_KITCHEN = "SENT_TO_KITCHEN"
    PREPARING = "PREPARING"
    READY = "READY"
    SERVED = "SERVED"
    PAYMENT_PENDING = "PAYMENT_PENDING"
    PAID = "PAID"
    CANCELLED = "CANCELLED"
    CLOSED = "CLOSED"


class ItemKitchenStatus(StrEnum):
    """Per-item kitchen state; the order status is derived from these."""

    PENDING = "PENDING"
    PREPARING = "PREPARING"
    READY = "READY"
    SERVED = "SERVED"
    CANCELLED = "CANCELLED"


class PaymentMethod(StrEnum):
    CASH = "CASH"
    UPI = "UPI"
    CARD = "CARD"


class TipMethod(StrEnum):
    """Tips are cash or a direct UPI transfer to the waiter."""

    CASH = "CASH"
    UPI = "UPI"


class PaymentStatus(StrEnum):
    PENDING = "PENDING"
    PARTIAL = "PARTIAL"
    PAID = "PAID"
    REFUNDED = "REFUNDED"


class FoodType(StrEnum):
    VEG = "VEG"
    NON_VEG = "NON_VEG"
    EGG = "EGG"
    OTHER = "OTHER"


class MealType(StrEnum):
    BREAKFAST = "BREAKFAST"
    LUNCH = "LUNCH"
    DINNER = "DINNER"
    SNACKS = "SNACKS"
    BEVERAGE = "BEVERAGE"
    ALL_DAY = "ALL_DAY"


class CancellationReason(StrEnum):
    WRONG_ITEM = "WRONG_ITEM"
    CUSTOMER_CANCELLED = "CUSTOMER_CANCELLED"
    OUT_OF_STOCK = "OUT_OF_STOCK"
    OTHER = "OTHER"


class AuditAction(StrEnum):
    ORDER_CREATED = "ORDER_CREATED"
    ORDER_MODIFIED = "ORDER_MODIFIED"
    ORDER_ITEM_DELETED = "ORDER_ITEM_DELETED"
    ORDER_CANCELLED = "ORDER_CANCELLED"
    ORDER_CLOSED = "ORDER_CLOSED"
    PAYMENT_ADDED = "PAYMENT_ADDED"
    PAYMENT_EDITED = "PAYMENT_EDITED"
    TIP_ADDED = "TIP_ADDED"
    TIP_VOIDED = "TIP_VOIDED"
    PAYMENT_VOIDED = "PAYMENT_VOIDED"
    PRODUCT_PRICE_CHANGED = "PRODUCT_PRICE_CHANGED"
    USER_CREATED = "USER_CREATED"
    USER_DISABLED = "USER_DISABLED"
    USER_DELETED = "USER_DELETED"
    USER_PASSWORD_RESET = "USER_PASSWORD_RESET"


class NotificationType(StrEnum):
    ORDER_READY = "ORDER_READY"

