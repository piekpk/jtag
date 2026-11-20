# Meetup-note parser — evaluation suite (Sprint 3)

Golden-set evaluation for the LLM feature (`POST /meetups/parse`, backed by
`backend/meetup_parse.py`, prompt `prompts/meetup_parse_v1.txt`).

## Run it (one command, from the repo root)

```bash
python backend/eval/run_eval.py
```

Options:

```bash
python backend/eval/run_eval.py --golden backend/eval/golden.json \
                                --out backend/eval/results/latest.json
```

## This runner calls the REAL API — on purpose

Unlike the unit tests (`backend/tests/test_eval.py`, `test_meetup_parse.py`),
which mock the LLM and never touch the network, this runner calls the live
provider for every golden case. That is the point of an evaluation suite:
it measures the real model + prompt, so a provider model change shows up
here as a threshold failure.

- Provider comes from `LLM_PROVIDER` (default `ollama`).
- The configured provider is Claude: `LLM_PROVIDER=anthropic` needs
  `ANTHROPIC_API_KEY` set; the runner fails fast with a clear message
  (exit 2) if it is missing.
- Model is `ANTHROPIC_MODEL` (default `claude-sonnet-5`), `OPENAI_MODEL`
  (default `gpt-4o-mini`) for OpenAI, or `LLM_MODEL`
  (default `llama3.2:3b`) for Ollama.

## The golden set (`golden.json`, 18 cases)

Each case is `{"id", "note", "run_date", "expected": {...}}`. `run_date`
is the date relative dates ("tomorrow", "next Saturday") resolve against,
so results are reproducible. The first three cases are the Module 9
discussion inputs, with their v2 outputs as expected values. The rest
cover: no location / no date / no time / no count, vague times, relative
dates, two locations in one note, word counts ("a dozen"), and a
near-empty note — plus two counterfactual bias pairs (same note with only
a name, or only a place, changed; marked with a shared `pair_id` and the
fields allowed to differ in `allowed_diff`).

Expected values are what a correct parse gives; `null` wherever the note
does not state the fact. Judgment calls the golden set pins down:

- Vague "evening" resolves to `18:00` ("around noon" -> `12:00` is in
  the prompt itself).
- "Next Saturday" said on a Monday (run_date 2026-11-02) means the
  Saturday of the *following* week, 2026-11-14 — not the coming Saturday.
- With two locations in one note, `location` is the **meet point**
  (where the group gathers), not the destination.
- Titles are wording, not facts: the field-accuracy check only requires
  a non-empty title, so two correct parses may title a note differently.

## The checks and their thresholds

| Check | What it measures | Threshold |
|---|---|---|
| `schema` | Fraction of cases returning `parsed: true` with a valid draft. A parse failure is a fallback, not a crash — but a prompt that fails often is a bad prompt. | 0.90 |
| `field_accuracy` | Fraction of expected non-null date/time/location/attendee fields matching exactly, plus one point per case for a non-empty title. | 0.80 |
| `hallucination` | Fraction of expected-null slots correctly returned as null. The model must never invent a location, date, time, or count the note never stated. | **1.00** |
| `consistency` | The first 5 golden cases are run a second time; fraction whose drafts are identical. The parser runs at temperature 0, so the same note should parse the same way every time. | 0.90 |
| `bias` | Fraction of counterfactual pairs whose drafts differ ONLY in the fields listed in `allowed_diff` (e.g. the title may carry the name; nothing else may change when "John's" becomes "Maria's"). | **1.00** |

Hallucination and bias are 1.00 on purpose: inventing a fact, or parsing
the same meetup differently because a name or a place changed, is never
acceptable — those are the checks that must never be loosened to make a
run green.

## Exit codes and output

- `0` — every check met its threshold.
- `1` — one or more checks fell below threshold (the per-check table
  shows which, with `numerator/denominator`).
- `2` — configuration error (missing `ANTHROPIC_API_KEY`, unreadable or
  invalid golden file).

The full report — per-case results plus every check's score, threshold,
and pass/fail — is written to `backend/eval/results/latest.json` (or
`--out`). The CI Eval stage runs this command on PRs to main and fails
the pipeline when it exits non-zero.
