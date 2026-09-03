"""Restaurant-wide settings.

Stored as a single document so there is exactly one source of truth for what
goes on an invoice and which UPI account the QR points at.
"""

from fastapi import APIRouter, HTTPException, status

from app.core.database import get_database
from app.core.deps import AdminUser, CurrentUser
from app.core.utils import utcnow
from app.schemas.settings import (
    RestaurantSettingsBase,
    RestaurantSettingsPublic,
    RestaurantSettingsUpdate,
)

router = APIRouter(prefix="/settings", tags=["settings"])

SETTINGS_ID = "restaurant"


async def load_settings() -> dict:
    """Read the settings document, seeding defaults the first time."""
    db = get_database()
    document = await db.settings.find_one({"_id": SETTINGS_ID})
    if document is None:
        document = {"_id": SETTINGS_ID, **RestaurantSettingsBase().model_dump(), "updatedAt": None}
        await db.settings.insert_one(document)
    return document


@router.get("", response_model=RestaurantSettingsPublic)
async def get_settings(user: CurrentUser) -> RestaurantSettingsPublic:
    """Any signed-in user reads these - the waiter needs them to print a bill."""
    return RestaurantSettingsPublic.model_validate(await load_settings())


@router.patch("", response_model=RestaurantSettingsPublic)
async def update_settings(
    payload: RestaurantSettingsUpdate, admin: AdminUser
) -> RestaurantSettingsPublic:
    await load_settings()

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    updates["updatedAt"] = utcnow()
    document = await get_database().settings.find_one_and_update(
        {"_id": SETTINGS_ID}, {"$set": updates}, return_document=True
    )
    return RestaurantSettingsPublic.model_validate(document)
