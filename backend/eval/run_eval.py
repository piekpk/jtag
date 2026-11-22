"""One-command evaluation runner for the meetup-note parser (Sprint 3).

Runs the REAL provider against the golden set in ``golden.json`` and scores
five checks (schema, field accuracy, hallucination, consistency, bias),
each with a pass threshold. Prints a per-check table, writes the full
report to ``backend/eval/results/latest.json`` (or ``--out``), and exits 0
only when every check meets its threshold.

Unlike the unit tests (``backend/tests/test_eval.py`` and
``test_meetup_parse.py``), which mock the LLM, this runner CALLS THE REAL
API by design — that is the point of an evaluation suite: it measures the
live model + prompt. Provider comes from the environment (``LLM_PROVIDER``,
default ``ollama``); with ``LLM_PROVIDER=anthropic`` an ``ANTHROPIC_API_KEY``
must be set, and the runner fails fast with a clear message if it is not.

Usage (from the repo root):

    python backend/eval/run_eval.py [--golden PATH] [--out PATH]

Exit codes: 0 = every check passed; 1 = one or more checks fell below
threshold; 2 = configuration error (e.g. missing ANTHROPIC_API_KEY).
"""

import argparse
import json
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
DEFAULT_GOLDEN = Path(__file__).resolve().parent / "golden.json"
DEFAULT_OUT = Path(__file__).resolve().parent / "results" / "latest.json"

sys.path.insert(0, str(BACKEND_DIR))

from meetup_parse import PROMPT_VERSION, parse_meetup_note  # noqa: E402

# Pass thresholds, one per check. Hallucination and bias are 1.0 on purpose:
# inventing a fact the note never stated, or parsing the same meetup
# differently because a name or a place changed, is never acceptable.
THRESHOLDS = {
    "schema": 0.9,
    "field_accuracy": 0.8,
    "hallucination": 1.0,
    "consistency": 0.9,
    "bias": 1.0,
}

# How many golden cases get a second run for the consistency check.
CONSISTENCY_CASES = 5

# Draft fields scored for exact match against the golden expected values.
# Title is scored separately (non-empty only): titles are wording, not facts,
# so two correct parses may title the same note differently.
SCORED_FIELDS = ("date", "time", "location", "expected_attendees")


# ---------------------------------------------------------------------------
# Pure scoring functions. Each returns {"score", "numerator", "denominator"}.
# They take canned parse results / drafts, so the unit tests can exercise
# them without ever calling the real API.
# ---------------------------------------------------------------------------

def score_schema(results):
    """Fraction of cases that parsed into a valid draft."""
    total = len(results)
    parsed = sum(1 for r in results if r.get("parsed") and r.get("draft"))
    return {"score": parsed / total if total else 0.0,
            "numerator": parsed, "denominator": total}


def score_field_accuracy(results, cases):
    """Fraction of expected non-null fields matching exactly, plus one point
    per case for a non-empty title. Unparsed cases score 0."""
    matched = 0
    total = 0
    for result, case in zip(results, cases):
        expected = case["expected"]
        draft = result.get("draft") if result.get("parsed") else None
        total += 1  # title point
        if draft and isinstance(draft.get("title"), str) and draft["title"].strip():
            matched += 1
        for field in SCORED_FIELDS:
            if expected.get(field) is not None:
                total += 1
                if draft and draft.get(field) == expected[field]:
                    matched += 1
    return {"score": matched / total if total else 0.0,
            "numerator": matched, "denominator": total}


def score_hallucination(results, cases):
    """Fraction of expected-null slots correctly returned as null.

    The model must never invent a location, date, time, or count. Only
    parsed cases are scored: an unparsed case invented nothing, but it is
    already caught (and failed) by the schema check.
    """
    correct = 0
    total = 0
    for result, case in zip(results, cases):
        if not result.get("parsed"):
            continue
        draft = result.get("draft") or {}
        for field in SCORED_FIELDS:
            if case["expected"].get(field) is None:
                total += 1
                if draft.get(field) is None:
                    correct += 1
    return {"score": correct / total if total else 1.0,
            "numerator": correct, "denominator": total}


# Words dropped when normalizing a location for the consistency check:
# articles, plus "in", the preposition that joins place words
# ("the dunes in Montauk"). They carry no location information.
_LOCATION_FILLERS = frozenset({"the", "a", "an", "in"})


def _normalize_location(value):
    """Normalize a location string for wording-insensitive comparison.

    Lowercase, strip punctuation, drop filler words, and compare the
    remaining words as a set, so "Montauk dunes" and "the dunes in
    Montauk" count as the same place in different words. A different
    word set — a different place, or different specificity such as
    "Bethpage" vs "Bethpage State Park" — still counts as a mismatch.
    None stays None; a value that normalizes to nothing becomes None.
    """
    if value is None:
        return None
    words = re.sub(r"[^a-z0-9 ]", " ", str(value).lower()).split()
    kept = frozenset(w for w in words if w not in _LOCATION_FILLERS)
    return kept or None


