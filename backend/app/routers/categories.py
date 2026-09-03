"""Menu category management. Admin writes; any signed-in user may read."""

from fastapi import APIRouter, HTTPException, Query, status
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.core.deps import AdminUser, CurrentUser
from app.core.utils import to_object_id, utcnow
from app.schemas.category import CategoryCreate, CategoryPublic, CategoryUpdate
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/categories", tags=["categories"])

NOT_FOUND = "Category not found"


async def _with_product_counts(documents: list[dict]) -> list[dict]:
    """Attach how many products sit in each category, in one extra query."""
    if not documents:
        return documents

    db = get_database()
    counts: dict[str, int] = {}
    cursor = db.products.find({"categoryId": {"$in": [d["_id"] for d in documents]}})
    async for product in cursor:
        key = str(product["categoryId"])
        counts[key] = counts.get(key, 0) + 1

    for document in documents:
        document["productCount"] = counts.get(str(document["_id"]), 0)
    return documents


@router.get("", response_model=list[CategoryPublic])
async def list_categories(
    user: CurrentUser,
    isActive: bool | None = None,
    search: str | None = Query(default=None),
) -> list[CategoryPublic]:
    query: dict = {}
    if isActive is not None:
        query["isActive"] = isActive
    if search:
        query["name"] = {"$regex": search.strip(), "$options": "i"}

    cursor = get_database().categories.find(query).sort("displayOrder", 1)
    documents = [document async for document in cursor]
    documents.sort(key=lambda d: (d.get("displayOrder", 0), d.get("name", "").lower()))
    return [CategoryPublic.model_validate(d) for d in await _with_product_counts(documents)]


@router.post("", response_model=CategoryPublic, status_code=status.HTTP_201_CREATED)
async def create_category(payload: CategoryCreate, admin: AdminUser) -> CategoryPublic:
    now = utcnow()
    document = payload.model_dump()
    document["name"] = document["name"].strip()
    document.update({"createdAt": now, "updatedAt": now})

    try:
        result = await get_database().categories.insert_one(document)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A category with this name already exists",
        )

    document["_id"] = result.inserted_id
    document["productCount"] = 0
    return CategoryPublic.model_validate(document)


@router.get("/{category_id}", response_model=CategoryPublic)
async def get_category(category_id: str, user: CurrentUser) -> CategoryPublic:
    document = await get_database().categories.find_one({"_id": to_object_id(category_id, NOT_FOUND)})
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return CategoryPublic.model_validate((await _with_product_counts([document]))[0])


@router.patch("/{category_id}", response_model=CategoryPublic)
async def update_category(
    category_id: str, payload: CategoryUpdate, admin: AdminUser
) -> CategoryPublic:
    oid = to_object_id(category_id, NOT_FOUND)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    if "name" in updates and updates["name"]:
        updates["name"] = updates["name"].strip()
        clash = await get_database().categories.find_one(
            {"name": updates["name"], "_id": {"$ne": oid}}
        )
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another category already uses this name",
            )

    updates["updatedAt"] = utcnow()
    document = await get_database().categories.find_one_and_update(
        {"_id": oid}, {"$set": updates}, return_document=True
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return CategoryPublic.model_validate((await _with_product_counts([document]))[0])


@router.delete("/{category_id}", response_model=MessageResponse)
async def delete_category(category_id: str, admin: AdminUser) -> MessageResponse:
    """Refused while products still reference the category - disable it instead."""
    oid = to_object_id(category_id, NOT_FOUND)
    db = get_database()

    product_count = await db.products.count_documents({"categoryId": oid})
    if product_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{product_count} product(s) still use this category. "
                "Move or delete them first, or disable the category instead."
            ),
        )

    result = await db.categories.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return MessageResponse(message="Category deleted")
