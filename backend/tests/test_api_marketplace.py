"""Integration tests for marketplace listings: create and delete."""

import base64

# 1x1 transparent PNG.
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def _create_listing(client, headers, title="Used winch"):
    return client.post(
        "/marketplace",
        files={"photo": ("winch.png", PNG_BYTES, "image/png")},
        data={
            "title": title,
            "description": "Works fine, upgraded to a bigger one.",
            "contact_info": "seller@example.com",
            "price": "150",
        },
        headers=headers,
    )


def test_create_listing_success(client, user_a):
    a_id, a_headers = user_a
    response = _create_listing(client, a_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["title"] == "Used winch"
    assert body["user_id"] == a_id


def test_create_listing_missing_title_400(client, user_a):
    _a_id, a_headers = user_a
    # Whitespace-only: reaches the handler, which strips it and rejects
    # the listing as missing its title (an empty field never gets there).
    response = _create_listing(client, a_headers, title="   ")
    assert response.status_code == 400


def test_create_listing_without_photo_rejected(client, user_a):
    _a_id, a_headers = user_a
    response = client.post(
        "/marketplace",
        data={"title": "No photo", "description": "d", "contact_info": "c"},
        headers=a_headers,
    )
    assert response.status_code in (400, 422)


def test_create_listing_unauthenticated_401(client):
    response = client.post(
        "/marketplace",
        files={"photo": ("winch.png", PNG_BYTES, "image/png")},
        data={"title": "T", "description": "d", "contact_info": "c"},
    )
    assert response.status_code == 401


def test_delete_own_listing(client, user_a):
    _a_id, a_headers = user_a
    created = _create_listing(client, a_headers, title="Delete me")
    assert created.status_code == 200, created.text
    listing_id = created.json()["id"]
    response = client.delete(f"/marketplace/{listing_id}", headers=a_headers)
    assert response.status_code == 200, response.text
    assert response.json()["deleted"] is True


def test_delete_other_users_listing_403(client, user_a, user_b):
    _a_id, a_headers = user_a
    _b_id, b_headers = user_b
    created = _create_listing(client, a_headers, title="Not yours")
    assert created.status_code == 200, created.text
    listing_id = created.json()["id"]
    response = client.delete(f"/marketplace/{listing_id}", headers=b_headers)
    assert response.status_code == 403
