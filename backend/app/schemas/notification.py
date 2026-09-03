"""Notification schemas."""

from datetime import datetime
from pydantic import ConfigDict, Field

from app.models.enums import NotificationType
from app.schemas.common import MongoModel, PyObjectId


class NotificationPublic(MongoModel):
    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId = Field(alias="_id")
    recipientUserId: PyObjectId
    type: NotificationType | str
    orderId: str
    orderNumber: int | None = None
    invoiceNumber: str | None = None
    tableId: str
    tableNumber: str | int
    title: str
    message: str
    isRead: bool = False
    createdAt: datetime


class NotificationListResponse(MongoModel):
    items: list[NotificationPublic]
    unreadCount: int
