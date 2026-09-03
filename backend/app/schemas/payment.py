from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import PaymentMethod
from app.schemas.common import MongoModel, PyObjectId


class PaymentCreate(BaseModel):
    method: PaymentMethod
    amount: float = Field(gt=0, le=10_000_000, description="Amount applied to the bill")

    # Cash only: what the customer handed over, so change can be shown.
    receivedAmount: float | None = Field(default=None, ge=0)

    # Card transaction id, or the UPI reference the waiter reads off the phone.
    reference: str | None = Field(default=None, max_length=60)
    note: str | None = Field(default=None, max_length=200)

    # Idempotency. The client generates this once per intended payment, so a
    # double-tap, a retry after a timeout, or a flaky tablet connection cannot
    # take the customer money twice.
    clientRequestId: str | None = Field(default=None, min_length=8, max_length=64)

    @model_validator(mode="after")
    def check_received_amount(self) -> "PaymentCreate":
        if self.receivedAmount is not None and self.receivedAmount < self.amount:
            raise ValueError("Amount received cannot be less than the amount being paid")
        return self


class PaymentVoid(BaseModel):
    reason: str = Field(min_length=3, max_length=200)


class PaymentPublic(MongoModel):
    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId = Field(alias="_id")
    orderId: PyObjectId
    invoiceNumber: str
    tableNumber: str
    method: PaymentMethod
    amount: float
    receivedAmount: float | None = None
    changeGiven: float | None = None
    reference: str | None = None
    note: str | None = None

    receivedById: PyObjectId
    receivedByName: str
    paidAt: datetime

    isVoided: bool = False
    voidedAt: datetime | None = None
    voidedByName: str | None = None
    voidReason: str | None = None


class PaymentSummary(BaseModel):
    """What is still owed on an order, and how it has been paid so far."""

    grandTotal: float
    amountPaid: float
    amountDue: float
    isFullyPaid: bool
    payments: list[PaymentPublic] = []
