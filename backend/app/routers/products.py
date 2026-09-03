"""Product (menu item) management. Admin writes; any signed-in user may read."""

from fastapi import APIRouter, HTTPException, Query, status

from app.core.database import get_database
from app.core.deps import AdminUser, CurrentUser
from app.core.utils import to_object_id, utcnow
from app.models.enums import AuditAction, FoodType, MealType
from app.schemas.common import MessageResponse, Page
from app.schemas.product import ProductCreate, ProductPublic, ProductUpdate
from app.services import audit

router = APIRouter(prefix="/products", tags=["products"])

NOT_FOUND = "Product not found"


async def _attach_category_names(documents: list[dict]) -> list[dict]:
    """Resolve category names in one extra query rather than per product."""
    if not documents:
        return documents

    category_ids = {d["categoryId"] for d in documents if d.get("categoryId")}
    names: dict[str, str] = {}
    cursor = get_database().categories.find({"_id": {"$in": list(category_ids)}})
    async for category in cursor:
        names[str(category["_id"])] = category["name"]

    for document in documents:
        document["categoryName"] = names.get(str(document.get("categoryId")))
    return documents


async def _require_category(category_id: str):
    oid = to_object_id(category_id, "Category not found")
    if await get_database().categories.find_one({"_id": oid}) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="That category does not exist"
        )
    return oid


@router.get("", response_model=Page[ProductPublic])
async def list_products(
    user: CurrentUser,
    search: str | None = Query(default=None, description="Match on product name"),
    categoryId: str | None = None,
    foodType: FoodType | None = None,
    mealType: MealType | None = None,
    isAvailable: bool | None = None,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=50, ge=1, le=200),
) -> Page[ProductPublic]:
    query: dict = {}
    if search:
        query["name"] = {"$regex": search.strip(), "$options": "i"}
    if categoryId:
        query["categoryId"] = to_object_id(categoryId, "Category not found")
    if foodType is not None:
        query["foodType"] = foodType.value
    if mealType is not None:
        query["mealType"] = mealType.value
    if isAvailable is not None:
        query["isAvailable"] = isAvailable

    db = get_database()
    total = await db.products.count_documents(query)
    cursor = db.products.find(query).sort("name", 1).skip((page - 1) * pageSize).limit(pageSize)
    documents = [document async for document in cursor]

    items = [ProductPublic.model_validate(d) for d in await _attach_category_names(documents)]
    return Page[ProductPublic](items=items, total=total, page=page, pageSize=pageSize)


@router.post("", response_model=ProductPublic, status_code=status.HTTP_201_CREATED)
async def create_product(payload: ProductCreate, admin: AdminUser) -> ProductPublic:
    category_oid = await _require_category(payload.categoryId)

    now = utcnow()
    document = payload.model_dump()
    document["name"] = document["name"].strip()
    document["categoryId"] = category_oid
    document.update({"createdAt": now, "updatedAt": now})

    result = await get_database().products.insert_one(document)
    document["_id"] = result.inserted_id
    return ProductPublic.model_validate((await _attach_category_names([document]))[0])


@router.get("/{product_id}", response_model=ProductPublic)
async def get_product(product_id: str, user: CurrentUser) -> ProductPublic:
    document = await get_database().products.find_one({"_id": to_object_id(product_id, NOT_FOUND)})
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return ProductPublic.model_validate((await _attach_category_names([document]))[0])


@router.patch("/{product_id}", response_model=ProductPublic)
async def update_product(
    product_id: str, payload: ProductUpdate, admin: AdminUser
) -> ProductPublic:
    oid = to_object_id(product_id, NOT_FOUND)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    existing = await get_database().products.find_one({"_id": oid})
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)

    if "categoryId" in updates and updates["categoryId"]:
        updates["categoryId"] = await _require_category(updates["categoryId"])
    if "name" in updates and updates["name"]:
        updates["name"] = updates["name"].strip()

    # Price and GST changes only affect future orders: order items snapshot both
    # at billing time, so historical bills never move.
    updates["updatedAt"] = utcnow()
    document = await get_database().products.find_one_and_update(
        {"_id": oid}, {"$set": updates}, return_document=True
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)

    # A price or GST change is the one product edit that affects money.
    price_changed = "price" in updates and updates["price"] != existing.get("price")
    gst_changed = "gstPercentage" in updates and updates["gstPercentage"] != existing.get(
        "gstPercentage"
    )
    if price_changed or gst_changed:
        await audit.record(
            AuditAction.PRODUCT_PRICE_CHANGED,
            "product",
            user=admin,
            entity_id=oid,
            entity_label=existing.get("name"),
            old_value={
                "price": existing.get("price"),
                "gstPercentage": existing.get("gstPercentage"),
            },
            new_value={
                "price": document.get("price"),
                "gstPercentage": document.get("gstPercentage"),
            },
            note="Existing orders keep their own snapshot",
        )

    return ProductPublic.model_validate((await _attach_category_names([document]))[0])


@router.delete("/{product_id}", response_model=MessageResponse)
async def delete_product(product_id: str, admin: AdminUser) -> MessageResponse:
    """Safe to hard-delete: order items keep their own name/price/GST snapshot."""
    result = await get_database().products.delete_one({"_id": to_object_id(product_id, NOT_FOUND)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return MessageResponse(message="Product deleted")
