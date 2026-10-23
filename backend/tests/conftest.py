"""Shared fixtures for the API integration tests.

The app is started once per test session against a fresh, throwaway
SQLite database (DATA_DIR points at a temp dir), so the suite never
touches a real database and needs no network, no LLM, and no external
services. Emails and squad names are made unique per call so tests can
run in any order against the shared session database.
"""

import os
import tempfile
import uuid

# Must be set before the app module is imported: main.py builds its
# database engine from DATA_DIR at import time.
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="jtap-test-data-")

import pytest
from fastapi.testclient import TestClient

from tests.api_helpers import signup_user


@pytest.fixture(scope="session")
def client():
    import main

    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture()
def user_a(client):
    return signup_user(client)


@pytest.fixture()
def user_b(client):
    return signup_user(client)
