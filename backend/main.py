import shutil
import os
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from passlib.context import CryptContext
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

# --- App Setup ---
app = FastAPI(title="Jtap Backend")
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
    file_location = f"uploads/profiles/{user_id}_{file.filename}"
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)
    user.profile_picture_url = f"http://192.168.50.158:8000/{file_location}"
    db.commit()
    return {"message": "Profile picture updated", "url": user.profile_picture_url}

@app.get("/users", response_model=list[UserProfileResponse])
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return users