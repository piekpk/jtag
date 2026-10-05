"""Nearby-place lookups for JtapBot via the OpenStreetMap Overpass API.

Free, no API key. The LLM never guesses at real-world places: this module
returns actual POIs with distance and listed hours, and the bot formats them
deterministically.
"""

import json
import math
import time
import urllib.parse
import urllib.request

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
USER_AGENT = "JtapApp/1.0 (JtapBot nearby search)"
TIMEOUT_S = 40

# category -> list of Overpass tag selectors
CATEGORIES = {
    "gas": [{"amenity": "fuel"}],
    "mechanic": [{"shop": "car_repair"}, {"amenity": "car_repair"}],
    "tow": [{"shop": "car_repair"}, {"amenity": "car_repair"}],
    "food": [{"amenity": "restaurant"}, {"amenity": "fast_food"}],
}

CATEGORY_LABEL = {
    "gas": "gas stations",
    "mechanic": "mechanic shops",
    "tow": "tow services",
    "food": "places to eat",
}


def _haversine_mi(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a)) / 1609.344


def _ql_for(category, lat, lng, radius_m):
    # Nodes only: way-queries are far slower and most POIs are nodes anyway.
    # (Name-regex searches like "tow" are also skipped: they force full tag
    # scans and routinely time out. car_repair shops cover towing.)
    blocks = []
    for sel in CATEGORIES[category]:
        k, v = next(iter(sel.items()))
        blocks.append(f'node["{k}"="{v}"](around:{radius_m},{lat},{lng});')
    return "[out:json][timeout:25];(" + "".join(blocks) + ");out tags;"


def _open_status(tags):
    """Best-effort open-now signal from the opening_hours tag.

    Returns (is_24_7: bool, hours_text: str|None). We don't try to evaluate
    arbitrary opening_hours rules (timezones make that unreliable); we surface
    24/7 clearly and show the raw hours otherwise.
    """
    hours = (tags.get("opening_hours") or "").strip()
    if not hours:
        return False, None
    if hours == "24/7":
        return True, "Open 24 hours"
    return False, f"Hours: {hours}"


# Short in-memory cache: repeated "near me" asks in one area don't hammer Overpass.
_CACHE = {}
_CACHE_TTL_S = 15 * 60


def search_nearby(lat, lng, category, radius_m=8000, limit=5):
    """Return up to `limit` nearest POIs: dicts with name/distance_mi/hours.

    Raises on network/API failure; the caller decides what to tell the user.
    """
    cache_key = (category, round(lat, 2), round(lng, 2), radius_m, limit)
    hit = _CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _CACHE_TTL_S:
        return hit[1]
    results = _search_uncached(lat, lng, category, radius_m, limit)
    _CACHE[cache_key] = (time.time(), results)
    # Keep the cache small.
    if len(_CACHE) > 64:
        _CACHE.pop(next(iter(_CACHE)))
    return results


def _search_uncached(lat, lng, category, radius_m, limit):
    ql = _ql_for(category, lat, lng, radius_m)
    last_err = None
    for base_url in OVERPASS_URLS:
        try:
            req = urllib.request.Request(
                base_url,
                data=urllib.parse.urlencode({"data": ql}).encode(),
                headers={"User-Agent": USER_AGENT,
                         "Content-Type": "application/x-www-form-urlencoded"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            if "elements" not in payload:
                # Throttled mirrors answer fast with an error object instead of data.
                last_err = RuntimeError(f"Overpass mirror gave no data: {str(payload)[:120]}")
                continue
            break
        except Exception as e:
            last_err = e
            continue
    else:
        raise last_err or RuntimeError("Overpass unreachable")

    seen = set()
    results = []
    for el in payload.get("elements", []):
        tags = el.get("tags", {})
        plat, plng = el.get("lat"), el.get("lon")
        if plat is None or plng is None:
            continue
        key = (round(plat, 5), round(plng, 5), tags.get("name"))
        if key in seen:
            continue
        seen.add(key)
        is247, hours_text = _open_status(tags)
        results.append({
            "name": tags.get("name") or f"Unnamed {category} stop",
            "distance_mi": _haversine_mi(lat, lng, plat, plng),
            "lat": plat,
            "lng": plng,
            "is_24_7": is247,
            "hours": hours_text,
            "phone": tags.get("phone"),
        })

    # 24/7 first, then nearest.
    results.sort(key=lambda r: (not r["is_24_7"], r["distance_mi"]))
    return results[:limit]
