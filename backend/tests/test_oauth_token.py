"""Tests for Facebook/X sign-in token creation (backend/main.py: /auth/facebook, /auth/x).

Regression test: both endpoints used to call
``create_access_token(data={"sub": str(user.id)})``, but the function is
defined as ``create_access_token(user_id: int)`` — so both raised TypeError
at runtime and Facebook/X sign-in could never succeed. The fix passes the
user id positionally, like /signup, /login and /auth/google do.

The OAuth verification step is mocked (no network): the Graph / X API
responses are faked, and the endpoint functions are called directly with a
scratch SQLite session. Each test asserts the returned access token is a
real JWT whose ``sub`` is the signed-in user's id — that can only hold if
create_access_token was called correctly.
"""

import os
import sys
from pathlib import Path

import jwt
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture(scope="module")
def app(tmp_path_factory):
    """Import backend.main against a scratch DATA_DIR; return the module."""
    data_dir = tmp_path_factory.mktemp("jtap-data")
    os.environ["DATA_DIR"] = str(data_dir)
    import main

    return main


@pytest.fixture()
def db(app):
    """A fresh session on the scratch DB; wiped after each test."""
    session = app.SessionLocal()
    try:
        yield session
    finally:
        session.query(app.VerificationPin).delete()
        session.query(app.User).delete()
        session.commit()
        session.close()


class _FakeResponse:
    def __init__(self, payload):
        self.status_code = 200
        self.text = ""
        self._payload = payload

    def json(self):
        return self._payload


def _assert_valid_token(app, result):
    """The access token must decode to the signed-in user's id."""
    payload = jwt.decode(
        result.access_token, app.SECRET_KEY, algorithms=[app.ALGORITHM]
    )
    assert payload["sub"] == str(result.id)


def test_facebook_sign_in_returns_valid_token(app, db, monkeypatch):
    # Arrange: Graph API verifies the token and reports id + email.
    monkeypatch.setattr(
        app.requests,
        "get",
        lambda *a, **k: _FakeResponse(
            {
                "id": "fb123",
                "email": "fbuser@example.com",
                "picture": {"data": {"url": "https://example.com/pic.jpg"}},
            }
        ),
    )
    # Act
    result = app.auth_facebook(
        body=app.FacebookAuthRequest(access_token="fake-fb-token"), db=db
    )
    # Assert
    assert result.email == "fbuser@example.com"
    _assert_valid_token(app, result)


def test_x_sign_in_returns_valid_token(app, db, monkeypatch):
    # Arrange: X API v2 verifies the token and reports the user id.
    monkeypatch.setattr(
        app.requests,
        "get",
        lambda *a, **k: _FakeResponse(
            {"data": {"id": "x456", "profile_image_url": "https://example.com/x.jpg"}}
        ),
    )
    # Act
    result = app.auth_x(body=app.XAuthRequest(access_token="fake-x-token"), db=db)
    # Assert
    assert result.email == "x_x456@x.jtap"
    _assert_valid_token(app, result)
