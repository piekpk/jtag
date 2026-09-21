import shutil
import os
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from models import Base, User
from schemas import UserProfileUpdate, UserProfileResponse

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

# Mount the static files so the mobile app can request the images
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

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

    # Save the file locally on the server
    file_location = f"uploads/profiles/{user_id}_{file.filename}"
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)

    # Save the absolute URL including your specific IP so React Native can fetch it
    user.profile_picture_url = f"http://192.168.50.158:8000/{file_location}"
    db.commit()
    
    return {"message": "Profile picture updated", "url": user.profile_picture_url}
