"""JtapBot: a Jeep-loving chatbot in the app's global chat.

- Posts a scheduled Jeep joke / trail tip / fun fact every few hours
  (JTBOT_POST_HOURS env, default 6).
- Replies when someone @-mentions @JtapBot in global chat (1/min rate limit).
- Everything it posts goes through the profanity filter first.
- Uses the same LLM backend as duck lore (Ollama by default, OpenAI optional).
"""

import os
import json
import random
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timedelta

import llm
import profanity
import duck_ai
import places
from models import User, DuckType, UserDuck, DuckGive, DuckDrop, PlaceSearch

BOT_EMAIL = "jtapbot@jtap.local"
BOT_NAME = "JtapBot"
BOT_AVATAR_URL = "/bot-assets/jtapbot-avatar.webp"
BOT_COVER_URL = "/bot-assets/jtapbot-cover.webp"
BOT_PROFILE = {
    "vehicleTitle": "The Command Rig",
    "specs": {
        "engine": "Twin-turbo joke engine",
        "wheels": '35" dad-joke radials',
        "interior": "Rubber duck command center",
    },
    "mods": "Joke cannon, trail-tip radar, unlimited duck dispenser. Runs on premium sarcasm and 87 octane.",
    "coverPhoto": BOT_COVER_URL,
}
POST_INTERVAL_HOURS = float(os.environ.get("JTBOT_POST_HOURS", "6"))
REPLY_COOLDOWN_S = 60

BOT_USER_ID = None
_SessionLocal = None
_last_reply_at = 0.0
_post_last = 0.0
_thread_started = False

SYSTEM = (
    "You are JtapBot, a friendly and funny bot in the global chat of a Jeep 4x4 "
    "off-roading app. You love Jeeps, trail riding, mud, and rubber ducks. "
    "Keep every message short (1-3 sentences), family-friendly, with no profanity. "
    "Never give mechanical repair instructions, torque specs, or part numbers; if asked, "
    "say you're just here for the fun stuff and suggest a qualified mechanic."
)

CATEGORIES = [
    "Tell a short, original, family-friendly joke about Jeeps, off-roading, or rubber ducks.",
    "Share one practical beginner-friendly off-roading or trail etiquette tip in one or two sentences.",
    "Share a fun fact about Jeeps, 4x4 history, or rubber ducks in one or two sentences.",
]


def _db_path():
    return os.path.join(os.environ.get("DATA_DIR", "."), "jtap.db")


def init_bot(SessionLocal):
    """Create the bot user if missing; remember its id. Call once at startup."""
    global BOT_USER_ID, _SessionLocal
    _SessionLocal = SessionLocal
    db = SessionLocal()
    try:
        bot = db.query(User).filter(User.email == BOT_EMAIL).first()
        if not bot:
            bot = User(
                email=BOT_EMAIL,
                hashed_password=secrets.token_hex(32),  # never used to log in
                settings={"ownerName": BOT_NAME, **BOT_PROFILE},
                profile_picture_url=BOT_AVATAR_URL,
            )
            db.add(bot)
            db.commit()
            db.refresh(bot)
        else:
            # Fill in the profile, but never overwrite fields Pawel customized.
            settings = dict(bot.settings or {})
            changed = False
            if settings.get("ownerName") != BOT_NAME:
                settings["ownerName"] = BOT_NAME
                changed = True
            for key, value in BOT_PROFILE.items():
                if not settings.get(key):
                    settings[key] = value
                    changed = True
            if changed:
                bot.settings = settings
            if not bot.profile_picture_url:
                bot.profile_picture_url = BOT_AVATAR_URL
                changed = True
            if changed:
                db.commit()
        BOT_USER_ID = bot.id
        print(f"JtapBot ready (user id {BOT_USER_ID}).")
    finally:
        db.close()


