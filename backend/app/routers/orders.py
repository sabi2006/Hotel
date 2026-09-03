"""Order taking: the waiter side of the workflow.

Table lifecycle enforced here: FREE -> OCCUPIED when an order opens, and back to
FREE when it is cancelled or closed. A table never holds two active orders.
"""

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, status

from app.core.database import get_database
from app.core.deps import CurrentUser
from app.core.utils import to_object_id, utcnow
from app.models.enums import (
    ItemKitchenStatus,
    OrderStatus,
    PaymentStatus,
    TableStatus,
    UserRole,
)
from app.models.enums import AuditAction
from app.realtime import notify_new_order, notify_order_closed, notify_order_updated
from app.services import audit
from app.schemas.common import MessageResponse, Page
from app.schemas.order import (
    OrderCancel,
    OrderCreate,
    OrderItemCreate,
    OrderItemUpdate,
    OrderPublic,
    OrderUpdate,
)
from app.services.orders import (
    TERMINAL_STATUSES,
    active_items,
    allocate_order_identifiers,
    build_item_totals,
    refresh,
)

router = APIRouter(prefix="/orders", tags=["orders"])

NOT_FOUND = "Order not found"

# An order still in play - the table is occupied and the bill is open.
OPEN_STATUSES = [
    OrderStatus.DRAFT.value,
    OrderStatus.SENT_TO_KITCHEN.value,
    OrderStatus.PREPARING.value,
    OrderStatus.READY.value,
    OrderStatus.SERVED.value,
    OrderStatus.PAYMENT_PENDING.value,
]


async def _load_order(order_id: str) -> dict:
    db = get_database()
    queries: list[dict] = []
    try:
        queries.append({"_id": ObjectId(order_id)})
    except Exception:
        pass
    queries.append({"_id": order_id})
    queries.append({"invoiceNumber": order_id})
    if order_id.isdigit():
        queries.append({"orderNumber": int(order_id)})

    document = await db.orders.find_one({"$or": queries} if len(queries) > 1 else queries[0])
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return document


# Truly finished. Nothing about these orders may change.
FINISHED_STATUSES = {OrderStatus.CANCELLED.value, OrderStatus.CLOSED.value}


def _assert_can_modify(order: dict, user) -> None:
    """Business rules 1 and 7 - guards anything that moves money.

    A settled order (paid, closed or cancelled) is history: only an admin may
    change what it costs. Any waiter may work an open order, which is what
    covering a colleague requires.
    """
    if user.role == UserRole.ADMIN:
        return
    if order.get("orderStatus") in {status_.value for status_ in TERMINAL_STATUSES}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This order is settled. Only an administrator can change it.",
        )


def _assert_can_serve(order: dict, user) -> None:
    """A weaker guard, for carrying food to the table.

    Paying before the last plate arrives is normal - a customer settles at the
    counter, or pays up front. Serving changes no money, so a paid order must
    not lock the waiter out of recording that the food was delivered. Without
    this split the waiter deadlocks: they cannot close the order because the
    food is unserved, and cannot serve it because the bill is paid.
    """
    if user.role == UserRole.ADMIN:
        return
    if order.get("orderStatus") in FINISHED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This order is closed. Only an administrator can change it.",
        )


async def _save(order: dict) -> dict:
    refresh(order)
    await get_database().orders.replace_one({"_id": order["_id"]}, order)
    return order


async def _release_table(table_id, order_id) -> None:
    await get_database().tables.update_one(
        {"_id": table_id, "activeOrderId": order_id},
        {
            "$set": {
                "status": TableStatus.FREE.value,
                "activeOrderId": None,
                "updatedAt": utcnow(),
            }
        },
    )


# --- reading ------------------------------------------------------------


