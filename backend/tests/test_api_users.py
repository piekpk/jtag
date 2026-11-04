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


# Story 1.3: delete vehicle profile (rig data only, account survives).


def _setup_rig(client, user_id, headers):
    response = client.patch(
        f"/users/{user_id}/profile",
        json={"settings": {
            "ownerName": "Trail Tester",
            "vehicleTitle": "2021 Wrangler",
            "specs": {"engine": "2.0L"},
            "mods": "Lift kit",
            "photos": ["photo1.jpg", "", "", ""],
            "coverPhoto": "cover.jpg",
        }},
        headers=headers,
    )
    assert response.status_code == 200, response.text


def test_delete_own_rig_clears_vehicle_only(client, user_a):
    a_id, a_headers = user_a
    _setup_rig(client, a_id, a_headers)
    response = client.delete(f"/users/{a_id}/rig", headers=a_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    for key in ("vehicleTitle", "specs", "mods", "photos", "coverPhoto"):
        assert key not in body["settings"]
    assert body["profile_picture_url"] is None
    # The account itself survives with its identity intact.
    check = client.get(f"/users/{a_id}/profile", headers=a_headers)
    assert check.status_code == 200
    assert check.json()["settings"].get("ownerName") == "Trail Tester"
    assert check.json()["email"]


def test_delete_rig_drops_photo_reactions(client, user_a, user_b):
    a_id, a_headers = user_a
    b_id, b_headers = user_b
    _setup_rig(client, a_id, a_headers)
    react = client.post(f"/users/{a_id}/photos/0/react", json={"emoji": "like"}, headers=b_headers)
    assert react.status_code == 200, react.text
    response = client.delete(f"/users/{a_id}/rig", headers=a_headers)
    assert response.status_code == 200, response.text
    reactions = client.get(f"/users/{a_id}/photos/reactions", headers=b_headers)
    assert reactions.status_code == 200, reactions.text
    assert reactions.json()["counts"] == {}


def test_delete_other_rig_403(client, user_a, user_b):
    a_id, _a_headers = user_a
    b_id, b_headers = user_b
    response = client.delete(f"/users/{a_id}/rig", headers=b_headers)
    assert response.status_code == 403


def test_delete_rig_unauthenticated_401(client, user_a):
    a_id, _a_headers = user_a
    response = client.delete(f"/users/{a_id}/rig")
    assert response.status_code == 401
