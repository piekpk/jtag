from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any

class UserCreate(BaseModel):
    email: str
    password: str

class UserProfileUpdate(BaseModel):
    settings: Optional[Dict[str, Any]] = None

class UserProfileResponse(BaseModel):
    id: int
    email: str
    profile_picture_url: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    is_admin: bool = False

    class Config:
        from_attributes = True


class SquadCreate(BaseModel):
    name: str
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    is_private: bool = False


class SquadMemberResponse(BaseModel):
    id: int
    squad_id: int
    user_id: int
    role: str
    joined_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SquadResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    created_by: int
    is_private: bool = False
    created_at: Optional[datetime] = None
    member_count: int = 0
    my_role: Optional[str] = None

    class Config:
        from_attributes = True
