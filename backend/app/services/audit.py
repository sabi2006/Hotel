"""The audit trail.

Billing software needs to be able to answer "who changed this, and to what".
Every money-touching or destructive action writes one row here, holding the
before and after values.

Two deliberate properties:

* Writing a log must never take down the action it is recording. A failure here
  is logged and swallowed - a working till that lost one audit row beats a till
  that stopped mid-service.
* Nothing ever updates or deletes a row. The collection is append-only.
"""

import logging
from typing import Any

from bson import ObjectId

from app.core.database import get_database
from app.core.utils import utcnow
from app.models.enums import AuditAction

logger = logging.getLogger("hotel.audit")


def _plain(value: Any) -> Any:
    """Make a value safe to store and to serialise back out again."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {key: _plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_plain(item) for item in value]
    return value


async def record(
    action: AuditAction,
    entity_type: str,
    *,
    user: Any = None,
    entity_id: str | ObjectId | None = None,
    entity_label: str | None = None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    note: str | None = None,
) -> None:
    try:
        document = {
            "action": action.value,
            "entityType": entity_type,
            "entityId": str(entity_id) if entity_id is not None else None,
            "entityLabel": entity_label,
            "userId": ObjectId(user.id) if user is not None else None,
            "userName": getattr(user, "name", "system"),
            "userRole": getattr(getattr(user, "role", None), "value", None),
            "oldValue": _plain(old_value) if old_value else None,
            "newValue": _plain(new_value) if new_value else None,
            "note": note,
            "createdAt": utcnow(),
        }
        await get_database().auditLogs.insert_one(document)
    except Exception as error:  # pragma: no cover - defensive by design
        logger.error("Could not write audit log for %s: %s", action.value, error)


def order_snapshot(order: dict) -> dict:
    """The fields worth keeping when an order changes."""
    return {
        "invoiceNumber": order.get("invoiceNumber"),
        "tableNumber": order.get("tableNumber"),
        "orderStatus": order.get("orderStatus"),
        "paymentStatus": order.get("paymentStatus"),
        "grandTotal": order.get("grandTotal"),
        "amountPaid": order.get("amountPaid"),
        "itemCount": len(order.get("items", [])),
    }
