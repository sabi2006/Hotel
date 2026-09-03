from pydantic import BaseModel, EmailStr

from app.schemas.user import UserPublic


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    expiresInMinutes: int
    user: UserPublic
