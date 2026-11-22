"""Tests for the Sprint 3 LLM feature: POST /meetups/parse + meetup_parse.

Every test mocks the LLM at the generate() boundary (monkeypatching
meetup_parse.generate), so the suite never calls the real API — the same
rule the CI Test stage enforces. The fallback test
(test_parse_endpoint_fallback_when_llm_down) proves the documented fallback:
model down -> 200 with parsed=false, and the caller shows the manual form.
"""

from datetime import date

import pytest

import meetup_parse
from meetup_parse import parse_meetup_note

V1 = '{"title": "Trail run at Bethpage State Park", "date": "2026-11-07", "time": "09:00", "location": "Bethpage State Park", "expected_attendees": 12}'
V1_NOTE = "Trail run at Bethpage State Park on Saturday, November 7 at 9am. About 12 rigs coming. Bring recovery gear."
V3 = '{"title": "Quick ride", "date": "2026-11-03", "time": "08:00", "location": null, "expected_attendees": 5}'
V3_NOTE = "Quick ride tomorrow morning at 8, probably 5 of us, bring radios."


def _mock_generate(monkeypatch, text):
    monkeypatch.setattr(meetup_parse, "generate", lambda *a, **k: text)


def test_valid_output_parsed(monkeypatch):
    _mock_generate(monkeypatch, V1)
    result = parse_meetup_note(V1_NOTE, today=date(2026, 11, 2))
    assert result["parsed"] is True
    assert result["prompt_version"] == "meetup_parse_v2"
    assert result["draft"] == {
        "title": "Trail run at Bethpage State Park",
        "date": "2026-11-07", "time": "09:00",
        "location": "Bethpage State Park", "expected_attendees": 12,
    }


def test_missing_location_stays_null(monkeypatch):
    _mock_generate(monkeypatch, V3)
    result = parse_meetup_note(V3_NOTE, today=date(2026, 11, 2))
    assert result["parsed"] is True
    assert result["draft"]["location"] is None
    assert result["draft"]["date"] == "2026-11-03"


def test_llm_unavailable_fallback(monkeypatch):
    _mock_generate(monkeypatch, None)
    result = parse_meetup_note(V1_NOTE)
    assert result["parsed"] is False
    assert result["draft"] is None
    assert result["reason"] == "llm_unavailable"
    assert result["note"] == V1_NOTE


def test_garbage_output_invalid_json(monkeypatch):
    _mock_generate(monkeypatch, "Sure! Here's your meetup, sounds fun!")
    result = parse_meetup_note(V1_NOTE)
    assert result["parsed"] is False
    assert result["reason"] == "invalid_json"


def _mock_generate_sequence(monkeypatch, texts):
    """Mock generate() to return each text in turn; count the calls."""
    calls = {"n": 0}

    def fake(*a, **k):
        text = texts[min(calls["n"], len(texts) - 1)]
        calls["n"] += 1
        return text

    monkeypatch.setattr(meetup_parse, "generate", fake)
    return calls


def test_retry_recovers_after_empty_response(monkeypatch):
    calls = _mock_generate_sequence(monkeypatch, [None, V1])
    result = parse_meetup_note(V1_NOTE, today=date(2026, 11, 2))
    assert result["parsed"] is True
    assert result["draft"]["title"] == "Trail run at Bethpage State Park"
    assert calls["n"] == 2


def test_retry_recovers_after_invalid_json(monkeypatch):
    calls = _mock_generate_sequence(monkeypatch, ["not json at all", V1])
    result = parse_meetup_note(V1_NOTE, today=date(2026, 11, 2))
    assert result["parsed"] is True
    assert calls["n"] == 2


def test_retry_exhausted_keeps_last_reason(monkeypatch):
    _mock_generate_sequence(monkeypatch, [None, "still not json"])
    result = parse_meetup_note(V1_NOTE)
    assert result["parsed"] is False
    assert result["reason"] == "invalid_json"


def test_invalid_schema_does_not_retry(monkeypatch):
    calls = _mock_generate_sequence(
        monkeypatch, [V1[:-1] + ', "vibe": "chill"}', V1])
    result = parse_meetup_note(V1_NOTE)
    assert result["parsed"] is False
    assert result["reason"] == "invalid_schema"
    assert calls["n"] == 1


def test_failed_parse_records_raw_text(monkeypatch):
    _mock_generate(monkeypatch, "Sure! Here's your meetup, sounds fun!")
    result = parse_meetup_note(V1_NOTE)
    assert result["parsed"] is False
    assert result["reason"] == "invalid_json"
    assert result["raw_text"] == "Sure! Here's your meetup, sounds fun!"


