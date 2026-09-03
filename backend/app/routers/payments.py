"""Billing and payments.

Business rule 9: each payment is stored separately, so a split bill such as
UPI 800 + cash 200 adds up correctly and reports can attribute each rupee to the
method it arrived by.

Displaying a UPI QR is not a payment. Nothing here marks money as received until
a person confirms it, which keeps the door open for a real gateway later.
"""

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, status
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.core.deps import AdminUser, CurrentUser
from app.core.utils import to_object_id, utcnow
from app.models.enums import (
    AuditAction,
    ItemKitchenStatus,
    OrderStatus,
    PaymentMethod,
    TableStatus,
    UserRole,
)
from app.realtime import notify_order_closed, notify_order_updated
from app.schemas.common import Page
from app.schemas.order import OrderPublic
from app.schemas.payment import PaymentCreate, PaymentPublic, PaymentSummary, PaymentVoid
from app.services import audit
from app.services.orders import active_items, money
from app.services.payments import amount_due, list_payments, recalculate_order_payment

router = APIRouter(tags=["payments"])

ORDER_NOT_FOUND = "Order not found"

# Money may not be taken against an order that is finished with.
UNPAYABLE_STATUSES = {OrderStatus.CANCELLED.value, OrderStatus.CLOSED.value}


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ORDER_NOT_FOUND)
    return document


async def _summary_for(order: dict) -> PaymentSummary:
    """The payment state of one order, as every endpoint here reports it."""
    payments = await list_payments(order["_id"])
    due = amount_due(order)
    return PaymentSummary(
        grandTotal=money(order.get("grandTotal", 0)),
        amountPaid=money(order.get("amountPaid", 0)),
        amountDue=due,
        isFullyPaid=due <= 0.005,
        payments=[PaymentPublic.model_validate(p) for p in payments],
    )


@router.get("/orders/{order_id}/payments", response_model=PaymentSummary)
async def get_order_payments(order_id: str, user: CurrentUser) -> PaymentSummary:
    return await _summary_for(await _load_order(order_id))


@router.post(
    "/orders/{order_id}/payments",
    response_model=PaymentSummary,
    status_code=status.HTTP_201_CREATED,
)
async def add_payment(order_id: str, payload: PaymentCreate, user: CurrentUser) -> PaymentSummary:
    """Record one payment against the bill. Call it repeatedly to split."""
    if user.role == UserRole.KITCHEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Kitchen staff cannot take payments"
        )

    order = await _load_order(order_id)

    # A replay of a payment we already took returns the current state rather
    # than a second charge or a confusing error.
    if payload.clientRequestId:
        existing = await get_database().payments.find_one(
            {"clientRequestId": payload.clientRequestId}
        )
        if existing is not None:
            return await _summary_for(await _load_order(str(existing["orderId"])))

    if order.get("orderStatus") in UNPAYABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This order is already closed or cancelled",
        )
    if not active_items(order):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="There is nothing to pay for yet"
        )

    outstanding = amount_due(order)
    if outstanding <= 0.005:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This bill is already fully paid"
        )

    # Overpaying the bill is a mistake, not a tip. Tips are recorded separately.
    if money(payload.amount) > outstanding + 0.005:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"That is more than the {outstanding:.2f} still due. "
                "Reduce the amount, or record the extra as a tip."
            ),
        )

    now = utcnow()
    change = None
    if payload.method == PaymentMethod.CASH and payload.receivedAmount is not None:
        change = money(payload.receivedAmount - payload.amount)

    payment = {
        "orderId": order["_id"],
        # Denormalised so payment reports need no join.
        "invoiceNumber": order["invoiceNumber"],
        "tableNumber": order["tableNumber"],
        "method": payload.method.value,
        "amount": money(payload.amount),
        "receivedAmount": money(payload.receivedAmount) if payload.receivedAmount else None,
        "changeGiven": change,
        "reference": payload.reference.strip() if payload.reference else None,
        "note": payload.note,
        "receivedById": ObjectId(user.id),
        "receivedByName": user.name,
        "paidAt": now,
        "isVoided": False,
        "voidedAt": None,
        "voidedByName": None,
        "voidReason": None,
    }

    # Only set when the client supplied one. The unique index is sparse, and
    # sparse skips missing fields - not explicit nulls - so writing None here
    # would make every keyless payment collide with every other.
    if payload.clientRequestId:
        payment["clientRequestId"] = payload.clientRequestId

    try:
        result = await get_database().payments.insert_one(payment)
    except DuplicateKeyError:
        # Two taps landed at once. The other one won; report its outcome.
        return await _summary_for(await _load_order(order_id))
    payment["_id"] = result.inserted_id

    order = await recalculate_order_payment(order)
    await notify_order_updated(order)

    await audit.record(
        AuditAction.PAYMENT_ADDED,
        "payment",
        user=user,
        entity_id=payment["_id"],
        entity_label=order["invoiceNumber"],
        new_value={
            "method": payment["method"],
            "amount": payment["amount"],
            "reference": payment["reference"],
            "amountDue": amount_due(order),
        },
    )

    return await _summary_for(order)


