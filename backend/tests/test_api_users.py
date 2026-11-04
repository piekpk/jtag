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


# Story 1.4: structured per-item mods by category.


def _patch_mods(client, user_id, headers, mods):
    return client.patch(
        f"/users/{user_id}/profile",
        json={"settings": {"mods": mods}},
        headers=headers,
    )


def test_add_structured_mod_ok(client, user_a):
    a_id, a_headers = user_a
    response = _patch_mods(client, a_id, a_headers, [
        {"id": "m1", "category": "Suspension", "name": "2-inch lift kit"},
    ])
    assert response.status_code == 200, response.text
    assert response.json()["settings"]["mods"] == [
        {"id": "m1", "category": "Suspension", "name": "2-inch lift kit"},
    ]


def test_mod_missing_id_assigned(client, user_a):
    a_id, a_headers = user_a
    response = _patch_mods(client, a_id, a_headers, [
        {"category": "Armor", "name": "Steel bumper"},
    ])
    assert response.status_code == 200, response.text
    assert response.json()["settings"]["mods"][0]["id"]


def test_mod_name_over_100_rejected(client, user_a):
    a_id, a_headers = user_a
    response = _patch_mods(client, a_id, a_headers, [
        {"id": "m1", "category": "Suspension", "name": "x" * 101},
    ])
    assert response.status_code == 400


def test_mod_unknown_category_rejected(client, user_a):
    a_id, a_headers = user_a
    response = _patch_mods(client, a_id, a_headers, [
        {"id": "m1", "category": "Warp Drive", "name": "Flux capacitor"},
    ])
    assert response.status_code == 400


def test_mod_string_rejected(client, user_a):
    a_id, a_headers = user_a
    response = _patch_mods(client, a_id, a_headers, "Lift kit")
    assert response.status_code == 400


def test_mod_peer_patch_403(client, user_a, user_b):
    a_id, _a_headers = user_a
    b_id, b_headers = user_b
    response = _patch_mods(client, a_id, b_headers, [
        {"id": "m1", "category": "Suspension", "name": "2-inch lift kit"},
    ])
    assert response.status_code == 403
