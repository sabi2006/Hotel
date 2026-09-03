"""WebSocket endpoint carrying live order events."""

import logging

from bson import ObjectId
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.database import get_database
from app.core.security import decode_access_token
from app.models.enums import UserRole
from app.realtime import ROOMS_BY_ROLE, manager

logger = logging.getLogger("hotel.ws")

router = APIRouter()

# Close codes, per the WebSocket spec range for application errors.
POLICY_VIOLATION = 1008


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(default="")) -> None:
    """Authenticate from the query string, then join the rooms for that role.

    Browsers cannot set headers on a WebSocket handshake, so the JWT travels as
    a query parameter. It is validated exactly like a REST bearer token.
    """
    payload = decode_access_token(token)
    if payload is None or not payload.get("sub"):
        await websocket.close(code=POLICY_VIOLATION, reason="Invalid token")
        return

    try:
        user = await get_database().users.find_one({"_id": ObjectId(payload["sub"])})
    except Exception:
        user = None

    if user is None or not user.get("isActive", True):
        await websocket.close(code=POLICY_VIOLATION, reason="Account unavailable")
        return

    try:
        role = UserRole(user["role"])
    except ValueError:
        await websocket.close(code=POLICY_VIOLATION, reason="Unknown role")
        return

    rooms = ROOMS_BY_ROLE[role] + (f"user:{user['_id']}",)
    await manager.connect(websocket, rooms)
    logger.info("WebSocket connected: %s (%s, room: user:%s)", user.get("email"), role.value, user["_id"])


    try:
        await websocket.send_json({"event": "connected", "payload": {"rooms": list(rooms)}})
        while True:
            # The client only sends keepalive pings; replying keeps proxies open.
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"event": "pong", "payload": {}})
    except WebSocketDisconnect:
        pass
    except Exception as error:
        logger.debug("WebSocket closed unexpectedly: %s", error)
    finally:
        await manager.disconnect(websocket)
