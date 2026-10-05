"""Holiday-duck grants: which holiday ducks fall on a given Gregorian date.

Fixed-date holidays match exactly. Movable Christian feasts are derived from
Western Easter (Anonymous Gregorian computus). Islamic holidays use the
tabular Islamic calendar and match within +/-1 day, since real-world moon
sighting can shift observance by a day.
"""

import math
from datetime import date, timedelta

# slug, display name, duck name
FIXED = {
    (1, 1): ("holiday_new_year", "New Year's Day", "New Year Duck"),
    (5, 1): ("holiday_workers_day", "Workers' Day", "Workers' Day Duck"),
    (3, 8): ("holiday_womens_day", "International Women's Day", "Women's Day Duck"),
    (8, 15): ("holiday_assumption", "Assumption Day", "Assumption Duck"),
    (11, 1): ("holiday_all_saints", "All Saints' Day", "All Saints' Duck"),
    (12, 25): ("holiday_christmas", "Christmas Day", "Christmas Duck"),
    (12, 26): ("holiday_boxing_day", "Boxing Day", "Boxing Day Duck"),
}

# offset from Easter Sunday -> (slug, display name, duck name)
EASTER_BASED = {
    -2: ("holiday_good_friday", "Good Friday", "Good Friday Duck"),
    0: ("holiday_easter_sunday", "Easter Sunday", "Easter Sunday Duck"),
    1: ("holiday_easter", "Easter Monday", "Easter Duck"),
    39: ("holiday_ascension", "Ascension Day", "Ascension Duck"),
    50: ("holiday_whit_monday", "Whit Monday", "Whit Monday Duck"),
}

# (hijri month, hijri day) -> (slug, display name, duck name)
ISLAMIC = {
    (10, 1): ("holiday_eid_fitr", "Eid al-Fitr", "Eid al-Fitr Duck"),
    (12, 10): ("holiday_eid_adha", "Eid al-Adha", "Eid al-Adha Duck"),
    (3, 12): ("holiday_mawlid", "Mawlid", "Mawlid Duck"),
    (1, 1): ("holiday_hijri_new_year", "Islamic New Year", "Hijri New Year Duck"),
}


def easter_western(year: int) -> date:
    """Easter Sunday via the Anonymous Gregorian computus."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def hijri_to_gregorian(hy: int, hm: int, hd: int) -> date:
    """Tabular Islamic calendar -> Gregorian date."""
    jd = (hd + math.ceil(29.5 * (hm - 1)) + (hy - 1) * 354
          + math.floor((3 + 11 * hy) / 30) + 1948439 - 1)
    # Fliegel-Van Flandern JDN -> Gregorian
    l = jd + 68569
    n = (4 * l) // 146097
    l = l - (146097 * n + 3) // 4
    i = (4000 * (l + 1)) // 1461001
    l = l - (1461 * i) // 4 + 31
    j = (80 * l) // 2447
    d = l - (2447 * j) // 80
    l = j // 11
    m = j + 2 - 12 * l
    y = 100 * (n - 49) + i + l
    return date(y, m, d)


def holidays_on(d: date):
    """Return [(slug, holiday_name, duck_name)] for holidays on date `d`."""
    found = []
    key = (d.month, d.day)
    if key in FIXED:
        found.append(FIXED[key])
    easter = easter_western(d.year)
    for offset, entry in EASTER_BASED.items():
        if d == easter + timedelta(days=offset):
            found.append(entry)
    # Islamic holidays: check the two Hijri years overlapping this Gregorian year.
    approx_hy = int((d.year - 622) * 33 / 32)
    for hy in (approx_hy, approx_hy + 1):
        for (hm, hd), entry in ISLAMIC.items():
            try:
                g = hijri_to_gregorian(hy, hm, hd)
            except ValueError:
                continue
            if abs((d - g).days) <= 1 and entry not in found:
                found.append(entry)
    return found
