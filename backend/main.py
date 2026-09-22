import shutil
import os
import json
import sqlite3
from datetime import datetime
from uuid import uuid4
from math import radians, cos, sin, asin, sqrt
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from passlib.context import CryptContext
from pydantic import BaseModel
from models import Base, User
from schemas import UserProfileUpdate, UserProfileResponse, UserCreate

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- Database Setup ---
SQLALCHEMY_DATABASE_URL = "sqlite:///./jtap.db" 
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
    conn = sqlite3.connect('jtap.db')
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

# --- App Setup ---
app = FastAPI(title="Jtap Backend")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# --- Auth Endpoints ---
@app.post("/signup", response_model=UserProfileResponse)
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
    return new_user

@app.post("/login", response_model=UserProfileResponse)
def login(user_credentials: UserCreate, db: Session = Depends(get_db)):
    normalized_email = user_credentials.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()
    
    if not user or not pwd_context.verify(user_credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    return user

# --- Profile Endpoints ---
@app.get("/users/{user_id}/profile", response_model=UserProfileResponse)
def get_profile(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.patch("/users/{user_id}/profile", response_model=UserProfileResponse)
def update_profile(user_id: int, profile_data: UserProfileUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if profile_data.settings is not None:
        user.settings = profile_data.settings
    db.commit()
    db.refresh(user)
    return user

@app.post("/users/{user_id}/profile-picture")
def upload_profile_picture(user_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    os.makedirs("uploads/profiles", exist_ok=True)
    
    file_extension = file.filename.split(".")[-1]
    unique_filename = f"user_{user_id}_{uuid4().hex}.{file_extension}"
    file_location = f"uploads/profiles/{unique_filename}"
    
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)
        
    user.profile_picture_url = f"http://192.168.50.158:8000/{file_location}"
    db.commit()
    
    return {"message": "Profile picture updated", "url": user.profile_picture_url}

@app.post("/users/{user_id}/duck")
def duck_user_rig(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    current_settings = dict(user.settings or {})
    current_duck_count = current_settings.get("duckCount", 0) + 1
    current_settings["duckCount"] = current_duck_count
    
    user.settings = current_settings
    db.commit()
    db.refresh(user)
    
    return {"message": "Rig ducked successfully!", "duckCount": current_duck_count}

@app.get("/users", response_model=list[UserProfileResponse])
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return users

# --- Location & Map Endpoints ---
@app.put("/users/{user_id}/location")
def update_location(user_id: int, location: LocationUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.latitude = location.lat
    user.longitude = location.lng
    db.commit()
    return {"message": "Location updated successfully"}

@app.get("/users/nearby")
def get_nearby_users(lat: float, lng: float, radiusInMeters: float = 8000, db: Session = Depends(get_db)):
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

# --- Chat & Reaction Endpoints ---
@app.get("/chat")
def get_chat_messages(channel: str = "global", lat: float = None, lng: float = None):
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
def post_chat_message(chat: ChatMessageCreate, db: Session = Depends(get_db)):
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
def react_to_message(message_id: int, reaction: ReactionCreate):
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