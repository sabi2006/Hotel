from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import MongoModel, PyObjectId


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=300)
    displayOrder: int = Field(default=0, ge=0, le=999)
    isActive: bool = True


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=300)
    displayOrder: int | None = Field(default=None, ge=0, le=999)
    isActive: bool | None = None


class CategoryPublic(MongoModel):
    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId = Field(alias="_id")
    name: str
    description: str | None = None
    displayOrder: int = 0
    isActive: bool = True
    productCount: int = 0
    createdAt: datetime
    updatedAt: datetime
