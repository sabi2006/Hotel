"""Report aggregation.

Numbers are summed in Python over a filtered cursor rather than in a Mongo
aggregation pipeline. At restaurant scale - thousands of orders a month, and the
queries are index-backed on createdAt - the difference is not measurable, and it
keeps one code path that is straightforward to read and to test. If a site ever
grows past that, these functions are the single place to swap in $group.
"""

from collections import defaultdict
from datetime import datetime, timedelta

from app.core.database import get_database
from app.models.enums import ItemKitchenStatus, OrderStatus
from app.services.orders import money

# A draft never reached the kitchen, so it is not a sale. A cancelled order is
# counted separately rather than as revenue.
NON_SALE_STATUSES = {OrderStatus.DRAFT.value, OrderStatus.CANCELLED.value}


def local(moment: datetime, tz_offset_minutes: int) -> datetime:
    """Shift a stored UTC moment into the viewer local time."""
    return moment + timedelta(minutes=tz_offset_minutes)


def minutes_between(start: datetime | None, end: datetime | None) -> float | None:
    if start is None or end is None:
        return None
    delta = (end - start).total_seconds() / 60
    return delta if delta >= 0 else None


def average(values: list[float]) -> float:
    return money(sum(values) / len(values)) if values else 0.0


async def orders_in_range(from_date: datetime, to_date: datetime) -> list[dict]:
    cursor = get_database().orders.find(
        {"createdAt": {"$gte": from_date, "$lte": to_date}}
    )
    return [document async for document in cursor]


async def payments_in_range(from_date: datetime, to_date: datetime) -> list[dict]:
    """Payments are attributed to when the money arrived, not when the order opened."""
    cursor = get_database().payments.find(
        {"paidAt": {"$gte": from_date, "$lte": to_date}, "isVoided": False}
    )
    return [document async for document in cursor]


async def tips_in_range(from_date: datetime, to_date: datetime) -> list[dict]:
    cursor = get_database().tips.find(
        {"createdAt": {"$gte": from_date, "$lte": to_date}, "isVoided": False}
    )
    return [document async for document in cursor]


def sale_orders(orders: list[dict]) -> list[dict]:
    return [o for o in orders if o.get("orderStatus") not in NON_SALE_STATUSES]


def billable_items(order: dict) -> list[dict]:
    return [
        item
        for item in order.get("items", [])
        if item.get("kitchenStatus") != ItemKitchenStatus.CANCELLED.value
    ]


def build_summary(orders: list[dict], payments: list[dict], tips: list[dict]) -> dict:
    sales = sale_orders(orders)

    total_sales = money(sum(o.get("grandTotal", 0) for o in sales))
    total_gst = money(sum(o.get("gstAmount", 0) for o in sales))
    total_discount = money(sum(o.get("discount", 0) for o in sales))
    items_sold = sum(item.get("quantity", 0) for o in sales for item in billable_items(o))

    by_method: dict[str, float] = defaultdict(float)
    for payment in payments:
        by_method[payment["method"]] += payment["amount"]

    outstanding = money(
        sum(
            max(0.0, o.get("grandTotal", 0) - o.get("amountPaid", 0))
            for o in sales
            if o.get("orderStatus") != OrderStatus.CLOSED.value
        )
    )

    tip_total = money(sum(t["amount"] for t in tips))
    cash_tips = money(sum(t["amount"] for t in tips if t["method"] == "CASH"))

    return {
        "totalSales": total_sales,
        # Net of GST and discount - what the food itself brought in.
        "netSales": money(total_sales - total_gst),
        "totalGst": total_gst,
        "totalDiscount": total_discount,
        "totalOrders": len(sales),
        "cancelledOrders": sum(
            1 for o in orders if o.get("orderStatus") == OrderStatus.CANCELLED.value
        ),
        "itemsSold": items_sold,
        "averageOrderValue": money(total_sales / len(sales)) if sales else 0.0,
        "totalCollected": money(sum(by_method.values())),
        "cashAmount": money(by_method.get("CASH", 0)),
        "upiAmount": money(by_method.get("UPI", 0)),
        "cardAmount": money(by_method.get("CARD", 0)),
        "pendingAmount": outstanding,
        "totalTips": tip_total,
        "cashTips": cash_tips,
        "upiTips": money(tip_total - cash_tips),
    }


def build_series(
    orders: list[dict],
    payments: list[dict],
    granularity: str,
    tz_offset_minutes: int,
) -> list[dict]:
    """Sales and order counts bucketed by day, month, or hour."""

    def key_for(moment: datetime) -> str:
        shifted = local(moment, tz_offset_minutes)
        if granularity == "month":
            return shifted.strftime("%Y-%m")
        if granularity == "hour":
            return shifted.strftime("%Y-%m-%d %H:00")
        return shifted.strftime("%Y-%m-%d")

    buckets: dict[str, dict] = defaultdict(lambda: {"sales": 0.0, "orders": 0, "collected": 0.0})

    for order in sale_orders(orders):
        bucket = buckets[key_for(order["createdAt"])]
        bucket["sales"] += order.get("grandTotal", 0)
        bucket["orders"] += 1

    for payment in payments:
        buckets[key_for(payment["paidAt"])]["collected"] += payment["amount"]

    return [
        {
            "label": label,
            "sales": money(values["sales"]),
            "orders": values["orders"],
            "collected": money(values["collected"]),
        }
        for label, values in sorted(buckets.items())
    ]


