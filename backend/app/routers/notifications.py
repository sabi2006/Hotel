"""Notification endpoints for managing user alerts."""

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, status

from app.core.database import get_database
from app.core.deps import CurrentUser
from app.core.utils import to_object_id
from app.schemas.common import MessageResponse
from app.schemas.notification import NotificationListResponse, NotificationPublic

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=100),
) -> NotificationListResponse:
    """List recent notifications for the logged-in user with unread count."""
    db = get_database()
    user_oid = ObjectId(user.id)

    cursor = (
        db.notifications.find({"recipientUserId": user_oid})
        .sort("createdAt", -1)
        .limit(limit)
    )

    items: list[NotificationPublic] = []
    async for doc in cursor:
        items.append(NotificationPublic.model_validate(doc))

    unread_count = await db.notifications.count_documents(
        {"recipientUserId": user_oid, "isRead": False}
    )

    return NotificationListResponse(items=items, unreadCount=unread_count)


@router.patch("/{notification_id}/read", response_model=NotificationPublic)
async def mark_notification_read(
    notification_id: str,
    user: CurrentUser,
) -> NotificationPublic:
    """Mark a single notification as read."""
    db = get_database()
    notif_oid = to_object_id(notification_id, "Notification not found")
    user_oid = ObjectId(user.id)

    doc = await db.notifications.find_one_and_update(
        {"_id": notif_oid, "recipientUserId": user_oid},
        {"$set": {"isRead": True}},
        return_document=True,
    )
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    return NotificationPublic.model_validate(doc)


@router.post("/mark-all-read", response_model=MessageResponse)
async def mark_all_notifications_read(
    user: CurrentUser,
) -> MessageResponse:
    """Mark all notifications for the logged-in user as read."""
    db = get_database()
    user_oid = ObjectId(user.id)

    result = await db.notifications.update_many(
        {"recipientUserId": user_oid, "isRead": False},
        {"$set": {"isRead": True}},
    )

    return MessageResponse(message=f"Marked {result.modified_count} notifications as read")
