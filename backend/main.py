import shutil
import os
import json
import random
import re
import sqlite3
from typing import Optional
from datetime import datetime, timedelta
from uuid import uuid4
from math import radians, cos, sin, asin, sqrt
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Header, BackgroundTasks
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import jwt
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, or_, func
from sqlalchemy.orm import sessionmaker, Session
from passlib.context import CryptContext
from pydantic import BaseModel
from models import Base, User, DuckType, UserDuck, DuckGive, DuckDrop, DropClaim, Trade, UserMilestone, Milestone, PhotoReaction, MarketListing, Notification, Meetup, MeetupRsvp, PlaceSearch, SosRequest, SosResponse
from schemas import UserProfileUpdate, UserProfileResponse, UserCreate
import duck_ai
import profanity
import holiday_ducks
import jtapbot
import fcm_direct

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- File storage (configurable for hosted deploys) ---
# Set DATA_DIR to a persistent volume mount (e.g. /data on Railway/Render/Fly)
# so the SQLite DB and uploads survive restarts. Defaults to the current
# directory, preserving existing local behavior.
DATA_DIR = os.environ.get("DATA_DIR", ".")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "jtap.db")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")

# --- Database Setup ---
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}" 
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
duck_ai.SessionLocal = SessionLocal


def _ensure_duck_ai_columns():
    """Lightweight migration: add duck_types.lore and duck_drops.clue to older DBs."""
    conn = get_raw_db()
    try:
        duck_cols = [r["name"] for r in conn.execute("PRAGMA table_info(duck_types)")]
        if "lore" not in duck_cols:
            conn.execute("ALTER TABLE duck_types ADD COLUMN lore TEXT")
            print("Migration: added duck_types.lore column.")
        drop_cols = [r["name"] for r in conn.execute("PRAGMA table_info(duck_drops)")]
        if "clue" not in drop_cols:
            conn.execute("ALTER TABLE duck_drops ADD COLUMN clue TEXT")
            print("Migration: added duck_drops.clue column.")
        conn.commit()
    finally:
        conn.close()


def _ensure_is_admin_column():
    """Lightweight migration: add users.is_admin to DBs created before the column existed."""
    conn = get_raw_db()
    try:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(users)")]
        if "is_admin" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0")
            conn.commit()
            print("Migration: added users.is_admin column.")
    finally:
        conn.close()


def _ensure_is_banned_column():
    """Lightweight migration: add users.is_banned to DBs created before the column existed."""
    conn = get_raw_db()
    try:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(users)")]
        if "is_banned" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN is_banned BOOLEAN DEFAULT 0")
            conn.commit()
            print("Migration: added users.is_banned column.")
    finally:
        conn.close()


def _ensure_duck_image_column():
    """Lightweight migration: add duck_types.image_url to DBs created before it existed."""
    conn = get_raw_db()
    try:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(duck_types)")]
        if "image_url" not in cols:
            conn.execute("ALTER TABLE duck_types ADD COLUMN image_url TEXT")
            conn.commit()
            print("Migration: added duck_types.image_url column.")
    finally:
        conn.close()


def _ensure_push_token_column():
    """Lightweight migration: add users.push_token to DBs created before the column existed."""
    conn = get_raw_db()
    try:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(users)")]
        if "push_token" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN push_token TEXT")
            conn.commit()
            print("Migration: added users.push_token column.")
    finally:
        conn.close()


def _ensure_fcm_token_column():
    """Lightweight migration: add users.fcm_token for direct FCM delivery."""
    conn = get_raw_db()
    try:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(users)")]
        if "fcm_token" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN fcm_token TEXT")
            conn.commit()
            print("Migration: added users.fcm_token column.")
    finally:
        conn.close()


def _install_duck_sprites():
    """Copy the bundled duck sprite library into the uploads dir.

    Copies files that are missing, and refreshes files whose bundled copy
    is newer (e.g. after the library's backgrounds were made transparent).
    """
    src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "duck_sprites")
    dst = os.path.join(UPLOAD_DIR, "ducks")
    if not os.path.isdir(src):
        return
    count = 0
    for theme in sorted(os.listdir(src)):
        tdir = os.path.join(src, theme)
        if not os.path.isdir(tdir):
            continue
        os.makedirs(os.path.join(dst, theme), exist_ok=True)
        for f in sorted(os.listdir(tdir)):
            if not f.endswith(".png"):
                continue
            src_file = os.path.join(tdir, f)
            target = os.path.join(dst, theme, f)
            if not os.path.exists(target) or os.path.getmtime(src_file) > os.path.getmtime(target):
                shutil.copyfile(src_file, target)
                count += 1
    if count:
        print(f"Installed {count} duck sprite(s) into uploads/ducks.")


def _admin_emails() -> set:
    """Emails granted admin via ADMIN_EMAILS (comma-separated) or the owner default."""
    return {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "glichxp@gmail.com").split(",") if e.strip()}


def _bootstrap_admins():
    """Grant admin to every address in ADMIN_EMAILS (comma-separated, defaults to the owner's email). Runs at startup."""
    emails = _admin_emails()
    if not emails:
        return
    db = SessionLocal()
    try:
        granted = 0
        for u in db.query(User).filter(User.email.in_(emails)).all():
            if not u.is_admin:
                u.is_admin = True
                granted += 1
        if granted:
            db.commit()
            print(f"Admin bootstrap: granted admin to {granted} user(s).")
    finally:
        db.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Raw SQLite helper for chat messages to seamlessly join with user settings
def get_raw_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# Run after get_raw_db exists: migrate old DBs, then grant admins.
_ensure_is_admin_column()
_ensure_is_banned_column()
_ensure_duck_ai_columns()
_ensure_duck_image_column()
_ensure_push_token_column()
_ensure_fcm_token_column()
_install_duck_sprites()
_bootstrap_admins()

# --- Helper Functions ---
def haversine(lat1, lon1, lat2, lon2):
    R = 6371000  # Radius of Earth in meters
    phi1 = radians(lat1)
    phi2 = radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)
    a = sin(dphi / 2)**2 + cos(phi1) * cos(phi2) * sin(dlambda / 2)**2
    return 2 * R * asin(sqrt(a))

class LocationUpdate(BaseModel):
    lat: float
    lng: float

class ChatMessageCreate(BaseModel):
    user_id: int
    message: str
    channel: str = "global"

class ReactionCreate(BaseModel):
    emoji: str # 'duck', 'jeep', or 'wave'

PHOTO_REACTION_EMOJIS = {"like", "duck", "jeep", "wave"}

def _photo_slot_counts(db, owner_id):
    """{slot_str: {emoji: count}} across all of an owner's photo slots."""
    counts = {}
    for idx, emoji in db.query(PhotoReaction.photo_index, PhotoReaction.emoji).filter(
        PhotoReaction.photo_owner_id == owner_id
    ).all():
        slot = str(idx)
        counts.setdefault(slot, {})
        counts[slot][emoji] = counts[slot].get(emoji, 0) + 1
    return counts


# --- App Setup ---
app = FastAPI(title="Jtap Backend")

# Allow web clients / Expo web to call the API (native apps are unaffected by CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
# Bundled bot assets (JtapBot profile photos) ship with the repo, not DATA_DIR.
app.mount("/bot-assets", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "bot_assets")), name="bot-assets")

