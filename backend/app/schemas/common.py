"""Shared schema helpers."""

from typing import Annotated, Any, Generic, TypeVar

from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, ConfigDict

T = TypeVar("T")


def _stringify_object_id(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    return value


# Mongo `_id` values arrive as ObjectId; expose them to the API as plain strings.
PyObjectId = Annotated[str, BeforeValidator(_stringify_object_id)]


class MongoModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    pageSize: int

    @property
    def pages(self) -> int:
        return max(1, -(-self.total // self.pageSize))


class MessageResponse(BaseModel):
    message: str
