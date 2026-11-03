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
