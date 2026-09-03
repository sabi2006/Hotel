from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import FoodType, MealType
from app.schemas.common import MongoModel, PyObjectId


class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    image: str | None = Field(default=None, max_length=500, description="Image URL")
    price: float = Field(ge=0, le=1_000_000)
    gstPercentage: float = Field(default=5, ge=0, le=100)
    quantityAvailable: int = Field(default=0, ge=0)
    categoryId: str
    foodType: FoodType = FoodType.VEG
    mealType: MealType = MealType.ALL_DAY
    isAvailable: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    image: str | None = Field(default=None, max_length=500)
    price: float | None = Field(default=None, ge=0, le=1_000_000)
    gstPercentage: float | None = Field(default=None, ge=0, le=100)
    quantityAvailable: int | None = Field(default=None, ge=0)
    categoryId: str | None = None
    foodType: FoodType | None = None
    mealType: MealType | None = None
    isAvailable: bool | None = None


class ProductPublic(MongoModel):
    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId = Field(alias="_id")
    name: str
    description: str | None = None
    image: str | None = None
    price: float
    gstPercentage: float
    quantityAvailable: int
    categoryId: PyObjectId
    categoryName: str | None = None
    foodType: FoodType
    mealType: MealType
    isAvailable: bool
    createdAt: datetime
    updatedAt: datetime
