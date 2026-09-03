"""Read-only view of the audit trail. Admin only, and append-only by design."""

from datetime import datetime

from fastapi import APIRouter, Query

from app.core.database import get_database
from app.core.deps import AdminUser
from app.core.utils import to_object_id
from app.models.enums import AuditAction
from app.schemas.audit import AuditLogPublic
from app.schemas.common import Page

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("", response_model=Page[AuditLogPublic])
async def list_audit_logs(
    admin: AdminUser,
    action: AuditAction | None = None,
    entityType: str | None = None,
    entityId: str | None = None,
    userId: str | None = None,
    fromDate: datetime | None = None,
    toDate: datetime | None = None,
    search: str | None = Query(default=None, description="Match on the entity label"),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=50, ge=1, le=200),
) -> Page[AuditLogPublic]:
    query: dict = {}
    if action is not None:
        query["action"] = action.value
    if entityType:
        query["entityType"] = entityType
    if entityId:
        query["entityId"] = entityId
    if userId:
        query["userId"] = to_object_id(userId, "User not found")
    if search:
        query["entityLabel"] = {"$regex": search.strip(), "$options": "i"}

    if fromDate or toDate:
        window: dict = {}
        if fromDate:
            window["$gte"] = fromDate
        if toDate:
            window["$lte"] = toDate
        query["createdAt"] = window

    db = get_database()
    total = await db.auditLogs.count_documents(query)
    cursor = (
        db.auditLogs.find(query)
        .sort("createdAt", -1)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
    )
    items = [AuditLogPublic.model_validate(document) async for document in cursor]
    return Page[AuditLogPublic](items=items, total=total, page=page, pageSize=pageSize)
