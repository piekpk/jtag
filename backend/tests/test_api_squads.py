"""Integration tests for squads: creation (POST /squads) and
profile retrieval (GET /squads/{id})."""

from tests.api_helpers import unique_name


def _create_squad(client, headers, name, **extra):
    response = client.post(
        "/squads", json={"name": name, **extra}, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_create_squad_success_creator_is_leader(client, user_a):
    a_id, a_headers = user_a
    name = unique_name("Trail Crew")
    response = client.post("/squads", json={"name": name}, headers=a_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == name
    assert body["created_by"] == a_id
    assert body["member_count"] == 1
    assert body["my_role"] == "leader"


def test_create_squad_unauthenticated_401(client):
    response = client.post("/squads", json={"name": unique_name("Nope")})
    assert response.status_code == 401


def test_create_squad_blank_name_400(client, user_a):
    _a_id, a_headers = user_a
    response = client.post("/squads", json={"name": "   "}, headers=a_headers)
    assert response.status_code == 400


def test_create_squad_duplicate_name_400(client, user_a):
    _a_id, a_headers = user_a
    name = unique_name("Dup Crew")
    first = client.post("/squads", json={"name": name}, headers=a_headers)
    assert first.status_code == 200, first.text
    second = client.post("/squads", json={"name": name}, headers=a_headers)
    assert second.status_code == 400


def test_create_squad_profane_name_400(client, user_a):
    _a_id, a_headers = user_a
    response = client.post(
        "/squads", json={"name": "shit crew"}, headers=a_headers
    )
    assert response.status_code == 400


def test_create_squad_long_name_400(client, user_a):
    _a_id, a_headers = user_a
    response = client.post("/squads", json={"name": "x" * 81}, headers=a_headers)
    assert response.status_code == 400


# --- Membership (S2.1, #44): POST /squads/{id}/join, DELETE /squads/{id}/leave ---


def _make_squad(client, headers, **extra):
    response = client.post(
        "/squads", json={"name": unique_name("Member Crew"), **extra},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_join_squad_success(client, user_a, user_b):
    _a_id, a_headers = user_a
    b_id, b_headers = user_b
    squad = _make_squad(client, a_headers)
    response = client.post(f"/squads/{squad['id']}/join", headers=b_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["member_count"] == 2
    assert body["my_role"] == "member"
    assert b_id != squad["created_by"]


def test_join_squad_already_member_400(client, user_a, user_b):
    _a_id, a_headers = user_a
    _b_id, b_headers = user_b
    squad = _make_squad(client, a_headers)
    first = client.post(f"/squads/{squad['id']}/join", headers=b_headers)
    assert first.status_code == 200, first.text
    second = client.post(f"/squads/{squad['id']}/join", headers=b_headers)
    assert second.status_code == 400


def test_join_private_squad_403(client, user_a, user_b):
    _a_id, a_headers = user_a
    _b_id, b_headers = user_b
    squad = _make_squad(client, a_headers, is_private=True)
    response = client.post(f"/squads/{squad['id']}/join", headers=b_headers)
    assert response.status_code == 403


def test_join_squad_not_found_404(client, user_a):
    _a_id, a_headers = user_a
    response = client.post("/squads/999999999/join", headers=a_headers)
    assert response.status_code == 404


def test_join_squad_unauthenticated_401(client, user_a):
    _a_id, a_headers = user_a
    squad = _make_squad(client, a_headers)
    response = client.post(f"/squads/{squad['id']}/join")
    assert response.status_code == 401


def test_leave_squad_success(client, user_a, user_b):
    _a_id, a_headers = user_a
    _b_id, b_headers = user_b
    squad = _make_squad(client, a_headers)
    joined = client.post(f"/squads/{squad['id']}/join", headers=b_headers)
    assert joined.status_code == 200, joined.text
    response = client.request(
        "DELETE", f"/squads/{squad['id']}/leave", headers=b_headers
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["member_count"] == 1
    assert body["my_role"] is None


def test_leave_squad_non_member_400(client, user_a, user_b):
    _a_id, a_headers = user_a
    _b_id, b_headers = user_b
    squad = _make_squad(client, a_headers)
    response = client.request(
        "DELETE", f"/squads/{squad['id']}/leave", headers=b_headers
    )
    assert response.status_code == 400


def test_leave_squad_leader_400(client, user_a):
    _a_id, a_headers = user_a
    squad = _make_squad(client, a_headers)
    response = client.request(
        "DELETE", f"/squads/{squad['id']}/leave", headers=a_headers
    )
    assert response.status_code == 400
# --- Squad retrieval (S4.1, #48): GET /squads/{id} ---


def test_get_squad_public_as_leader(client, user_a):
    a_id, a_headers = user_a
    client.patch(
        f"/users/{a_id}/profile",
        json={"settings": {"ownerName": "Trail Boss"}},
        headers=a_headers,
    )
    squad = _create_squad(client, a_headers, unique_name("Open Crew"))
    response = client.get(f"/squads/{squad['id']}", headers=a_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == squad["id"]
    assert body["member_count"] == 1
    assert body["my_role"] == "leader"
    assert len(body["members"]) == 1
    member = body["members"][0]
    assert member["user_id"] == a_id
    assert member["display_name"] == "Trail Boss"
    assert member["role"] == "leader"
    assert "email" not in member


def test_get_squad_public_as_non_member(client, user_a, user_b):
    _a_id, a_headers = user_a
    _b_id, b_headers = user_b
    squad = _create_squad(client, a_headers, unique_name("Open To All"))
    response = client.get(f"/squads/{squad['id']}", headers=b_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["my_role"] is None
    assert body["member_count"] == 1
    assert len(body["members"]) == 1
    # No ownerName set on the leader: the shared fallback name is used.
    assert body["members"][0]["display_name"] == "Fellow Jeeper"


def test_get_squad_private_as_member(client, user_a):
    _a_id, a_headers = user_a
    squad = _create_squad(
        client, a_headers, unique_name("Secret Crew"), is_private=True
    )
    response = client.get(f"/squads/{squad['id']}", headers=a_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_private"] is True
    assert body["my_role"] == "leader"
    assert len(body["members"]) == 1


def test_get_squad_private_as_non_member_403(client, user_a, user_b):
    _a_id, a_headers = user_a
    _b_id, b_headers = user_b
    squad = _create_squad(
        client, a_headers, unique_name("Locked Crew"), is_private=True
    )
    response = client.get(f"/squads/{squad['id']}", headers=b_headers)
    assert response.status_code == 403
    assert "members" not in response.json()


def test_get_squad_not_found_404(client, user_a):
    _a_id, a_headers = user_a
    response = client.get("/squads/999999999", headers=a_headers)
    assert response.status_code == 404


def test_get_squad_unauthenticated_401(client, user_a):
    _a_id, a_headers = user_a
    squad = _create_squad(client, a_headers, unique_name("Some Crew"))
    response = client.get(f"/squads/{squad['id']}")
    assert response.status_code == 401
