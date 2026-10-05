"""JtapBot: a Jeep-loving chatbot in the app's global chat.

- Posts a scheduled Jeep joke / trail tip / fun fact every few hours
  (JTBOT_POST_HOURS env, default 6).
- Replies when someone @-mentions @JtapBot in global chat (1/min rate limit).
- Everything it posts goes through the profanity filter first.
- Uses the same LLM backend as duck lore (Ollama by default, OpenAI optional).
"""

import os
import random
import secrets
import sqlite3
import threading
import time
from datetime import datetime

import llm
import profanity
from models import User

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
_last_reply_at = 0.0
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
    global BOT_USER_ID
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
    while True:
        time.sleep(POST_INTERVAL_HOURS * 3600)
        try:
            post_scheduled()
        except Exception as e:
            print(f"JtapBot loop error: {e}")


def start():
    """Launch the scheduler thread once. Call once at startup."""
    global _thread_started
    if _thread_started:
        return
    _thread_started = True
    threading.Thread(target=_bot_loop, daemon=True).start()


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
    threading.Thread(target=_reply_worker, args=(message,), daemon=True).start()


def _reply_worker(message):
    try:
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
