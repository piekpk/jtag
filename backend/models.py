from sqlalchemy import Column, Integer, String, Text, JSON, Float, DateTime, Boolean, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    profile_picture_url = Column(String, nullable=True)
    settings = Column(JSON, server_default='{}')
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    is_admin = Column(Boolean, nullable=False, default=False, server_default="0")
    is_banned = Column(Boolean, nullable=False, default=False, server_default="0")
    push_token = Column(String, nullable=True)  # Expo push token for duck/push notifications


# --- Duck Game Models ---
class DuckType(Base):
    """Catalog of collectible ducks."""
    __tablename__ = "duck_types"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    rarity = Column(String, nullable=False, default="common")  # common | rare | epic | legendary
    emoji = Column(String, nullable=False, default="🐤")
    description = Column(String, nullable=True)
    lore = Column(Text, nullable=True)  # AI-generated backstory (duck_ai)
    seasonal = Column(String, nullable=True)  # e.g. "halloween", "winter", or None
    image_url = Column(String, nullable=True)  # custom sprite, e.g. /uploads/ducks/pirates/pirates-01.png


class UserDuck(Base):
    """Per-user duck inventory. A row's existence = pond unlocked (permanent);
    count = spendable ducks the user currently holds."""
    __tablename__ = "user_ducks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    duck_type_id = Column(Integer, index=True, nullable=False)
    count = Column(Integer, nullable=False, default=0)
    first_received_at = Column(DateTime, nullable=True)


class DuckGive(Base):
    """Log of every duck given from one user to another (powers feed + leaderboard)."""
    __tablename__ = "duck_gives"

    id = Column(Integer, primary_key=True, index=True)
    giver_id = Column(Integer, index=True, nullable=False)
    recipient_id = Column(Integer, index=True, nullable=False)
    duck_type_id = Column(Integer, nullable=False)
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class DuckDrop(Base):
    """A limited-time duck spawn at a real-world location."""
    __tablename__ = "duck_drops"

    id = Column(Integer, primary_key=True, index=True)
    duck_type_id = Column(Integer, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radius_m = Column(Float, nullable=False, default=200.0)
    starts_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    max_claims = Column(Integer, nullable=False, default=50)
    claims_count = Column(Integer, nullable=False, default=0)
    created_by = Column(Integer, nullable=True)
    label = Column(String, nullable=True)
    clue = Column(String, nullable=True)  # AI-generated scavenger-hunt clue (duck_ai)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class DropClaim(Base):
    """One claim per user per drop."""
    __tablename__ = "drop_claims"

    id = Column(Integer, primary_key=True, index=True)
    drop_id = Column(Integer, index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=False)
    claimed_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Trade(Base):
    """A proposed duck swap between two users."""
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    proposer_id = Column(Integer, index=True, nullable=False)
    recipient_id = Column(Integer, index=True, nullable=False)
    offered_duck_type_id = Column(Integer, nullable=False)
    offered_qty = Column(Integer, nullable=False, default=1)
    requested_duck_type_id = Column(Integer, nullable=False)
    requested_qty = Column(Integer, nullable=False, default=1)
    status = Column(String, nullable=False, default="pending")  # pending | accepted | declined | cancelled | expired
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    decided_at = Column(DateTime, nullable=True)

class UserMilestone(Base):
    """One-time milestone completions per user (rewards auto-granted)."""
    __tablename__ = "user_milestones"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    key = Column(String, index=True, nullable=False)
    claimed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class Milestone(Base):
    """Admin-created custom milestones. Key is derived as f"custom_{id}"."""
    __tablename__ = "milestones"

    id = Column(Integer, primary_key=True, index=True)
    track = Column(String, nullable=False, default="Activity")
    name = Column(String, nullable=False)
    description = Column(String, nullable=False, default="")
    target = Column(Integer, nullable=False, default=1)
    counter = Column(String, nullable=False)  # ducks_given | drops_claimed | drops_created | trades_completed | pond_unlocked | photo_reactions
    reward_pool = Column(Text, nullable=True)  # JSON list of rarities, e.g. ["rare", "epic"]
    reward_slug = Column(String, nullable=True)  # specific duck type slug
    prefer_unowned = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class PhotoReaction(Base):
    """Likes/emoji reactions on a specific photo slot of another user's profile."""
    __tablename__ = "photo_reactions"

    id = Column(Integer, primary_key=True, index=True)
    photo_owner_id = Column(Integer, index=True, nullable=False)
    photo_index = Column(Integer, nullable=False)  # 0-3 slot in settings.photos
    user_id = Column(Integer, index=True, nullable=False)
    emoji = Column(String(16), nullable=False)  # like | duck | jeep | wave
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("photo_owner_id", "photo_index", "user_id", "emoji"),
    )

class MarketListing(Base):
    """Marketplace listing: one photo, description, contact info."""
    __tablename__ = "market_listings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    photo_url = Column(String, nullable=False)
    title = Column(String(120), nullable=False)
    price = Column(Float, nullable=False, default=0.0)
    description = Column(Text, nullable=False)
    contact_info = Column(String(200), nullable=False)
    category = Column(String(60), nullable=False, default="Other")
    is_sold = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class Notification(Base):
    """In-app notification inbox entries (ducked, etc.). Push mirrors via Expo."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    type = Column(String, nullable=False, default="general")  # ducked | general
    title = Column(String, nullable=False)
    body = Column(String, nullable=False, default="")
    data = Column(JSON, nullable=True)
    is_read = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Meetup(Base):
    """A user-planned meetup at a real-world location."""
    __tablename__ = "meetups"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(80), nullable=False)
    description = Column(String(500), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class MeetupRsvp(Base):
    """One RSVP per user per meetup."""
    __tablename__ = "meetup_rsvps"

    id = Column(Integer, primary_key=True, index=True)
    meetup_id = Column(Integer, index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class PlaceSearch(Base):
    """A JtapBot nearby-places answer, so chat can deep-link it onto the map."""
    __tablename__ = "place_searches"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)  # who asked
    category = Column(String(20), nullable=False)  # gas | mechanic | tow | food
    results = Column(JSON, nullable=False, default=list)  # [{name,lat,lng,distance_mi,hours,phone}]
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
