"""Restaurant table management.

Tables cycle FREE -> OCCUPIED -> FREE. They are never permanently closed; the
status is driven by the active order, which phase 3 introduces.
"""

from fastapi import APIRouter, HTTPException, Query, status
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.core.deps import AdminUser, CurrentUser
from app.core.utils import to_object_id, utcnow
from app.models.enums import TableStatus
from app.schemas.common import MessageResponse
from app.schemas.table import TableCreate, TablePublic, TableUpdate

router = APIRouter(prefix="/tables", tags=["tables"])

NOT_FOUND = "Table not found"


def _sort_key(document: dict):
    """Order T1, T2, T10 naturally rather than lexicographically."""
    number = str(document.get("tableNumber", ""))
    digits = "".join(character for character in number if character.isdigit())
    return (int(digits) if digits else 10**9, number.lower())


@router.get("", response_model=list[TablePublic])
async def list_tables(
    user: CurrentUser,
    status_filter: TableStatus | None = Query(default=None, alias="status"),
    isActive: bool | None = None,
) -> list[TablePublic]:
    query: dict = {}
    if status_filter is not None:
        query["status"] = status_filter.value
    if isActive is not None:
        query["isActive"] = isActive

    cursor = get_database().tables.find(query)
    documents = [document async for document in cursor]
    documents.sort(key=_sort_key)
    return [TablePublic.model_validate(d) for d in documents]


@router.post("", response_model=TablePublic, status_code=status.HTTP_201_CREATED)
async def create_table(payload: TableCreate, admin: AdminUser) -> TablePublic:
    now = utcnow()
    document = payload.model_dump()
    document["tableNumber"] = document["tableNumber"].strip()
    document.update(
        {
            "status": TableStatus.FREE.value,
            "activeOrderId": None,
            "createdAt": now,
            "updatedAt": now,
        }
    )

    try:
        result = await get_database().tables.insert_one(document)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A table with this number already exists",
        )

    document["_id"] = result.inserted_id
    return TablePublic.model_validate(document)


@router.get("/{table_id}", response_model=TablePublic)
async def get_table(table_id: str, user: CurrentUser) -> TablePublic:
    document = await get_database().tables.find_one({"_id": to_object_id(table_id, NOT_FOUND)})
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return TablePublic.model_validate(document)


@router.patch("/{table_id}", response_model=TablePublic)
async def update_table(table_id: str, payload: TableUpdate, admin: AdminUser) -> TablePublic:
    oid = to_object_id(table_id, NOT_FOUND)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    db = get_database()
    existing = await db.tables.find_one({"_id": oid})
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)

    if "tableNumber" in updates and updates["tableNumber"]:
        updates["tableNumber"] = updates["tableNumber"].strip()
        clash = await db.tables.find_one(
            {"tableNumber": updates["tableNumber"], "_id": {"$ne": oid}}
        )
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another table already uses this number",
            )

    # Taking a table out of service mid-meal would strand its order.
    if updates.get("isActive") is False and existing.get("status") == TableStatus.OCCUPIED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This table is occupied. Close its order before deactivating it.",
        )

    updates["updatedAt"] = utcnow()
    document = await db.tables.find_one_and_update(
        {"_id": oid}, {"$set": updates}, return_document=True
    )
    return TablePublic.model_validate(document)


@router.delete("/{table_id}", response_model=MessageResponse)
async def delete_table(table_id: str, admin: AdminUser) -> MessageResponse:
    oid = to_object_id(table_id, NOT_FOUND)
    db = get_database()

    existing = await db.tables.find_one({"_id": oid})
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    if existing.get("status") == TableStatus.OCCUPIED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This table is occupied. Close its order before deleting it.",
        )

    await db.tables.delete_one({"_id": oid})
    return MessageResponse(message="Table deleted")
