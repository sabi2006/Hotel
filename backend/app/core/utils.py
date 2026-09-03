"""Small helpers shared across routers and services."""

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException, status


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_object_id(value: str, not_found_detail: str = "Not found") -> ObjectId:
    """Convert a path parameter to an ObjectId, 404-ing on anything malformed."""
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail)
