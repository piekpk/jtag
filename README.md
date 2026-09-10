# TrailGrid: 4x4 Proximity Community App

An enthusiast mobile application designed for 4x4 and off-road vehicle owners to locate nearby rigs, compare builds, and request trail assistance.

## Architecture
- **Backend:** Python 3.10+, FastAPI, Uvicorn, SQLite
- **Mobile Client:** React Native, Expo, Expo Location
- **Spatial Engine:** Haversine great-circle distance algorithm

## Setup Instructions

### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python seed.py            # Generates mock profiles around your area
uvicorn main:app --reload --host 0.0.0.0 --port 8000

run command 
$env:REACT_NATIVE_PACKAGER_HOSTNAME="192.168.86.34"; npx expo start --clear

to avctivate android app
