"""Tips.

Kept entirely separate from the food bill. A tip never changes grandTotal,
amountPaid, or whether an order can be closed - it is money for the waiter, not
revenue for the restaurant, and the reports treat it that way.

A UPI tip goes directly to the waiter through their own QR, so the app records
that it happened rather than moving the money.
"""

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, status

from app.core.database import get_database
from app.core.deps import AdminUser, CurrentUser
from app.core.utils import to_object_id, utcnow
from app.models.enums import AuditAction, OrderStatus, UserRole
from app.schemas.common import Page
from app.schemas.tip import TipCreate, TipPublic, TipSummary, TipVoid
from app.services import audit
from app.services.orders import money

router = APIRouter(tags=["tips"])

ORDER_NOT_FOUND = "Order not found"


async def _load_order(order_id: str) -> dict:
    document = await get_database().orders.find_one(
        {"_id": to_object_id(order_id, ORDER_NOT_FOUND)}
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ORDER_NOT_FOUND)
    return document


async def _summary_for(order_id) -> TipSummary:
    cursor = get_database().tips.find({"orderId": order_id}).sort("createdAt", 1)
    tips = [document async for document in cursor]
    total = money(sum(t["amount"] for t in tips if not t.get("isVoided")))
    return TipSummary(totalTips=total, tips=[TipPublic.model_validate(t) for t in tips])


@router.get("/orders/{order_id}/tips", response_model=TipSummary)
async def get_order_tips(order_id: str, user: CurrentUser) -> TipSummary:
    order = await _load_order(order_id)
    return await _summary_for(order["_id"])


@router.post(
    "/orders/{order_id}/tips", response_model=TipSummary, status_code=status.HTTP_201_CREATED
)
async def add_tip(order_id: str, payload: TipCreate, user: CurrentUser) -> TipSummary:
    if user.role == UserRole.KITCHEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Kitchen staff cannot record tips"
        )

    order = await _load_order(order_id)
    if order.get("orderStatus") == OrderStatus.CANCELLED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This order was cancelled"
        )

    db = get_database()

    # The tip belongs to the waiter who worked the table unless told otherwise.
    waiter_id = order["waiterId"]
    waiter_name = order["waiterName"]
    if payload.waiterId:
        waiter_oid = to_object_id(payload.waiterId, "Waiter not found")
        waiter = await db.users.find_one({"_id": waiter_oid})
        if waiter is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Waiter not found")
        waiter_id, waiter_name = waiter["_id"], waiter["name"]

    tip = {
        "orderId": order["_id"],
        "invoiceNumber": order["invoiceNumber"],
        "tableNumber": order["tableNumber"],
        "waiterId": waiter_id,
        "waiterName": waiter_name,
        "amount": money(payload.amount),
        "method": payload.method.value,
        "reference": payload.reference.strip() if payload.reference else None,
        "note": payload.note,
        "recordedById": ObjectId(user.id),
        "recordedByName": user.name,
        "createdAt": utcnow(),
        "isVoided": False,
        "voidedAt": None,
        "voidedByName": None,
        "voidReason": None,
    }

    result = await db.tips.insert_one(tip)

    await audit.record(
        AuditAction.TIP_ADDED,
        "tip",
        user=user,
        entity_id=result.inserted_id,
        entity_label=order["invoiceNumber"],
        new_value={
            "amount": tip["amount"],
            "method": tip["method"],
            "waiterName": tip["waiterName"],
        },
    )
    return await _summary_for(order["_id"])


@router.post("/tips/{tip_id}/void", response_model=TipSummary)
async def void_tip(tip_id: str, payload: TipVoid, admin: AdminUser) -> TipSummary:
    """Tips are voided with a reason, never deleted."""
    db = get_database()
    tip = await db.tips.find_one({"_id": to_object_id(tip_id, "Tip not found")})
    if tip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tip not found")
    if tip.get("isVoided"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This tip is already voided"
        )

    await db.tips.update_one(
        {"_id": tip["_id"]},
        {
            "$set": {
                "isVoided": True,
                "voidedAt": utcnow(),
                "voidedByName": admin.name,
                "voidReason": payload.reason.strip(),
            }
        },
    )
    await audit.record(
        AuditAction.TIP_VOIDED,
        "tip",
        user=admin,
        entity_id=tip["_id"],
        entity_label=tip["invoiceNumber"],
        old_value={"amount": tip["amount"], "isVoided": False},
        new_value={"isVoided": True},
        note=payload.reason.strip(),
    )
    return await _summary_for(tip["orderId"])


@router.get("/tips", response_model=Page[TipPublic])
async def list_tips(
    user: CurrentUser,
    waiterId: str | None = None,
    includeVoided: bool = False,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=50, ge=1, le=200),
) -> Page[TipPublic]:
    """Admins see every tip; a waiter sees only their own."""
    query: dict = {}
    if not includeVoided:
        query["isVoided"] = False

    if user.role == UserRole.ADMIN:
        if waiterId:
            query["waiterId"] = to_object_id(waiterId, "Waiter not found")
    else:
        query["waiterId"] = ObjectId(user.id)

    db = get_database()
    total = await db.tips.count_documents(query)
    cursor = (
        db.tips.find(query).sort("createdAt", -1).skip((page - 1) * pageSize).limit(pageSize)
    )
    items = [TipPublic.model_validate(document) async for document in cursor]
    return Page[TipPublic](items=items, total=total, page=page, pageSize=pageSize)
