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


class SquadMemberDetail(BaseModel):
    """One member in a squad detail payload.

    Deliberately carries no email: member lists are visible to other
    users, and email exposure in list/profile responses is a known
    open issue the team has not decided to widen.
    """

    user_id: int
    display_name: Optional[str] = None
    role: str
    joined_at: Optional[datetime] = None
    profile_picture_url: Optional[str] = None

    class Config:
        from_attributes = True


class SquadDetailResponse(SquadResponse):
    members: list[SquadMemberDetail] = []


class RigCreate(BaseModel):
    year: Optional[int] = None
    make: Optional[str] = None
    model: Optional[str] = None


class RigResponse(BaseModel):
    id: int
    user_id: int
    year: Optional[int] = None
    make: str
    model: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