@router.post("/payments/{payment_id}/void", response_model=PaymentSummary)
async def void_payment(payment_id: str, payload: PaymentVoid, admin: AdminUser) -> PaymentSummary:
    """Reverse a mistaken payment.

    Payments are never deleted - the record stays with a reason attached, and
    simply stops counting towards the bill.
    """
    db = get_database()
    payment = await db.payments.find_one({"_id": to_object_id(payment_id, "Payment not found")})
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    if payment.get("isVoided"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This payment is already voided"
        )

    await db.payments.update_one(
        {"_id": payment["_id"]},
        {
            "$set": {
                "isVoided": True,
                "voidedAt": utcnow(),
                "voidedByName": admin.name,
                "voidReason": payload.reason.strip(),
            }
        },
    )

    order = await db.orders.find_one({"_id": payment["orderId"]})
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ORDER_NOT_FOUND)

    order = await recalculate_order_payment(order)
    await notify_order_updated(order)

    await audit.record(
        AuditAction.PAYMENT_VOIDED,
        "payment",
        user=admin,
        entity_id=payment["_id"],
        entity_label=payment["invoiceNumber"],
        old_value={"method": payment["method"], "amount": payment["amount"], "isVoided": False},
        new_value={"isVoided": True, "amountDue": amount_due(order)},
        note=payload.reason.strip(),
    )

    return await _summary_for(order)


@router.get("/payments", response_model=Page[PaymentPublic])
async def list_all_payments(
    admin: AdminUser,
    method: PaymentMethod | None = None,
    includeVoided: bool = False,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=50, ge=1, le=200),
) -> Page[PaymentPublic]:
    query: dict = {}
    if method is not None:
        query["method"] = method.value
    if not includeVoided:
        query["isVoided"] = False

    db = get_database()
    total = await db.payments.count_documents(query)
    cursor = (
        db.payments.find(query).sort("paidAt", -1).skip((page - 1) * pageSize).limit(pageSize)
    )
    items = [PaymentPublic.model_validate(document) async for document in cursor]
    return Page[PaymentPublic](items=items, total=total, page=page, pageSize=pageSize)


@router.post("/orders/{order_id}/close", response_model=OrderPublic)
@router.patch("/orders/{order_id}/close", response_model=OrderPublic)
@router.post("/payments/orders/{order_id}/close", response_model=OrderPublic)
@router.patch("/payments/orders/{order_id}/close", response_model=OrderPublic)
async def close_order(order_id: str, user: CurrentUser) -> OrderPublic:
    """Business rules 5 and 6: close only when served and fully paid, then free
    the table.
    """
    order = await _load_order(order_id)

    if order.get("orderStatus") == OrderStatus.CLOSED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This order is already closed"
        )
    if order.get("orderStatus") == OrderStatus.CANCELLED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This order was cancelled"
        )

    # Rule 5 is absolute - it binds admins too.
    outstanding = amount_due(order)
    if outstanding > 0.005:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{outstanding:.2f} is still unpaid. Take the balance before closing.",
        )

    unserved = [
        item
        for item in active_items(order)
        if item.get("sentToKitchenAt") is not None
        and item.get("kitchenStatus") != ItemKitchenStatus.SERVED.value
    ]
    if unserved and user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{len(unserved)} item(s) have not been served yet. "
                "Serve them, or ask an administrator to close this order."
            ),
        )

    now = utcnow()
    order["orderStatus"] = OrderStatus.CLOSED.value
    order["closedAt"] = now
    order["closedByName"] = user.name
    order["updatedAt"] = now

    db = get_database()
    await db.orders.replace_one({"_id": order["_id"]}, order)

    table_id = order.get("tableId")
    if table_id:
        table_queries: list[dict] = [{"_id": table_id}]
        try:
            table_queries.append({"_id": ObjectId(table_id)})
        except Exception:
            pass
        await db.tables.update_one(
            {"$or": table_queries},
            {
                "$set": {
                    "status": TableStatus.FREE.value,
                    "activeOrderId": None,
                    "updatedAt": now,
                }
            },
        )

    await notify_order_closed(order)

    await audit.record(
        AuditAction.ORDER_CLOSED,
        "order",
        user=user,
        entity_id=order["_id"],
        entity_label=order["invoiceNumber"],
        new_value={
            "grandTotal": order.get("grandTotal"),
            "amountPaid": order.get("amountPaid"),
            "tableNumber": order.get("tableNumber"),
        },
    )
    return OrderPublic.model_validate(order)