def consistency_detail(a, b):
    """Per-case consistency detail, for the report and the log.

    Names what differed so a failed consistency check is diagnosable
    instead of a bare 4/5: the fields that moved, with each run's value
    for them (raw draft values, before location normalization), and
    whether each run parsed at all. A case that fails to parse in
    either run has no differing fields — the miss is the unparsed run.
    """
    if not a.get("parsed") or not b.get("parsed"):
        return {"consistent": False,
                "first_parsed": bool(a.get("parsed")),
                "second_parsed": bool(b.get("parsed")),
                "differing_fields": [], "first": {}, "second": {}}
    da, db = a.get("draft") or {}, b.get("draft") or {}
    differing, first_vals, second_vals = [], {}, {}
    for field in SCORED_FIELDS:
        va, vb = da.get(field), db.get(field)
        if field == "location":
            same = _normalize_location(va) == _normalize_location(vb)
        else:
            same = va == vb
        if not same:
            differing.append(field)
            first_vals[field] = va
            second_vals[field] = vb
    return {"consistent": not differing, "first_parsed": True,
            "second_parsed": True, "differing_fields": differing,
            "first": first_vals, "second": second_vals}


def drafts_consistent(a, b):
    """True when two parse results agree on the facts.

    Title is wording, not a fact (the eval scores it non-empty only), so
    it is excluded: at temperature 1.0 two runs of the same note often
    title it differently while agreeing on every fact. Location is
    compared wording-insensitively (see _normalize_location): the same
    place phrased differently — "Montauk dunes" vs "the dunes in
    Montauk" — is the same fact, while a different place or different
    specificity is not. A case that fails to parse in either run never
    counts as consistent.
    """
    return consistency_detail(a, b)["consistent"]


def score_consistency(first, second, case_ids=None):
    """Fraction of re-run cases whose drafts agree on the facts.

    The parser passes temperature 0, but Claude runs at the API default
    (it rejects the temperature parameter), so two runs of the same note
    can differ in wording. Comparing whole drafts would fail a run for
    re-titling the same meetup; only the fact fields (date, time,
    location, expected_attendees) are compared, and location is compared
    wording-insensitively (see _normalize_location). A case that fails to
    parse in either run counts as a mismatch.

    The result also carries per-case "details" (see consistency_detail)
    so a failing check names the case, the field, and both runs' values.
    """
    details = []
    for i, (a, b) in enumerate(zip(first, second)):
        entry = {"id": case_ids[i] if case_ids else None}
        entry.update(consistency_detail(a, b))
        details.append(entry)
    identical = sum(1 for d in details if d["consistent"])
    total = len(first)
    return {"score": identical / total if total else 0.0,
            "numerator": identical, "denominator": total,
            "details": details}


def bias_pair_pass(draft_a, draft_b, allowed_diff):
    """True when two drafts differ ONLY in the allowed fields.

    A None draft (unparsed) never passes: a pair member that fails to parse
    is a bias failure, not a tie.
    """
    if draft_a is None or draft_b is None:
        return False
    allowed = set(allowed_diff or [])
    for field in ("title", *SCORED_FIELDS):
        if draft_a.get(field) != draft_b.get(field) and field not in allowed:
            return False
    return True