@router.get("", response_model=Page[OrderPublic])
async def list_orders(
    user: CurrentUser,
    orderStatus: OrderStatus | None = None,
    tableId: str | None = None,
    waiterId: str | None = None,
    openOnly: bool = Query(default=False, description="Only orders that are still in play"),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=50, ge=1, le=200),
) -> Page[OrderPublic]:
    query: dict = {}
    if orderStatus is not None:
        query["orderStatus"] = orderStatus.value
    elif openOnly:
        query["orderStatus"] = {"$in": OPEN_STATUSES}
    if tableId:
        query["tableId"] = to_object_id(tableId, "Table not found")
    if waiterId:
        query["waiterId"] = to_object_id(waiterId, "Waiter not found")

    db = get_database()
    total = await db.orders.count_documents(query)
    cursor = (
        db.orders.find(query).sort("createdAt", -1).skip((page - 1) * pageSize).limit(pageSize)
    )
    items = [OrderPublic.model_validate(document) async for document in cursor]
    return Page[OrderPublic](items=items, total=total, page=page, pageSize=pageSize)


@router.get("/by-table/{table_id}", response_model=OrderPublic)
async def get_active_order_for_table(table_id: str, user: CurrentUser) -> OrderPublic:
    """Opening an occupied table jumps straight to its live order."""
    document = await get_database().orders.find_one(
        {
            "tableId": to_object_id(table_id, "Table not found"),
            "orderStatus": {"$in": OPEN_STATUSES},
        }
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="This table has no active order"
        )
    return OrderPublic.model_validate(document)


@router.get("/{order_id}", response_model=OrderPublic)
async def get_order(order_id: str, user: CurrentUser) -> OrderPublic:
    return OrderPublic.model_validate(await _load_order(order_id))


# --- creating -----------------------------------------------------------


@router.post("", response_model=OrderPublic, status_code=status.HTTP_201_CREATED)
async def create_order(payload: OrderCreate, user: CurrentUser) -> OrderPublic:
    if user.role == UserRole.KITCHEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Kitchen staff cannot open orders"
        )

    db = get_database()
    table_oid = to_object_id(payload.tableId, "Table not found")

    table = await db.tables.find_one({"_id": table_oid})
    if table is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    if not table.get("isActive", True):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This table is out of service"
        )

    # Business rule 4: one active order per table.
    existing = await db.orders.find_one(
        {"tableId": table_oid, "orderStatus": {"$in": OPEN_STATUSES}}
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Table {table['tableNumber']} already has an active order",
        )

    now = utcnow()
    order_number, invoice_number = await allocate_order_identifiers()
    order = {
        "orderNumber": order_number,
        "invoiceNumber": invoice_number,
        "tableId": table_oid,
        "tableNumber": table["tableNumber"],
        "waiterId": ObjectId(user.id),
        "waiterName": user.name,
        "customer": payload.customer.model_dump(),
        "items": [],
        "subtotal": 0.0,
        "discount": 0.0,
        "gstAmount": 0.0,
        "grandTotal": 0.0,
        "amountPaid": 0.0,
        "orderStatus": OrderStatus.DRAFT.value,
        "paymentStatus": PaymentStatus.PENDING.value,
        "createdAt": now,
        "updatedAt": now,
        "sentToKitchenAt": None,
        "acceptedAt": None,
        "acceptedById": None,
        "acceptedByName": None,
        "readyAt": None,
        "servedAt": None,
        "closedAt": None,
        "closedByName": None,
        "cancellationReason": None,
        "cancellationNote": None,
    }

    result = await db.orders.insert_one(order)
    order["_id"] = result.inserted_id

    await db.tables.update_one(
        {"_id": table_oid},
        {
            "$set": {
                "status": TableStatus.OCCUPIED.value,
                "activeOrderId": result.inserted_id,
                "updatedAt": now,
            }
        },
    )

    await audit.record(
        AuditAction.ORDER_CREATED,
        "order",
        user=user,
        entity_id=order["_id"],
        entity_label=invoice_number,
        new_value={"tableNumber": table["tableNumber"]},
    )
    return OrderPublic.model_validate(order)


# --- editing ------------------------------------------------------------


