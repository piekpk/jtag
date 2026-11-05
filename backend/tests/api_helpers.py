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


# Consonants only, and no "x": every word on the profanity filter's list
# contains a vowel, so a suffix built from these letters can never form a
# listed word after the filter's leet normalization (0->o, 5->s, ...) --
# a hex suffix could ("b00b..." -> "boob"), which made squad/marketplace
# creation fail the profanity check at random (~1 run in 50). "x" is
# excluded because the filter also treats it as a masking character.
_SUFFIX_ALPHABET = "bcdfghjklmnpqrstvwz"


def unique_name(prefix):
    n = uuid.uuid4().int
    suffix = ""
    for _ in range(10):
        n, r = divmod(n, len(_SUFFIX_ALPHABET))
        suffix += _SUFFIX_ALPHABET[r]
    return f"{prefix}-{suffix}"
