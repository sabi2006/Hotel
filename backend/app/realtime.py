"""Live updates between the waiter, kitchen and admin panels.

Native WebSockets rather than Socket.IO: the payloads here are one-way
broadcasts into role rooms, which needs none of the Socket.IO protocol, and it
keeps the browser side dependency-free.

Clients connect to /ws?token=<jwt>. The token decides which rooms they join, so
a waiter can never subscribe to a feed they are not allowed to see.
"""

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

from app.models.enums import UserRole

logger = logging.getLogger("hotel.realtime")

# Event names shared with the frontend (see src/services/realtime.ts).
ORDER_NEW = "order:new"
ORDER_UPDATED = "order:updated"
ORDER_READY = "order:ready"
ORDER_CLOSED = "order:closed"

# Rooms map one-to-one onto roles.
ROOM_KITCHEN = "kitchen"
ROOM_WAITERS = "waiters"
ROOM_ADMIN = "admin"

ROOMS_BY_ROLE: dict[UserRole, tuple[str, ...]] = {
    UserRole.KITCHEN: (ROOM_KITCHEN,),
    UserRole.WAITER: (ROOM_WAITERS,),
    # Admins watch everything.
    UserRole.ADMIN: (ROOM_ADMIN, ROOM_KITCHEN, ROOM_WAITERS),
}


class ConnectionManager:
    """Tracks open sockets per room and fans messages out to them."""

    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, rooms: tuple[str, ...]) -> None:
        await websocket.accept()
        async with self._lock:
            for room in rooms:
                self._rooms.setdefault(room, set()).add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            for members in self._rooms.values():
                members.discard(websocket)

    async def broadcast(self, room: str, event: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            members = list(self._rooms.get(room, ()))

        if not members:
            return

        message = {"event": event, "payload": payload}
        dead: list[WebSocket] = []
        for websocket in members:
            try:
                await websocket.send_json(message)
            except Exception:
                # A client that vanished mid-send is simply dropped.
                dead.append(websocket)

        for websocket in dead:
            await self.disconnect(websocket)

    async def broadcast_many(
        self, rooms: tuple[str, ...], event: str, payload: dict[str, Any]
    ) -> None:
        # Admins sit in several rooms; send once per socket, not once per room.
        async with self._lock:
            members: set[WebSocket] = set()
            for room in rooms:
                members |= self._rooms.get(room, set())

        message = {"event": event, "payload": payload}
        for websocket in list(members):
            try:
                await websocket.send_json(message)
            except Exception:
                await self.disconnect(websocket)

    def connection_count(self) -> dict[str, int]:
        return {room: len(members) for room, members in self._rooms.items()}


manager = ConnectionManager()


def order_summary(order: dict) -> dict[str, Any]:
    """The small payload pushed to clients - they refetch for the detail."""
    return {
        "orderId": str(order["_id"]),
        "orderNumber": order.get("orderNumber"),
        "invoiceNumber": order.get("invoiceNumber"),
        "tableId": str(order.get("tableId")),
        "tableNumber": order.get("tableNumber"),
        "waiterId": str(order.get("waiterId")),
        "waiterName": order.get("waiterName"),
        "orderStatus": order.get("orderStatus"),
        "itemCount": len(order.get("items", [])),
        "grandTotal": order.get("grandTotal", 0),
    }


def ready_notification_summary(
    order: dict, notification: dict | None = None
) -> dict[str, Any]:
    """Rich notification payload sent when an order becomes READY."""
    summary = order_summary(order)
    summary["type"] = "ORDER_READY"
    summary["recipientUserId"] = str(order.get("waiterId")) if order.get("waiterId") else None
    summary["title"] = "Order Ready"
    summary["message"] = (
        f"Order #{order.get('invoiceNumber') or order.get('orderNumber')} "
        f"for Table {order.get('tableNumber')} is ready to serve"
    )
    if notification:
        summary["id"] = str(notification.get("_id", ""))
        summary["notificationId"] = str(notification.get("_id", ""))
        summary["isRead"] = bool(notification.get("isRead", False))
        created_at = notification.get("createdAt")
        summary["createdAt"] = (
            created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at)
        )
    return summary


async def notify_new_order(order: dict) -> None:
    """Waiter sent food to the kitchen - light up the kitchen display."""
    await manager.broadcast(ROOM_KITCHEN, ORDER_NEW, order_summary(order))


async def notify_order_updated(order: dict) -> None:
    await manager.broadcast_many(
        (ROOM_KITCHEN, ROOM_WAITERS, ROOM_ADMIN), ORDER_UPDATED, order_summary(order)
    )


async def notify_order_ready(order: dict, notification: dict | None = None) -> None:
    """Kitchen finished - ring the specific assigned waiter ONLY."""
    waiter_id = str(order.get("waiterId")) if order.get("waiterId") else None
    payload = ready_notification_summary(order, notification)

    # STRICT TARGETING: Send ORDER_READY event ONLY to the specific assigned waiter!
    # Do NOT broadcast ORDER_READY to ADMIN, KITCHEN, or other WAITERS!
    if waiter_id:
        await manager.broadcast(f"user:{waiter_id}", ORDER_READY, payload)

    # Also notify waiters and admins that order status changed (for silent floor plan sync)
    await manager.broadcast_many(
        (ROOM_WAITERS, ROOM_ADMIN), ORDER_UPDATED, order_summary(order)
    )



async def notify_order_closed(order: dict) -> None:
    await manager.broadcast_many(
        (ROOM_KITCHEN, ROOM_WAITERS, ROOM_ADMIN), ORDER_CLOSED, order_summary(order)
    )

