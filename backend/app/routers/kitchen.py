"""The kitchen display side of the workflow.

Business rule 2: kitchen staff may only move kitchen statuses. Nothing here can
touch money, customers, or the items on the bill - the one exception is
cancelling a line that cannot be cooked, which always records a reason.
"""

from fastapi import APIRouter, HTTPException, Query, status

from app.core.database import get_database
from app.core.deps import KitchenUser
from app.core.utils import to_object_id, utcnow
from app.models.enums import ItemKitchenStatus, OrderStatus, UserRole
from app.realtime import notify_order_ready, notify_order_updated
from app.schemas.kitchen import KitchenBoard, KitchenItemCancel, KitchenItemUpdate
from app.schemas.order import OrderPublic
from app.services.orders import active_items, refresh

router = APIRouter(prefix="/kitchen", tags=["kitchen"])

NOT_FOUND = "Order not found"

# Orders the kitchen still has work on, or has just finished.
KITCHEN_STATUSES = [
    OrderStatus.SENT_TO_KITCHEN.value,
    OrderStatus.PREPARING.value,
    OrderStatus.READY.value,
    OrderStatus.SERVED.value,
]


def _sent_items(order: dict) -> list[dict]:
    """Only items the waiter has actually sent are the kitchen's business."""
    return [item for item in active_items(order) if item.get("sentToKitchenAt") is not None]


def _bucket_for(order: dict) -> str:
    """Which column of the kitchen board this order belongs in."""
    items = _sent_items(order)
    if not items:
        return "COMPLETED"

    statuses = {item.get("kitchenStatus") for item in items}
    if ItemKitchenStatus.PENDING.value in statuses:
        return "NEW"
    if ItemKitchenStatus.PREPARING.value in statuses:
        return "PREPARING"
    if ItemKitchenStatus.READY.value in statuses:
        return "READY"
    return "COMPLETED"


async def _load(order_id: str) -> dict:
    document = await get_database().orders.find_one({"_id": to_object_id(order_id, NOT_FOUND)})
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return document


async def _save_and_notify(order: dict, previous_status: str) -> dict:
    refresh(order)
    await get_database().orders.replace_one({"_id": order["_id"]}, order)

    # The waiter needs the ready bell the moment the order flips, and once only.
    if order["orderStatus"] == OrderStatus.READY.value and previous_status != OrderStatus.READY.value:
        notification = None
        waiter_id = order.get("waiterId")
        if waiter_id:
            now = utcnow()
            notification = {
                "recipientUserId": to_object_id(waiter_id, "Invalid waiter id"),
                "type": "ORDER_READY",
                "orderId": str(order["_id"]),
                "orderNumber": order.get("orderNumber"),
                "invoiceNumber": order.get("invoiceNumber"),
                "tableId": str(order.get("tableId")),
                "tableNumber": order.get("tableNumber"),
                "title": "Order Ready",
                "message": f"Order #{order.get('invoiceNumber') or order.get('orderNumber')} for Table {order.get('tableNumber')} is ready to serve",
                "isRead": False,
                "createdAt": now,
            }
            try:
                res = await get_database().notifications.insert_one(notification)
                notification["_id"] = res.inserted_id
            except Exception:
                pass
        await notify_order_ready(order, notification)
    else:
        await notify_order_updated(order)
    return order



@router.get("/orders", response_model=KitchenBoard)
async def kitchen_board(
    user: KitchenUser,
    completedLimit: int = Query(default=20, ge=0, le=100),
) -> KitchenBoard:
    """The four columns of the kitchen display, in one call."""
    cursor = (
        get_database()
        .orders.find({"orderStatus": {"$in": KITCHEN_STATUSES}})
        .sort("sentToKitchenAt", 1)
    )

    board: dict[str, list[OrderPublic]] = {
        "new": [],
        "preparing": [],
        "ready": [],
        "completed": [],
    }
    key_for = {"NEW": "new", "PREPARING": "preparing", "READY": "ready", "COMPLETED": "completed"}

    async for document in cursor:
        if not _sent_items(document):
            continue
        board[key_for[_bucket_for(document)]].append(OrderPublic.model_validate(document))

    # Finished tickets are only useful as recent history.
    board["completed"] = board["completed"][-completedLimit:] if completedLimit else []
    board["completed"].reverse()

    return KitchenBoard(**board)


