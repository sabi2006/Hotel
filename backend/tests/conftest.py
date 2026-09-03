import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core import database  # noqa: E402
from tests.fake_mongo import FakeClient  # noqa: E402


@pytest.fixture()
def client():
    """App wired to an in-memory Mongo stand-in.

    Setting the module-level client short-circuits connect_to_mongo(), so the
    real production code paths run unmodified against the fake.
    """
    database._client = FakeClient()
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
    database._client = None


@pytest.fixture()
def fake_db(client):
    """Direct access to the in-memory collections.

    Lets a test set up state that a later phase would create - for example
    occupying a table before orders exist.
    """
    return database._client["ignored"]