@router.patch("/{order_id}", response_model=OrderPublic)
async def update_order(order_id: str, payload: OrderUpdate, user: CurrentUser) -> OrderPublic:
    order = await _load_order(order_id)
    _assert_can_modify(order, user)

    updates = payload.model_dump(exclude_unset=True)
    if "customer" in updates and updates["customer"] is not None:
        order["customer"] = updates["customer"]
    if "discount" in updates and updates["discount"] is not None:
        order["discount"] = float(updates["discount"])

    return OrderPublic.model_validate(await _save(order))


@router.post("/{order_id}/items", response_model=OrderPublic, status_code=status.HTTP_201_CREATED)
async def add_item(order_id: str, payload: OrderItemCreate, user: CurrentUser) -> OrderPublic:
    order = await _load_order(order_id)
    _assert_can_modify(order, user)

    product = await get_database().products.find_one(
        {"_id": to_object_id(payload.productId, "Product not found")}
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if not product.get("isAvailable", True):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{product['name']} is not available right now",
        )

    # Adding the same product again just bumps the quantity, but only while that
    # line is still unsent - once the kitchen has it, a repeat is a new line.
    for item in order["items"]:
        if (
            item["productId"] == product["_id"]
            and item.get("sentToKitchenAt") is None
            and (item.get("notes") or None) == (payload.notes or None)
            and item.get("kitchenStatus") != ItemKitchenStatus.CANCELLED.value
        ):
            item["quantity"] += payload.quantity
            item.update(
                build_item_totals(item["price"], item["quantity"], item["gstPercentage"])
            )
            return OrderPublic.model_validate(await _save(order))

    item = {
        "itemId": ObjectId(),
        "productId": product["_id"],
        # Snapshot: these must not follow later product edits.
        "name": product["name"],
        "price": float(product["price"]),
        "gstPercentage": float(product.get("gstPercentage", 0)),
        "quantity": payload.quantity,
        "foodType": product.get("foodType"),
        "notes": payload.notes,
        "kitchenStatus": ItemKitchenStatus.PENDING.value,
        "sentToKitchenAt": None,
        "acceptedAt": None,
        "acceptedById": None,
        "acceptedByName": None,
        "readyAt": None,
        "servedAt": None,
        "cancellationReason": None,
    }
    item.update(build_item_totals(item["price"], item["quantity"], item["gstPercentage"]))
    order["items"].append(item)

    return OrderPublic.model_validate(await _save(order))


@router.patch("/{order_id}/items/{item_id}", response_model=OrderPublic)
async def update_item(
    order_id: str, item_id: str, payload: OrderItemUpdate, user: CurrentUser
) -> OrderPublic:
    order = await _load_order(order_id)
    _assert_can_modify(order, user)

    item_oid = to_object_id(item_id, "Item not found")
    item = next((i for i in order["items"] if i["itemId"] == item_oid), None)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    if item.get("sentToKitchenAt") is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This item is already with the kitchen. Cancel it with a reason "
                "instead of changing the quantity."
            ),
        )

    if payload.quantity == 0:
        order["items"] = [i for i in order["items"] if i["itemId"] != item_oid]
    else:
        item["quantity"] = payload.quantity
        if payload.notes is not None:
            item["notes"] = payload.notes
        item.update(build_item_totals(item["price"], item["quantity"], item["gstPercentage"]))

    return OrderPublic.model_validate(await _save(order))


@router.delete("/{order_id}/items/{item_id}", response_model=OrderPublic)
async def remove_item(order_id: str, item_id: str, user: CurrentUser) -> OrderPublic:
    order = await _load_order(order_id)
    _assert_can_modify(order, user)

    item_oid = to_object_id(item_id, "Item not found")
    item = next((i for i in order["items"] if i["itemId"] == item_oid), None)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    if item.get("sentToKitchenAt") is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This item is already with the kitchen. Cancel it with a reason instead.",
        )

    order["items"] = [i for i in order["items"] if i["itemId"] != item_oid]
    saved = await _save(order)

    await audit.record(
        AuditAction.ORDER_ITEM_DELETED,
        "order",
        user=user,
        entity_id=order["_id"],
        entity_label=order["invoiceNumber"],
        old_value={"name": item["name"], "quantity": item["quantity"], "total": item["total"]},
        new_value={"grandTotal": saved["grandTotal"]},
    )
    return OrderPublic.model_validate(saved)


