from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AuditAction, UserRole
from app.schemas.common import MongoModel, PyObjectId


class AuditLogPublic(MongoModel):
    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId = Field(alias="_id")

    action: AuditAction
    entityType: str
    entityId: str | None = None
    # A human-readable handle, so the log reads without joining anything.
    entityLabel: str | None = None

    userId: PyObjectId | None = None
    userName: str
    userRole: UserRole | None = None

    oldValue: dict[str, Any] | None = None
    newValue: dict[str, Any] | None = None
    note: str | None = None

    createdAt: datetime
