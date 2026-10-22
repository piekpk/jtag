"""Integration tests for the auth endpoints and the auth guard itself."""

import uuid

from tests.api_helpers import signup_user

PASSWORD = "test-password-123"


def _email():
    return f"user-{uuid.uuid4().hex[:12]}@example.com"


def test_signup_returns_token_and_user(client):
    email = _email()
    response = client.post("/signup", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == email
    assert isinstance(body["id"], int)
    assert body["access_token"]


def test_signup_duplicate_email_rejected(client):
    email = _email()
    first = client.post("/signup", json={"email": email, "password": PASSWORD})
    assert first.status_code == 200, first.text
    second = client.post("/signup", json={"email": email, "password": PASSWORD})
    assert second.status_code == 400


def test_login_success(client):
    email = _email()
    client.post("/signup", json={"email": email, "password": PASSWORD})
    response = client.post("/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    assert response.json()["access_token"]


def test_login_wrong_password_401(client):
    email = _email()
    client.post("/signup", json={"email": email, "password": PASSWORD})
    response = client.post("/login", json={"email": email, "password": "wrong-password"})
    assert response.status_code == 401


def test_protected_route_without_token_401(client):
    user_id, _headers = signup_user(client)
    response = client.get(f"/users/{user_id}/profile")
    assert response.status_code == 401


def test_protected_route_with_garbage_token_401(client):
    user_id, _headers = signup_user(client)
    response = client.get(
        f"/users/{user_id}/profile",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert response.status_code == 401
