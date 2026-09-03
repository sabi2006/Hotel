"""Image and file upload endpoints for dishes, QR codes, and restaurant assets."""

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.deps import CurrentUser

router = APIRouter(prefix="/uploads", tags=["uploads"])

# Absolute path based on backend repository root
BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BACKEND_ROOT / "uploads" / "images"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 Megabytes
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}


class UploadResponse(BaseModel):
    url: str
    filename: str


@router.post("/image", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_image(
    user: CurrentUser,
    file: UploadFile = File(...),
) -> UploadResponse:
    """Upload a dish or asset image, validating type and file size.
    
    Generates a secure UUID filename to prevent path traversal and collisions.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided in upload",
        )

    # Check content type
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload a JPG, PNG, or WEBP image",
        )

    # Check extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        if content_type == "image/png":
            ext = ".png"
        elif content_type == "image/webp":
            ext = ".webp"
        else:
            ext = ".jpg"

    # Read and check size
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image size must be less than 5MB",
        )

    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot upload an empty image file",
        )

    # Generate safe unique filename
    safe_filename = f"{uuid4().hex}{ext}"
    target_path = UPLOAD_DIR / safe_filename

    with open(target_path, "wb") as f:
        f.write(contents)

    # Standard browser-accessible relative path
    image_url = f"/uploads/images/{safe_filename}"
    return UploadResponse(url=image_url, filename=safe_filename)
