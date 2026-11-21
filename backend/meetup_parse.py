"""Parse a free-text meetup note into a structured draft with the LLM.

Sprint 3 LLM feature. The prompt is versioned in
``prompts/meetup_parse_v1.txt`` (loaded at runtime, never edited in place);
the provider is ``llm.generate`` — Claude (Anthropic) when
``LLM_PROVIDER=anthropic`` (``ANTHROPIC_API_KEY``, model via
``ANTHROPIC_MODEL``, default ``claude-sonnet-5``), OpenAI when
``LLM_PROVIDER=openai``, Ollama otherwise. Extraction passes temperature 0 (honoured by OpenAI/Ollama;
the Anthropic provider omits it — claude-sonnet-5 rejects the parameter
— so Claude runs at the API default).

The parser NEVER raises for model problems. It returns a result dict:

    {"parsed": True, "prompt_version": "meetup_parse_v1",
     "draft": {"title": ..., "date": ..., "time": ...,
               "location": ..., "expected_attendees": ...},
     "reason": None, "note": <original note>}

or, when the model is unavailable or its output is unusable:

    {"parsed": False, "prompt_version": "meetup_parse_v1",
     "draft": None, "reason": "llm_unavailable" | "invalid_json" |
     "invalid_schema" | "prompt_unavailable", "note": <original note>}

Callers treat ``parsed: False`` as the fallback path: show the manual
meetup form with the note pre-filled. Nothing is ever created from a
failed parse, and a failed parse is a normal outcome, not an error.
Only a bad *input* (empty or overlong note) raises ValueError.
"""

import json
import re
from datetime import date
from pathlib import Path

from llm import generate

PROMPT_VERSION = "meetup_parse_v1"
PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / f"{PROMPT_VERSION}.txt"
MAX_NOTE_CHARS = 500
MAX_TITLE_CHARS = 80
MAX_LOCATION_CHARS = 200
DRAFT_KEYS = ("title", "date", "time", "location", "expected_attendees")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)


def _load_prompt(today: date) -> str | None:
    """Read the versioned prompt, resolving relative dates against today."""
    try:
        text = PROMPT_PATH.read_text(encoding="utf-8")
    except OSError:
        return None
    return text.replace("{today}", today.isoformat())


def _strip_fences(text: str) -> str:
    """Tolerate a single ```json fence around the object; otherwise as-is."""
    m = _FENCE_RE.match(text.strip())
    return m.group(1) if m else text.strip()


def _valid_date(value) -> bool:
    if not isinstance(value, str) or not _DATE_RE.match(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _valid_time(value) -> bool:
    return isinstance(value, str) and bool(_TIME_RE.match(value))


def _validate_draft(raw) -> tuple[dict | None, str | None]:
    """Strict schema check. Returns (draft, None) or (None, reason)."""
    if not isinstance(raw, dict):
        return None, "invalid_schema"
    if tuple(raw.keys()) != DRAFT_KEYS:
        return None, "invalid_schema"
    title = raw["title"]
    if not isinstance(title, str) or not title.strip():
        return None, "invalid_schema"
    if raw["date"] is not None and not _valid_date(raw["date"]):
        return None, "invalid_schema"
    if raw["time"] is not None and not _valid_time(raw["time"]):
        return None, "invalid_schema"
    location = raw["location"]
    if location is not None and not isinstance(location, str):
        return None, "invalid_schema"
    attendees = raw["expected_attendees"]
    if attendees is not None and (isinstance(attendees, bool)
                                 or not isinstance(attendees, int)):
        return None, "invalid_schema"
    return {
        "title": title.strip()[:MAX_TITLE_CHARS],
        "date": raw["date"],
        "time": raw["time"],
        "location": (location.strip()[:MAX_LOCATION_CHARS] or None)
        if isinstance(location, str) else None,
        "expected_attendees": attendees if (isinstance(attendees, int)
                                            and attendees > 0) else None,
    }, None


def parse_meetup_note(note: str, today: date | None = None) -> dict:
    """Parse one meetup note. Never raises for model failures."""
    note = (note or "").strip()
    if not note:
        raise ValueError("note must not be empty")
    if len(note) > MAX_NOTE_CHARS:
        raise ValueError("note must be 500 characters or fewer")
    today = today or date.today()
    base = {"prompt_version": PROMPT_VERSION, "draft": None,
            "reason": None, "note": note}
    system = _load_prompt(today)
    if system is None:
        return {**base, "parsed": False, "reason": "prompt_unavailable"}
    raw_text = generate(note, system=system, max_tokens=220, temperature=0)
    if raw_text is None:
        return {**base, "parsed": False, "reason": "llm_unavailable"}
    try:
        raw = json.loads(_strip_fences(raw_text))
    except (json.JSONDecodeError, ValueError):
        return {**base, "parsed": False, "reason": "invalid_json"}
    draft, reason = _validate_draft(raw)
    if draft is None:
        return {**base, "parsed": False, "reason": reason}
    return {**base, "parsed": True, "draft": draft}