def _say(text):
    """Post a bot message to global chat. Returns True if posted."""
    text = (text or "").strip()
    if not text or profanity.find_profanity(text):
        return False
    conn = sqlite3.connect(_db_path())
    try:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                reactions TEXT DEFAULT '{}',
                channel TEXT DEFAULT 'global',
                latitude REAL,
                longitude REAL)"""
        )
        conn.execute(
            "INSERT INTO messages (user_id, message, timestamp, reactions, channel) "
            "VALUES (?, ?, ?, '{}', 'global')",
            (BOT_USER_ID, text, datetime.utcnow()),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def post_scheduled():
    """Generate and post one scheduled message. No-op if the LLM is down."""
    if not llm.is_available():
        return False
    try:
        text = llm.generate(random.choice(CATEGORIES), system=SYSTEM, max_tokens=120)
        return _say(text)
    except Exception as e:
        print(f"JtapBot scheduled post failed: {e}")
        return False


def _bot_loop():
    global _post_last
    while True:
        try:
            now = time.time()
            if now - _post_last >= POST_INTERVAL_HOURS * 3600:
                post_scheduled()
                _post_last = now
            _maybe_bot_drop()
        except Exception as e:
            print(f"JtapBot loop error: {e}")
        time.sleep(3600)  # wake hourly; posts/drops are rate-limited by timestamps


def start():
    """Launch the scheduler thread once. Call once at startup."""
    global _thread_started, _post_last
    if _thread_started:
        return
    _thread_started = True
    _post_last = time.time()  # first scheduled post lands after a full interval
    threading.Thread(target=_bot_loop, daemon=True).start()


# --- JtapBot duck drops -----------------------------------------------------

DROP_INTERVAL_HOURS = 8
DROP_CLUSTER_MILES = 10
DROP_MIN_USERS = 3
DROP_MAX_CLAIMS = 10
DROP_DURATION_HOURS = 24
_M_PER_MILE = 1609.344


def _cluster_location(db):
    """Centroid (+ jitter) of the biggest cluster of >=3 users within 10 miles.

    Returns (lat, lng) or None when no qualifying cluster exists.
    """
    import main  # lazy: main imports jtapbot at module level

    users = (
        db.query(User)
        .filter(User.latitude.isnot(None), User.longitude.isnot(None))
        .all()
    )
    users = [u for u in users if u.id != BOT_USER_ID]
    if len(users) < DROP_MIN_USERS:
        return None
    best = None
    for u in users:
        near = [
            v
            for v in users
            if main.haversine(u.latitude, u.longitude, v.latitude, v.longitude)
            <= DROP_CLUSTER_MILES * _M_PER_MILE
        ]
        if len(near) >= DROP_MIN_USERS and (best is None or len(near) > len(best)):
            best = near
    if not best:
        return None
    lat = sum(u.latitude for u in best) / len(best)
    lng = sum(u.longitude for u in best) / len(best)
    # Small jitter (~0.5 mi) so the pin isn't exactly on someone's house.
    lat += random.uniform(-0.007, 0.007)
    lng += random.uniform(-0.007, 0.007)
    return lat, lng


def _maybe_bot_drop():
    """Create one bot duck drop if 8h passed and a 3+ user cluster exists."""
    import main  # lazy: main imports jtapbot at module level

    if BOT_USER_ID is None or _SessionLocal is None:
        return False
    db = _SessionLocal()
    try:
        since = datetime.utcnow() - timedelta(hours=DROP_INTERVAL_HOURS)
        recent = (
            db.query(DuckDrop)
            .filter(
                DuckDrop.created_by == BOT_USER_ID,
                DuckDrop.created_at >= since,
            )
            .first()
        )
        if recent:
            return False
        loc = _cluster_location(db)
        if not loc:
            return False
        lat, lng = loc
        pool = (
            db.query(DuckType)
            .filter(DuckType.rarity.in_(("common", "uncommon")))
            .order_by(DuckType.id)
            .all()
        )
        if not pool:
            return False
        commons = [d for d in pool if d.rarity == "common"]
        dt = random.choice(commons) if commons and random.random() < 0.7 else random.choice(pool)
        # The bot is a system actor: mint its stock for this drop.
        # Bounded by the 8h creation limit, so this can't inflate the economy.
        main._grant_duck(db, BOT_USER_ID, dt.id, DROP_MAX_CLAIMS)
        now = datetime.utcnow()
        drop = DuckDrop(
            duck_type_id=dt.id,
            latitude=lat,
            longitude=lng,
            radius_m=200.0,
            starts_at=now,
            expires_at=now + timedelta(hours=DROP_DURATION_HOURS),
            max_claims=DROP_MAX_CLAIMS,
            created_by=BOT_USER_ID,
            label=f"JtapBot drop: {dt.name}",
        )
        db.add(drop)
        db.commit()
        db.refresh(drop)
        drop_id = drop.id
        duck_name, duck_emoji = dt.name, dt.emoji or "🦆"
        db.close()
        # AI scavenger-hunt clue fills in shortly (background; drop is live now).
        try:
            duck_ai.generate_clue_for_drop(drop_id)
        except Exception as e:
            print(f"JtapBot clue generation failed: {e}")
        _say(
            f"\U0001F986 JtapBot just hid {DROP_MAX_CLAIMS}x {duck_emoji} {duck_name} "
            "somewhere nearby! Check the map! \U0001F5FA\uFE0F"
        )
        print(f"JtapBot created drop {drop_id} ({duck_name}) at {lat:.4f},{lng:.4f}")
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        try:
            db.close()
        except Exception:
            pass


def maybe_reply(user_id, channel, message):
    """Fire-and-forget @JtapBot reply for global chat messages."""
    global _last_reply_at
    if BOT_USER_ID is None or user_id == BOT_USER_ID:
        return
    if (channel or "global") != "global":
        return
    if "@jtapbot" not in (message or "").lower():
        return
    now = time.time()
    if now - _last_reply_at < REPLY_COOLDOWN_S:
        return
    _last_reply_at = now
    threading.Thread(target=_reply_worker, args=(user_id, message), daemon=True).start()


_DUCK_ASK_WORDS = {"give", "want", "please", "gift", "me", "quack", "need", "send", "drop", "got"}
DUCK_GIFT_COOLDOWN_HOURS = 24


def _wants_duck(message):
    """Does this @JtapBot message ask for a duck?"""
    words = set(re.findall(r"[a-z]+", (message or "").lower()))
    return "duck" in words and bool(words & _DUCK_ASK_WORDS)


def _grant_bot_duck(user_id):
    """Grant a bot duck. Returns (DuckType, 'granted') or (None, reason)."""
    import main  # lazy: main imports jtapbot at module level

    db = _SessionLocal()
    try:
        since = datetime.utcnow() - timedelta(hours=DUCK_GIFT_COOLDOWN_HOURS)
        recent = (
            db.query(DuckGive)
            .filter(
                DuckGive.giver_id == BOT_USER_ID,
                DuckGive.recipient_id == user_id,
                DuckGive.created_at >= since,
            )
            .first()
        )
        if recent:
            return None, "cooldown"

        pool = (
            db.query(DuckType)
            .filter(DuckType.rarity.in_(("common", "uncommon")))
            .order_by(DuckType.id)
            .all()
        )
        if not pool:
            return None, "empty"

        owned = {
            r.duck_type_id
            for r in db.query(UserDuck).filter(UserDuck.user_id == user_id).all()
        }
        candidates = [d for d in pool if d.id not in owned] or pool
        weights = [4 if d.rarity == "common" else 1 for d in candidates]
        dt = random.choices(candidates, weights=weights, k=1)[0]

        main._grant_duck(db, user_id, dt.id, 1)
        db.add(
            DuckGive(
                giver_id=BOT_USER_ID,
                recipient_id=user_id,
                duck_type_id=dt.id,
                note="JtapBot gift",
            )
        )
        recipient = db.query(User).filter(User.id == user_id).first()
        main._bump_legacy_duck_count(db, recipient)
        main._notify_user(
            db,
            user_id,
            "ducked",
            "🦆 JtapBot ducked you!",
            f"JtapBot gifted you a {dt.emoji} {dt.name}",
            {"giver_id": BOT_USER_ID, "duck_type_id": dt.id},
        )
        db.commit()
        main._check_milestones(db, user_id)
        db.commit()
        # Capture display fields before the session closes (dt detaches).
        granted = {"name": dt.name, "emoji": dt.emoji or "🦆"}
        return granted, "granted"
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _reply_worker(user_id, message):
    try:
        # Duck dispensing works even when the LLM is down.
        if _wants_duck(message):
            import main  # lazy: main imports jtapbot at module level

            db = _SessionLocal()
            try:
                name = main._owner_name(db, user_id)
            finally:
                db.close()
            dt, status = _grant_bot_duck(user_id)
            if status == "granted":
                _say(f"\U0001F986 {name} — a wild {dt['emoji']} {dt['name']} waddled into your pond! Quack!")
            elif status == "cooldown":
                _say(
                    f"Easy there, {name}! My duck bag refills every 24 hours. "
                    "Come back tomorrow! \U0001F986"
                )
            return
        # Real place data — never let the LLM guess at gas stations or shops.
        category = _wants_places(message)
        if category:
            _say(_places_reply(user_id, category))
            return
        if not llm.is_available():
            return
        text = llm.generate(
            f'A user in the Jeep 4x4 app global chat said: "{message}". '
            "Reply to them directly as JtapBot.",
            system=SYSTEM,
            max_tokens=120,
        )
        _say(text)
    except Exception as e:
        print(f"JtapBot reply failed: {e}")


# --- JtapBot nearby places --------------------------------------------------

_PLACES_KEYWORDS = {
    "gas": {"gas", "fuel", "diesel"},
    "mechanic": {"mechanic", "repair", "autorepair"},
    "tow": {"tow", "towing"},
    "food": {"food", "restaurant", "restaurants", "eat", "eating", "hungry",
             "pizza", "burger", "burgers", "taco", "tacos", "diner", "breakfast",
             "lunch", "dinner", "sandwich", "bbq"},
}

_PLACES_EMOJI = {"gas": "⛽", "mechanic": "🔧", "tow": "🪝", "food": "🍔"}


def _wants_places(message):
    """Return a places category if the message asks for nearby places."""
    words = set(re.findall(r"[a-z]+", (message or "").lower()))
    for category, keywords in _PLACES_KEYWORDS.items():
        if words & keywords:
            return category
    return None


def _places_reply(user_id, category):
    db = _SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        lat = user.latitude if user else None
        lng = user.longitude if user else None
    finally:
        db.close()
    if lat is None or lng is None:
        return (
            "I don't have your location yet — open the Map tab so the app saves it, "
            "then ask me again! \U0001F5FA\uFE0F"
        )
    try:
        results = places.search_nearby(lat, lng, category)
    except Exception as e:
        print(f"JtapBot places lookup failed: {e}")
        return (
            "Couldn't reach the map data right now — try again in a bit! \U0001F5FA\uFE0F"
        )
    emoji = _PLACES_EMOJI[category]
    label = places.CATEGORY_LABEL[category]
    if not results:
        return f"{emoji} No {label} found within 5 miles of you."
    lines = [f"{emoji} {label.capitalize()} near you:"]
    for r in results:
        line = f"• {r['name']} — {r['distance_mi']:.1f} mi"
        if r["is_24_7"]:
            line += " — open 24 hours"
        elif r["hours"]:
            line += f" — {r['hours']}"
        if r.get("phone"):
            line += f" — {r['phone']}"
        lines.append(line)
    lines.append("24/7 spots listed first — call ahead to confirm hours.")
    # Persist the search so chat can deep-link it onto the map.
    try:
        db = _SessionLocal()
        try:
            ps = PlaceSearch(user_id=user_id, category=category, results=results)
            db.add(ps)
            db.commit()
            db.refresh(ps)
            search_id = ps.id
        finally:
            db.close()
    except Exception as e:
        print(f"JtapBot place-search save failed: {e}")
        search_id = None
    if search_id:
        lines.append(f"[map:{search_id}]")
    return "\n".join(lines)
