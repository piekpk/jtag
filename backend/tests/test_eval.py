"""Unit tests for the eval scoring functions (backend/eval/run_eval.py).

These tests use CANNED parser outputs — dicts passed straight to the pure
scoring functions — so they never call the real API. The live eval is
backend/eval/run_eval.py, run on demand and in the CI Eval stage.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))

import run_eval
from run_eval import (
    THRESHOLDS,
    bias_pair_pass,
    score_bias,
    score_consistency,
    score_field_accuracy,
    score_hallucination,
    score_schema,
)

DRAFT = {
    "title": "Trail run at Bethpage State Park",
    "date": "2026-11-07",
    "time": "09:00",
    "location": "Bethpage State Park",
    "expected_attendees": 12,
}


def _result(draft, parsed=True):
    return {"parsed": parsed, "prompt_version": "meetup_parse_v1",
            "draft": draft, "reason": None, "note": "n"}


def _case(expected):
    return {"id": "x", "note": "n", "run_date": "2026-11-02",
            "expected": expected}


# --- hallucination -----------------------------------------------------------

def test_hallucination_catches_invented_location():
    # Note states no location; the draft invents one.
    cases = [_case({"title": "Quick ride", "date": "2026-11-03",
                    "time": "08:00", "location": None,
                    "expected_attendees": 5})]
    invented = _result({**DRAFT, "title": "Quick ride", "date": "2026-11-03",
                        "time": "08:00", "location": "Bethpage",
                        "expected_attendees": 5})
    detail = score_hallucination([invented], cases)
    assert detail["score"] == 0.0
    assert detail["numerator"] == 0
    assert detail["denominator"] == 1
    assert detail["score"] < THRESHOLDS["hallucination"]


def test_hallucination_clean_run_scores_one():
    cases = [_case({"title": "Quick ride", "date": "2026-11-03",
                    "time": "08:00", "location": None,
                    "expected_attendees": 5})]
    clean = _result({"title": "Quick ride", "date": "2026-11-03",
                     "time": "08:00", "location": None,
                     "expected_attendees": 5})
    detail = score_hallucination([clean], cases)
    assert detail["score"] == 1.0


def test_hallucination_counts_each_invented_slot():
    cases = [_case({"title": "Coffee meetup", "date": None, "time": None,
                    "location": None, "expected_attendees": None})]
    invented = _result({"title": "Coffee meetup", "date": "2026-11-07",
                        "time": "09:00", "location": None,
                        "expected_attendees": None})
    detail = score_hallucination([invented], cases)
    # 2 of 4 null slots invented (date, time); location and count stayed null.
    assert detail == {"score": 0.5, "numerator": 2, "denominator": 4}


def test_hallucination_vacuous_when_nothing_is_null():
    cases = [_case(dict(DRAFT))]
    detail = score_hallucination([_result(dict(DRAFT))], cases)
    assert detail == {"score": 1.0, "numerator": 0, "denominator": 0}


# --- bias --------------------------------------------------------------------

def test_bias_pair_passes_when_only_allowed_field_differs():
    a = dict(DRAFT, title="John's trail ride at Bethpage")
    b = dict(DRAFT, title="Maria's trail ride at Bethpage")
    assert bias_pair_pass(a, b, ["title"]) is True
    detail = score_bias([{"pair_id": "name-pair", "allowed_diff": ["title"],
                          "drafts": [a, b]}])
    assert detail == {"score": 1.0, "numerator": 1, "denominator": 1}


def test_bias_pair_catches_unintended_difference():
    a = dict(DRAFT, title="John's trail ride at Bethpage")
    # Same note except the name — but the attendee count moved too.
    b = dict(DRAFT, title="Maria's trail ride at Bethpage",
             expected_attendees=20)
    assert bias_pair_pass(a, b, ["title"]) is False
    detail = score_bias([{"pair_id": "name-pair", "allowed_diff": ["title"],
                          "drafts": [a, b]}])
    assert detail["score"] == 0.0
    assert detail["score"] < THRESHOLDS["bias"]


def test_bias_pair_fails_when_a_member_does_not_parse():
    assert bias_pair_pass(dict(DRAFT), None, ["title"]) is False
    assert bias_pair_pass(None, None, ["title"]) is False


def test_bias_place_pair_allows_title_and_location():
    a = dict(DRAFT, title="Trail run at Bethpage State Park")
    b = dict(DRAFT, title="Trail run at Montauk dunes",
             location="Montauk dunes")
    assert bias_pair_pass(a, b, ["title", "location"]) is True
    # ... but the same two drafts fail if only the title may differ.
    assert bias_pair_pass(a, b, ["title"]) is False


# --- schema / field accuracy / consistency (threshold boundaries) -----------

def test_schema_threshold_boundary():
    nine_of_ten = [_result(dict(DRAFT)) for _ in range(9)]
    nine_of_ten.append(_result(None, parsed=False))
    assert score_schema(nine_of_ten)["score"] == 0.9
    assert score_schema(nine_of_ten)["score"] >= THRESHOLDS["schema"]

    eight_of_ten = [_result(dict(DRAFT)) for _ in range(8)]
    eight_of_ten.extend(_result(None, parsed=False) for _ in range(2))
    assert score_schema(eight_of_ten)["score"] == 0.8
    assert score_schema(eight_of_ten)["score"] < THRESHOLDS["schema"]


def test_field_accuracy_counts_title_and_exact_fields():
    cases = [_case(dict(DRAFT))]
    # 3 of 4 fields match + non-empty title: 4 of 5 points.
    partial = _result({**DRAFT, "time": "10:00"})
    detail = score_field_accuracy([partial], cases)
    assert detail == {"score": 0.8, "numerator": 4, "denominator": 5}
    assert detail["score"] >= THRESHOLDS["field_accuracy"]

    # Unparsed case scores 0 of 5.
    detail = score_field_accuracy([_result(None, parsed=False)], cases)
    assert detail == {"score": 0.0, "numerator": 0, "denominator": 5}


def test_field_accuracy_empty_title_loses_title_point():
    cases = [_case(dict(DRAFT))]
    blank_title = _result({**DRAFT, "title": "   "})
    detail = score_field_accuracy([blank_title], cases)
    assert detail == {"score": 0.8, "numerator": 4, "denominator": 5}


def test_consistency_identical_and_changed():
    first = [_result(dict(DRAFT)) for _ in range(5)]
    second = [_result(dict(DRAFT)) for _ in range(5)]
    assert score_consistency(first, second)["score"] == 1.0

    second[3] = _result({**DRAFT, "time": "10:00"})
    detail = score_consistency(first, second)
    assert detail == {"score": 0.8, "numerator": 4, "denominator": 5}
    assert detail["score"] < THRESHOLDS["consistency"]


def test_consistency_unparsed_run_counts_as_mismatch():
    first = [_result(dict(DRAFT))]
    second = [_result(None, parsed=False)]
    assert score_consistency(first, second)["score"] == 0.0
