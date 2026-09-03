import logging
from contextlib import asynccontextmanager
from typing import Any
from bson import ObjectId

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from pathlib import Path
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import (
    close_mongo_connection,
    connect_to_mongo,
    ensure_indexes,
    get_database,
)
from app.core.security import hash_password
from app.models.enums import UserRole
from app.routers import (
    audit,
    auth,
    categories,
    kitchen,
    notifications,
    orders,
    payments,
    products,
    reports,
    settings as settings_router,
    tables,
    tips,
    uploads,
    users,
    ws,
)
from app.services.users import normalise_email, utcnow

SECURITY_HEADERS = {
    # The API serves JSON, never markup, so lock the browser down hard.
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Cache-Control": "no-store",
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("hotel")


def check_configuration() -> None:
    """Shout about settings that are fine locally and dangerous in production."""
    problems: list[str] = []

    if settings.JWT_SECRET == "change-me-in-production":
        problems.append("JWT_SECRET is still the default - anyone can forge a token")
    if settings.BOOTSTRAP_ADMIN_PASSWORD == "Admin@123":
        problems.append("BOOTSTRAP_ADMIN_PASSWORD is still the default")
    if settings.ALLOW_PUBLIC_STAFF_REGISTRATION:
        problems.append(
            "ALLOW_PUBLIC_STAFF_REGISTRATION is on - anyone can create a staff account"
        )
    if "*" in settings.CORS_ORIGINS:
        problems.append("CORS_ORIGINS allows every origin")

    for problem in problems:
        logger.warning("INSECURE CONFIG: %s", problem)
    if problems and not settings.DEBUG:
        logger.error(
            "Running with DEBUG=false and %d insecure setting(s). Fix these before "
            "taking real payments.",
            len(problems),
        )


async def bootstrap_admin() -> None:
    """Create the first admin so the system is usable on a fresh database."""
    db = get_database()
    if await db.users.count_documents({"role": UserRole.ADMIN.value}) > 0:
        return

    now = utcnow()
    await db.users.insert_one(
        {
            "name": settings.BOOTSTRAP_ADMIN_NAME,
            "email": normalise_email(settings.BOOTSTRAP_ADMIN_EMAIL),
            "phone": None,
            "passwordHash": hash_password(settings.BOOTSTRAP_ADMIN_PASSWORD),
            "role": UserRole.ADMIN.value,
            "isActive": True,
            "createdAt": now,
            "updatedAt": now,
        }
    )
    logger.warning(
        "Bootstrapped admin account %s - change this password immediately.",
        settings.BOOTSTRAP_ADMIN_EMAIL,
    )


import re

async def sanitize_product_images() -> None:
    """Normalize and clean existing product image paths in MongoDB."""
    db = get_database()
    cursor = db.products.find({"image": {"$exists": True, "$ne": None}})
    async for product in cursor:
        img = product.get("image")
        if not img or not isinstance(img, str):
            continue
        trimmed = img.strip()
        new_img = trimmed

        # Handle Windows paths or uploads/images
        if "\\" in trimmed or "uploads/images/" in trimmed or "uploads\\images\\" in trimmed:
            match = re.search(r"uploads[\\\/]images[\\\/]([a-zA-Z0-9_\-\.]+)", trimmed, re.I)
            if match:
                new_img = f"/uploads/images/{match.group(1)}"
        elif trimmed.startswith("http://localhost:8000/uploads/") or trimmed.startswith("http://localhost:8001/uploads/"):
            new_img = re.sub(r"^https?://(?:localhost|127\.0\.0\.1):\d+", "", trimmed)
        elif trimmed.startswith("uploads/"):
            new_img = f"/{trimmed}"
        elif trimmed.lower() in ("null", "undefined", "") or trimmed.startswith("blob:"):
            new_img = None

        if new_img != img:
            await db.products.update_one({"_id": product["_id"]}, {"$set": {"image": new_img}})
            logger.info("Sanitized product image for '%s': %s -> %s", product.get("name"), img, new_img)


async def sync_brand_settings() -> None:
    """Ensure brand settings in MongoDB default to SPICE GARDEN."""
    db = get_database()
    setting = await db.settings.find_one({"_id": "restaurant"})
    if setting and setting.get("restaurantName") in ("My Restaurant", "Restaurant POS", "Demo Restaurant", None):
        await db.settings.update_one(
            {"_id": "restaurant"},
            {"$set": {"restaurantName": "SPICE GARDEN", "invoiceFooterNote": "Thank you for visiting Spice Garden!"}},
        )
        logger.info("Updated restaurant setting brand name to SPICE GARDEN")


async def reconcile_table_statuses() -> None:
    """Synchronize table.status with actual live open orders in MongoDB."""
    try:
        db = get_database()
        open_statuses = ["DRAFT", "SENT_TO_KITCHEN", "PREPARING", "READY", "SERVED", "PAYMENT_PENDING"]
        cursor = db.orders.find({"orderStatus": {"$in": open_statuses}})
        
        open_table_ids: set[Any] = set()
        async for order in cursor:
            tid = order.get("tableId")
            if tid:
                open_table_ids.add(tid)
                try:
                    open_table_ids.add(ObjectId(str(tid)))
                except Exception:
                    pass

        # Any table NOT having an active open order should be marked FREE
        if open_table_ids:
            reconciled = await db.tables.update_many(
                {"_id": {"$nin": list(open_table_ids)}, "status": "OCCUPIED"},
                {"$set": {"status": "FREE", "activeOrderId": None, "updatedAt": utcnow()}},
            )
        else:
            reconciled = await db.tables.update_many(
                {"status": "OCCUPIED"},
                {"$set": {"status": "FREE", "activeOrderId": None, "updatedAt": utcnow()}},
            )

        if reconciled.modified_count > 0:
            logger.info("Reconciled %d orphaned occupied tables back to FREE", reconciled.modified_count)
    except Exception as exc:
        logger.warning("Table status reconciliation notice: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    check_configuration()
    try:
        await connect_to_mongo()
        await ensure_indexes()
        await bootstrap_admin()
        await sanitize_product_images()
        await sync_brand_settings()
        await reconcile_table_statuses()
        logger.info("Connected to MongoDB database '%s'", settings.MONGODB_DB)
    except Exception as exc:
        logger.error("MongoDB initialization deferred: %s", exc)
    yield
    await close_mongo_connection()


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    docs_url="/docs",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _serialisable_errors(errors: list[dict]) -> list[dict]:
    """Strip values json cannot encode.

    A custom Pydantic validator puts the raised exception itself into ctx, which
    would blow up the response encoder.
    """
    cleaned: list[dict] = []
    for error in errors:
        item = {key: value for key, value in error.items() if key != "ctx"}
        item["loc"] = [str(part) for part in error.get("loc", ())]
        if "ctx" in error:
            item["ctx"] = {key: str(value) for key, value in error["ctx"].items()}
        if "input" in item and not isinstance(item["input"], (str, int, float, bool, type(None))):
            item["input"] = str(item["input"])
        cleaned.append(item)
    return cleaned


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    for header, value in SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Never leak a stack trace to a client.

    The detail goes to the server log, where it belongs; the caller gets a
    generic message so an error cannot become a source of intelligence about
    the internals.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong. The error has been logged."},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return a single readable message the frontend can show in a toast."""
    errors = exc.errors()
    first = errors[0] if errors else None

    if first is None:
        message = "Invalid request"
    else:
        field = ".".join(str(part) for part in first["loc"][1:])
        # A model-level validator has no field to name; its message stands alone.
        message = f"{field}: {first['msg']}" if field else first["msg"]

    return JSONResponse(
        status_code=422,
        content={"detail": message, "errors": _serialisable_errors(errors)},
    )


@app.get("/", tags=["health"])
@app.get("/api/health", tags=["health"])
async def health() -> dict:
    return {"status": "ok", "app": settings.APP_NAME}


# Ensure static upload directory exists and is mounted
BACKEND_ROOT = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BACKEND_ROOT / "uploads"
(UPLOAD_DIR / "images").mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Copy brand logo between frontend and backend static assets if available
try:
    import shutil
    frontend_public = BACKEND_ROOT.parent / "frontend" / "public"
    frontend_logo = frontend_public / "spice-garden-logo.png"
    backend_logo = UPLOAD_DIR / "images" / "spice-garden-logo.png"
    if frontend_logo.exists() and not backend_logo.exists():
        shutil.copyfile(frontend_logo, backend_logo)
        logger.info("Brand logo initialized from frontend public assets to %s", backend_logo)
except Exception as logo_err:
    logger.debug("Logo sync check: %s", logo_err)

app.include_router(auth.router, prefix=settings.API_PREFIX)
app.include_router(users.router, prefix=settings.API_PREFIX)
app.include_router(categories.router, prefix=settings.API_PREFIX)
app.include_router(products.router, prefix=settings.API_PREFIX)
app.include_router(tables.router, prefix=settings.API_PREFIX)
app.include_router(orders.router, prefix=settings.API_PREFIX)
app.include_router(kitchen.router, prefix=settings.API_PREFIX)
app.include_router(notifications.router, prefix=settings.API_PREFIX)
app.include_router(payments.router, prefix=settings.API_PREFIX)
app.include_router(tips.router, prefix=settings.API_PREFIX)
app.include_router(reports.router, prefix=settings.API_PREFIX)
app.include_router(audit.router, prefix=settings.API_PREFIX)
app.include_router(settings_router.router, prefix=settings.API_PREFIX)
app.include_router(uploads.router, prefix=settings.API_PREFIX)
app.include_router(ws.router)
