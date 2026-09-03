from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import MongoModel


class RestaurantSettingsBase(BaseModel):
    restaurantName: str = Field(default="SPICE GARDEN", min_length=1, max_length=120)
    addressLine1: str | None = Field(default=None, max_length=200)
    addressLine2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=120)

    # Printed on the invoice when present.
    gstNumber: str | None = Field(default=None, max_length=30)
    fssaiNumber: str | None = Field(default=None, max_length=30)

    # Shown to the customer when they choose to pay by UPI.
    upiId: str | None = Field(default=None, max_length=120)
    upiQrImage: str | None = Field(default=None, max_length=500, description="Image URL")

    invoiceFooterNote: str = Field(default="Thank you for visiting Spice Garden!", max_length=200)
    currencySymbol: str = Field(default="INR", max_length=8)

    # Prefixed to a local number when building a WhatsApp click-to-chat link.
    whatsappCountryCode: str = Field(default="91", max_length=4)


class RestaurantSettingsUpdate(BaseModel):
    restaurantName: str | None = Field(default=None, min_length=1, max_length=120)
    addressLine1: str | None = Field(default=None, max_length=200)
    addressLine2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=120)
    gstNumber: str | None = Field(default=None, max_length=30)
    fssaiNumber: str | None = Field(default=None, max_length=30)
    upiId: str | None = Field(default=None, max_length=120)
    upiQrImage: str | None = Field(default=None, max_length=500)
    invoiceFooterNote: str | None = Field(default=None, max_length=200)
    currencySymbol: str | None = Field(default=None, max_length=8)
    whatsappCountryCode: str | None = Field(default=None, max_length=4)


class RestaurantSettingsPublic(MongoModel, RestaurantSettingsBase):
    model_config = ConfigDict(populate_by_name=True)

    updatedAt: datetime | None = None
