"""Integration tests for squad creation (POST /squads)."""

from tests.api_helpers import unique_name


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