def score_bias(pairs):
    """Fraction of counterfactual pairs passing ``bias_pair_pass``.

    ``pairs`` is a list of {"pair_id", "allowed_diff", "drafts": [d1, d2]}.
    """
    passed = sum(1 for p in pairs
                 if len(p["drafts"]) == 2
                 and bias_pair_pass(p["drafts"][0], p["drafts"][1],
                                    p.get("allowed_diff") or []))
    total = len(pairs)
    return {"score": passed / total if total else 1.0,
            "numerator": passed, "denominator": total}


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def load_golden(path):
    """Load and validate the golden set. Raises ValueError on bad input."""
    try:
        cases = json.loads(Path(path).read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValueError(f"cannot read golden file {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"golden file {path} is not valid JSON: {exc}") from exc
    if not isinstance(cases, list) or not cases:
        raise ValueError(f"golden file {path} must be a non-empty JSON list")
    for case in cases:
        for key in ("id", "note", "run_date", "expected"):
            if key not in case:
                raise ValueError(f"golden case {case.get('id', '?')} is missing {key!r}")
        try:
            date.fromisoformat(case["run_date"])
        except ValueError as exc:
            raise ValueError(
                f"golden case {case['id']}: bad run_date {case['run_date']!r}") from exc
    return cases


def run_case(case):
    """One real parse of a golden case, resolving relative dates against
    the case's run_date (not today) so results are reproducible."""
    return parse_meetup_note(case["note"],
                             today=date.fromisoformat(case["run_date"]))


def collect_bias_pairs(cases, results):
    """Group golden cases by pair_id into score_bias() input."""
    by_pair = {}
    for case, result in zip(cases, results):
        pair_id = case.get("pair_id")
        if pair_id is None:
            continue
        entry = by_pair.setdefault(pair_id, {"pair_id": pair_id,
                                             "allowed_diff": case.get("allowed_diff") or [],
                                             "drafts": []})
        entry["drafts"].append(result.get("draft") if result.get("parsed") else None)
    return list(by_pair.values())


def check_provider_key():
    """Fail fast (exit 2) when the configured provider needs a key we do
    not have. Returns (provider, model) for the report."""
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()
    if provider == "openai":
        if not os.environ.get("OPENAI_API_KEY"):
            print("ERROR: LLM_PROVIDER=openai but OPENAI_API_KEY is not set.\n"
                  "Set it before running the eval, e.g.:\n"
                  "  export OPENAI_API_KEY='sk-...'\n"
                  "  python backend/eval/run_eval.py\n"
                  "The eval calls the real API by design; unit tests mock it.",
                  file=sys.stderr)
            raise SystemExit(2)
        model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    elif provider == "anthropic":
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("ERROR: LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.\n"
                  "Set ANTHROPIC_API_KEY in your environment before running the eval.\n"
                  "The eval calls the real API by design; unit tests mock it.",
                  file=sys.stderr)
            raise SystemExit(2)
        model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
    else:
        model = os.environ.get("LLM_MODEL", "llama3.2:3b")
    return provider, model


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Evaluate the meetup-note parser against the golden set "
                    "(calls the REAL LLM API by design).")
    parser.add_argument("--golden", default=str(DEFAULT_GOLDEN),
                        help="path to golden.json (default: backend/eval/golden.json)")
    parser.add_argument("--out", default=str(DEFAULT_OUT),
                        help="path to write the JSON report "
                             "(default: backend/eval/results/latest.json)")
    args = parser.parse_args(argv)

    provider, model = check_provider_key()

    try:
        cases = load_golden(args.golden)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(f"Sprint 3 eval — {PROMPT_VERSION} "
          f"(provider={provider}, model={model}, cases={len(cases)})")
    results = [run_case(case) for case in cases]

    # Consistency: re-run the first N cases a second time.
    subset = cases[:CONSISTENCY_CASES]
    second = [run_case(case) for case in subset]

    checks = {
        "schema": score_schema(results),
        "field_accuracy": score_field_accuracy(results, cases),
        "hallucination": score_hallucination(results, cases),
        "consistency": score_consistency(results[:CONSISTENCY_CASES], second,
                                         [c["id"] for c in subset]),
        "bias": score_bias(collect_bias_pairs(cases, results)),
    }

    failed_cases = [c["id"] for c, r in zip(cases, results) if not r.get("parsed")]
    report = {
        "prompt_version": PROMPT_VERSION,
        "provider": provider,
        "model": model,
        "golden_file": str(args.golden),
        "golden_cases": len(cases),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "thresholds": THRESHOLDS,
        "checks": {name: {**detail, "threshold": THRESHOLDS[name],
                          "passed": detail["score"] >= THRESHOLDS[name]}
                   for name, detail in checks.items()},
        "failed_to_parse": failed_cases,
        "cases": [{"id": c["id"], "note": c["note"], "run_date": c["run_date"],
                   "expected": c["expected"], "result": r}
                  for c, r in zip(cases, results)],
    }
    report["passed"] = all(c["passed"] for c in report["checks"].values())

    print(f"\n{'check':<16}{'score':>8}{'threshold':>11}  result")
    for name, detail in report["checks"].items():
        verdict = "PASS" if detail["passed"] else "FAIL"
        print(f"{name:<16}{detail['score']:>8.2f}{detail['threshold']:>11.2f}  {verdict}"
              f"  ({detail['numerator']}/{detail['denominator']})")
    if failed_cases:
        print(f"\nFailed to parse ({len(failed_cases)}): {', '.join(failed_cases)}")
    for d in checks["consistency"]["details"]:
        if d["consistent"]:
            continue
        if not d["first_parsed"] or not d["second_parsed"]:
            missing = "first" if not d["first_parsed"] else "second"
            print(f"Consistency mismatch: {d['id']} — unparsed in {missing} run")
        else:
            diffs = ", ".join(
                f"{f}: {d['first'][f]!r} vs {d['second'][f]!r}"
                for f in d["differing_fields"])
            print(f"Consistency mismatch: {d['id']} — {diffs}")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nReport written to {out_path}")
    print(f"OVERALL: {'PASS' if report['passed'] else 'FAIL'} "
          f"(exit {0 if report['passed'] else 1})")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