# --- JWT Auth Setup ---
SECRET_KEY = os.environ.get("JTAP_SECRET_KEY", "jtap-dev-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

if SECRET_KEY == "jtap-dev-secret-change-me":
    print("WARNING: JTAP_SECRET_KEY not set - using insecure dev default. Set the env var in production.")


def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(authorization: str = Header(default=None), db: Session = Depends(get_db)) -> User:
    """Validate the Bearer token and return the logged-in user. Used on protected routes."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization[len("Bearer "):]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if getattr(user, "is_banned", False):
        raise HTTPException(status_code=403, detail="This account has been banned")
    return user


def require_self(user_id: int, current_user: User) -> User:
    """Ensure the logged-in user can only act on their own user id."""
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized for this user")
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Restrict a route to admin users."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


class AuthResponse(UserProfileResponse):
    access_token: str
    token_type: str = "bearer"

# --- Auth Endpoints ---
@app.post("/signup", response_model=AuthResponse)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    normalized_email = user.email.strip().lower()
    
    db_user = db.query(User).filter(User.email == normalized_email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pw = pwd_context.hash(user.password)
    new_user = User(email=normalized_email, hashed_password=hashed_pw,
                    is_admin=normalized_email in _admin_emails())
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    # Starter ducks for the duck game (pre-existing users get them lazily on first pond/inventory fetch)
    _ensure_starter_ducks(db, new_user.id)
    _check_holiday_ducks(db, new_user)
    return AuthResponse(
        id=new_user.id,
        email=new_user.email,
        profile_picture_url=new_user.profile_picture_url,
        settings=new_user.settings,
        is_admin=new_user.is_admin,
        access_token=create_access_token(new_user.id),
    )

@app.post("/login", response_model=AuthResponse)
def login(user_credentials: UserCreate, db: Session = Depends(get_db)):
    normalized_email = user_credentials.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()
    
    if not user or not pwd_context.verify(user_credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if getattr(user, "is_banned", False):
        raise HTTPException(status_code=403, detail="This account has been banned")

    _check_holiday_ducks(db, user)

    return AuthResponse(
        id=user.id,
        email=user.email,
        profile_picture_url=user.profile_picture_url,
        settings=user.settings,
        is_admin=user.is_admin,
        access_token=create_access_token(user.id),
    )

# --- Profile Endpoints ---
@app.get("/users/{user_id}/profile", response_model=UserProfileResponse)
def get_profile(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def _require_clean_profile_settings(settings: dict) -> None:
    """Profanity check on the free-text fields of a profile settings payload."""
    if not isinstance(settings, dict):
        return
    texts = []
    for key in ("ownerName", "vehicleTitle", "mods"):
        if settings.get(key):
            texts.append(settings[key])
    specs = settings.get("specs")
    if isinstance(specs, dict):
        texts.extend(v for v in specs.values() if isinstance(v, str) and v)
    links = settings.get("socialLinks")
    if isinstance(links, list):
        texts.extend(l.get("url") for l in links
                     if isinstance(l, dict) and l.get("url"))
    _require_clean(*texts)


_SOCIAL_DOMAINS = {
    "instagram": ("instagram.com",),
    "facebook": ("facebook.com", "fb.com"),
    "tiktok": ("tiktok.com",),
    "youtube": ("youtube.com", "youtu.be"),
    "x": ("x.com", "twitter.com"),
    "reddit": ("reddit.com",),
    "threads": ("threads.com", "threads.net"),
    "website": None,  # any domain
}


def _valid_social_url(platform: str, url: str) -> bool:
    """The URL must be well-formed and, except for Website, on the platform's domain."""
    from urllib.parse import urlparse
    u = (url or "").strip()
    if not u or " " in u:
        return False
    if not u.lower().startswith(("http://", "https://")):
        u = "https://" + u
    try:
        host = (urlparse(u).hostname or "").lower()
    except Exception:
        return False
    if "." not in host:
        return False
    domains = _SOCIAL_DOMAINS.get(platform)
    if domains is None:
        return True
    return any(host == d or host.endswith("." + d) for d in domains)


@app.patch("/users/{user_id}/profile", response_model=UserProfileResponse)
def update_profile(user_id: int, profile_data: UserProfileUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_self(user_id, current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if profile_data.settings is not None:
        _require_clean_profile_settings(profile_data.settings)
        links = profile_data.settings.get("socialLinks") if isinstance(profile_data.settings, dict) else None
        if isinstance(links, list):
            for l in links:
                if isinstance(l, dict) and not _valid_social_url(l.get("platform"), l.get("url")):
                    raise HTTPException(status_code=400, detail="One of your social links isn't a valid URL for its platform.")
        name = profile_data.settings.get("ownerName") if isinstance(profile_data.settings, dict) else None
        if isinstance(name, str) and len(name) > 30:
            raise HTTPException(status_code=400, detail="Name must be 30 characters or fewer.")
        title = profile_data.settings.get("vehicleTitle") if isinstance(profile_data.settings, dict) else None
        if isinstance(title, str) and len(title) > 30:
            raise HTTPException(status_code=400, detail="Vehicle title must be 30 characters or fewer.")
        specs = profile_data.settings.get("specs") if isinstance(profile_data.settings, dict) else None
        if isinstance(specs, dict):
            for v in specs.values():
                if isinstance(v, str) and len(v) > 30:
                    raise HTTPException(status_code=400, detail="Spec values must be 30 characters or fewer.")
        mods = profile_data.settings.get("mods") if isinstance(profile_data.settings, dict) else None
        if isinstance(mods, str) and re.search(r"(.)\1{5,}", mods):
            raise HTTPException(status_code=400, detail="Mods can't repeat the same character more than 5 times in a row.")
        if isinstance(mods, str) and len(mods) > 500:
            raise HTTPException(status_code=400, detail="Mods must be 500 characters or fewer.")
        # Merge, don't replace: the app only sends the fields it edits, and
        # server-managed keys (duckCount, ...) must survive a profile save.
        merged = dict(user.settings or {})
        merged.update(profile_data.settings)
        user.settings = merged
    db.commit()
    db.refresh(user)
    return user

# --- Photo likes & reactions ---
@app.get("/users/{user_id}/photos/reactions")
def get_photo_reactions(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    owner = db.query(User).filter(User.id == user_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="User not found")
    mine = {}
    for idx, emoji in db.query(PhotoReaction.photo_index, PhotoReaction.emoji).filter(
        PhotoReaction.photo_owner_id == user_id,
        PhotoReaction.user_id == current_user.id
    ).all():
        mine.setdefault(str(idx), []).append(emoji)
    return {"counts": _photo_slot_counts(db, user_id), "mine": mine}

@app.post("/users/{user_id}/photos/{photo_index}/react")
def react_to_photo(user_id: int, photo_index: int, reaction: ReactionCreate,
                   db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if reaction.emoji not in PHOTO_REACTION_EMOJIS:
        raise HTTPException(status_code=400, detail="Invalid emoji")
    if photo_index < 0 or photo_index > 3:
        raise HTTPException(status_code=400, detail="Invalid photo index")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't react to your own photos")
    owner = db.query(User).filter(User.id == user_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="User not found")
    photos = (owner.settings or {}).get("photos") or []
    if photo_index >= len(photos) or not photos[photo_index]:
        raise HTTPException(status_code=404, detail="Photo not found")

    existing = db.query(PhotoReaction).filter(
        PhotoReaction.photo_owner_id == user_id,
        PhotoReaction.photo_index == photo_index,
        PhotoReaction.user_id == current_user.id,
        PhotoReaction.emoji == reaction.emoji
    ).first()
    if existing:
        db.delete(existing)
        status = "removed"
    else:
        db.add(PhotoReaction(photo_owner_id=user_id, photo_index=photo_index,
                             user_id=current_user.id, emoji=reaction.emoji))
        status = "reacted"
    db.commit()

    counts = {}
    for (emoji,) in db.query(PhotoReaction.emoji).filter(
        PhotoReaction.photo_owner_id == user_id,
        PhotoReaction.photo_index == photo_index
    ).all():
        counts[emoji] = counts.get(emoji, 0) + 1
    mine = [emoji for (emoji,) in db.query(PhotoReaction.emoji).filter(
        PhotoReaction.photo_owner_id == user_id,
        PhotoReaction.photo_index == photo_index,
        PhotoReaction.user_id == current_user.id
    ).all()]
    done = _check_milestones(db, current_user.id) if status == "reacted" else []
    return {"status": status, "counts": counts, "mine": mine, "milestones_completed": done}


@app.post("/users/{user_id}/profile-picture")
def upload_profile_picture(user_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_self(user_id, current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    os.makedirs(os.path.join(UPLOAD_DIR, "profiles"), exist_ok=True)

    file_extension = file.filename.split(".")[-1]
    unique_filename = f"user_{user_id}_{uuid4().hex}.{file_extension}"
    file_location = os.path.join(UPLOAD_DIR, "profiles", unique_filename)
    
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)
        
    user.profile_picture_url = f"/uploads/profiles/{unique_filename}"
    db.commit()
    
    return {"message": "Profile picture updated", "url": user.profile_picture_url}

@app.post("/users/{user_id}/duck")
def duck_user_rig(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Legacy one-tap duck: gives a classic yellow duck, spending it from the giver's inventory."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't duck yourself")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    _ensure_starter_ducks(db, current_user.id)
    classic = db.query(DuckType).filter(DuckType.slug == STARTER_DUCK_SLUG).first()
    _spend_duck(db, current_user.id, classic.id, 1)
    _grant_duck(db, user.id, classic.id, 1)
    db.add(DuckGive(giver_id=current_user.id, recipient_id=user.id, duck_type_id=classic.id))
    _bump_legacy_duck_count(db, user)
    db.commit()
    db.refresh(user)
    done = _check_milestones(db, current_user.id) + _check_milestones(db, user.id)

    return {"message": "Rig ducked successfully!", "duckCount": (user.settings or {}).get("duckCount", 0),
            "milestones_completed": done}

@app.get("/users", response_model=list[UserProfileResponse])
def get_all_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    users = db.query(User).all()
    return users

@app.get("/users/count")
def get_user_count(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Count of real members (excludes banned users and JtapBot)."""
    count = db.query(User).filter(
        (User.is_banned == False) | (User.is_banned == None),
        User.email != jtapbot.BOT_EMAIL,
    ).count()
    return {"count": count}

# --- Location & Map Endpoints ---
@app.put("/users/{user_id}/location")
def update_location(user_id: int, location: LocationUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_self(user_id, current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.latitude = location.lat
    user.longitude = location.lng
    db.commit()
    return {"message": "Location updated successfully"}

@app.get("/users/nearby")
def get_nearby_users(lat: float, lng: float, radiusInMeters: float = 8000, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    users = db.query(User).filter(
        User.latitude.isnot(None), 
        User.longitude.isnot(None)
    ).all()
    
    nearby_users = []
    for user in users:
        distance = haversine(lat, lng, user.latitude, user.longitude)
        if distance <= radiusInMeters:
            nearby_users.append({
                "id": user.id,
                "email": user.email, 
                "latitude": user.latitude,
                "longitude": user.longitude,
                "distance_meters": distance,
                "settings": user.settings,
                "profile_picture_url": user.profile_picture_url
            })
            
    return nearby_users

@app.get("/users/search")
def search_users(q: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Find any registered user by name or rig title.

    Privacy: never returns locations or emails, and skips users who opted out
    via settings.discoverable = false.
    """
    q = (q or "").strip().lower()
    if len(q) < 2:
        return []
    results = []
    for user in db.query(User).filter(User.id != current_user.id).all():
        settings = user.settings or {}
        if settings.get("discoverable") is False:
            continue
        owner = (settings.get("ownerName") or "").lower()
        vehicle = (settings.get("vehicleTitle") or "").lower()
        if q in owner or q in vehicle:
            results.append({
                "id": user.id,
                "settings": user.settings,
                "profile_picture_url": user.profile_picture_url,
            })
        if len(results) >= 20:
            break
    return results

# --- Chat & Reaction Endpoints ---
@app.get("/chat")
def get_chat_messages(channel: str = "global", lat: float = None, lng: float = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    channel = (channel or "global").strip() or "global"
    if channel.startswith(jtapbot.BOT_DM_PREFIX) and not jtapbot.is_bot_dm(channel, current_user.id):
        raise HTTPException(status_code=403, detail="Not your bot chat")
    conn = get_raw_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            reactions TEXT DEFAULT '{}',
            channel TEXT DEFAULT 'global',
            latitude REAL,
            longitude REAL
        )
    ''')
    
    for col_def in [
        ("reactions", "TEXT DEFAULT '{}'"),
        ("channel", "TEXT DEFAULT 'global'"),
        ("latitude", "REAL"),
        ("longitude", "REAL")
    ]:
        try:
            cursor.execute(f"ALTER TABLE messages ADD COLUMN {col_def[0]} {col_def[1]}")
            conn.commit()
        except sqlite3.OperationalError:
            pass
    
    cursor.execute('''
        SELECT m.id, m.user_id, m.message, m.timestamp, m.reactions, m.channel, m.latitude, m.longitude, u.settings 
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.channel = ?
        ORDER BY m.timestamp ASC
        LIMIT 100
    ''', (channel,))
    rows = cursor.fetchall()
    conn.close()
    
    messages = []
    for row in rows:
        msg_distance = None
        if lat is not None and lng is not None and row["latitude"] is not None and row["longitude"] is not None:
            msg_distance = haversine(lat, lng, row["latitude"], row["longitude"])
        if channel == "local" and lat is not None and lng is not None:
            if msg_distance is None:
                continue
            if msg_distance > 16093.4:
                continue

        owner_name = "Fellow Jeeper"
        if row["settings"]:
            try:
                settings_dict = json.loads(row["settings"])
                owner_name = settings_dict.get("ownerName", "Fellow Jeeper")
            except:
                pass
                
        try:
            reactions_dict = json.loads(row["reactions"] or "{}")
        except:
            reactions_dict = {}
                
        messages.append({
            "id": row["id"],
            "user_id": row["user_id"],
            "owner_name": owner_name,
            "message": row["message"],
            "timestamp": row["timestamp"],
            "reactions": reactions_dict,
            "channel": row["channel"],
            **({"distance_mi": round(msg_distance / 1609.34, 1)} if msg_distance is not None else {}),
        })
        
    return messages

@app.post("/chat")
def post_chat_message(chat: ChatMessageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if chat.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot post as another user")
    channel = (chat.channel or "global").strip() or "global"
    if len(chat.message) > 254:
        raise HTTPException(status_code=400, detail="Messages must be 254 characters or fewer.")
    if channel == "global":
        # Content checks (no DB needed).
        if re.search(r"https?://|www\.", chat.message, re.IGNORECASE):
            raise HTTPException(status_code=400, detail="Links aren't allowed in global chat.")
        if re.search(r"(.)\1{5,}", chat.message):
            raise HTTPException(status_code=400, detail="Messages can't repeat the same character more than 5 times in a row.")
        _require_clean(chat.message)
    if channel.startswith(jtapbot.BOT_DM_PREFIX) and not jtapbot.is_bot_dm(channel, current_user.id):
        raise HTTPException(status_code=403, detail="Not your bot chat")
    conn = get_raw_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            reactions TEXT DEFAULT '{}',
            channel TEXT DEFAULT 'global',
            latitude REAL,
            longitude REAL
        )
    ''')
    
    try:
        cursor.execute("ALTER TABLE messages ADD COLUMN reactions TEXT DEFAULT '{}'")
        cursor.execute("ALTER TABLE messages ADD COLUMN channel TEXT DEFAULT 'global'")
        cursor.execute("ALTER TABLE messages ADD COLUMN latitude REAL")
        cursor.execute("ALTER TABLE messages ADD COLUMN longitude REAL")
        conn.commit()
    except sqlite3.OperationalError:
        pass
    
    user = db.query(User).filter(User.id == chat.user_id).first()
    sender_lat = user.latitude if user else None
    sender_lng = user.longitude if user else None

    # Global chat anti-spam: a user may send at most 3 messages in a row. Only a
    # real human message resets the streak — JtapBot posts don't count.
    if channel == "global":
        # Slow mode: 30 seconds between messages.
        cursor.execute(
            "SELECT COUNT(*) FROM messages WHERE channel = 'global' AND user_id = ? "
            "AND timestamp > datetime('now', '-30 seconds')",
            (current_user.id,),
        )
        if cursor.fetchone()[0]:
            conn.close()
            raise HTTPException(status_code=429, detail="Slow down — wait 30 seconds between messages in global chat.")
        # No duplicate messages within 5 minutes.
        cursor.execute(
            "SELECT COUNT(*) FROM messages WHERE channel = 'global' AND user_id = ? "
            "AND message = ? AND timestamp > datetime('now', '-5 minutes')",
            (current_user.id, chat.message),
        )
        if cursor.fetchone()[0]:
            conn.close()
            raise HTTPException(status_code=400, detail="You already sent that message — say something new.")
        bot_user = db.query(User).filter(User.email == jtapbot.BOT_EMAIL).first()
        bot_id = bot_user.id if bot_user else -1
        cursor.execute(
            "SELECT user_id FROM messages WHERE channel = 'global' ORDER BY id DESC LIMIT 10"
        )
        recent_human = [r[0] for r in cursor.fetchall() if r[0] != bot_id][:3]
        if len(recent_human) == 3 and all(uid == current_user.id for uid in recent_human):
            conn.close()
            raise HTTPException(
                status_code=429,
                detail="You've sent 3 messages in a row — let someone else jump in before you send again."
            )

    cursor.execute(
        "INSERT INTO messages (user_id, message, timestamp, reactions, channel, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (chat.user_id, chat.message, datetime.utcnow(), "{}", channel, sender_lat, sender_lng)
    )
    conn.commit()
    msg_id = cursor.lastrowid
    conn.close()

    # JtapBot replies when @-mentioned in global chat, or to anything in a bot DM (fire-and-forget).
    try:
        jtapbot.maybe_reply(chat.user_id, channel, chat.message)
    except Exception as e:
        print(f"JtapBot mention hook failed: {e}")

    return {"id": msg_id, "status": "success"}

@app.post("/chat/{message_id}/react")
def react_to_message(message_id: int, reaction: ReactionCreate, current_user: User = Depends(get_current_user)):
    conn = get_raw_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT reactions FROM messages WHERE id = ?", (message_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Message not found")
        
    try:
        reactions_dict = json.loads(row["reactions"] or "{}")
    except:
        reactions_dict = {}
        
    emoji_key = reaction.emoji
    reactions_dict[emoji_key] = reactions_dict.get(emoji_key, 0) + 1
    
    cursor.execute(
        "UPDATE messages SET reactions = ? WHERE id = ?",
        (json.dumps(reactions_dict), message_id)
    )
    conn.commit()
    conn.close()
    
    return {"status": "success", "reactions": reactions_dict}
# ================= Duck Game =================
# Pond (permanent collection) + spendable inventory + drops + trading.
# All tables are created by Base.metadata.create_all at startup, so a
# server restart is the only deploy step needed.

DUCK_CATALOG = [
    {"slug": "classic_yellow", "name": "Classic Duck", "rarity": "common", "emoji": "🐤",
     "description": "The original. Every Jeeper starts here.", "seasonal": None,
     "image_url": "/uploads/ducks/classic/classic-plain.png"},
    {"slug": "mud_duck", "name": "Mud Duck", "rarity": "common", "emoji": "🦆",
     "description": "Fresh from the pit.", "seasonal": None,
     "image_url": "/uploads/ducks/classic/classic-mud.png"},
    {"slug": "golden_duck", "name": "Golden Duck", "rarity": "rare", "emoji": "🐥",
     "description": "24-karat trail bling.", "seasonal": None,
     "image_url": "/uploads/ducks/classic/classic-07.png"},
    {"slug": "glow_duck", "name": "Glow Duck", "rarity": "rare", "emoji": "✨",
     "description": "Charges by day, glows by night.", "seasonal": None,
     "image_url": "/uploads/ducks/classic/classic-08.png"},
    {"slug": "frost_duck", "name": "Frost Duck", "rarity": "rare", "emoji": "❄️",
     "description": "Only drops in the cold months.", "seasonal": "winter",
     "image_url": "/uploads/ducks/holidays/holidays-12.png"},
    {"slug": "black_gold", "name": "Black & Gold Duck", "rarity": "epic", "emoji": "🖤",
     "description": "Matches the app. Obviously the best one.", "seasonal": None,
     "image_url": "/uploads/ducks/classic/classic-20.png"},
    {"slug": "camo_duck", "name": "Camo Duck", "rarity": "epic", "emoji": "🪖",
     "description": "You didn't see it. That's the point.", "seasonal": None,
     "image_url": "/uploads/ducks/classic/classic-03.png"},
    {"slug": "diamond_duck", "name": "Diamond Duck", "rarity": "legendary", "emoji": "💎",
     "description": "One in a thousand.", "seasonal": None,
     "image_url": "/uploads/ducks/classic/classic-18.png"},
    {"slug": "spooky_duck", "name": "Spooky Duck", "rarity": "legendary", "emoji": "🎃",
     "description": "Only drops in October.", "seasonal": "halloween",
     "image_url": "/uploads/ducks/horror/horror-10.png"},
    # --- World holiday ducks (one sprite per holiday shared by 20+ countries) ---
    {"slug": "holiday_new_year", "name": "New Year Duck", "rarity": "common", "emoji": "🎉",
     "description": "First to the trailhead every January 1st.", "seasonal": None,
     "image_url": "/uploads/ducks/world/world-01.png"},
    {"slug": "holiday_christmas", "name": "Christmas Duck", "rarity": "common", "emoji": "🎄",
     "description": "Delivers presents to good Jeepers.", "seasonal": "christmas",
     "image_url": "/uploads/ducks/world/world-02.png"},
    {"slug": "holiday_good_friday", "name": "Good Friday Duck", "rarity": "rare", "emoji": "✝️",
     "description": "Quiet, humble, and steady on the trail.", "seasonal": "easter",
     "image_url": "/uploads/ducks/world/world-03.png"},
    {"slug": "holiday_workers_day", "name": "Workers' Day Duck", "rarity": "common", "emoji": "🔨",
     "description": "Built the trail so you can run it.", "seasonal": None,
     "image_url": "/uploads/ducks/world/world-04.png"},
    {"slug": "holiday_easter", "name": "Easter Duck", "rarity": "rare", "emoji": "🥚",
     "description": "Painted for the spring egg hunt.", "seasonal": "easter",
     "image_url": "/uploads/ducks/world/world-05.png"},
    {"slug": "holiday_eid_fitr", "name": "Eid al-Fitr Duck", "rarity": "rare", "emoji": "🌙",
     "description": "Lights a lantern at the end of Ramadan.", "seasonal": None,
     "image_url": "/uploads/ducks/world/world-06.png"},
    {"slug": "holiday_eid_adha", "name": "Eid al-Adha Duck", "rarity": "rare", "emoji": "🐑",
     "description": "Brings a sheep along for the festival.", "seasonal": None,
     "image_url": "/uploads/ducks/world/world-07.png"},
    {"slug": "holiday_boxing_day", "name": "Boxing Day Duck", "rarity": "rare", "emoji": "🎁",
     "description": "Stands guard over the gift boxes.", "seasonal": "christmas",
     "image_url": "/uploads/ducks/world/world-08.png"},
    {"slug": "holiday_assumption", "name": "Assumption Duck", "rarity": "rare", "emoji": "👼",
     "description": "Serene as a mid-August morning.", "seasonal": None,
     "image_url": "/uploads/ducks/world/world-09.png"},
    {"slug": "holiday_all_saints", "name": "All Saints' Duck", "rarity": "rare", "emoji": "🕯️",
     "description": "Keeps a candle lit for every saint.", "seasonal": None,
     "image_url": "/uploads/ducks/world/world-10.png"},
    {"slug": "holiday_mawlid", "name": "Mawlid Duck", "rarity": "epic", "emoji": "🕌",
     "description": "Celebrates in green and gold.", "seasonal": None,
     "image_url": "/uploads/ducks/world/world-11.png"},
    {"slug": "holiday_womens_day", "name": "Women's Day Duck", "rarity": "epic", "emoji": "♀️",
     "description": "Runs point on March 8th.", "seasonal": None,
     "image_url": "/uploads/ducks/world/world-12.png"},
    {"slug": "holiday_ascension", "name": "Ascension Duck", "rarity": "epic", "emoji": "🕊️",
     "description": "Rises above the clouds.", "seasonal": None,
     "image_url": "/uploads/ducks/world/world-13.png"},
    {"slug": "holiday_whit_monday", "name": "Whit Monday Duck", "rarity": "epic", "emoji": "🔥",
     "description": "Carries the Pentecost flame.", "seasonal": None,
     "image_url": "/uploads/ducks/world/world-14.png"},
    {"slug": "holiday_hijri_new_year", "name": "Hijri New Year Duck", "rarity": "legendary", "emoji": "🌟",
     "description": "Navigates by crescent and stars.", "seasonal": None,
     "image_url": "/uploads/ducks/world/world-15.png"},
    {"slug": "holiday_easter_sunday", "name": "Easter Sunday Duck", "rarity": "legendary", "emoji": "🌅",
     "description": "Blooms at sunrise.", "seasonal": "easter",
     "image_url": "/uploads/ducks/world/world-16.png"},
]

STARTER_DUCK_SLUG = "classic_yellow"
STARTER_DUCK_TOTAL = 10
TRADE_EXPIRY_HOURS = 48
MAX_ACTIVE_DROPS_PER_USER = 3


def seed_duck_types():
    db = SessionLocal()
    try:
        new_ids = []
        for d in DUCK_CATALOG:
            existing = db.query(DuckType).filter(DuckType.slug == d["slug"]).first()
            if not existing:
                dt = DuckType(**d)
                db.add(dt)
                db.flush()
                new_ids.append(dt.id)
            elif not existing.image_url and d.get("image_url"):
                # Backfill sprites for ducks seeded before image_url existed.
                existing.image_url = d["image_url"]
        if new_ids:
            db.commit()
            print(f"Seeded {len(new_ids)} new duck type(s).")
        else:
            db.commit()
    finally:
        # AI lore for newcomers (background; no-op if the LLM is unreachable).
        for duck_id in new_ids:
            duck_ai.generate_lore_for_duck(duck_id)
        db.close()


seed_duck_types()

# JtapBot: global-chat bot user + scheduled Jeep jokes/tips.
jtapbot.init_bot(SessionLocal)
jtapbot.start()


@app.get("/places/searches/{search_id}")
def get_place_search(search_id: int, db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    """Fetch a JtapBot nearby-places answer so chat can pin it on the map."""
    s = db.query(PlaceSearch).filter(PlaceSearch.id == search_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Search not found")
    return {"id": s.id, "category": s.category, "results": s.results or []}


def _duck_type_or_404(db: Session, duck_type_id: int) -> DuckType:
    dt = db.query(DuckType).filter(DuckType.id == duck_type_id).first()
    if not dt:
        raise HTTPException(status_code=404, detail="Duck type not found")
    return dt


def _duck_type_dict(dt: DuckType) -> dict:
    return {"id": dt.id, "slug": dt.slug, "name": dt.name, "rarity": dt.rarity,
            "emoji": dt.emoji, "description": dt.description, "lore": dt.lore,
            "seasonal": dt.seasonal, "image_url": dt.image_url}


def _owner_name(db: Session, user_id: int) -> str:
    user = db.query(User).filter(User.id == user_id).first()
    if user and user.settings:
        try:
            return (user.settings or {}).get("ownerName") or "Fellow Jeeper"
        except Exception:
            pass
    return "Fellow Jeeper"


# --- Milestone rewards ---
# One-time milestones that mint ducks from controlled rarity pools.
# `counter` maps to a progress query below; collection milestones count pond unlocks.
MILESTONES = [
    {"key": "give_5", "track": "Activity", "name": "Duck Giver",
     "description": "Give 5 ducks to fellow Jeepers", "target": 5,
     "counter": "ducks_given", "reward_pool": ["rare"]},
    {"key": "drops_claimed_5", "track": "Activity", "name": "Treasure Hunter",
     "description": "Claim 5 location drops", "target": 5,
     "counter": "drops_claimed", "reward_pool": ["common", "rare"]},
    {"key": "drops_created_3", "track": "Activity", "name": "Drop Master",
     "description": "Create 3 location drops", "target": 3,
     "counter": "drops_created", "reward_pool": ["common", "rare"]},
    {"key": "trades_done_3", "track": "Activity", "name": "Wheeler Dealer",
     "description": "Complete 3 trades", "target": 3,
     "counter": "trades_completed", "reward_pool": ["rare"]},
    {"key": "photo_react_1", "track": "Activity", "name": "First Like",
     "description": "React to a photo on another Jeeper's profile", "target": 1,
     "counter": "photo_reactions", "reward_pool": ["common"]},
    {"key": "photo_react_5", "track": "Activity", "name": "Photo Fan",
     "description": "React to 5 photos", "target": 5,
     "counter": "photo_reactions", "reward_pool": ["common", "rare"]},
    {"key": "photo_react_10", "track": "Activity", "name": "Hype Squad",
     "description": "React to 10 photos", "target": 10,
     "counter": "photo_reactions", "reward_pool": ["rare"]},
    {"key": "pond_3", "track": "Collection", "name": "Pond Starter",
     "description": "Unlock 3 ducks in your pond", "target": 3,
     "counter": "pond_unlocked", "reward_pool": ["rare"], "prefer_unowned": True},
    {"key": "pond_6", "track": "Collection", "name": "Pond Pro",
     "description": "Unlock 6 ducks in your pond", "target": 6,
     "counter": "pond_unlocked", "reward_pool": ["epic"], "prefer_unowned": True},
    {"key": "pond_9", "track": "Collection", "name": "Diamond Pond",
     "description": "Unlock 10 different ducks in your pond", "target": 10,
     "counter": "pond_unlocked", "reward_slug": "diamond_duck"},
]


# Counters usable by admin-created milestones (same queries as _milestone_progress).
MILESTONE_COUNTERS = {
    "ducks_given": "Ducks given to others",
    "drops_claimed": "Location drops claimed",
    "drops_created": "Location drops created",
    "trades_completed": "Trades completed",
    "pond_unlocked": "Different ducks in pond",
    "photo_reactions": "Photo reactions given",
}


def _db_milestone_dict(row: Milestone) -> dict:
    """Convert an admin-created Milestone row to the milestone dict format."""
    d = {
        "key": f"custom_{row.id}",
        "track": row.track,
        "name": row.name,
        "description": row.description or "",
        "target": row.target,
        "counter": row.counter,
    }
    if row.reward_slug:
        d["reward_slug"] = row.reward_slug
    else:
        try:
            pool = json.loads(row.reward_pool) if row.reward_pool else []
        except Exception:
            pool = []
        d["reward_pool"] = [r for r in pool if r in DUCK_RARITIES] or ["common"]
    if row.prefer_unowned:
        d["prefer_unowned"] = True
    return d


def _all_milestones(db: Session) -> list:
    """Built-in milestones plus admin-created ones."""
    return MILESTONES + [
        _db_milestone_dict(r) for r in db.query(Milestone).order_by(Milestone.id).all()
    ]


def _milestone_progress(db: Session, user_id: int, m: dict) -> int:
    c = m["counter"]
    if c == "ducks_given":
        return db.query(DuckGive).filter(DuckGive.giver_id == user_id).count()
    if c == "drops_claimed":
        return db.query(DropClaim).filter(DropClaim.user_id == user_id).count()
    if c == "drops_created":
        return db.query(DuckDrop).filter(DuckDrop.created_by == user_id).count()
    if c == "trades_completed":
        return db.query(Trade).filter(
            Trade.status == "accepted",
            or_(Trade.proposer_id == user_id, Trade.recipient_id == user_id)).count()
    if c == "pond_unlocked":
        return db.query(UserDuck).filter(UserDuck.user_id == user_id).count()
    if c == "photo_reactions":
        return db.query(PhotoReaction).filter(PhotoReaction.user_id == user_id).count()
    return 0


def _photo_reaction_tiers(db: Session, user_id: int) -> list:
    """Repeating milestones: a duck reward every 20 photo reactions (20, 40, 60, ...).

    Generates tiers up to the user's current count plus the next upcoming tier,
    so the Rewards tab can show progress toward it. Claimed tiers are recorded
    as one-time UserMilestone rows (keyed photo_react_<n>), so toggling a
    reaction off and on can't re-grant a tier.
    """
    count = db.query(PhotoReaction).filter(PhotoReaction.user_id == user_id).count()
    tiers = []
    n = 20
    while n <= count + 20:
        tiers.append({
            "key": f"photo_react_{n}",
            "track": "Activity",
            "name": "Photo Legend",
            "description": f"React to {n} photos",
            "target": n,
            "counter": "photo_reactions",
            "reward_pool": ["rare"],
        })
        n += 20
    return tiers


def _milestone_reward_duck(db: Session, user_id: int, m: dict):
    """Pick the duck this milestone grants. None if the pool is empty."""
    if m.get("reward_slug"):
        return db.query(DuckType).filter(DuckType.slug == m["reward_slug"]).first()
    pool = db.query(DuckType).filter(
        DuckType.rarity.in_(m["reward_pool"]),
        DuckType.seasonal.is_(None)).order_by(DuckType.id).all()
    if not pool:
        return None
    if m.get("prefer_unowned"):
        owned_ids = {r.duck_type_id for r in
                     db.query(UserDuck).filter(UserDuck.user_id == user_id).all()}
        unowned = [d for d in pool if d.id not in owned_ids]
        if unowned:
            pool = unowned
    return random.choice(pool)


def _milestone_reward_text(db: Session, m: dict) -> str:
    if m.get("reward_slug"):
        dt = db.query(DuckType).filter(DuckType.slug == m["reward_slug"]).first()
        return f"{dt.name} {dt.emoji}" if dt else "Special duck"
    return "Random " + " or ".join(m["reward_pool"]) + " duck"


def _milestone_dict(db: Session, m: dict) -> dict:
    return {"key": m["key"], "track": m["track"], "name": m["name"],
            "description": m["description"], "target": m["target"],
            "reward": _milestone_reward_text(db, m)}


def _check_milestones(db: Session, user_id: int) -> list:
    """Grant every newly-completed milestone for the user (loops for cascades).

    Called after the triggering action's commit, so progress queries see the
    latest state. Each grant commits separately; returns
    [{"milestone": {...}, "duck": {...}}] for the response payload.
    """
    completed = []
    skipped = set()  # milestones with an empty reward pool (defensive)
    while True:
        claimed_keys = {r.key for r in
                        db.query(UserMilestone).filter(UserMilestone.user_id == user_id).all()}
        found = False
        for m in _all_milestones(db) + _photo_reaction_tiers(db, user_id):
            if m["key"] in claimed_keys or m["key"] in skipped:
                continue
            if _milestone_progress(db, user_id, m) < m["target"]:
                continue
            dt = _milestone_reward_duck(db, user_id, m)
            if not dt:
                skipped.add(m["key"])
                continue
            _grant_duck(db, user_id, dt.id, 1)
            db.add(UserMilestone(user_id=user_id, key=m["key"]))
            db.commit()
            completed.append({"milestone": _milestone_dict(db, m), "duck": _duck_type_dict(dt)})
            found = True
        if not found:
            break
    return completed


def _ensure_starter_ducks(db: Session, user_id: int):
    """Grant STARTER_DUCK_TOTAL common ducks once, spread across common types.

    Fires only if the user has no user_ducks rows at all."""
    if db.query(UserDuck).filter(UserDuck.user_id == user_id).count() == 0:
        commons = db.query(DuckType).filter(DuckType.rarity == "common").order_by(DuckType.id).all()
        if commons:
            now = datetime.utcnow()
            per, rem = divmod(STARTER_DUCK_TOTAL, len(commons))
            for i, dt in enumerate(commons):
                qty = per + (1 if i < rem else 0)
                if qty:
                    db.add(UserDuck(user_id=user_id, duck_type_id=dt.id,
                                    count=qty, first_received_at=now))
            db.commit()


def _grant_duck(db: Session, user_id: int, duck_type_id: int, qty: int = 1):
    row = db.query(UserDuck).filter(
        UserDuck.user_id == user_id, UserDuck.duck_type_id == duck_type_id).first()
    now = datetime.utcnow()
    if row:
        row.count += qty
        if not row.first_received_at:
            row.first_received_at = now
    else:
        db.add(UserDuck(user_id=user_id, duck_type_id=duck_type_id,
                        count=qty, first_received_at=now))


def _remove_duck(db: Session, user_id: int, duck_type_id: int, qty: int) -> int:
    """Remove up to qty ducks from a user's inventory. Clamps at zero. Returns removed."""
    row = db.query(UserDuck).filter(
        UserDuck.user_id == user_id, UserDuck.duck_type_id == duck_type_id).first()
    if not row or row.count <= 0:
        return 0
    removed = min(qty, row.count)
    row.count -= removed
    return removed


def _spend_duck(db: Session, user_id: int, duck_type_id: int, qty: int = 1):
    row = db.query(UserDuck).filter(
        UserDuck.user_id == user_id, UserDuck.duck_type_id == duck_type_id).first()
    if not row or row.count < qty:
        raise HTTPException(status_code=400, detail="Not enough ducks of that type")
    row.count -= qty


def _bump_legacy_duck_count(db: Session, user: User):
    """Keep the legacy settings.duckCount in sync so existing UI keeps working."""
    settings = dict(user.settings or {})
    settings["duckCount"] = settings.get("duckCount", 0) + 1
    user.settings = settings


class DuckGiveCreate(BaseModel):
    recipient_id: int
    duck_type_id: int
    note: str = None


@app.get("/ducks/catalog")
def list_duck_catalog(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return [_duck_type_dict(dt) for dt in db.query(DuckType).order_by(DuckType.id).all()]


@app.get("/ducks/inventory")
def get_my_inventory(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _ensure_starter_ducks(db, current_user.id)
    rows = db.query(UserDuck).filter(UserDuck.user_id == current_user.id, UserDuck.count > 0).all()
    result = []
    for row in rows:
        dt = _duck_type_or_404(db, row.duck_type_id)
        result.append({"duck": _duck_type_dict(dt), "count": row.count})
    return result


def _pond_for(db: Session, user_id: int) -> dict:
    _ensure_starter_ducks(db, user_id)
    types = db.query(DuckType).order_by(DuckType.id).all()
    owned = {r.duck_type_id: r for r in db.query(UserDuck).filter(UserDuck.user_id == user_id).all()}
    slots = []
    unlocked = 0
    for dt in types:
        row = owned.get(dt.id)
        is_unlocked = row is not None
        if is_unlocked:
            unlocked += 1
        slots.append({
            "duck": _duck_type_dict(dt),
            "unlocked": is_unlocked,
            "count": row.count if row else 0,
            "first_received_at": row.first_received_at.isoformat() if row and row.first_received_at else None,
        })
    return {"user_id": user_id, "unlocked": unlocked, "total": len(types), "slots": slots}


@app.get("/ducks/pond")
def get_my_pond(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _pond_for(db, current_user.id)


@app.get("/ducks/milestones")
def list_milestones(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    claimed_keys = {r.key for r in
                    db.query(UserMilestone).filter(UserMilestone.user_id == current_user.id).all()}
    out = []
    for m in _all_milestones(db) + _photo_reaction_tiers(db, current_user.id):
        d = _milestone_dict(db, m)
        d["progress"] = _milestone_progress(db, current_user.id, m)
        d["claimed"] = m["key"] in claimed_keys
        out.append(d)
    return out


@app.get("/users/{user_id}/pond")
def get_user_pond(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not db.query(User).filter(User.id == user_id).first():
        raise HTTPException(status_code=404, detail="User not found")
    return _pond_for(db, user_id)


@app.post("/ducks/give")
def give_duck(payload: DuckGiveCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if payload.recipient_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't duck yourself")
    recipient = db.query(User).filter(User.id == payload.recipient_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    dt = _duck_type_or_404(db, payload.duck_type_id)
    _ensure_starter_ducks(db, current_user.id)

    _spend_duck(db, current_user.id, payload.duck_type_id, 1)
    _grant_duck(db, recipient.id, payload.duck_type_id, 1)
    db.add(DuckGive(giver_id=current_user.id, recipient_id=recipient.id,
                    duck_type_id=payload.duck_type_id, note=payload.note))
    _bump_legacy_duck_count(db, recipient)
    _notify_user(db, recipient.id, "ducked",
                 "🦆 You've been ducked!",
                 f"{_owner_name(db, current_user.id)} ducked you with {dt.emoji} {dt.name}",
                 {"giver_id": current_user.id, "duck_type_id": dt.id})
    db.commit()
    done = _check_milestones(db, current_user.id) + _check_milestones(db, recipient.id)
    return {"message": "Duck given!", "recipient_duck_count": (recipient.settings or {}).get("duckCount", 0),
            "milestones_completed": done}


def _send_expo_push(push_token: str, title: str, body: str, data: dict = None):
    """Fire-and-forget push via the Expo Push API. Never raises."""
    if not push_token or not push_token.startswith("ExponentPushToken["):
        return
    try:
        import urllib.request
        payload = json.dumps({
            "to": push_token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://exp.host/--/api/v2/push/send",
            data=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8", "replace")
        try:
            ticket = json.loads(raw).get("data", {})
            if isinstance(ticket, dict) and ticket.get("status") == "error":
                print(f"Push ticket error: {ticket.get('message')} "
                      f"({ticket.get('details')})")
            else:
                print(f"Push ticket ok: {ticket.get('id') or ticket.get('status')}")
        except Exception:
            print(f"Push ticket unparseable: {raw[:200]}")
    except Exception as e:
        print(f"Push send failed: {e}")


def _notify_user(db: Session, user_id: int, ntype: str, title: str, body: str, data: dict = None):
    """Create an in-app notification and mirror it as a push if the user has a token."""
    db.add(Notification(user_id=user_id, type=ntype, title=title, body=body, data=data))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return
    # Direct FCM first (no Expo middleman); fall back to the Expo Push API.
    if user.fcm_token and fcm_direct.send_fcm_direct(user.fcm_token, title, body, data):
        return
    if user.push_token:
        _send_expo_push(user.push_token, title, body, data)


def _notification_dict(n: Notification) -> dict:
    return {
        "id": n.id, "type": n.type, "title": n.title, "body": n.body,
        "data": n.data or {}, "is_read": bool(n.is_read),
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@app.get("/notifications")
def list_notifications(limit: int = 30, offset: int = 0,
                       db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The current user's notification inbox, newest first."""
    _check_holiday_ducks(db, current_user)
    base = db.query(Notification).filter(Notification.user_id == current_user.id)
    unread = base.filter(Notification.is_read == False).count()  # noqa: E712
    rows = (base.order_by(Notification.id.desc())
            .limit(min(max(limit, 1), 100)).offset(max(offset, 0)).all())
    return {"unread": unread, "notifications": [_notification_dict(n) for n in rows]}


@app.post("/notifications/read-all")
def read_all_notifications(db: Session = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    """Mark all of the current user's notifications as read."""
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False).update({"is_read": True})  # noqa: E712
    db.commit()
    return {"ok": True}


@app.post("/notifications/{notification_id}/read")
def read_notification(notification_id: int, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Mark one notification as read."""
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return {"ok": True}


class PushTokenUpdate(BaseModel):
    token: str = ""


@app.post("/users/me/push-token")
def set_push_token(payload: PushTokenUpdate, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    """Register (or clear) the current device's Expo push token."""
    token = (payload.token or "").strip()
    if token and not token.startswith("ExponentPushToken["):
        raise HTTPException(status_code=400, detail="Not a valid Expo push token")
    current_user.push_token = token or None
    db.commit()
    return {"ok": True}


class FCMTokenUpdate(BaseModel):
    fcm_token: str = ""


@app.post("/users/me/fcm-token")
def set_fcm_token(payload: FCMTokenUpdate, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    """Register (or clear) the current device's native FCM token for direct push."""
    token = (payload.fcm_token or "").strip()
    if token and len(token) < 20:
        raise HTTPException(status_code=400, detail="Not a valid FCM token")
    current_user.fcm_token = token or None
    db.commit()
    return {"ok": True}


@app.get("/ducks/feed")
def duck_feed(limit: int = 50, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    limit = max(1, min(limit, 100))
    gives = db.query(DuckGive).order_by(DuckGive.created_at.desc()).limit(limit).all()
    feed = []
    for g in gives:
        dt = _duck_type_or_404(db, g.duck_type_id)
        feed.append({
            "id": g.id,
            "giver_id": g.giver_id,
            "giver_name": _owner_name(db, g.giver_id),
            "recipient_id": g.recipient_id,
            "recipient_name": _owner_name(db, g.recipient_id),
            "duck": _duck_type_dict(dt),
            "note": g.note,
            "created_at": g.created_at.isoformat() if g.created_at else None,
        })
    return feed


@app.get("/ducks/leaderboard")
def duck_leaderboard(metric: str = "given", days: int = 0, lat: float = None, lng: float = None,
                     radius_m: float = 50000, db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    if metric not in ("given", "received"):
        raise HTTPException(status_code=400, detail="metric must be 'given' or 'received'")
    query = db.query(DuckGive)
    if days and days > 0:
        query = query.filter(DuckGive.created_at >= datetime.utcnow() - timedelta(days=days))
    gives = query.all()

    counts = {}
    bot_user = db.query(User).filter(User.email == jtapbot.BOT_EMAIL).first()
    bot_id = bot_user.id if bot_user else None
    for g in gives:
        uid = g.giver_id if metric == "given" else g.recipient_id
        if bot_id is not None and uid == bot_id:
            continue
        counts[uid] = counts.get(uid, 0) + 1

    board = []
    for uid, total in counts.items():
        if lat is not None and lng is not None:
            user = db.query(User).filter(User.id == uid).first()
            if not user or user.latitude is None or user.longitude is None:
                continue
            if haversine(lat, lng, user.latitude, user.longitude) > radius_m:
                continue
        board.append({"user_id": uid, "name": _owner_name(db, uid), "ducks": total})
    board.sort(key=lambda x: x["ducks"], reverse=True)
    return board[:50]


# --- Duck Drops ---
class DropCreate(BaseModel):
    duck_type_id: int
    latitude: float
    longitude: float
    radius_m: float = 200.0
    duration_hours: float = 2.0
    max_claims: int = 5
    label: str = None


class DropClaimCreate(BaseModel):
    lat: float
    lng: float


@app.post("/drops")
def create_drop(payload: DropCreate, background_tasks: BackgroundTasks,
                db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _duck_type_or_404(db, payload.duck_type_id)
    now = datetime.utcnow()
    active = db.query(DuckDrop).filter(
        DuckDrop.created_by == current_user.id,
        DuckDrop.expires_at > now,
        DuckDrop.claims_count < DuckDrop.max_claims).count()
    if active >= MAX_ACTIVE_DROPS_PER_USER:
        raise HTTPException(status_code=400, detail="You already have 3 active drops")
    claims = max(1, min(payload.max_claims, 500))
    # Drops are stocked from the creator's inventory: 1 duck per claim.
    # No minting — a legendary drop costs legendary ducks.
    _ensure_starter_ducks(db, current_user.id)
    _spend_duck(db, current_user.id, payload.duck_type_id, claims)
    drop = DuckDrop(
        duck_type_id=payload.duck_type_id,
        latitude=payload.latitude, longitude=payload.longitude,
        radius_m=max(50.0, payload.radius_m),
        starts_at=now,
        expires_at=now + timedelta(hours=max(0.25, min(payload.duration_hours, 72))),
        max_claims=claims,
        created_by=current_user.id, label=payload.label)
    db.add(drop)
    db.commit()
    db.refresh(drop)
    # AI scavenger-hunt clue fills in shortly (background; drop is live immediately).
    background_tasks.add_task(duck_ai.generate_clue_for_drop, drop.id)
    done = _check_milestones(db, current_user.id)
    return {"id": drop.id, "message": "Drop is live!", "milestones_completed": done}


@app.get("/drops/active")
def list_active_drops(lat: float, lng: float, radius_m: float = 10000,
                      db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    now = datetime.utcnow()
    drops = db.query(DuckDrop).filter(
        DuckDrop.starts_at <= now,
        DuckDrop.expires_at > now,
        DuckDrop.claims_count < DuckDrop.max_claims).all()
    claimed_ids = {c.drop_id for c in db.query(DropClaim).filter(
        DropClaim.user_id == current_user.id).all()}
    result = []
    for d in drops:
        dist = haversine(lat, lng, d.latitude, d.longitude)
        if dist > radius_m:
            continue
        dt = _duck_type_or_404(db, d.duck_type_id)
        result.append({
            "id": d.id, "duck": _duck_type_dict(dt),
            "latitude": d.latitude, "longitude": d.longitude,
            "radius_m": d.radius_m, "distance_m": dist,
            "expires_at": d.expires_at.isoformat(),
            "claims_left": d.max_claims - d.claims_count,
            "label": d.label, "clue": d.clue, "claimed_by_me": d.id in claimed_ids,
        })
    result.sort(key=lambda x: x["distance_m"])
    return result


@app.post("/drops/{drop_id}/claim")
def claim_drop(drop_id: int, payload: DropClaimCreate, db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)):
    drop = db.query(DuckDrop).filter(DuckDrop.id == drop_id).first()
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")
    now = datetime.utcnow()
    if not (drop.starts_at <= now <= drop.expires_at):
        raise HTTPException(status_code=400, detail="Drop is not active")
    if drop.claims_count >= drop.max_claims:
        raise HTTPException(status_code=400, detail="Drop is fully claimed")
    if db.query(DropClaim).filter(DropClaim.drop_id == drop_id,
                                 DropClaim.user_id == current_user.id).first():
        raise HTTPException(status_code=400, detail="You already claimed this drop")
    if haversine(payload.lat, payload.lng, drop.latitude, drop.longitude) > drop.radius_m:
        raise HTTPException(status_code=400, detail="You're not close enough to claim this drop")

    drop.claims_count += 1
    db.add(DropClaim(drop_id=drop_id, user_id=current_user.id))
    _ensure_starter_ducks(db, current_user.id)
    _grant_duck(db, current_user.id, drop.duck_type_id, 1)
    db.commit()
    done = _check_milestones(db, current_user.id)
    dt = _duck_type_or_404(db, drop.duck_type_id)
    return {"message": "Duck claimed!", "duck": _duck_type_dict(dt), "milestones_completed": done}


# --- Meetups ---
MAX_ACTIVE_MEETUPS_PER_USER = 5


def _as_naive_utc(dt: datetime) -> datetime:
    """Clients send ISO strings with a 'Z' suffix (offset-aware); the DB layer
    uses naive UTC everywhere, so strip tzinfo on the way in."""
    return dt.replace(tzinfo=None) if dt.tzinfo is not None else dt


class MeetupCreate(BaseModel):
    title: str
    description: str = None
    latitude: float
    longitude: float
    start_time: datetime
    end_time: datetime


def _meetup_dict(db: Session, m: Meetup, lat: float, lng: float, viewer_id: int) -> dict:
    attendee_count = db.query(MeetupRsvp).filter(MeetupRsvp.meetup_id == m.id).count()
    joined = db.query(MeetupRsvp).filter(
        MeetupRsvp.meetup_id == m.id, MeetupRsvp.user_id == viewer_id).first() is not None
    return {
        "id": m.id,
        "title": m.title,
        "description": m.description,
        "latitude": m.latitude, "longitude": m.longitude,
        "distance_m": haversine(lat, lng, m.latitude, m.longitude),
        "start_time": m.start_time.isoformat() if m.start_time else None,
        "end_time": m.end_time.isoformat() if m.end_time else None,
        "created_by": m.created_by,
        "host_name": _owner_name(db, m.created_by),
        "attendee_count": attendee_count,
        "joined_by_me": joined,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _fan_out_meetup_alerts(db: Session, m: Meetup, title: str, host_name: str):
    """Notify every user within 25 miles of the meetup (except the host)."""
    try:
        alert_radius_m = 25 * 1609.34
        when = m.start_time.strftime("%a %b %d, %I:%M %p")
        nearby = db.query(User).filter(
            User.id != m.created_by,
            User.latitude.isnot(None),
            User.longitude.isnot(None)).all()
        for u in nearby:
            if haversine(m.latitude, m.longitude, u.latitude, u.longitude) <= alert_radius_m:
                _notify_user(
                    db, u.id, "meetup",
                    "📍 New meetup nearby!",
                    f"{host_name} planned \"{title}\" — {when}",
                    {"meetup_id": m.id})
        db.commit()
    except Exception as e:
        print(f"Meetup alert fan-out failed: {e}")


def _require_clean(*texts: str) -> None:
    """Reject postings containing vulgar language (marketplace, meetups)."""
    try:
        profanity.assert_clean(*texts)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Please keep postings family-friendly — remove the profanity and try again.")


def _check_holiday_ducks(db: Session, user: User) -> list:
    """Gift holiday ducks when the user is active on the holiday itself.

    Runs on login, signup, and the notification poll (every 30s in the app),
    so long-lived sessions still get the grant on the day. Each holiday duck
    is granted at most once per calendar year; repeats just return [].
    """
    today = datetime.utcnow().date()
    settings = dict(user.settings or {})
    granted = dict(settings.get("holidayGrants") or {})
    newly = []
    for slug, holiday_name, duck_name in holiday_ducks.holidays_on(today):
        if granted.get(slug) == today.year:
            continue
        dt = db.query(DuckType).filter(DuckType.slug == slug).first()
        if not dt:
            continue
        _grant_duck(db, user.id, dt.id, 1)
        granted[slug] = today.year
        newly.append((holiday_name, duck_name, dt.id))
    if newly:
        settings["holidayGrants"] = granted
        user.settings = settings
        for holiday_name, duck_name, duck_type_id in newly:
            _notify_user(db, user.id, "duck",
                         f"🎁 Happy {holiday_name}!",
                         f"A wild {duck_name} appeared in your pond!",
                         {"duck_type_id": duck_type_id})
        db.commit()
    return newly


@app.post("/meetups")
def create_meetup(payload: MeetupCreate, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Give your meetup a title")
    if len(title) > 80:
        raise HTTPException(status_code=400, detail="Title is too long (max 80 characters)")
    _require_clean(title, payload.description)
    now = datetime.utcnow()
    start_time = _as_naive_utc(payload.start_time)
    end_time = _as_naive_utc(payload.end_time)
    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time")
    if start_time < now - timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="Start time must be in the future")
    if end_time - start_time > timedelta(hours=72):
        raise HTTPException(status_code=400, detail="Meetups can't run longer than 72 hours")
    active = db.query(Meetup).filter(
        Meetup.created_by == current_user.id,
        Meetup.end_time > now).count()
    if active >= MAX_ACTIVE_MEETUPS_PER_USER:
        raise HTTPException(status_code=400, detail="You already have 5 upcoming meetups")
    m = Meetup(
        title=title,
        description=(payload.description or "").strip()[:500] or None,
        latitude=payload.latitude, longitude=payload.longitude,
        start_time=start_time, end_time=end_time,
        created_by=current_user.id)
    db.add(m)
    db.commit()
    db.refresh(m)
    # The host is automatically on the attendee list.
    db.add(MeetupRsvp(meetup_id=m.id, user_id=current_user.id))
    db.commit()
    _fan_out_meetup_alerts(db, m, title, _owner_name(db, current_user.id))
    return _meetup_dict(db, m, payload.latitude, payload.longitude, current_user.id)


@app.get("/meetups/active")
def list_active_meetups(lat: float, lng: float, radius_m: float = 50000,
                        db: Session = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    now = datetime.utcnow()
    result = []
    for m in db.query(Meetup).filter(Meetup.end_time > now).all():
        dist = haversine(lat, lng, m.latitude, m.longitude)
        if dist > radius_m:
            continue
        result.append(_meetup_dict(db, m, lat, lng, current_user.id))
    result.sort(key=lambda x: x["start_time"])
    return result


@app.post("/meetups/{meetup_id}/rsvp")
def rsvp_meetup(meetup_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    m = db.query(Meetup).filter(Meetup.id == meetup_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meetup not found")
    if m.end_time <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="This meetup is over")
    existing = db.query(MeetupRsvp).filter(
        MeetupRsvp.meetup_id == meetup_id, MeetupRsvp.user_id == current_user.id).first()
    if not existing:
        db.add(MeetupRsvp(meetup_id=meetup_id, user_id=current_user.id))
        db.commit()
    return {"message": "You're in!", "meetup_id": meetup_id}


@app.delete("/meetups/{meetup_id}/rsvp")
def leave_meetup(meetup_id: int, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    rsvp = db.query(MeetupRsvp).filter(
        MeetupRsvp.meetup_id == meetup_id, MeetupRsvp.user_id == current_user.id).first()
    if rsvp:
        db.delete(rsvp)
        db.commit()
    return {"message": "RSVP removed", "meetup_id": meetup_id}


@app.delete("/meetups/{meetup_id}")
def cancel_meetup(meetup_id: int, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    m = db.query(Meetup).filter(Meetup.id == meetup_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meetup not found")
    if m.created_by != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only the host can cancel this meetup")
    db.query(MeetupRsvp).filter(MeetupRsvp.meetup_id == meetup_id).delete()
    db.delete(m)
    db.commit()
    return {"message": "Meetup cancelled", "meetup_id": meetup_id}


# --- SOS / help requests ---
class SosCreate(BaseModel):
    issue_type: str
    details: Optional[str] = None
    latitude: float
    longitude: float


SOS_ISSUE_TYPES = {"stuck", "breakdown", "flat_tire", "dead_battery", "out_of_fuel", "other"}
SOS_ISSUE_LABELS = {
    "stuck": "Stuck", "breakdown": "Breakdown", "flat_tire": "Flat tire",
    "dead_battery": "Dead battery", "out_of_fuel": "Out of fuel", "other": "Other",
}
SOS_DURATION_HOURS = 1
SOS_ALERT_RADIUS_M = 10 * 1609.34  # 10 miles


def _expire_sos_requests(db: Session) -> None:
    """Lazily mark past-due SOS requests as expired."""
    db.query(SosRequest).filter(
        SosRequest.status == "active",
        SosRequest.expires_at <= datetime.utcnow()
    ).update({"status": "expired"}, synchronize_session=False)
    db.commit()


def _sos_dict(db: Session, s: SosRequest, lat: float, lng: float, viewer_id: int) -> dict:
    requester = db.query(User).filter(User.id == s.user_id).first()
    vehicle = ""
    if requester and requester.settings:
        try:
            vehicle = (requester.settings or {}).get("vehicleTitle") or ""
        except Exception:
            pass
    return {
        "id": s.id,
        "user_id": s.user_id,
        "user_name": _owner_name(db, s.user_id),
        "vehicle_title": vehicle,
        "issue_type": s.issue_type,
        "issue_label": SOS_ISSUE_LABELS.get(s.issue_type, s.issue_type),
        "details": s.details,
        "latitude": s.latitude,
        "longitude": s.longitude,
        "status": s.status,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "expires_at": s.expires_at.isoformat() if s.expires_at else None,
        "distance_m": haversine(lat, lng, s.latitude, s.longitude),
        "responder_count": db.query(SosResponse).filter(SosResponse.request_id == s.id).count(),
        "responded_by_me": db.query(SosResponse).filter(
            SosResponse.request_id == s.id, SosResponse.user_id == viewer_id).first() is not None,
        "is_mine": s.user_id == viewer_id,
    }


def _fan_out_sos_alerts(db: Session, s: SosRequest, requester_name: str):
    """Push an SOS alert to every non-banned user within 10 miles (except the requester)."""
    try:
        label = SOS_ISSUE_LABELS.get(s.issue_type, s.issue_type)
        nearby = db.query(User).filter(
            User.id != s.user_id,
            User.is_banned == False,  # noqa: E712
            User.latitude.isnot(None),
            User.longitude.isnot(None)).all()
        for u in nearby:
            dist_m = haversine(s.latitude, s.longitude, u.latitude, u.longitude)
            if dist_m <= SOS_ALERT_RADIUS_M:
                mi = dist_m / 1609.34
                dist_txt = f"{mi:.1f} mi away" if mi < 10 else f"{round(mi)} mi away"
                _notify_user(
                    db, u.id, "sos",
                    "🆘 Jeeper needs help!",
                    f"{requester_name}: {label} — {dist_txt}",
                    {"sos_id": s.id})
        db.commit()
    except Exception as e:
        print(f"SOS alert fan-out failed: {e}")


@app.post("/sos")
def create_sos(payload: SosCreate, db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)):
    issue = (payload.issue_type or "").strip().lower()
    if issue not in SOS_ISSUE_TYPES:
        raise HTTPException(status_code=400, detail="Unknown issue type")
    details = (payload.details or "").strip() or None
    if details and len(details) > 254:
        raise HTTPException(status_code=400, detail="SOS details must be 254 characters or fewer.")
    if details:
        _require_clean(details)
    _expire_sos_requests(db)
    existing = db.query(SosRequest).filter(
        SosRequest.user_id == current_user.id,
        SosRequest.status == "active").first()
    if existing:
        raise HTTPException(status_code=400, detail="You already have an active SOS request")
    now = datetime.utcnow()
    s = SosRequest(
        user_id=current_user.id,
        issue_type=issue,
        details=details,
        latitude=payload.latitude,
        longitude=payload.longitude,
        status="active",
        created_at=now,
        expires_at=now + timedelta(hours=SOS_DURATION_HOURS))
    db.add(s)
    db.commit()
    db.refresh(s)
    _fan_out_sos_alerts(db, s, _owner_name(db, current_user.id))
    return _sos_dict(db, s, payload.latitude, payload.longitude, current_user.id)


@app.get("/sos/nearby")
def list_nearby_sos(lat: float, lng: float, radius_m: float = SOS_ALERT_RADIUS_M,
                    db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    """Active SOS requests near a point (for map pins)."""
    _expire_sos_requests(db)
    result = []
    for s in db.query(SosRequest).filter(SosRequest.status == "active").all():
        dist = haversine(lat, lng, s.latitude, s.longitude)
        if dist > radius_m:
            continue
        result.append(_sos_dict(db, s, lat, lng, current_user.id))
    result.sort(key=lambda x: x["created_at"] or "")
    return result


@app.post("/sos/{sos_id}/respond")
def respond_sos(sos_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    """Toggle 'I'm on my way' for an SOS request."""
    s = db.query(SosRequest).filter(SosRequest.id == sos_id).first()
    if not s or s.status != "active" or s.expires_at <= datetime.utcnow():
        raise HTTPException(status_code=404, detail="SOS request not found or expired")
    existing = db.query(SosResponse).filter(
        SosResponse.request_id == sos_id, SosResponse.user_id == current_user.id).first()
    if existing:
        db.delete(existing)
        db.commit()
        responding = False
    else:
        db.add(SosResponse(request_id=sos_id, user_id=current_user.id))
        db.commit()
        responding = True
        try:
            _notify_user(
                db, s.user_id, "sos",
                "🛻 Help is on the way!",
                f"{_owner_name(db, current_user.id)} is heading to your SOS.",
                {"sos_id": s.id})
            db.commit()
        except Exception as e:
            print(f"SOS responder notify failed: {e}")
    count = db.query(SosResponse).filter(SosResponse.request_id == sos_id).count()
    return {"responding": responding, "responder_count": count, "sos_id": sos_id}


def _get_own_sos(db: Session, sos_id: int, user_id: int) -> SosRequest:
    s = db.query(SosRequest).filter(SosRequest.id == sos_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="SOS request not found")
    if s.user_id != user_id:
        raise HTTPException(status_code=403, detail="Only the requester can do that")
    return s


@app.post("/sos/{sos_id}/resolve")
def resolve_sos(sos_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    s = _get_own_sos(db, sos_id, current_user.id)
    s.status = "resolved"
    db.commit()
    return {"message": "SOS resolved", "sos_id": sos_id}


@app.post("/sos/{sos_id}/cancel")
def cancel_sos(sos_id: int, db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)):
    s = _get_own_sos(db, sos_id, current_user.id)
    s.status = "cancelled"
    db.commit()
    return {"message": "SOS cancelled", "sos_id": sos_id}


# --- Trading ---
class TradeCreate(BaseModel):
    recipient_id: int
    offered_duck_type_id: int
    offered_qty: int = 1
    requested_duck_type_id: int
    requested_qty: int = 1


def _trade_dict(db: Session, t: Trade) -> dict:
    return {
        "id": t.id,
        "proposer_id": t.proposer_id, "proposer_name": _owner_name(db, t.proposer_id),
        "recipient_id": t.recipient_id, "recipient_name": _owner_name(db, t.recipient_id),
        "offered": {"duck": _duck_type_dict(_duck_type_or_404(db, t.offered_duck_type_id)),
                    "qty": t.offered_qty},
        "requested": {"duck": _duck_type_dict(_duck_type_or_404(db, t.requested_duck_type_id)),
                      "qty": t.requested_qty},
        "status": t.status,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "expires_at": t.expires_at.isoformat() if t.expires_at else None,
    }


def _sweep_expired_trades(db: Session):
    now = datetime.utcnow()
    expired = db.query(Trade).filter(Trade.status == "pending", Trade.expires_at < now).all()
    for t in expired:
        t.status = "expired"
        t.decided_at = now
    if expired:
        db.commit()


@app.post("/trades")
def propose_trade(payload: TradeCreate, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    if payload.recipient_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't trade with yourself")
    if not db.query(User).filter(User.id == payload.recipient_id).first():
        raise HTTPException(status_code=404, detail="Recipient not found")
    if payload.offered_qty < 1 or payload.requested_qty < 1:
        raise HTTPException(status_code=400, detail="Quantities must be at least 1")
    _duck_type_or_404(db, payload.offered_duck_type_id)
    _duck_type_or_404(db, payload.requested_duck_type_id)
    _ensure_starter_ducks(db, current_user.id)
    _spend_duck_check_only(db, current_user.id, payload.offered_duck_type_id, payload.offered_qty)
    pending = db.query(Trade).filter(
        Trade.proposer_id == current_user.id, Trade.status == "pending").count()
    if pending >= 10:
        raise HTTPException(status_code=400, detail="Too many pending trade offers")
    trade = Trade(
        proposer_id=current_user.id, recipient_id=payload.recipient_id,
        offered_duck_type_id=payload.offered_duck_type_id, offered_qty=payload.offered_qty,
        requested_duck_type_id=payload.requested_duck_type_id, requested_qty=payload.requested_qty,
        expires_at=datetime.utcnow() + timedelta(hours=TRADE_EXPIRY_HOURS))
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return _trade_dict(db, trade)


def _spend_duck_check_only(db: Session, user_id: int, duck_type_id: int, qty: int):
    row = db.query(UserDuck).filter(
        UserDuck.user_id == user_id, UserDuck.duck_type_id == duck_type_id).first()
    if not row or row.count < qty:
        raise HTTPException(status_code=400, detail="You don't have enough of the offered duck")


@app.get("/trades")
def list_trades(box: str = "all", db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    _sweep_expired_trades(db)
    query = db.query(Trade)
    if box == "incoming":
        query = query.filter(Trade.recipient_id == current_user.id)
    elif box == "outgoing":
        query = query.filter(Trade.proposer_id == current_user.id)
    else:
        query = query.filter((Trade.proposer_id == current_user.id) |
                             (Trade.recipient_id == current_user.id))
    trades = query.order_by(Trade.created_at.desc()).limit(100).all()
    return [_trade_dict(db, t) for t in trades]


def _get_open_trade(db: Session, trade_id: int) -> Trade:
    _sweep_expired_trades(db)
    t = db.query(Trade).filter(Trade.id == trade_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Trade not found")
    if t.status != "pending":
        raise HTTPException(status_code=400, detail=f"Trade is {t.status}")
    return t


@app.post("/trades/{trade_id}/accept")
def accept_trade(trade_id: int, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    t = _get_open_trade(db, trade_id)
    if t.recipient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the recipient can accept")
    # Re-validate both sides still hold the ducks, then swap atomically in one commit.
    _spend_duck_check_only(db, t.proposer_id, t.offered_duck_type_id, t.offered_qty)
    _spend_duck_check_only(db, t.recipient_id, t.requested_duck_type_id, t.requested_qty)
    _spend_duck(db, t.proposer_id, t.offered_duck_type_id, t.offered_qty)
    _grant_duck(db, t.recipient_id, t.offered_duck_type_id, t.offered_qty)
    _spend_duck(db, t.recipient_id, t.requested_duck_type_id, t.requested_qty)
    _grant_duck(db, t.proposer_id, t.requested_duck_type_id, t.requested_qty)
    t.status = "accepted"
    t.decided_at = datetime.utcnow()
    db.commit()
    done = _check_milestones(db, t.proposer_id) + _check_milestones(db, t.recipient_id)
    return {"message": "Trade completed!", "trade": _trade_dict(db, t), "milestones_completed": done}


@app.post("/trades/{trade_id}/decline")
def decline_trade(trade_id: int, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    t = _get_open_trade(db, trade_id)
    if t.recipient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the recipient can decline")
    t.status = "declined"
    t.decided_at = datetime.utcnow()
    db.commit()
    return {"message": "Trade declined"}


@app.post("/trades/{trade_id}/cancel")
def cancel_trade(trade_id: int, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    t = _get_open_trade(db, trade_id)
    if t.proposer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the proposer can cancel")
    t.status = "cancelled"
    t.decided_at = datetime.utcnow()
    db.commit()
    return {"message": "Trade cancelled"}


# --- Marketplace ---
def _listing_dict(db: Session, l: MarketListing) -> dict:
    return {
        "id": l.id, "user_id": l.user_id,
        "seller_name": _owner_name(db, l.user_id),
        "photo_url": l.photo_url, "title": l.title, "price": l.price,
        "description": l.description, "contact_info": l.contact_info,
        "category": l.category, "is_sold": l.is_sold,
        "created_at": l.created_at.isoformat() if l.created_at else None,
    }


@app.post("/marketplace")
def create_listing(photo: UploadFile = File(...), title: str = Form(...),
                   price: float = Form(0.0), description: str = Form(...),
                   contact_info: str = Form(...), category: str = Form("Other"),
                   db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    title = (title or "").strip()
    description = (description or "").strip()
    contact_info = (contact_info or "").strip()
    if not title or not description or not contact_info:
        raise HTTPException(status_code=400, detail="Title, description, and contact info are required")
    if len(title) > 120:
        raise HTTPException(status_code=400, detail="Title too long (120 chars max)")
    _require_clean(title, description, contact_info)
    if price < 0:
        raise HTTPException(status_code=400, detail="Price cannot be negative")
    if not photo.content_type or not photo.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Photo must be an image")
    photo_data = photo.file.read(10 * 1024 * 1024 + 1)
    if len(photo_data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo must be 10MB or less")
    listing = MarketListing(
        user_id=current_user.id, photo_url="", title=title, price=price,
        description=description, contact_info=contact_info,
        category=(category or "Other").strip() or "Other")
    db.add(listing)
    db.commit()
    db.refresh(listing)
    os.makedirs(os.path.join(UPLOAD_DIR, "marketplace"), exist_ok=True)
    ext = ((photo.filename or "jpg").split(".")[-1].lower()[:5] or "jpg")
    filename = f"listing_{listing.id}_{uuid4().hex}.{ext}"
    with open(os.path.join(UPLOAD_DIR, "marketplace", filename), "wb+") as f:
        f.write(photo_data)
    listing.photo_url = f"/uploads/marketplace/{filename}"
    db.commit()
    db.refresh(listing)
    return _listing_dict(db, listing)


@app.get("/marketplace")
def list_marketplace(q: str = None, category: str = None, include_sold: bool = False,
                     seller_id: int = None,
                     limit: int = 50, offset: int = 0,
                     db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    query = db.query(MarketListing)
    if not include_sold:
        query = query.filter(MarketListing.is_sold == False)  # noqa: E712
    if seller_id:
        query = query.filter(MarketListing.user_id == seller_id)
    if category and category.lower() != "all":
        query = query.filter(MarketListing.category == category)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(MarketListing.title.ilike(like),
                                 MarketListing.description.ilike(like)))
    total = query.count()
    rows = (query.order_by(MarketListing.created_at.desc())
            .limit(min(limit, 100)).offset(max(offset, 0)).all())
    return {"total": total, "listings": [_listing_dict(db, l) for l in rows]}


@app.get("/marketplace/{listing_id}")
def get_listing(listing_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    l = db.query(MarketListing).filter(MarketListing.id == listing_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Listing not found")
    return _listing_dict(db, l)


def _listing_or_403(db: Session, listing_id: int, current_user: User) -> MarketListing:
    l = db.query(MarketListing).filter(MarketListing.id == listing_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Listing not found")
    if l.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not your listing")
    return l


@app.delete("/marketplace/{listing_id}")
def delete_listing(listing_id: int, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    l = _listing_or_403(db, listing_id, current_user)
    if l.photo_url:
        try:
            os.remove(os.path.join(UPLOAD_DIR, "marketplace",
                                   os.path.basename(l.photo_url)))
        except OSError:
            pass
    db.delete(l)
    db.commit()
    return {"deleted": True}


@app.post("/marketplace/{listing_id}/sold")
def mark_listing_sold(listing_id: int, sold: bool = True,
                      db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    l = _listing_or_403(db, listing_id, current_user)
    l.is_sold = sold
    db.commit()
    return _listing_dict(db, l)


# --- Admin web panel ---
# Single-page admin UI served at /admin. Sign in with an admin account;
# it talks to the /admin/* JSON endpoints below using your JWT.
ADMIN_HTML_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "admin.html")


@app.get("/admin", response_class=HTMLResponse)
def admin_panel():
    with open(ADMIN_HTML_PATH, encoding="utf-8") as f:
        return f.read()


# --- Admin API ---
# Read-only browse + delete over every table, restricted to admin users.
ADMIN_TABLES = {
    "users": User,
    "duck_types": DuckType,
    "user_ducks": UserDuck,
    "duck_gives": DuckGive,
    "duck_drops": DuckDrop,
    "drop_claims": DropClaim,
    "trades": Trade,
    "user_milestones": UserMilestone,
    "milestones": Milestone,
    "notifications": Notification,
    "photo_reactions": PhotoReaction,
    "market_listings": MarketListing,
    "meetups": Meetup,
    "meetup_rsvps": MeetupRsvp,
    "sos_requests": SosRequest,
    "sos_responses": SosResponse,
}

# Columns never exposed through the admin API.
ADMIN_HIDDEN_COLUMNS = {
    "users": {"hashed_password"},
}

MESSAGE_COLUMNS = ["id", "user_id", "message", "timestamp", "reactions", "channel", "latitude", "longitude"]
MESSAGE_TABLE_DDL = """CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    reactions TEXT DEFAULT '{}',
    channel TEXT DEFAULT 'global',
    latitude REAL,
    longitude REAL
)"""


def _admin_table_or_404(name: str) -> str:
    if name != "messages" and name not in ADMIN_TABLES:
        raise HTTPException(status_code=404, detail="Unknown table")
    return name


def _row_to_dict(row, hidden: set) -> dict:
    out = {}
    for col in row.__table__.columns:
        if col.name in hidden:
            continue
        v = getattr(row, col.name)
        if isinstance(v, datetime):
            v = v.isoformat()
        out[col.name] = v
    return out


def _editable_columns(name: str) -> list:
    """Column metadata for the admin edit form: name, type, nullable. Skips id + hidden."""
    from sqlalchemy import Boolean, Integer, Float, DateTime, JSON
    hidden = ADMIN_HIDDEN_COLUMNS.get(name, set()) | {"id"}
    if name == "messages":
        types = {"user_id": "integer", "message": "string", "timestamp": "datetime",
                 "reactions": "string", "channel": "string",
                 "latitude": "float", "longitude": "float"}
        return [{"name": c, "type": types.get(c, "string"), "nullable": True}
                for c in MESSAGE_COLUMNS if c not in hidden]
    model = ADMIN_TABLES[name]
    cols = []
    for col in model.__table__.columns:
        if col.name in hidden:
            continue
        t = col.type
        if isinstance(t, Boolean):
            ctype = "boolean"
        elif isinstance(t, Integer):
            ctype = "integer"
        elif isinstance(t, Float):
            ctype = "float"
        elif isinstance(t, DateTime):
            ctype = "datetime"
        elif isinstance(t, JSON):
            ctype = "json"
        else:
            ctype = "string"
        cols.append({"name": col.name, "type": ctype, "nullable": col.nullable})
    return cols


def _coerce_value(ctype: str, value):
    """Coerce a JSON value to a column type. Raises ValueError on bad input."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None
    if ctype == "boolean":
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in ("1", "true", "yes", "on")
    if ctype == "integer":
        return int(value)
    if ctype == "float":
        return float(value)
    if ctype == "datetime":
        if isinstance(value, str):
            return datetime.fromisoformat(value.strip())
        return value
    if ctype == "json":
        if isinstance(value, str):
            return json.loads(value) if value.strip() else None
        return value
    return str(value)


@app.get("/admin/overview")
def admin_overview(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Row counts for every table."""
    tables = [{"table": name, "count": db.query(model).count()} for name, model in ADMIN_TABLES.items()]
    conn = get_raw_db()
    try:
        conn.execute(MESSAGE_TABLE_DDL)
        count = conn.execute("SELECT COUNT(*) AS c FROM messages").fetchone()["c"]
    finally:
        conn.close()
    tables.append({"table": "messages", "count": count})
    return {"tables": tables}


@app.get("/admin/tables/{name}")
def admin_table_rows(name: str, limit: int = 50, offset: int = 0,
                     db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Paginated rows for one table, newest first."""
    _admin_table_or_404(name)
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    if name == "messages":
        conn = get_raw_db()
        try:
            rows = conn.execute(
                "SELECT * FROM messages ORDER BY id DESC LIMIT ? OFFSET ?", (limit, offset)
            ).fetchall()
            return {"columns": MESSAGE_COLUMNS, "rows": [dict(r) for r in rows]}
        finally:
            conn.close()
    model = ADMIN_TABLES[name]
    hidden = ADMIN_HIDDEN_COLUMNS.get(name, set())
    q = db.query(model).order_by(model.id.desc())
    total = q.count()
    rows = q.offset(offset).limit(limit).all()
    columns = [c.name for c in model.__table__.columns if c.name not in hidden]
    return {"columns": columns, "total": total, "rows": [_row_to_dict(r, hidden) for r in rows]}


@app.get("/admin/tables/{name}/{row_id}")
def admin_row_detail(name: str, row_id: int,
                     db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Full detail for a single row."""
    _admin_table_or_404(name)
    if name == "messages":
        conn = get_raw_db()
        try:
            r = conn.execute("SELECT * FROM messages WHERE id = ?", (row_id,)).fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Row not found")
            return {"row": dict(r), "editable": _editable_columns(name)}
        finally:
            conn.close()
    model = ADMIN_TABLES[name]
    hidden = ADMIN_HIDDEN_COLUMNS.get(name, set())
    row = db.query(model).filter(model.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    return {"row": _row_to_dict(row, hidden), "editable": _editable_columns(name)}


@app.put("/admin/tables/{name}/{row_id}")
def admin_update_row(name: str, row_id: int, payload: dict,
                     db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Update a single row. Only real, non-hidden columns; id is immutable."""
    _admin_table_or_404(name)
    if name == "users" and row_id == admin.id and "is_admin" in payload and not payload["is_admin"]:
        raise HTTPException(status_code=403, detail="You cannot remove your own admin access")
    editable = {c["name"]: c["type"] for c in _editable_columns(name)}
    updates = {}
    for key, value in (payload or {}).items():
        if key not in editable:
            continue
        try:
            updates[key] = _coerce_value(editable[key], value)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"Bad value for '{key}'")
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if name == "duck_types" and updates.get("image_url"):
        taken = db.query(DuckType).filter(
            DuckType.image_url == updates["image_url"], DuckType.id != row_id).first()
        if taken:
            raise HTTPException(status_code=400,
                                detail=f"That sprite is already used by '{taken.name}'")
    if name == "messages":
        conn = get_raw_db()
        try:
            r = conn.execute("SELECT id FROM messages WHERE id = ?", (row_id,)).fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Row not found")
            sets = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(f"UPDATE messages SET {sets} WHERE id = ?", (*updates.values(), row_id))
            conn.commit()
            return {"row": dict(conn.execute("SELECT * FROM messages WHERE id = ?", (row_id,)).fetchone())}
        finally:
            conn.close()
    model = ADMIN_TABLES[name]
    row = db.query(model).filter(model.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    for key, value in updates.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    hidden = ADMIN_HIDDEN_COLUMNS.get(name, set())
    return {"row": _row_to_dict(row, hidden)}


@app.delete("/admin/tables/{name}/{row_id}")
def admin_delete_row(name: str, row_id: int,
                     db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Delete a single row. The duck catalog and your own admin account are protected."""
    _admin_table_or_404(name)
    if name == "duck_types":
        # Guarded delete: a duck with no references can go; one that's owned,
        # dropped, traded, or in the give history is blocked with the reason.
        row = db.query(model).filter(model.id == row_id).first() if (model := ADMIN_TABLES.get(name)) else None
        if not row:
            raise HTTPException(status_code=404, detail="Row not found")
        blockers = []
        if db.query(UserDuck).filter(UserDuck.duck_type_id == row_id, UserDuck.count > 0).count():
            blockers.append("owned by users")
        if db.query(DuckDrop).filter(DuckDrop.duck_type_id == row_id).count():
            blockers.append("used by duck drops")
        if db.query(Trade).filter(
                or_(Trade.offered_duck_type_id == row_id,
                    Trade.requested_duck_type_id == row_id),
                Trade.status == "pending").count():
            blockers.append("in open trades")
        if db.query(DuckGive).filter(DuckGive.duck_type_id == row_id).count():
            blockers.append("in give history")
        if blockers:
            raise HTTPException(
                status_code=400,
                detail=f"Can't delete this duck: {', '.join(blockers)}. "
                       f"Remove those references first.")
        db.delete(row)
        db.commit()
        return {"deleted": True}
    if name == "users" and row_id == admin.id:
        raise HTTPException(status_code=403, detail="You cannot delete your own admin account")
    if name == "messages":
        conn = get_raw_db()
        try:
            cur = conn.execute("DELETE FROM messages WHERE id = ?", (row_id,))
            conn.commit()
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Row not found")
            return {"deleted": True}
        finally:
            conn.close()
    model = ADMIN_TABLES[name]
    row = db.query(model).filter(model.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    if name == "market_listings" and getattr(row, "photo_url", None):
        try:
            os.remove(os.path.join(UPLOAD_DIR, "marketplace", os.path.basename(row.photo_url)))
        except OSError:
            pass
    db.delete(row)
    db.commit()
    return {"deleted": True}


# --- Duck AI (lore + drop clues) ---
@app.post("/admin/duck-types/{duck_type_id}/lore")
def admin_generate_lore(duck_type_id: int, force: bool = False,
                        db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """(Re)generate AI lore for one duck. Runs in the background; poll the duck to see it."""
    _duck_type_or_404(db, duck_type_id)
    duck_ai.generate_lore_for_duck(duck_type_id, force=force)
    return {"started": True}


@app.post("/admin/duck-types/backfill-lore")
def admin_backfill_lore(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Generate AI lore for every duck missing it. Runs in the background."""
    ids = [r[0] for r in db.query(DuckType.id).filter(DuckType.lore.is_(None)).all()]
    for duck_id in ids:
        duck_ai.generate_lore_for_duck(duck_id)
    return {"started": True, "ducks": len(ids)}


@app.post("/admin/duck-drops/{drop_id}/clue")
def admin_generate_clue(drop_id: int, force: bool = False,
                        db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """(Re)generate the AI scavenger-hunt clue for one drop. Runs in the background."""
    drop = db.query(DuckDrop).filter(DuckDrop.id == drop_id).first()
    if not drop:
        raise HTTPException(status_code=404, detail="Drop not found")
    duck_ai.generate_clue_for_drop(drop_id, force=force)
    return {"started": True}


class DuckGrant(BaseModel):
    email: str
    duck_type_id: int
    qty: int = 1


class MilestoneCreate(BaseModel):
    name: str
    description: str = ""
    track: str = "Activity"
    target: int = 1
    counter: str = "ducks_given"
    reward_mode: str = "pool"  # "pool" | "duck"
    reward_pool: list = []
    reward_slug: str = ""
    prefer_unowned: bool = False


@app.get("/admin/milestones")
def admin_list_milestones(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """List admin-created milestones (built-ins are hardcoded, not listed here)."""
    out = []
    for r in db.query(Milestone).order_by(Milestone.id).all():
        d = _db_milestone_dict(r)
        d["id"] = r.id
        d["created_at"] = r.created_at.isoformat() if r.created_at else None
        out.append(d)
    return out


@app.post("/admin/milestones")
def admin_create_milestone(payload: MilestoneCreate, db: Session = Depends(get_db),
                           admin: User = Depends(require_admin)):
    """Create a custom milestone. Claim key is auto-derived as custom_<id>."""
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if len(name) > 80:
        raise HTTPException(status_code=400, detail="Name too long (80 chars max)")
    description = (payload.description or "").strip()
    if len(description) > 200:
        raise HTTPException(status_code=400, detail="Description too long (200 chars max)")
    track = (payload.track or "Activity").strip() or "Activity"
    if len(track) > 40:
        raise HTTPException(status_code=400, detail="Track too long (40 chars max)")
    target = payload.target
    if not isinstance(target, int) or isinstance(target, bool) or target < 1:
        raise HTTPException(status_code=400, detail="Target must be a whole number of at least 1")
    counter = (payload.counter or "").strip()
    if counter not in MILESTONE_COUNTERS:
        raise HTTPException(status_code=400,
                            detail=f"Counter must be one of: {', '.join(MILESTONE_COUNTERS)}")
    reward_pool = None
    reward_slug = None
    if (payload.reward_mode or "pool").strip() == "duck":
        slug = (payload.reward_slug or "").strip()
        dt = db.query(DuckType).filter(DuckType.slug == slug).first()
        if not dt:
            raise HTTPException(status_code=400, detail="Reward duck not found")
        reward_slug = dt.slug
    else:
        pool = [r for r in (payload.reward_pool or []) if r in DUCK_RARITIES]
        if not pool:
            raise HTTPException(status_code=400, detail="Pick at least one reward rarity")
        reward_pool = json.dumps(pool)
    row = Milestone(track=track, name=name, description=description, target=target,
                    counter=counter, reward_pool=reward_pool, reward_slug=reward_slug,
                    prefer_unowned=bool(payload.prefer_unowned))
    db.add(row)
    db.commit()
    db.refresh(row)
    d = _db_milestone_dict(row)
    d["id"] = row.id
    return d


@app.delete("/admin/milestones/{milestone_id}")
def admin_delete_milestone(milestone_id: int, db: Session = Depends(get_db),
                           admin: User = Depends(require_admin)):
    """Delete a custom milestone. Users who already claimed it keep the reward."""
    row = db.query(Milestone).filter(Milestone.id == milestone_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Milestone not found")
    db.delete(row)
    db.commit()
    return {"deleted": True}


DUCK_RARITIES = ("common", "rare", "epic", "legendary")


@app.get("/admin/duck-sprites")
def admin_duck_sprites(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """List the bundled duck sprite library by theme, as URLs served from /uploads/ducks/.
    Includes which sprite each existing duck type uses."""
    base = os.path.join(UPLOAD_DIR, "ducks")
    themes = {}
    if os.path.isdir(base):
        for theme in sorted(os.listdir(base)):
            tdir = os.path.join(base, theme)
            if not os.path.isdir(tdir):
                continue
            files = sorted(f for f in os.listdir(tdir) if f.endswith(".png"))
            if files:
                themes[theme] = [f"/uploads/ducks/{theme}/{f}" for f in files]
    used = {dt.image_url: dt.name for dt in db.query(DuckType).filter(
        DuckType.image_url.isnot(None)).all()}
    return {"themes": themes, "used": used}


class DuckTypeCreate(BaseModel):
    name: str
    rarity: str = "common"
    emoji: str = "🐤"
    description: Optional[str] = None
    seasonal: Optional[str] = None
    image_url: Optional[str] = None


def _unique_duck_slug(db: Session, name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_") or "duck"
    slug, i = base, 2
    while db.query(DuckType).filter(DuckType.slug == slug).first():
        slug = f"{base}_{i}"
        i += 1
    return slug


@app.post("/admin/duck-types")
def admin_create_duck_type(payload: DuckTypeCreate, db: Session = Depends(get_db),
                           admin: User = Depends(require_admin)):
    """Create a new duck type. Slug is auto-generated; lore generates in the background."""
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if len(name) > 60:
        raise HTTPException(status_code=400, detail="Name too long (60 chars max)")
    rarity = (payload.rarity or "common").strip().lower()
    if rarity not in DUCK_RARITIES:
        raise HTTPException(status_code=400,
                            detail=f"Rarity must be one of: {', '.join(DUCK_RARITIES)}")
    image_url = (payload.image_url or "").strip() or None
    if image_url and not image_url.startswith("/uploads/ducks/"):
        raise HTTPException(status_code=400, detail="image_url must be a bundled duck sprite")
    if image_url:
        taken = db.query(DuckType).filter(DuckType.image_url == image_url).first()
        if taken:
            raise HTTPException(status_code=400,
                                detail=f"That sprite is already used by '{taken.name}'")
    dt = DuckType(
        slug=_unique_duck_slug(db, name),
        name=name,
        rarity=rarity,
        emoji=(payload.emoji or "🐤").strip() or "🐤",
        description=(payload.description or "").strip() or None,
        seasonal=(payload.seasonal or "").strip() or None,
        image_url=image_url,
    )
    db.add(dt)
    db.commit()
    db.refresh(dt)
    duck_ai.generate_lore_for_duck(dt.id)
    return _duck_type_dict(dt)


@app.post("/admin/ducks/grant")
def admin_grant_duck(payload: DuckGrant, db: Session = Depends(get_db),
                     admin: User = Depends(require_admin)):
    """Give ducks to a user by email, or take them away with a negative qty.
    Unlocks the pond entry and adds spendable ducks. Removal clamps at zero."""
    user = db.query(User).filter(User.email == (payload.email or "").strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    dt = _duck_type_or_404(db, payload.duck_type_id)
    qty = payload.qty or 0
    if qty == 0 or abs(qty) > 100:
        raise HTTPException(status_code=400, detail="Qty must be between -100 and 100, excluding 0")
    removed = 0
    if qty > 0:
        _grant_duck(db, user.id, payload.duck_type_id, qty)
        # Same duck-received alert as any other gift; removals stay silent.
        _notify_user(db, user.id, "ducked",
                     "🦆 You've been ducked!",
                     f"An admin gifted you {dt.emoji or '🦆'} {dt.name}" + (f" ×{qty}" if qty > 1 else ""),
                     {"giver_id": admin.id, "duck_type_id": dt.id})
    else:
        removed = _remove_duck(db, user.id, payload.duck_type_id, -qty)
    db.commit()
    return {"granted": True, "email": user.email,
            "duck_type_id": payload.duck_type_id, "qty": qty, "removed": removed}


@app.get("/admin/duck-types/options")
def admin_duck_type_options(db: Session = Depends(get_db),
                            admin: User = Depends(require_admin)):
    """Full duck-type list for admin dropdowns (no pagination cap)."""
    rows = db.query(DuckType).order_by(DuckType.name).all()
    return [{"id": d.id, "name": d.name, "emoji": d.emoji,
             "rarity": d.rarity} for d in rows]


@app.get("/admin/stats")
def admin_stats(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """App health at a glance: users, ducks, drops, trades, marketplace, chat."""
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    conn = get_raw_db()
    try:
        conn.execute(MESSAGE_TABLE_DDL)
        msg_total = conn.execute("SELECT COUNT(*) AS c FROM messages").fetchone()["c"]
    finally:
        conn.close()
    return {
        "users": {
            "total": db.query(User).count(),
            "admins": db.query(User).filter(User.is_admin == True).count(),  # noqa: E712
            "banned": db.query(User).filter(User.is_banned == True).count(),  # noqa: E712
        },
        "ducks": {
            "types": db.query(DuckType).count(),
            "inventory": db.query(func.sum(UserDuck.count)).scalar() or 0,
            "pond_unlocks": db.query(UserDuck).count(),
        },
        "drops": {
            "total": db.query(DuckDrop).count(),
            "active": db.query(DuckDrop).filter(DuckDrop.expires_at > now).count(),
            "created_7d": db.query(DuckDrop).filter(DuckDrop.created_at >= week_ago).count(),
        },
        "trades": {
            "total": db.query(Trade).count(),
            "pending": db.query(Trade).filter(Trade.status == "pending").count(),
            "created_7d": db.query(Trade).filter(Trade.created_at >= week_ago).count(),
        },
        "marketplace": {
            "active": db.query(MarketListing).filter(MarketListing.is_sold == False).count(),  # noqa: E712
            "sold": db.query(MarketListing).filter(MarketListing.is_sold == True).count(),  # noqa: E712
            "created_7d": db.query(MarketListing).filter(MarketListing.created_at >= week_ago).count(),
        },
        "messages": {"total": msg_total},
    }


@app.get("/admin/marketplace/queue")
def admin_marketplace_queue(limit: int = 20, db: Session = Depends(get_db),
                            admin: User = Depends(require_admin)):
    """Newest marketplace listings with seller email, for quick moderation."""
    limit = max(1, min(limit, 50))
    out = []
    for l in db.query(MarketListing).order_by(MarketListing.id.desc()).limit(limit).all():
        d = _listing_dict(db, l)
        seller = db.query(User).filter(User.id == l.user_id).first()
        d["seller_email"] = seller.email if seller else None
        out.append(d)
    return {"listings": out}


@app.get("/admin/users/lookup")
def admin_user_lookup(email: str, db: Session = Depends(get_db),
                      admin: User = Depends(require_admin)):
    """Find a user by email and see their ducks, listings, trades, and drops in one view."""
    user = db.query(User).filter(User.email == (email or "").strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    hidden = ADMIN_HIDDEN_COLUMNS.get("users", set())
    ducks = []
    for row in db.query(UserDuck).filter(UserDuck.user_id == user.id).all():
        dt = db.query(DuckType).filter(DuckType.id == row.duck_type_id).first()
        ducks.append({"duck": _duck_type_dict(dt) if dt else {"id": row.duck_type_id},
                      "count": row.count})
    listings = [_listing_dict(db, l) for l in
                db.query(MarketListing).filter(MarketListing.user_id == user.id)
                .order_by(MarketListing.id.desc()).limit(20).all()]
    trades = []
    for t in db.query(Trade).filter(
            or_(Trade.proposer_id == user.id, Trade.recipient_id == user.id)).order_by(
            Trade.id.desc()).limit(20).all():
        trades.append({"id": t.id, "status": t.status,
                       "proposer_id": t.proposer_id, "recipient_id": t.recipient_id})
    drops = db.query(DuckDrop).filter(DuckDrop.created_by == user.id).count()
    milestones = db.query(UserMilestone).filter(UserMilestone.user_id == user.id).count()
    return {
        "user": _row_to_dict(user, hidden),
        "ducks": ducks,
        "pond_unlocked": sum(1 for d in ducks),
        "listings": listings,
        "trades": trades,
        "drops_created": drops,
        "milestones": milestones,
    }


def _set_banned(db: Session, admin: User, user_id: int, banned: bool) -> dict:
    if user_id == admin.id:
        raise HTTPException(status_code=403, detail="You cannot ban your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if banned and user.is_admin:
        raise HTTPException(status_code=403, detail="You cannot ban another admin")
    user.is_banned = banned
    db.commit()
    return {"banned": banned, "user_id": user.id, "email": user.email}


@app.post("/admin/users/{user_id}/ban")
def admin_ban_user(user_id: int, db: Session = Depends(get_db),
                   admin: User = Depends(require_admin)):
    """Ban a user. Their token stops working on every protected route."""
    return _set_banned(db, admin, user_id, True)


@app.post("/admin/users/{user_id}/unban")
def admin_unban_user(user_id: int, db: Session = Depends(get_db),
                     admin: User = Depends(require_admin)):
    """Lift a ban."""
    return _set_banned(db, admin, user_id, False)


class AdminDropCreate(BaseModel):
    duck_type_id: int
    latitude: float
    longitude: float
    radius_m: float = 200.0
    duration_hours: float = 2.0
    max_claims: int = 5
    label: Optional[str] = None


@app.post("/admin/drops")
def admin_create_drop(payload: AdminDropCreate, background_tasks: BackgroundTasks,
                      db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Create a duck drop from the admin panel. Minted (no inventory spend),
    not counted against the per-user active-drop cap."""
    _duck_type_or_404(db, payload.duck_type_id)
    if not (-90 <= payload.latitude <= 90) or not (-180 <= payload.longitude <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates")
    now = datetime.utcnow()
    drop = DuckDrop(
        duck_type_id=payload.duck_type_id,
        latitude=payload.latitude, longitude=payload.longitude,
        radius_m=max(50.0, payload.radius_m),
        starts_at=now,
        expires_at=now + timedelta(hours=max(0.25, min(payload.duration_hours, 72))),
        max_claims=max(1, min(payload.max_claims, 500)),
        created_by=admin.id, label=(payload.label or "").strip() or None)
    db.add(drop)
    db.commit()
    db.refresh(drop)
    background_tasks.add_task(duck_ai.generate_clue_for_drop, drop.id)
    return {"id": drop.id, "message": "Drop is live!"}


class AdminMeetupCreate(BaseModel):
    title: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    start_time: datetime
    end_time: datetime


@app.post("/admin/meetups")
def admin_create_meetup(payload: AdminMeetupCreate,
                        db: Session = Depends(get_db),
                        admin: User = Depends(require_admin)):
    """Create a meetup from the admin panel. Hosted by the admin (auto-RSVP'd),
    fires the 25-mile alerts, and doesn't count against the admin's 5-meetup cap."""
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Give the meetup a title")
    if len(title) > 80:
        raise HTTPException(status_code=400, detail="Title is too long (max 80 characters)")
    _require_clean(title, payload.description)
    if not (-90 <= payload.latitude <= 90) or not (-180 <= payload.longitude <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates")
    now = datetime.utcnow()
    start_time = _as_naive_utc(payload.start_time)
    end_time = _as_naive_utc(payload.end_time)
    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time")
    if start_time < now - timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="Start time must be in the future")
    if end_time - start_time > timedelta(hours=72):
        raise HTTPException(status_code=400, detail="Meetups can't run longer than 72 hours")
    m = Meetup(
        title=title,
        description=(payload.description or "").strip()[:500] or None,
        latitude=payload.latitude, longitude=payload.longitude,
        start_time=start_time, end_time=end_time,
        created_by=admin.id)
    db.add(m)
    db.commit()
    db.refresh(m)
    db.add(MeetupRsvp(meetup_id=m.id, user_id=admin.id))
    db.commit()
    _fan_out_meetup_alerts(db, m, title, _owner_name(db, admin.id))
    return {"id": m.id, "message": "Meetup is live!"}


class BroadcastCreate(BaseModel):
    message: str
    push: bool = False


@app.post("/admin/broadcast")
def admin_broadcast(payload: BroadcastCreate, db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)):
    """Post a message to global chat as the admin.

    When push=True, every non-banned user also gets an announcement
    notification (in-app + push), e.g. for server maintenance notices.
    """
    text = (payload.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is required")
    if len(text) > 500:
        raise HTTPException(status_code=400, detail="Message too long (500 chars max)")
    conn = get_raw_db()
    try:
        conn.execute(MESSAGE_TABLE_DDL)
        cur = conn.execute(
            "INSERT INTO messages (user_id, message, timestamp, reactions, channel) "
            "VALUES (?, ?, ?, ?, ?)",
            (admin.id, text, datetime.utcnow(), "{}", "global"))
        conn.commit()
        msg_id = cur.lastrowid
    finally:
        conn.close()
    pushed = 0
    if payload.push:
        for u in db.query(User).filter(
                User.is_banned.is_(False),
                User.email != jtapbot.BOT_EMAIL).all():
            _notify_user(db, u.id, "announcement", "\U0001f4e2 Jtap announcement",
                         text, {"tab": "chat"})
            pushed += 1
        db.commit()
    return {"id": msg_id, "message": text, "pushed": pushed}
