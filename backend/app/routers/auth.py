from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request, status

from app.core.config import settings
from app.core.deps import CurrentUser
from app.core.ratelimit import address_limiter, login_limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.core.database import get_database
from app.models.enums import UserRole
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.common import MessageResponse
from app.schemas.user import PasswordChange, TipQrUpdate, UserPublic, UserRegister
from app.services.users import create_user, get_user_by_email, utcnow

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(user_document: dict) -> TokenResponse:
    user = UserPublic.model_validate(user_document)
    token = create_access_token(subject=str(user_document["_id"]), role=user.role.value)
    return TokenResponse(
        accessToken=token,
        expiresInMinutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user=user,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister) -> TokenResponse:
    """Self-service registration for waiter/kitchen staff.

    Admin accounts are never created this way - the first admin is bootstrapped
    at startup, and further admins are created from the admin panel.
    """
    if payload.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts cannot be self-registered",
        )
    if not settings.ALLOW_PUBLIC_STAFF_REGISTRATION:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is disabled. Ask an administrator to create your account.",
        )

    document = await create_user(payload)
    return _token_response(document)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request) -> TokenResponse:
    # Two tiers: a tight budget per account, and a much looser one per address.
    # Restaurant staff all share one address, so the address tier only exists to
    # stop a script working through many accounts at once.
    email_key = f"email:{payload.email.strip().lower()}"
    address_key = f"ip:{request.client.host if request.client else 'unknown'}"

    for limiter, key in ((login_limiter, email_key), (address_limiter, address_key)):
        wait = limiter.retry_after(key)
        if wait:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed sign-in attempts. Try again in {wait // 60 + 1} minute(s).",
                headers={"Retry-After": str(wait)},
            )

    document = await get_user_by_email(payload.email)
    # Same error for unknown email and wrong password - do not leak which it was.
    if document is None or not verify_password(payload.password, document.get("passwordHash", "")):
        login_limiter.record_failure(email_key)
        address_limiter.record_failure(address_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not document.get("isActive", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been disabled. Contact an administrator.",
        )

    # A correct password clears the counter, so an honest typo costs nothing.
    login_limiter.reset(email_key)
    address_limiter.reset(address_key)
    return _token_response(document)


@router.get("/me", response_model=UserPublic)
async def read_me(user: CurrentUser) -> UserPublic:
    return user


@router.post("/change-password", response_model=MessageResponse)
async def change_password(payload: PasswordChange, user: CurrentUser) -> MessageResponse:
    db = get_database()
    document = await db.users.find_one({"_id": ObjectId(user.id)})
    if document is None or not verify_password(payload.currentPassword, document["passwordHash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    await db.users.update_one(
        {"_id": document["_id"]},
        {"$set": {"passwordHash": hash_password(payload.newPassword), "updatedAt": utcnow()}},
    )
    return MessageResponse(message="Password updated successfully")


@router.patch("/me/tip-qr", response_model=UserPublic)
async def update_my_tip_qr(payload: TipQrUpdate, user: CurrentUser) -> UserPublic:
    """A waiter keeps their own tip QR up to date without needing an admin."""
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    updates = {
        key: (value.strip() if isinstance(value, str) and value.strip() else None)
        for key, value in updates.items()
    }
    updates["updatedAt"] = utcnow()

    document = await get_database().users.find_one_and_update(
        {"_id": ObjectId(user.id)}, {"$set": updates}, return_document=True
    )
    return UserPublic.model_validate(document)


@router.post("/logout", response_model=MessageResponse)
async def logout(user: CurrentUser) -> MessageResponse:
    """JWTs are stateless; the client discards the token. Kept for API symmetry."""
    return MessageResponse(message="Logged out")
