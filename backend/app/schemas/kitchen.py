from pydantic import BaseModel, Field

from app.models.enums import CancellationReason, ItemKitchenStatus
from app.schemas.order import OrderPublic


class KitchenItemUpdate(BaseModel):
    kitchenStatus: ItemKitchenStatus


class KitchenItemCancel(BaseModel):
    reason: CancellationReason = CancellationReason.OUT_OF_STOCK
    note: str | None = Field(default=None, max_length=200)


class KitchenBoard(BaseModel):
    """The four columns of the kitchen display."""

    new: list[OrderPublic] = []
    preparing: list[OrderPublic] = []
    ready: list[OrderPublic] = []
    completed: list[OrderPublic] = []
