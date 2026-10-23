"""Helpers shared by the API integration tests (see conftest.py)."""

import uuid


def signup_user(client, password="test-password-123"):
    """Register a fresh user; returns (user_id, auth_headers)."""
    email = f"user-{uuid.uuid4().hex[:12]}@example.com"
    response = client.post("/signup", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    body = response.json()
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    return body["id"], headers


def unique_name(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:8]}"