@router.post("/orders/{order_id}/accept", response_model=OrderPublic)
async def accept_order(order_id: str, user: KitchenUser) -> OrderPublic:
    """Start cooking everything that is waiting on this ticket."""
    order = await _load(order_id)
    previous = order["orderStatus"]

    pending = [
        item
        for item in _sent_items(order)
        if item.get("kitchenStatus") == ItemKitchenStatus.PENDING.value
    ]
    if not pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nothing on this order is waiting to be started",
        )

    now = utcnow()
    for item in pending:
        item["kitchenStatus"] = ItemKitchenStatus.PREPARING.value
        item["preparingAt"] = now

    # Kitchen timing, for the prep-time reports.
    if order.get("acceptedAt") is None:
        order["acceptedAt"] = now
        order["acceptedById"] = user.id
        order["acceptedByName"] = user.name

    return OrderPublic.model_validate(await _save_and_notify(order, previous))


@router.post("/orders/{order_id}/ready", response_model=OrderPublic)
async def mark_order_ready(order_id: str, user: KitchenUser) -> OrderPublic:
    """Everything being cooked on this ticket is done."""
    order = await _load(order_id)
    previous = order["orderStatus"]

    cooking = [
        item
        for item in _sent_items(order)
        if item.get("kitchenStatus")
        in {ItemKitchenStatus.PENDING.value, ItemKitchenStatus.PREPARING.value}
    ]
    if not cooking:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nothing on this order is still being prepared",
        )

    now = utcnow()
    for item in cooking:
        item.setdefault("preparingAt", now)
        item["kitchenStatus"] = ItemKitchenStatus.READY.value
        item["readyAt"] = now

    return OrderPublic.model_validate(await _save_and_notify(order, previous))


@router.patch("/orders/{order_id}/items/{item_id}", response_model=OrderPublic)
async def update_item_status(
    order_id: str, item_id: str, payload: KitchenItemUpdate, user: KitchenUser
) -> OrderPublic:
    """Move a single line, so one order can hold items at different stages."""
    order = await _load(order_id)
    previous = order["orderStatus"]

    item_oid = to_object_id(item_id, "Item not found")
    item = next((i for i in order["items"] if i["itemId"] == item_oid), None)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    if item.get("sentToKitchenAt") is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This item has not been sent to the kitchen yet",
        )
    if item.get("kitchenStatus") == ItemKitchenStatus.CANCELLED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This item was cancelled"
        )

    # SERVED belongs to the waiter, who confirms the food reached the table.
    if payload.kitchenStatus == ItemKitchenStatus.SERVED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the waiter can mark an item as served",
        )

    now = utcnow()
    item["kitchenStatus"] = payload.kitchenStatus.value
    if payload.kitchenStatus == ItemKitchenStatus.PREPARING:
        item["preparingAt"] = now
        if order.get("acceptedAt") is None:
            order["acceptedAt"] = now
            order["acceptedById"] = user.id
            order["acceptedByName"] = user.name
    elif payload.kitchenStatus == ItemKitchenStatus.READY:
        item.setdefault("preparingAt", now)
        item["readyAt"] = now

    return OrderPublic.model_validate(await _save_and_notify(order, previous))


@router.post("/orders/{order_id}/items/{item_id}/cancel", response_model=OrderPublic)
async def cancel_item(
    order_id: str, item_id: str, payload: KitchenItemCancel, user: KitchenUser
) -> OrderPublic:
    """Cancel a line the kitchen cannot cook, always with a reason.

    An item that is already cooked can only be written off by an admin - by then
    it is a money decision, not a kitchen one.
    """
    order = await _load(order_id)
    previous = order["orderStatus"]

    item_oid = to_object_id(item_id, "Item not found")
    item = next((i for i in order["items"] if i["itemId"] == item_oid), None)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    already_made = item.get("kitchenStatus") in {
        ItemKitchenStatus.READY.value,
        ItemKitchenStatus.SERVED.value,
    }
    if already_made and user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This item is already prepared. Only an administrator can write it off.",
        )

    item["kitchenStatus"] = ItemKitchenStatus.CANCELLED.value
    item["cancellationReason"] = payload.reason.value

    # refresh() drops cancelled lines from the totals.
    return OrderPublic.model_validate(await _save_and_notify(order, previous))
