from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TableStatus
from app.schemas.common import MongoModel, PyObjectId


class TableBase(BaseModel):
    tableNumber: str = Field(min_length=1, max_length=20)
    capacity: int = Field(default=4, ge=1, le=50)
    isActive: bool = True


class TableCreate(TableBase):
    pass


class TableUpdate(BaseModel):
    tableNumber: str | None = Field(default=None, min_length=1, max_length=20)
    capacity: int | None = Field(default=None, ge=1, le=50)
    isActive: bool | None = None


class TablePublic(MongoModel):
    model_config = ConfigDict(populate_by_name=True)

    id: PyObjectId = Field(alias="_id")
    tableNumber: str
    capacity: int
    status: TableStatus = TableStatus.FREE
    activeOrderId: PyObjectId | None = None
    isActive: bool = True
    createdAt: datetime
    updatedAt: datetime