def test_empty_response_records_raw_text_none(monkeypatch):
    _mock_generate(monkeypatch, None)
    result = parse_meetup_note(V1_NOTE)
    assert result["parsed"] is False
    assert result["reason"] == "llm_unavailable"
    assert result["raw_text"] is None


def test_success_has_no_raw_text(monkeypatch):
    _mock_generate(monkeypatch, V1)
    result = parse_meetup_note(V1_NOTE, today=date(2026, 11, 2))
    assert result["parsed"] is True
    assert "raw_text" not in result


def test_fenced_json_tolerated(monkeypatch):
    _mock_generate(monkeypatch, "```json\n" + V1 + "\n```")
    result = parse_meetup_note(V1_NOTE)
    assert result["parsed"] is True


def test_extra_key_rejected(monkeypatch):
    _mock_generate(monkeypatch, V1[:-1] + ', "vibe": "chill"}')
    result = parse_meetup_note(V1_NOTE)
    assert result["parsed"] is False
    assert result["reason"] == "invalid_schema"


def test_wrong_attendee_type_rejected(monkeypatch):
    _mock_generate(monkeypatch, V1.replace('"expected_attendees": 12', '"expected_attendees": "twelve"'))
    result = parse_meetup_note(V1_NOTE)
    assert result["parsed"] is False
    assert result["reason"] == "invalid_schema"


def test_bad_date_rejected(monkeypatch):
    _mock_generate(monkeypatch, V1.replace('"2026-11-07"', '"Nov 7, 2026"'))
    result = parse_meetup_note(V1_NOTE)
    assert result["parsed"] is False
    assert result["reason"] == "invalid_schema"


def test_long_title_truncated(monkeypatch):
    long_title = "Trail run " + "x" * 100
    _mock_generate(monkeypatch, V1.replace("Trail run at Bethpage State Park", long_title))
    result = parse_meetup_note(V1_NOTE)
    assert result["parsed"] is True
    assert len(result["draft"]["title"]) == 80


def test_zero_attendees_becomes_null(monkeypatch):
    _mock_generate(monkeypatch, V1.replace('"expected_attendees": 12', '"expected_attendees": 0'))
    result = parse_meetup_note(V1_NOTE)
    assert result["parsed"] is True
    assert result["draft"]["expected_attendees"] is None


def test_extraction_uses_temperature_zero(monkeypatch):
    seen = {}

    def fake_generate(prompt, system=None, max_tokens=220, temperature=0.9):
        seen["temperature"] = temperature
        return V1

    monkeypatch.setattr(meetup_parse, "generate", fake_generate)
    parse_meetup_note(V1_NOTE)
    assert seen["temperature"] == 0


def test_empty_note_raises():
    with pytest.raises(ValueError):
        parse_meetup_note("   ")


def test_overlong_note_raises():
    with pytest.raises(ValueError):
        parse_meetup_note("x" * 501)


# --- Endpoint tests (full stack, LLM still mocked at generate()) ---


def test_parse_endpoint_success(client, user_a, monkeypatch):
    _mock_generate(monkeypatch, V1)
    _a_id, a_headers = user_a
    response = client.post("/meetups/parse", json={"note": V1_NOTE}, headers=a_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["parsed"] is True
    assert body["draft"]["title"] == "Trail run at Bethpage State Park"
    assert body["prompt_version"] == "meetup_parse_v2"


def test_parse_endpoint_fallback_when_llm_down(client, user_a, monkeypatch):
    """The fallback-path proof: model down -> 200, parsed=false, note kept."""
    _mock_generate(monkeypatch, None)
    _a_id, a_headers = user_a
    response = client.post("/meetups/parse", json={"note": V1_NOTE}, headers=a_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["parsed"] is False
    assert body["reason"] == "llm_unavailable"
    assert body["draft"] is None
    assert body["note"] == V1_NOTE


def test_parse_endpoint_empty_note_400(client, user_a):
    _a_id, a_headers = user_a
    response = client.post("/meetups/parse", json={"note": "   "}, headers=a_headers)
    assert response.status_code == 400


def test_parse_endpoint_long_note_400(client, user_a):
    _a_id, a_headers = user_a
    response = client.post("/meetups/parse", json={"note": "x" * 501}, headers=a_headers)
    assert response.status_code == 400


def test_parse_endpoint_requires_auth(client):
    response = client.post("/meetups/parse", json={"note": V1_NOTE})
    assert response.status_code == 401


def test_parse_endpoint_profane_note_400(client, user_a):
    _a_id, a_headers = user_a
    response = client.post("/meetups/parse",
                           json={"note": "trail ride shit show Saturday"},
                           headers=a_headers)
    assert response.status_code == 400
