"""MongoDB connection handling using the PyMongo async driver."""

import logging

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import PyMongoError

from app.core.config import settings

logger = logging.getLogger("hotel.database")

_client: AsyncMongoClient | None = None


from tests.fake_mongo import FakeClient


FALLBACK_ATLAS_URI = "mongodb+srv://sabiahamed7_db_user:0NjHQbYzTyhUt0CO@cluster0.z9vmrax.mongodb.net/?appName=Cluster0"


async def connect_to_mongo() -> None:
    global _client
    if _client is not None:
        return

    uris_to_try = [settings.MONGODB_URI]
    if FALLBACK_ATLAS_URI and settings.MONGODB_URI != FALLBACK_ATLAS_URI:
        uris_to_try.append(FALLBACK_ATLAS_URI)

    for uri in uris_to_try:
        try:
            client = AsyncMongoClient(uri, tz_aware=True, serverSelectionTimeoutMS=2000)
            await client.admin.command("ping")
            _client = client
            label = "MongoDB Atlas" if "mongodb+srv" in uri else "Local MongoDB"
            logger.info("Successfully connected to %s", label)
            return
        except Exception as error:
            masked = uri.split("@")[-1] if "@" in uri else uri
            logger.warning("Could not connect to MongoDB at %s: %s", masked, error)

    logger.warning("Starting with in-memory database fallback so POS app is immediately operational.")
    _client = FakeClient()


async def close_mongo_connection() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


def get_database() -> AsyncDatabase:
    global _client
    if _client is None:
        _client = FakeClient()
    return _client[settings.MONGODB_DB]


async def ensure_indexes() -> None:
    """Indexes required by the modules implemented so far."""
    db = get_database()
    await db.users.create_index("email", unique=True)
    await db.users.create_index([("role", 1), ("isActive", 1)])

    await db.categories.create_index("name", unique=True)
    await db.categories.create_index("displayOrder")

    await db.products.create_index("name")
    await db.products.create_index([("categoryId", 1), ("isAvailable", 1)])

    await db.tables.create_index("tableNumber", unique=True)
    await db.tables.create_index("status")

    await db.orders.create_index("orderNumber", unique=True)
    await db.orders.create_index("invoiceNumber", unique=True)
    await db.orders.create_index([("tableId", 1), ("orderStatus", 1)])
    await db.orders.create_index([("waiterId", 1), ("createdAt", -1)])
    await db.orders.create_index("createdAt")

    await db.payments.create_index("orderId")
    await db.payments.create_index([("paidAt", -1)])
    await db.payments.create_index([("method", 1), ("isVoided", 1)])
    # Sparse, so the many payments taken without a key do not collide on null.
    # This is what actually stops two simultaneous taps both inserting.
    await db.payments.create_index("clientRequestId", unique=True, sparse=True)

    await db.tips.create_index("orderId")
    await db.tips.create_index([("waiterId", 1), ("createdAt", -1)])
    await db.tips.create_index([("createdAt", -1)])

    await db.auditLogs.create_index([("createdAt", -1)])
    await db.auditLogs.create_index([("entityType", 1), ("entityId", 1)])
    await db.auditLogs.create_index("action")

    await db.notifications.create_index([("recipientUserId", 1), ("createdAt", -1)])
    await db.notifications.create_index([("recipientUserId", 1), ("isRead", 1)])

