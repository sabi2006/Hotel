"""A tiny in-memory stand-in for the small slice of Mongo this app uses.

Lets the auth/user endpoints be tested without a running MongoDB server.
"""

import re
from copy import deepcopy

from bson import ObjectId


def _matches(document: dict, query: dict) -> bool:
    for key, condition in query.items():
        if key == "$or":
            if not any(_matches(document, sub) for sub in condition):
                return False
            continue
        value = document.get(key)
        if isinstance(condition, dict):
            if "$ne" in condition and value == condition["$ne"]:
                return False
            if "$in" in condition and value not in condition["$in"]:
                return False
            if "$gte" in condition and (value is None or value < condition["$gte"]):
                return False
            if "$lte" in condition and (value is None or value > condition["$lte"]):
                return False
            if "$gt" in condition and (value is None or value <= condition["$gt"]):
                return False
            if "$lt" in condition and (value is None or value >= condition["$lt"]):
                return False
            if "$regex" in condition:
                flags = re.I if "i" in condition.get("$options", "") else 0
                if value is None or not re.search(condition["$regex"], str(value), flags):
                    return False
        elif value != condition:
            return False
    return True


class FakeCursor:
    def __init__(self, documents: list[dict]):
        self._documents = documents

    def sort(self, key, direction=1):
        self._documents.sort(key=lambda d: d.get(key), reverse=direction < 0)
        return self

    def skip(self, count: int):
        self._documents = self._documents[count:]
        return self

    def limit(self, count: int):
        self._documents = self._documents[:count]
        return self

    def __aiter__(self):
        async def generator():
            for document in self._documents:
                yield deepcopy(document)

        return generator()


class _Result:
    def __init__(self, inserted_id=None, matched_count=0, modified_count=0, deleted_count=0):
        self.inserted_id = inserted_id
        self.matched_count = matched_count
        self.modified_count = modified_count
        self.deleted_count = deleted_count


class FakeCollection:
    def __init__(self):
        self.documents: list[dict] = []
        self.unique_keys: set[str] = set()
        # Sparse indexes ignore documents that omit the field entirely.
        self.sparse_keys: set[str] = set()

    async def create_index(self, keys, unique: bool = False, sparse: bool = False, **kwargs):
        if unique and isinstance(keys, str):
            self.unique_keys.add(keys)
            if sparse:
                self.sparse_keys.add(keys)
        return "index"

    async def insert_one(self, document: dict):
        from pymongo.errors import DuplicateKeyError

        for key in self.unique_keys:
            if key in self.sparse_keys and key not in document:
                continue
            if any(
                key in existing and existing.get(key) == document.get(key)
                for existing in self.documents
            ):
                raise DuplicateKeyError(f"duplicate {key}")
        stored = deepcopy(document)
        stored.setdefault("_id", ObjectId())
        self.documents.append(stored)
        return _Result(inserted_id=stored["_id"])

    async def find_one(self, query: dict):
        for document in self.documents:
            if _matches(document, query):
                return deepcopy(document)
        return None

    def find(self, query: dict):
        return FakeCursor([d for d in self.documents if _matches(d, query)])

    async def count_documents(self, query: dict) -> int:
        return sum(1 for d in self.documents if _matches(d, query))

    async def update_one(self, query: dict, update: dict):
        for document in self.documents:
            if _matches(document, query):
                document.update(update.get("$set", {}))
                return _Result(matched_count=1, modified_count=1)
        return _Result()

    async def delete_one(self, query: dict):
        for index, document in enumerate(self.documents):
            if _matches(document, query):
                del self.documents[index]
                return _Result(deleted_count=1)
        return _Result()

    async def replace_one(self, query: dict, replacement: dict):
        for index, document in enumerate(self.documents):
            if _matches(document, query):
                self.documents[index] = deepcopy(replacement)
                return _Result(matched_count=1, modified_count=1)
        return _Result()

    def _apply(self, document: dict, update: dict) -> None:
        document.update(update.get("$set", {}))
        for field, amount in update.get("$inc", {}).items():
            document[field] = document.get(field, 0) + amount

    async def find_one_and_update(
        self, query: dict, update: dict, return_document=True, upsert=False
    ):
        for document in self.documents:
            if _matches(document, query):
                self._apply(document, update)
                return deepcopy(document)

        if not upsert:
            return None

        # Seed the new document from the equality parts of the query.
        created = {key: value for key, value in query.items() if not isinstance(value, dict)}
        created.setdefault("_id", ObjectId())
        self._apply(created, update)
        self.documents.append(created)
        return deepcopy(created)


class FakeDatabase:
    def __init__(self):
        self._collections: dict[str, FakeCollection] = {}

    def __getattr__(self, name: str) -> FakeCollection:
        return self._collections.setdefault(name, FakeCollection())

    def __getitem__(self, name: str) -> FakeCollection:
        return self._collections.setdefault(name, FakeCollection())


class FakeClient:
    def __init__(self):
        self._database = FakeDatabase()

    def __getitem__(self, name: str) -> FakeDatabase:
        return self._database

    async def close(self):
        return None
