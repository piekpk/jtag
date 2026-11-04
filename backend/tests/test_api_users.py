"""Integration tests for user profiles: viewing, editing, permissions."""


def test_get_other_profile_ok(client, user_a, user_b):
    _a_id, a_headers = user_a
    b_id, _b_headers = user_b
    response = client.get(f"/users/{b_id}/profile", headers=a_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == b_id
    assert "settings" in body


def test_get_missing_user_404(client, user_a):
    _a_id, a_headers = user_a
    response = client.get("/users/999999/profile", headers=a_headers)
    assert response.status_code == 404


def test_patch_own_profile_saves_settings(client, user_a):
    a_id, a_headers = user_a
    response = client.patch(
        f"/users/{a_id}/profile",
        json={"settings": {"vehicleTitle": "Trail Tester"}},
        headers=a_headers,
    )
    assert response.status_code == 200, response.text
    check = client.get(f"/users/{a_id}/profile", headers=a_headers)
    assert check.json()["settings"]["vehicleTitle"] == "Trail Tester"


def test_patch_other_profile_403(client, user_a, user_b):
    _a_id, a_headers = user_a
    b_id, _b_headers = user_b
    response = client.patch(
        f"/users/{b_id}/profile",
        json={"settings": {"vehicleTitle": "Not Mine"}},
        headers=a_headers,
    )
    assert response.status_code == 403


def test_patch_profane_vehicle_title_400(client, user_a):
    a_id, a_headers = user_a
    response = client.patch(
        f"/users/{a_id}/profile",
        json={"settings": {"vehicleTitle": "shit wagon"}},
        headers=a_headers,
    )
    assert response.status_code == 400


def test_patch_oversized_owner_name_400(client, user_a):
    a_id, a_headers = user_a
    response = client.patch(
        f"/users/{a_id}/profile",
        json={"settings": {"ownerName": "x" * 31}},
        headers=a_headers,
    )
    assert response.status_code == 400


# Story 1.8: privacy toggle — a private profile is locked to peers.


def _set_private(client, user_id, headers, value):
    response = client.patch(
        f"/users/{user_id}/profile",
        json={"settings": {"vehicleTitle": "2021 Wrangler", "mods": "Lift kit", "private": value}},
        headers=headers,
    )
    assert response.status_code == 200, response.text


def test_private_profile_locked_to_peers(client, user_a, user_b):
    a_id, a_headers = user_a
    b_id, b_headers = user_b
    _set_private(client, a_id, a_headers, True)
    response = client.get(f"/users/{a_id}/profile", headers=b_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "This rig profile is private"
    # No modification data may leak in the locked response.
    assert "Lift kit" not in response.text


def test_private_profile_visible_to_owner(client, user_a):
    a_id, a_headers = user_a
    _set_private(client, a_id, a_headers, True)
    response = client.get(f"/users/{a_id}/profile", headers=a_headers)
    assert response.status_code == 200, response.text
    assert response.json()["settings"].get("private") is True
    assert response.json()["settings"]["mods"] == "Lift kit"


def test_public_profile_visible_to_peers(client, user_a, user_b):
    a_id, a_headers = user_a
    b_id, b_headers = user_b
    _set_private(client, a_id, a_headers, False)
    response = client.get(f"/users/{a_id}/profile", headers=b_headers)
    assert response.status_code == 200, response.text
    assert response.json()["settings"]["mods"] == "Lift kit"
