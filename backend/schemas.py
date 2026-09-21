from pydantic import BaseModel
from typing import Optional, Dict, Any

class UserProfileUpdate(BaseModel):
    settings: Optional[Dict[str, Any]] = None

class UserProfileResponse(BaseModel):
    id: int
    email: str
    profile_picture_url: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True
