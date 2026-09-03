from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TipMethod
from app.schemas.common import MongoModel, PyObjectId


class TipCreate(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)
    method: TipMethod = TipMethod.CASH

    # Which waiter the tip is for. Defaults to whoever owns the order.
    waiterId: str | None = None
    reference: str | None = Field(default=None, max_length=60)
    note: str | None = Field(default=None, max_length=200)


class TipVoid(BaseModel):
    reason: str = Field(min_length=3, max_length=200)


class TipPublic(MongoModel):
    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId = Field(alias="_id")
    orderId: PyObjectId
    invoiceNumber: str
    tableNumber: str

    waiterId: PyObjectId
    waiterName: str

    amount: float
    method: TipMethod
    reference: str | None = None
    note: str | None = None

    recordedById: PyObjectId
    recordedByName: str
    createdAt: datetime

    isVoided: bool = False
    voidedAt: datetime | None = None
    voidedByName: str | None = None
    voidReason: str | None = None


class TipSummary(BaseModel):
    """Tips on one order. Deliberately separate from the food bill."""

    totalTips: float
    tips: list[TipPublic] = []
