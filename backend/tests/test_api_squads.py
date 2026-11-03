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