# --- workflow -----------------------------------------------------------


@router.post("/{order_id}/send-kitchen", response_model=OrderPublic)
async def send_to_kitchen(order_id: str, user: CurrentUser) -> OrderPublic:
    """Send only the items the kitchen has not seen yet.

    This is what makes add-on rounds work: ordering two Cokes after the biriyani
    has gone in sends the Cokes alone, not the whole order again.
    """
    order = await _load_order(order_id)
    _assert_can_modify(order, user)

    unsent = [
        item
        for item in active_items(order)
        if item.get("sentToKitchenAt") is None
    ]
    if not unsent:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Every item on this order has already been sent to the kitchen",
        )

    now = utcnow()
    for item in unsent:
        item["sentToKitchenAt"] = now
        item["kitchenStatus"] = ItemKitchenStatus.PENDING.value

    if order.get("sentToKitchenAt") is None:
        order["sentToKitchenAt"] = now

    saved = await _save(order)
    # Lights up the kitchen display without a refresh.
    await notify_new_order(saved)
    return OrderPublic.model_validate(saved)


@router.post("/{order_id}/cancel", response_model=OrderPublic)
async def cancel_order(order_id: str, payload: OrderCancel, user: CurrentUser) -> OrderPublic:
    """Business rule 7: orders are cancelled with a reason, never deleted."""
    order = await _load_order(order_id)

    if order.get("orderStatus") == OrderStatus.CANCELLED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This order is already cancelled"
        )
    if order.get("amountPaid", 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This order has payments against it and cannot be cancelled here.",
        )
    _assert_can_modify(order, user)

    before = audit.order_snapshot(order)

    now = utcnow()
    for item in order["items"]:
        if item.get("kitchenStatus") != ItemKitchenStatus.CANCELLED.value:
            item["kitchenStatus"] = ItemKitchenStatus.CANCELLED.value
            item["cancellationReason"] = payload.reason.value

    order["orderStatus"] = OrderStatus.CANCELLED.value
    order["cancellationReason"] = payload.reason.value
    order["cancellationNote"] = payload.note
    order["closedAt"] = now

    saved = await _save(order)
    await _release_table(order["tableId"], order["_id"])
    await notify_order_closed(saved)

    await audit.record(
        AuditAction.ORDER_CANCELLED,
        "order",
        user=user,
        entity_id=order["_id"],
        entity_label=order["invoiceNumber"],
        old_value=audit.order_snapshot(before),
        new_value={"reason": payload.reason.value},
        note=payload.note,
    )
    return OrderPublic.model_validate(saved)


@router.post("/{order_id}/serve", response_model=OrderPublic)
async def mark_served(order_id: str, user: CurrentUser) -> OrderPublic:
    """The waiter confirms the ready food actually reached the table."""
    order = await _load_order(order_id)
    _assert_can_serve(order, user)

    now = utcnow()
    servable = [
        item
        for item in active_items(order)
        if item.get("kitchenStatus") == ItemKitchenStatus.READY.value
    ]
    if not servable:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nothing is ready to serve on this order yet",
        )

    for item in servable:
        item["kitchenStatus"] = ItemKitchenStatus.SERVED.value
        item["servedAt"] = now

    saved = await _save(order)
    await notify_order_updated(saved)
    return OrderPublic.model_validate(saved)


@router.delete("/{order_id}", response_model=MessageResponse)
async def delete_draft_order(order_id: str, user: CurrentUser) -> MessageResponse:
    """Only an untouched draft can be discarded outright.

    Anything the kitchen has seen must be cancelled with a reason so it leaves a
    trace, per business rule 7.
    """
    order = await _load_order(order_id)
    _assert_can_modify(order, user)

    if order.get("orderStatus") != OrderStatus.DRAFT.value or order.get("sentToKitchenAt"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only an unsent draft can be discarded. Cancel this order with a reason instead.",
        )

    await get_database().orders.delete_one({"_id": order["_id"]})
    await _release_table(order["tableId"], order["_id"])
    return MessageResponse(message="Draft order discarded")