def build_peak_hours(orders: list[dict], tz_offset_minutes: int) -> list[dict]:
    """Every hour of the day, so the chart has no gaps."""
    sales = [0.0] * 24
    counts = [0] * 24

    for order in sale_orders(orders):
        hour = local(order["createdAt"], tz_offset_minutes).hour
        sales[hour] += order.get("grandTotal", 0)
        counts[hour] += 1

    return [
        {"hour": hour, "label": f"{hour:02d}:00", "sales": money(sales[hour]), "orders": counts[hour]}
        for hour in range(24)
    ]


def build_product_rows(orders: list[dict], limit: int | None = None) -> list[dict]:
    totals: dict[str, dict] = {}

    for order in sale_orders(orders):
        for item in billable_items(order):
            key = str(item.get("productId"))
            row = totals.setdefault(
                key, {"productId": key, "name": item["name"], "quantitySold": 0, "revenue": 0.0}
            )
            row["quantitySold"] += item.get("quantity", 0)
            row["revenue"] += item.get("total", 0)

    rows = sorted(totals.values(), key=lambda r: r["revenue"], reverse=True)
    for row in rows:
        row["revenue"] = money(row["revenue"])
    return rows[:limit] if limit else rows


async def build_category_rows(orders: list[dict]) -> list[dict]:
    """Roll product sales up to their category.

    Order items snapshot the product, not its category, so the mapping is read
    from the products collection - one query, not one per item.
    """
    product_ids = {
        item.get("productId")
        for order in sale_orders(orders)
        for item in billable_items(order)
        if item.get("productId")
    }
    if not product_ids:
        return []

    db = get_database()
    category_of: dict[str, object] = {}
    async for product in db.products.find({"_id": {"$in": list(product_ids)}}):
        category_of[str(product["_id"])] = product.get("categoryId")

    names: dict[str, str] = {}
    async for category in db.categories.find({}):
        names[str(category["_id"])] = category["name"]

    totals: dict[str, dict] = {}
    for order in sale_orders(orders):
        for item in billable_items(order):
            category_id = category_of.get(str(item.get("productId")))
            label = names.get(str(category_id), "Uncategorised")
            row = totals.setdefault(label, {"name": label, "quantitySold": 0, "revenue": 0.0})
            row["quantitySold"] += item.get("quantity", 0)
            row["revenue"] += item.get("total", 0)

    rows = sorted(totals.values(), key=lambda r: r["revenue"], reverse=True)
    for row in rows:
        row["revenue"] = money(row["revenue"])
    return rows


def build_waiter_rows(orders: list[dict], tips: list[dict]) -> list[dict]:
    totals: dict[str, dict] = {}

    for order in sale_orders(orders):
        key = str(order.get("waiterId"))
        row = totals.setdefault(
            key,
            {
                "waiterId": key,
                "name": order.get("waiterName", "Unknown"),
                "orders": 0,
                "sales": 0.0,
                "averageOrderValue": 0.0,
                "tips": 0.0,
            },
        )
        row["orders"] += 1
        row["sales"] += order.get("grandTotal", 0)

    for tip in tips:
        key = str(tip.get("waiterId"))
        row = totals.setdefault(
            key,
            {
                "waiterId": key,
                "name": tip.get("waiterName", "Unknown"),
                "orders": 0,
                "sales": 0.0,
                "averageOrderValue": 0.0,
                "tips": 0.0,
            },
        )
        row["tips"] += tip["amount"]

    for row in totals.values():
        row["averageOrderValue"] = money(row["sales"] / row["orders"]) if row["orders"] else 0.0
        row["sales"] = money(row["sales"])
        row["tips"] = money(row["tips"])

    return sorted(totals.values(), key=lambda r: r["sales"], reverse=True)


def build_table_rows(orders: list[dict]) -> list[dict]:
    totals: dict[str, dict] = {}

    for order in sale_orders(orders):
        key = str(order.get("tableNumber", "?"))
        row = totals.setdefault(
            key, {"tableNumber": key, "orders": 0, "sales": 0.0, "averageOrderValue": 0.0}
        )
        row["orders"] += 1
        row["sales"] += order.get("grandTotal", 0)

    for row in totals.values():
        row["averageOrderValue"] = money(row["sales"] / row["orders"]) if row["orders"] else 0.0
        row["sales"] = money(row["sales"])

    return sorted(totals.values(), key=lambda r: r["sales"], reverse=True)


def build_kitchen_report(orders: list[dict]) -> dict:
    accept_times: list[float] = []
    prep_times: list[float] = []
    total_times: list[float] = []

    for order in sale_orders(orders):
        sent, accepted, ready = (
            order.get("sentToKitchenAt"),
            order.get("acceptedAt"),
            order.get("readyAt"),
        )

        # How long a ticket waited before the kitchen picked it up.
        waited = minutes_between(sent, accepted)
        if waited is not None:
            accept_times.append(waited)

        # How long the cooking itself took.
        cooked = minutes_between(accepted, ready)
        if cooked is not None:
            prep_times.append(cooked)

        overall = minutes_between(sent, ready)
        if overall is not None:
            total_times.append(overall)

    return {
        "ordersPrepared": len(total_times),
        "averageAcceptMinutes": average(accept_times),
        "averagePrepMinutes": average(prep_times),
        "averageTotalMinutes": average(total_times),
        "slowestPrepMinutes": money(max(total_times)) if total_times else 0.0,
    }


def build_payment_method_rows(payments: list[dict]) -> list[dict]:
    totals: dict[str, dict] = {}
    for payment in payments:
        row = totals.setdefault(
            payment["method"], {"method": payment["method"], "amount": 0.0, "count": 0}
        )
        row["amount"] += payment["amount"]
        row["count"] += 1

    for row in totals.values():
        row["amount"] = money(row["amount"])
    return sorted(totals.values(), key=lambda r: r["amount"], reverse=True)
