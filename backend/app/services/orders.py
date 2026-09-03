"""Order maths and state derivation.

Two rules drive everything here:

1. Every order item stores its own snapshot of name, price and GST rate. Totals
   are always recomputed from those snapshots, never from the live product, so a
   price change today cannot alter a bill from last month.
2. The order status is derived from the per-item kitchen statuses, so one order
   can legitimately hold items that are READY, PREPARING and PENDING at once.
"""

from datetime import datetime

from app.core.database import get_database
from app.core.utils import utcnow
from app.models.enums import ItemKitchenStatus, OrderStatus, PaymentStatus

# Statuses the waiter and kitchen may no longer drive automatically.
TERMINAL_STATUSES = {OrderStatus.CANCELLED, OrderStatus.PAID, OrderStatus.CLOSED}


def money(value: float) -> float:
    """Round to paise. Applied per item, then summed, to avoid drift."""
    return round(value + 1e-9, 2)


def build_item_totals(price: float, quantity: int, gst_percentage: float) -> dict:
    subtotal = money(price * quantity)
    gst_amount = money(subtotal * gst_percentage / 100)
    return {
        "subtotal": subtotal,
        "gstAmount": gst_amount,
        "total": money(subtotal + gst_amount),
    }


def active_items(order: dict) -> list[dict]:
    """Cancelled items stay on the record but never contribute to the bill."""
    return [
        item
        for item in order.get("items", [])
        if item.get("kitchenStatus") != ItemKitchenStatus.CANCELLED.value
    ]


def recalculate_totals(order: dict) -> dict:
    items = active_items(order)
    subtotal = money(sum(item["subtotal"] for item in items))
    gst_amount = money(sum(item["gstAmount"] for item in items))
    discount = money(order.get("discount", 0) or 0)

    # A discount must never push the bill below zero.
    discount = min(discount, money(subtotal + gst_amount))

    order["subtotal"] = subtotal
    order["gstAmount"] = gst_amount
    order["discount"] = discount
    order["grandTotal"] = money(subtotal + gst_amount - discount)
    return order


def derive_order_status(order: dict) -> str:
    """Compute the order status from its items.

    Terminal statuses (cancelled, paid, closed) are set explicitly elsewhere and
    are never overwritten here.
    """
    current = order.get("orderStatus")
    if current in {status.value for status in TERMINAL_STATUSES}:
        return current

    items = active_items(order)
    if not items:
        return OrderStatus.DRAFT.value

    sent = [item for item in items if item.get("sentToKitchenAt") is not None]
    if not sent:
        return OrderStatus.DRAFT.value

    statuses = {item.get("kitchenStatus") for item in sent}

    # A part-paid bill outranks the kitchen view: the food is done with, the
    # money is not. Full payment is set explicitly by the payment service.
    paid = order.get("amountPaid", 0) or 0
    total = order.get("grandTotal", 0) or 0
    if 0 < paid < total - 0.005:
        return OrderStatus.PAYMENT_PENDING.value

    if statuses == {ItemKitchenStatus.SERVED.value}:
        return OrderStatus.SERVED.value
    if statuses <= {ItemKitchenStatus.READY.value, ItemKitchenStatus.SERVED.value}:
        return OrderStatus.READY.value
    if ItemKitchenStatus.PREPARING.value in statuses:
        return OrderStatus.PREPARING.value
    return OrderStatus.SENT_TO_KITCHEN.value


def stamp_milestones(order: dict, now: datetime | None = None) -> dict:
    """Record when the order first reached each kitchen milestone."""
    now = now or utcnow()
    status = order.get("orderStatus")

    if status == OrderStatus.READY.value and order.get("readyAt") is None:
        order["readyAt"] = now
    if status == OrderStatus.SERVED.value and order.get("servedAt") is None:
        order["servedAt"] = now
    return order


def refresh(order: dict) -> dict:
    """Recompute money and status after any change to the items."""
    recalculate_totals(order)
    order["orderStatus"] = derive_order_status(order)
    stamp_milestones(order)
    order["updatedAt"] = utcnow()
    return order


async def next_sequence(name: str) -> int:
    """Atomic counter. Mongo guarantees the increment even under concurrency."""
    document = await get_database().counters.find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return int(document["seq"])


async def allocate_order_identifiers() -> tuple[int, str]:
    """Sequential order number plus a readable invoice number.

    Customer-facing bills must never show a Mongo ObjectId.
    """
    year = utcnow().year
    sequence = await next_sequence(f"orders-{year}")
    return sequence, f"INV-{year}-{sequence:06d}"


def payment_status_for(order: dict) -> str:
    paid = money(order.get("amountPaid", 0))
    total = money(order.get("grandTotal", 0))
    if paid <= 0:
        return PaymentStatus.PENDING.value
    if paid < total:
        return PaymentStatus.PARTIAL.value
    return PaymentStatus.PAID.value
