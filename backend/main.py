import shutil
import os
import json
import random
import sqlite3
from datetime import datetime, timedelta
from uuid import uuid4
from math import radians, cos, sin, asin, sqrt
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
import jwt
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, or_
from sqlalchemy.orm import sessionmaker, Session
from passlib.context import CryptContext
from pydantic import BaseModel
from models import Base, User, DuckType, UserDuck, DuckGive, DuckDrop, DropClaim, Trade, UserMilestone, PhotoReaction
from schemas import UserProfileUpdate, UserProfileResponse, UserCreate

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
    return user


def require_self(user_id: int, current_user: User) -> User:
    """Ensure the logged-in user can only act on their own user id."""
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized for this user")
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
    new_user = User(email=normalized_email, hashed_password=hashed_pw)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    # Starter ducks for the duck game (pre-existing users get them lazily on first pond/inventory fetch)
    classic = db.query(DuckType).filter(DuckType.slug == STARTER_DUCK_SLUG).first()
    if classic:
        db.add(UserDuck(user_id=new_user.id, duck_type_id=classic.id,
                        count=STARTER_DUCK_COUNT, first_received_at=datetime.utcnow()))
        db.commit()
    return AuthResponse(
        id=new_user.id,
        email=new_user.email,
        profile_picture_url=new_user.profile_picture_url,
        settings=new_user.settings,
        access_token=create_access_token(new_user.id),
    )

@app.post("/login", response_model=AuthResponse)
def login(user_credentials: UserCreate, db: Session = Depends(get_db)):
    normalized_email = user_credentials.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()
    
    if not user or not pwd_context.verify(user_credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    return AuthResponse(
        id=user.id,
        email=user.email,
        profile_picture_url=user.profile_picture_url,
        settings=user.settings,
        access_token=create_access_token(user.id),
    )

# --- Profile Endpoints ---
@app.get("/users/{user_id}/profile", response_model=UserProfileResponse)
def get_profile(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.patch("/users/{user_id}/profile", response_model=UserProfileResponse)
def update_profile(user_id: int, profile_data: UserProfileUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_self(user_id, current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if profile_data.settings is not None:
        user.settings = profile_data.settings
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
    return {"status": status, "counts": counts, "mine": mine}


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
        if channel == "local" and lat is not None and lng is not None:
            if row["latitude"] is not None and row["longitude"] is not None:
                distance = haversine(lat, lng, row["latitude"], row["longitude"])
                if distance > 16093.4:
                    continue
            else:
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
            "channel": row["channel"]
        })
        
    return messages

@app.post("/chat")
def post_chat_message(chat: ChatMessageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if chat.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot post as another user")
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
    
    cursor.execute(
        "INSERT INTO messages (user_id, message, timestamp, reactions, channel, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (chat.user_id, chat.message, datetime.utcnow(), "{}", chat.channel, sender_lat, sender_lng)
    )
    conn.commit()
    msg_id = cursor.lastrowid
    conn.close()
    
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
     "description": "The original. Every Jeeper starts here.", "seasonal": None},
    {"slug": "mud_duck", "name": "Mud Duck", "rarity": "common", "emoji": "🦆",
     "description": "Fresh from the pit.", "seasonal": None},
    {"slug": "golden_duck", "name": "Golden Duck", "rarity": "rare", "emoji": "🐥",
     "description": "24-karat trail bling.", "seasonal": None},
    {"slug": "glow_duck", "name": "Glow Duck", "rarity": "rare", "emoji": "✨",
     "description": "Charges by day, glows by night.", "seasonal": None},
    {"slug": "frost_duck", "name": "Frost Duck", "rarity": "rare", "emoji": "❄️",
     "description": "Only drops in the cold months.", "seasonal": "winter"},
    {"slug": "black_gold", "name": "Black & Gold Duck", "rarity": "epic", "emoji": "🖤",
     "description": "Matches the app. Obviously the best one.", "seasonal": None},
    {"slug": "camo_duck", "name": "Camo Duck", "rarity": "epic", "emoji": "🪖",
     "description": "You didn't see it. That's the point.", "seasonal": None},
    {"slug": "diamond_duck", "name": "Diamond Duck", "rarity": "legendary", "emoji": "💎",
     "description": "One in a thousand.", "seasonal": None},
    {"slug": "spooky_duck", "name": "Spooky Duck", "rarity": "legendary", "emoji": "🎃",
     "description": "Only drops in October.", "seasonal": "halloween"},
]

STARTER_DUCK_SLUG = "classic_yellow"
STARTER_DUCK_COUNT = 3
TRADE_EXPIRY_HOURS = 48
MAX_ACTIVE_DROPS_PER_USER = 3


def seed_duck_types():
    db = SessionLocal()
    try:
        if db.query(DuckType).count() == 0:
            for d in DUCK_CATALOG:
                db.add(DuckType(**d))
            db.commit()
    finally:
        db.close()


seed_duck_types()


def _duck_type_or_404(db: Session, duck_type_id: int) -> DuckType:
    dt = db.query(DuckType).filter(DuckType.id == duck_type_id).first()
    if not dt:
        raise HTTPException(status_code=404, detail="Duck type not found")
    return dt


def _duck_type_dict(dt: DuckType) -> dict:
    return {"id": dt.id, "slug": dt.slug, "name": dt.name, "rarity": dt.rarity,
            "emoji": dt.emoji, "description": dt.description, "seasonal": dt.seasonal}


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
    {"key": "pond_3", "track": "Collection", "name": "Pond Starter",
     "description": "Unlock 3 ducks in your pond", "target": 3,
     "counter": "pond_unlocked", "reward_pool": ["rare"], "prefer_unowned": True},
    {"key": "pond_6", "track": "Collection", "name": "Pond Pro",
     "description": "Unlock 6 ducks in your pond", "target": 6,
     "counter": "pond_unlocked", "reward_pool": ["epic"], "prefer_unowned": True},
    {"key": "pond_9", "track": "Collection", "name": "Diamond Pond",
     "description": "Complete the full pond — all 9 ducks", "target": 9,
     "counter": "pond_unlocked", "reward_slug": "diamond_duck"},
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
    return 0


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
        for m in MILESTONES:
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
    """Grant starter ducks once: fires only if the user has no user_ducks rows at all."""
    if db.query(UserDuck).filter(UserDuck.user_id == user_id).count() == 0:
        classic = db.query(DuckType).filter(DuckType.slug == STARTER_DUCK_SLUG).first()
        if classic:
            db.add(UserDuck(user_id=user_id, duck_type_id=classic.id,
                            count=STARTER_DUCK_COUNT, first_received_at=datetime.utcnow()))
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
    for m in MILESTONES:
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
    _duck_type_or_404(db, payload.duck_type_id)
    _ensure_starter_ducks(db, current_user.id)

    _spend_duck(db, current_user.id, payload.duck_type_id, 1)
    _grant_duck(db, recipient.id, payload.duck_type_id, 1)
    db.add(DuckGive(giver_id=current_user.id, recipient_id=recipient.id,
                    duck_type_id=payload.duck_type_id, note=payload.note))
    _bump_legacy_duck_count(db, recipient)
    db.commit()
    done = _check_milestones(db, current_user.id) + _check_milestones(db, recipient.id)
    return {"message": "Duck given!", "recipient_duck_count": (recipient.settings or {}).get("duckCount", 0),
            "milestones_completed": done}


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
    for g in gives:
        uid = g.giver_id if metric == "given" else g.recipient_id
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
def create_drop(payload: DropCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
            "label": d.label, "claimed_by_me": d.id in claimed_ids,
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
