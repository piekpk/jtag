import math
import random
from database import engine, SessionLocal, Base
from models import RigModel

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

# Reference center coordinate (Default: Farmingdale State College / Long Island area)
BASE_LAT = 40.7523
BASE_LON = -73.4277

rig_templates = [
    {"handle": "MudHound", "owner": "Dave R.", "gen": "JL", "trim": "Rubicon", "tire": 37, "winch": True, "radio": "GMRS 16", "img": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=400"},
    {"handle": "TrailTurtle", "owner": "Sarah M.", "gen": "JK", "trim": "Sahara", "tire": 33, "winch": False, "radio": "CB 4", "img": "https://images.unsplash.com/photo-1506015391300-4802dc74de2e?w=400"},
    {"handle": "RockCrawler99", "owner": "Mike T.", "gen": "TJ", "trim": "Sport", "tire": 35, "winch": True, "radio": "GMRS 21", "img": "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=400"},
    {"handle": "SandRunner", "owner": "Alex K.", "gen": "JL", "trim": "Willys", "tire": 35, "winch": False, "radio": "GMRS 8", "img": "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=400"},
    {"handle": "HighVoltage4x4", "owner": "Paul P.", "gen": "JL 4xe", "trim": "Sahara", "tire": 35, "winch": True, "radio": "GMRS 14", "img": "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400"},
    {"handle": "ApexOverland", "owner": "Chris B.", "gen": "JT", "trim": "Rubicon", "tire": 38, "winch": True, "radio": "GMRS 19", "img": "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=400"},
]

def add_random_offset(lat, lon, max_miles=15):
    # 1 degree lat ~ 69 miles
    radius_deg = max_miles / 69.0
    u = random.random()
    v = random.random()
    w = radius_deg * math.sqrt(u)
    t = 2 * math.pi * v
    delta_lat = w * math.cos(t)
    delta_lon = (w * math.sin(t)) / math.cos(math.radians(lat))
    return lat + delta_lat, lon + delta_lon

db = SessionLocal()
for item in rig_templates:
    r_lat, r_lon = add_random_offset(BASE_LAT, BASE_LON, max_miles=12)
    rig = RigModel(
        handle=item["handle"],
        owner_name=item["owner"],
        model_gen=item["gen"],
        trim=item["trim"],
        tire_size=item["tire"],
        has_winch=item["winch"],
        radio_channel=item["radio"],
        image_url=item["img"],
        latitude=r_lat,
        longitude=r_lon,
    )
    db.add(rig)

db.commit()
db.close()
print("Database seeded with mock rigs successfully.")