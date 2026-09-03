"""Payment totals.

Every payment is its own record - that is what makes split payments add up
correctly, and what lets a report say how much came in as cash versus UPI.
The order only ever caches the sum.
"""

from app.core.database import get_database
from app.models.enums import OrderStatus, PaymentStatus
from app.services.orders import money, refresh


async def list_payments(order_id) -> list[dict]:
    cursor = get_database().payments.find({"orderId": order_id}).sort("paidAt", 1)
    return [document async for document in cursor]


def sum_payments(payments: list[dict]) -> float:
    """Voided payments never count towards the bill."""
    return money(sum(p["amount"] for p in payments if not p.get("isVoided")))


async def recalculate_order_payment(order: dict) -> dict:
    """Refresh amountPaid and paymentStatus from the payment records."""
    payments = await list_payments(order["_id"])
    paid = sum_payments(payments)

    order["amountPaid"] = paid

    # Voiding a payment can drop a PAID order back below its total. PAID is a
    # terminal status that refresh() will not recompute, so clear it first.
    total_before = money(order.get("grandTotal", 0))
    if order.get("orderStatus") == OrderStatus.PAID.value and paid + 0.005 < total_before:
        order["orderStatus"] = OrderStatus.SERVED.value

    refresh(order)

    total = money(order.get("grandTotal", 0))
    if paid <= 0:
        order["paymentStatus"] = PaymentStatus.PENDING.value
    elif paid + 0.005 < total:
        order["paymentStatus"] = PaymentStatus.PARTIAL.value
    else:
        order["paymentStatus"] = PaymentStatus.PAID.value

    # A fully paid order that is not yet closed sits at PAID.
    if (
        order["paymentStatus"] == PaymentStatus.PAID.value
        and order.get("orderStatus") not in {OrderStatus.CLOSED.value, OrderStatus.CANCELLED.value}
    ):
        order["orderStatus"] = OrderStatus.PAID.value

    await get_database().orders.replace_one({"_id": order["_id"]}, order)
    return order


def amount_due(order: dict) -> float:
    return money(max(0.0, money(order.get("grandTotal", 0)) - money(order.get("amountPaid", 0))))
