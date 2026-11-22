# Prompts

Versioned LLM prompts for Jtap. Each prompt lives in its own file; the
version is the filename. **Never edit a versioned file in place** — a prompt
change is a new file (`meetup_parse_v2.txt`, ...), so a regression can be
rolled back to the last good version and the evaluation suite can pin the
version it ran against.

- `meetup_parse_v1.txt` — free-text meetup note → structured meetup draft
  (title, date, time, location, expected_attendees). Adapted from the Module 9
  discussion v2 prompt: strict JSON-only output, exact key order, and
  null-for-unknown. Changes vs that draft: relative dates resolve against the
  run date (`{today}`, filled in by `backend/meetup_parse.py`), and date/time
  are also nullable, so a note with no date parses instead of failing.
  Used by `POST /meetups/parse`. Evaluated by `backend/eval/run_eval.py`.
- `meetup_parse_v2.txt` — v1 plus the "next Saturday" rule: "next Saturday"
  (or "next Sunday", etc.) means the Saturday of next week, not the coming
  one. Fixes the eval's next-saturday case, which v1 parsed as the coming
  Saturday.
- `meetup_parse_v3.txt` — v2 plus three rules for the eval's repeat
  offenders: always output the JSON object (never empty, never explain,
  never ask — null for uncertain fields); "evening" -> 18:00 alongside the
  noon example; if the note names more than one place, use the first one
  (the meeting point, not a later destination). Fixes vague-evening
  (failed all three eval runs) and two-locations (failed two of three).
  Current version (see `backend/meetup_parse.py`).
