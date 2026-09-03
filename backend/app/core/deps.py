"""Authentication / authorisation dependencies."""

from typing import Annotated, Iterable

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.database import get_database
from app.core.security import decode_access_token
from app.models.enums import UserRole
from app.schemas.user import UserPublic

bearer_scheme = HTTPBearer(auto_error=False)

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> UserPublic:
    if credentials is None or not credentials.credentials:
        raise CREDENTIALS_ERROR

    payload = decode_access_token(credentials.credentials)
    if payload is None or not payload.get("sub"):
        raise CREDENTIALS_ERROR

    try:
        user_id = ObjectId(payload["sub"])
    except (InvalidId, TypeError):
        raise CREDENTIALS_ERROR

    document = await get_database().users.find_one({"_id": user_id})
    if document is None:
        raise CREDENTIALS_ERROR
    if not document.get("isActive", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    return UserPublic.model_validate(document)


CurrentUser = Annotated[UserPublic, Depends(get_current_user)]


class RequireRoles:
    """Dependency factory enforcing role-based access on the backend.

    Frontend route guards are convenience only; this is the real boundary.
    """

    def __init__(self, *roles: UserRole) -> None:
        self.roles: set[UserRole] = set(roles)

    def __call__(self, user: CurrentUser) -> UserPublic:
        if user.role not in self.roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"RequireRoles({sorted(self.roles)})"


def require_roles(roles: Iterable[UserRole]) -> RequireRoles:
    return RequireRoles(*roles)


AdminUser = Annotated[UserPublic, Depends(RequireRoles(UserRole.ADMIN))]
WaiterUser = Annotated[UserPublic, Depends(RequireRoles(UserRole.WAITER, UserRole.ADMIN))]
KitchenUser = Annotated[UserPublic, Depends(RequireRoles(UserRole.KITCHEN, UserRole.ADMIN))]
