"""User persistence logic shared by the auth and user-management routers."""

from bson import ObjectId
from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.core.security import hash_password
from app.core.utils import utcnow  # re-exported: routers import utcnow from here
from app.models.enums import UserRole
from app.schemas.user import UserCreate

__all__ = ["utcnow", "normalise_email", "get_user_by_email", "get_user_by_id", "create_user"]


def normalise_email(email: str) -> str:
    return email.strip().lower()


async def get_user_by_email(email: str) -> dict | None:
    return await get_database().users.find_one({"email": normalise_email(email)})


async def get_user_by_id(user_id: str) -> dict | None:
    try:
        oid = ObjectId(user_id)
    except Exception:
        return None
    return await get_database().users.find_one({"_id": oid})


async def create_user(payload: UserCreate, is_active: bool = True) -> dict:
    now = utcnow()
    document = {
        "name": payload.name.strip(),
        "email": normalise_email(payload.email),
        "phone": payload.phone.strip() if payload.phone else None,
        "passwordHash": hash_password(payload.password),
        "role": UserRole(payload.role).value,
        "isActive": is_active,
        "createdAt": now,
        "updatedAt": now,
    }

    try:
        result = await get_database().users.insert_one(document)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    document["_id"] = result.inserted_id
    return document
