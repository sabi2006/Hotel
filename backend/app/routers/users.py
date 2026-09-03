"""Admin user management (waiters, kitchen staff, other admins)."""

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, status

from app.core.database import get_database
from app.core.deps import AdminUser, CurrentUser
from app.core.security import hash_password
from app.models.enums import AuditAction, UserRole
from app.schemas.common import MessageResponse, Page
from app.schemas.user import PasswordReset, UserCreate, UserPublic, UserUpdate, WaiterTipQr
from app.services import audit
from app.services.users import create_user, normalise_email, utcnow

router = APIRouter(prefix="/users", tags=["users"])


def _object_id_or_404(user_id: str) -> ObjectId:
    try:
        return ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")


@router.get("", response_model=Page[UserPublic])
async def list_users(
    admin: AdminUser,
    role: UserRole | None = None,
    isActive: bool | None = None,
    search: str | None = Query(default=None, description="Match on name, email or phone"),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=20, ge=1, le=100),
) -> Page[UserPublic]:
    query: dict = {}
    if role is not None:
        query["role"] = role.value
    if isActive is not None:
        query["isActive"] = isActive
    if search:
        pattern = {"$regex": search.strip(), "$options": "i"}
        query["$or"] = [{"name": pattern}, {"email": pattern}, {"phone": pattern}]

    db = get_database()
    total = await db.users.count_documents(query)
    cursor = (
        db.users.find(query)
        .sort("createdAt", -1)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
    )
    items = [UserPublic.model_validate(doc) async for doc in cursor]
    return Page[UserPublic](items=items, total=total, page=page, pageSize=pageSize)


@router.post("", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def create_staff_user(payload: UserCreate, admin: AdminUser) -> UserPublic:
    document = await create_user(payload)

    await audit.record(
        AuditAction.USER_CREATED,
        "user",
        user=admin,
        entity_id=document["_id"],
        entity_label=document["name"],
        new_value={"email": document["email"], "role": document["role"]},
    )
    return UserPublic.model_validate(document)


@router.get("/{user_id}/tip-qr", response_model=WaiterTipQr)
async def get_waiter_tip_qr(user_id: str, user: CurrentUser) -> WaiterTipQr:
    """The tip QR for one waiter, so it can be shown to a paying customer."""
    document = await get_database().users.find_one({"_id": _object_id_or_404(user_id)})
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return WaiterTipQr.model_validate(document)


@router.get("/{user_id}", response_model=UserPublic)
async def get_user(user_id: str, admin: AdminUser) -> UserPublic:
    document = await get_database().users.find_one({"_id": _object_id_or_404(user_id)})
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserPublic.model_validate(document)


@router.patch("/{user_id}", response_model=UserPublic)
async def update_user(user_id: str, payload: UserUpdate, admin: AdminUser) -> UserPublic:
    oid = _object_id_or_404(user_id)
    updates = payload.model_dump(exclude_unset=True)

    if "email" in updates and updates["email"]:
        updates["email"] = normalise_email(updates["email"])
        clash = await get_database().users.find_one(
            {"email": updates["email"], "_id": {"$ne": oid}}
        )
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another account already uses this email",
            )

    if "role" in updates and updates["role"]:
        role_val = updates["role"].value if hasattr(updates["role"], "value") else str(updates["role"])
        updates["role"] = role_val
        if str(oid) == admin.id and role_val != admin.role.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot change your own admin role",
            )

    # An admin must not be able to lock themselves out of the system.
    if updates.get("isActive") is False and str(oid) == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot disable your own account",
        )

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    updates["updatedAt"] = utcnow()
    document = await get_database().users.find_one_and_update(
        {"_id": oid}, {"$set": updates}, return_document=True
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await audit.record(
        AuditAction.USER_CREATED if "role" in updates else AuditAction.USER_DISABLED,
        "user",
        user=admin,
        entity_id=oid,
        entity_label=document.get("name", str(oid)),
        new_value={k: v for k, v in updates.items() if k != "updatedAt"},
        note="User details modified by admin",
    )
    return UserPublic.model_validate(document)


@router.post("/{user_id}/reset-password", response_model=MessageResponse)
async def reset_password(user_id: str, payload: PasswordReset, admin: AdminUser) -> MessageResponse:
    result = await get_database().users.update_one(
        {"_id": _object_id_or_404(user_id)},
        {"$set": {"passwordHash": hash_password(payload.newPassword), "updatedAt": utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await audit.record(
        AuditAction.USER_PASSWORD_RESET,
        "user",
        user=admin,
        entity_id=user_id,
        entity_label=user_id,
    )
    return MessageResponse(message="Password reset successfully")


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: str, admin: AdminUser, permanent: bool = False
) -> MessageResponse:
    """Disable or permanently delete a staff account."""
    oid = _object_id_or_404(user_id)
    if str(oid) == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete or disable your own account",
        )

    db = get_database()
    if permanent:
        # A staff member who has traded is referenced by orders, payments, tips
        # and the audit trail. Deleting them would orphan an open table and
        # leave money attributed to a ghost, so only a never-used account can
        # be removed outright. Everyone else is disabled instead.
        history = {
            "orders": await db.orders.count_documents({"waiterId": oid}),
            "payments": await db.payments.count_documents({"receivedById": oid}),
            "tips": await db.tips.count_documents({"waiterId": oid}),
        }
        used = {name: count for name, count in history.items() if count}
        if used:
            detail = ", ".join(f"{count} {name}" for name, count in used.items())
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"This account has trading history ({detail}) and cannot be deleted. "
                    "Disable it instead - the records must keep pointing at a real person."
                ),
            )

        result = await db.users.delete_one({"_id": oid})
        if result.deleted_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        await audit.record(
            AuditAction.USER_DELETED,
            "user",
            user=admin,
            entity_id=oid,
            entity_label=user_id,
            note="User permanently deleted",
        )
        return MessageResponse(message="User deleted successfully")
    else:
        result = await db.users.update_one(
            {"_id": oid}, {"$set": {"isActive": False, "updatedAt": utcnow()}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        await audit.record(
            AuditAction.USER_DISABLED,
            "user",
            user=admin,
            entity_id=oid,
            entity_label=user_id,
            new_value={"isActive": False},
        )
        return MessageResponse(message="User disabled")
