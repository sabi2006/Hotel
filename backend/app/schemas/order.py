from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    CancellationReason,
    FoodType,
    ItemKitchenStatus,
    OrderStatus,
    PaymentStatus,
)
from app.schemas.common import MongoModel, PyObjectId


class CustomerInfo(BaseModel):
    """Both fields are optional - never force a phone number for a walk-in."""

    name: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=20)


class OrderItemPublic(MongoModel):
    model_config = ConfigDict(populate_by_name=True)

    itemId: PyObjectId
    productId: PyObjectId
    # name, price and gstPercentage are snapshots taken when the item was added.
    # They must never be re-read from the product, or old bills would change.
    name: str
    price: float
    gstPercentage: float
    quantity: int
    subtotal: float
    gstAmount: float
    total: float
    foodType: FoodType
    notes: str | None = None
    kitchenStatus: ItemKitchenStatus
    sentToKitchenAt: datetime | None = None
    preparingAt: datetime | None = None
    readyAt: datetime | None = None
    servedAt: datetime | None = None
    cancellationReason: CancellationReason | None = None


class OrderPublic(MongoModel):
    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId = Field(alias="_id")
    orderNumber: int
    invoiceNumber: str
    tableId: PyObjectId
    tableNumber: str
    waiterId: PyObjectId
    waiterName: str
    customer: CustomerInfo = CustomerInfo()
    items: list[OrderItemPublic] = []

    subtotal: float = 0
    discount: float = 0
    gstAmount: float = 0
    grandTotal: float = 0
    amountPaid: float = 0

    orderStatus: OrderStatus
    paymentStatus: PaymentStatus

    createdAt: datetime
    updatedAt: datetime
    sentToKitchenAt: datetime | None = None
    acceptedAt: datetime | None = None
    acceptedByName: str | None = None
    readyAt: datetime | None = None
    servedAt: datetime | None = None
    closedAt: datetime | None = None
    closedByName: str | None = None
    cancellationReason: CancellationReason | None = None
    cancellationNote: str | None = None

    @property
    def hasUnsentItems(self) -> bool:
        return any(item.sentToKitchenAt is None for item in self.items)


class OrderCreate(BaseModel):
    tableId: str
    customer: CustomerInfo = CustomerInfo()


class OrderUpdate(BaseModel):
    customer: CustomerInfo | None = None
    discount: float | None = Field(default=None, ge=0)


class OrderItemCreate(BaseModel):
    productId: str
    quantity: int = Field(default=1, ge=1, le=99)
    notes: str | None = Field(default=None, max_length=200)


class OrderItemUpdate(BaseModel):
    quantity: int = Field(ge=0, le=99, description="0 removes the item")
    notes: str | None = Field(default=None, max_length=200)


class OrderCancel(BaseModel):
    reason: CancellationReason
    note: str | None = Field(default=None, max_length=200)
