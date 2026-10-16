"""Unit tests for backend/holiday_ducks.py — holiday-duck date logic.

Test design (CSC 325 Module 6):
- Oracles come from published calendar facts, NOT from running the code.
  Western Easter dates below are the astronomically fixed dates from
  standard references (e.g. timeanddate.com); if the computus is wrong,
  these tests must fail. This is the Lecture 2 oracle rule: the expected
  value is derived from the specification, never from the implementation.
- Equivalence classes: fixed-date holidays, Easter-relative holidays,
  non-holiday dates.
- Boundary analysis: the day before/after a holiday must NOT match;
  Easter-relative offsets are exact (Good Friday is exactly Easter - 2).
- One behaviour per test; names state the expected behaviour.
"""

from datetime import date

from holiday_ducks import easter_western, hijri_to_gregorian, holidays_on


# ---------------------------------------------------------------------------
# easter_western: published Western Easter Sunday dates
# ---------------------------------------------------------------------------

def test_easter_2024_is_march_31():
    assert easter_western(2024) == date(2024, 3, 31)


def test_easter_2025_is_april_20():
    assert easter_western(2025) == date(2025, 4, 20)


def test_easter_2026_is_april_5():
    assert easter_western(2026) == date(2026, 4, 5)


def test_easter_2023_is_april_9():
    assert easter_western(2023) == date(2023, 4, 9)


def test_easter_returns_a_sunday():
    # Easter Sunday must always fall on a Sunday (weekday() == 6).
    for year in (2020, 2021, 2022, 2023, 2024, 2025, 2026, 2030):
        assert easter_western(year).weekday() == 6, f"Easter {year} is not a Sunday"


# ---------------------------------------------------------------------------
# holidays_on: fixed-date holidays (spec: FIXED table in module docstring)
# ---------------------------------------------------------------------------

def test_christmas_day_has_christmas_duck():
    ducks = holidays_on(date(2025, 12, 25))
    assert any(slug == "holiday_christmas" for slug, _, _ in ducks)


def test_christmas_eve_has_no_christmas_duck():
    # Boundary: Dec 24 is not Christmas.
    ducks = holidays_on(date(2025, 12, 24))
    assert all(slug != "holiday_christmas" for slug, _, _ in ducks)


def test_new_years_day_has_new_year_duck():
    ducks = holidays_on(date(2026, 1, 1))
    assert any(slug == "holiday_new_year" for slug, _, _ in ducks)


def test_boxing_day_is_december_26_not_25():
    ducks_26 = holidays_on(date(2025, 12, 26))
    ducks_25 = holidays_on(date(2025, 12, 25))
    assert any(slug == "holiday_boxing_day" for slug, _, _ in ducks_26)
    assert all(slug != "holiday_boxing_day" for slug, _, _ in ducks_25)


def test_ordinary_day_has_no_holiday_duck():
    assert holidays_on(date(2025, 6, 15)) == []


# ---------------------------------------------------------------------------
# holidays_on: Easter-relative holidays
# Spec: offsets from Easter Sunday (-2 Good Friday, 0 Easter Sunday,
# +1 Easter Monday). Easter 2025 = April 20 (published).
# ---------------------------------------------------------------------------

def test_good_friday_2025_is_april_18():
    # Easter Sunday 2025-04-20 minus 2 days.
    ducks = holidays_on(date(2025, 4, 18))
    assert any(slug == "holiday_good_friday" for slug, _, _ in ducks)


def test_easter_sunday_2025_has_easter_duck():
    ducks = holidays_on(date(2025, 4, 20))
    assert any(slug == "holiday_easter_sunday" for slug, _, _ in ducks)


def test_easter_monday_2025_is_april_21():
    ducks = holidays_on(date(2025, 4, 21))
    assert any(slug == "holiday_easter" for slug, _, _ in ducks)


def test_day_after_easter_monday_has_no_easter_duck():
    # Boundary: the Easter season ends after Monday.
    ducks = holidays_on(date(2025, 4, 22))
    assert all("easter" not in slug for slug, _, _ in ducks)


# ---------------------------------------------------------------------------
# hijri_to_gregorian: structural properties
# The tabular calendar is an approximation (+/-1 day vs moon sighting, per
# the module docstring), so exact-date oracles would over-claim. Instead we
# check the function's contract: deterministic, returns real dates, and
# monotonic in its inputs.
# ---------------------------------------------------------------------------

def test_hijri_conversion_is_deterministic():
    assert hijri_to_gregorian(1447, 1, 1) == hijri_to_gregorian(1447, 1, 1)


def test_hijri_conversion_returns_a_date():
    result = hijri_to_gregorian(1447, 10, 1)
    assert isinstance(result, date)


def test_later_hijri_date_converts_to_later_gregorian_date():
    earlier = hijri_to_gregorian(1447, 1, 1)
    later = hijri_to_gregorian(1447, 2, 1)
    assert later > earlier


def test_ramadan_1446_converts_near_march_1_2025():
    # 1 Ramadan 1446 AH was observed on 2025-03-01 (widely published).
    # The tabular calendar may differ by ~1 day (per the module docstring),
    # so we assert within a 2-day window, not an exact date.
    result = hijri_to_gregorian(1446, 9, 1)
    assert abs((result - date(2025, 3, 1)).days) <= 2
