import math
from typing import List
from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import get_db
from models import RigModel, RigResponse

app = FastAPI(title="TrailGrid Proximity Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.8  # Earth's radius in miles
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

@app.get("/api/rigs/nearby", response_model=List[RigResponse])
def get_nearby_rigs(
    lat: float = Query(..., description="Current latitude"),
    lon: float = Query(..., description="Current longitude"),
    db: Session = Depends(get_db)
):
    rigs = db.query(RigModel).all()
    results = []

    for rig in rigs:
        dist = haversine_distance(lat, lon, rig.latitude, rig.longitude)
        results.append({
            "id": rig.id,
            "handle": rig.handle,
            "owner_name": rig.owner_name,
            "model_gen": rig.model_gen,
            "trim": rig.trim,
            "tire_size": rig.tire_size,
            "has_winch": rig.has_winch,
            "radio_channel": rig.radio_channel,
            "image_url": rig.image_url,
            "distance_miles": round(dist, 1)
        })

    # Sort ascending by distance (nearest first)
    results.sort(key=lambda x: x["distance_miles"])
    return results