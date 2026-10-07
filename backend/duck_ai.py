"""AI-generated flavor for the duck game: duck lore and drop clues.

Both run in background threads with their own DB sessions so slow LLM calls
never block requests. If the LLM is unavailable the fields simply stay null
and the app behaves as before.
"""

import json
import os
import threading
import urllib.request

from models import DuckType, DuckDrop
from llm import generate

# Set in main.py after SessionLocal exists (avoids a circular import).
SessionLocal = None


def _session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


LORE_SYSTEM = (
    "You write playful backstories for collectible rubber ducks in a Jeep "
    "off-roading app called Jtap. Keep it fun, a little rowdy, Jeep-culture "
    "flavored. 2-3 sentences max. No hashtags, no emojis in the text itself."
)

CLUE_SYSTEM = (
    "You write scavenger-hunt clues for a real-world treasure hunt in a Jeep "
    "off-roading app. The clue hints at a nearby landmark or place without "
    "naming the exact spot. Cryptic but solvable, 1-2 sentences. Rarer ducks "
    "get trickier clues. No hashtags, no emojis."
)


def lore_prompt(name: str, rarity: str, emoji: str, seasonal: str | None) -> str:
    season = f" It is a limited seasonal duck for {seasonal}." if seasonal else ""
    return (
        f"Write a backstory for a collectible duck named \"{name}\" {emoji}. "
        f"Its rarity tier is \"{rarity}\" (common < rare < epic < legendary) — "
        f"rarer ducks deserve grander legends.{season}"
    )


def clue_prompt(duck_name: str, rarity: str, place: str | None) -> str:
    where = f"The duck is hidden near: {place}." if place else \
        "The duck is hidden somewhere outdoors nearby."
    difficulty = {
        "common": "Make the clue fairly easy.",
        "rare": "Make the clue moderately tricky.",
        "epic": "Make the clue quite tricky.",
        "legendary": "Make the clue genuinely hard, worthy of a legend.",
    }.get(rarity, "Make the clue moderately tricky.")
    return (
        f"{where} A \"{duck_name}\" duck (rarity: {rarity}) is waiting there. "
        f"Write a scavenger-hunt clue leading a Jeeper to it. {difficulty}"
    )


def reverse_geocode(lat: float, lng: float) -> str | None:
    """Free reverse geocode via Nominatim. Returns a short place description or None."""
    try:
        url = (f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}"
               f"&format=json&zoom=16")
        req = urllib.request.Request(url, headers={"User-Agent": "Jtap/1.0"}, method="GET")
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        addr = data.get("address") or {}
        parts = [addr.get(k) for k in ("leisure", "amenity", "tourism", "shop",
                                       "road", "suburb", "town", "city", "village")]
        parts = [p for p in parts if p]
        return ", ".join(parts[:3]) or data.get("display_name", "").split(",")[0] or None
    except Exception:
        return None


def _run_in_background(fn, *args):
    t = threading.Thread(target=fn, args=args, daemon=True)
    t.start()


def generate_lore_for_duck(duck_id: int, force: bool = False) -> None:
    """Background worker: fill DuckType.lore via the LLM."""
    def work():
        for db in _session():
            dt = db.query(DuckType).filter(DuckType.id == duck_id).first()
            if not dt or (dt.lore and not force):
                return
            text = generate(lore_prompt(dt.name, dt.rarity, dt.emoji, dt.seasonal),
                            system=LORE_SYSTEM, max_tokens=220)
            if text:
                dt.lore = text
                db.commit()
    _run_in_background(work)


def generate_clue_for_drop(drop_id: int, force: bool = False) -> None:
    """Background worker: reverse-geocode then fill DuckDrop.clue via the LLM."""
    def work():
        for db in _session():
            drop = db.query(DuckDrop).filter(DuckDrop.id == drop_id).first()
            if not drop or (drop.clue and not force):
                return
            dt = db.query(DuckType).filter(DuckType.id == drop.duck_type_id).first()
            duck_name = dt.name if dt else "mystery duck"
            rarity = dt.rarity if dt else "common"
            place = reverse_geocode(drop.latitude, drop.longitude)
            text = generate(clue_prompt(duck_name, rarity, place),
                            system=CLUE_SYSTEM, max_tokens=160)
            if text:
                drop.clue = text
                db.commit()
    _run_in_background(work)
