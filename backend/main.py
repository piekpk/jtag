import shutil
import os
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

# --- App Setup ---
app = FastAPI(title="Jtap Backend")
# This mount allows other devices to fetch images via the /uploads URL path
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# --- Auth Endpoints ---
@app.post("/signup", response_model=UserProfileResponse)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    # Force strict lowercase and remove accidental spaces on the server side
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

#---user login checking and returning user profile if successful
@app.post("/login", response_model=UserProfileResponse)
def login(user_credentials: UserCreate, db: Session = Depends(get_db)):
    # Normalize the email just like we do in signup
    normalized_email = user_credentials.email.strip().lower()
    
    # Look for the user in the database
    user = db.query(User).filter(User.email == normalized_email).first()
    
    # If the user doesn't exist, OR the password doesn't match the hash, reject them
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
    
    # Ensure the directory exists so the server doesn't crash during the first upload
    os.makedirs("uploads/profiles", exist_ok=True)
    
    # Generate a unique filename using UUID
    file_extension = file.filename.split(".")[-1]
    unique_filename = f"user_{user_id}_{uuid4().hex}.{file_extension}"
    file_location = f"uploads/profiles/{unique_filename}"
    
    # Save the file to the local directory
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)
        
    # Store the fully qualified URL in the database so the frontend can load it instantly
    user.profile_picture_url = f"http://192.168.50.158:8000/{file_location}"
    db.commit()
    
    return {"message": "Profile picture updated", "url": user.profile_picture_url}

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