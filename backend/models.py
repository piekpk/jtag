from sqlalchemy import Column, Integer, String, Float, Boolean
from pydantic import BaseModel
from database import Base

class RigModel(Base):
    __tablename__ = "rigs"

    id = Column(Integer, primary_key=True, index=True)
    handle = Column(String, unique=True, index=True)
    owner_name = Column(String)
    model_gen = Column(String)       # e.g., 'JL', 'JK', 'TJ'
    trim = Column(String)            # e.g., 'Rubicon', 'Sahara', 'Willys'
    tire_size = Column(Integer)      # e.g., 35, 37
    has_winch = Column(Boolean, default=False)
    radio_channel = Column(String)   # e.g., 'GMRS 16'
    image_url = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)

# Pydantic Schemas
class RigResponse(BaseModel):
    id: int
    handle: str
    owner_name: str
    model_gen: str
    trim: str
    tire_size: int
    has_winch: bool
    radio_channel: str
    image_url: str
    distance_miles: float

    class Config:
        from_attributes = True