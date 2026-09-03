from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole
from app.schemas.common import MongoModel, PyObjectId


class UserBase(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=20)


class UserCreate(UserBase):
    password: str = Field(min_length=6, max_length=72)
    role: UserRole


class UserRegister(UserCreate):
    """Self-service registration. Admin sign-up is blocked in the router."""


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=20)
    role: UserRole | None = None
    isActive: bool | None = None
    # A waiter-specific QR, so a tip goes straight to that waiter.
    tipUpiId: str | None = Field(default=None, max_length=120)
    tipQrImage: str | None = Field(default=None, max_length=500)


class TipQrUpdate(BaseModel):
    """What a waiter may change about their own tip details."""

    tipUpiId: str | None = Field(default=None, max_length=120)
    tipQrImage: str | None = Field(default=None, max_length=500)


class PasswordChange(BaseModel):
    currentPassword: str
    newPassword: str = Field(min_length=6, max_length=72)


class PasswordReset(BaseModel):
    """Admin-driven reset; no current password required."""

    newPassword: str = Field(min_length=6, max_length=72)


class WaiterTipQr(MongoModel):
    """Only what is needed to show a tip QR at the table.

    Readable by any signed-in user - a waiter settling a colleague table needs
    it - but it exposes nothing else about the account.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId = Field(alias="_id")
    name: str
    tipUpiId: str | None = None
    tipQrImage: str | None = None


class UserPublic(MongoModel):
    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId = Field(alias="_id")
    name: str
    email: EmailStr
    phone: str | None = None
    role: UserRole
    isActive: bool = True
    tipUpiId: str | None = None
    tipQrImage: str | None = None
    createdAt: datetime
    updatedAt: datetime
