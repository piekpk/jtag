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
python -m uvicorn main:app --reload --host 192.168.50.158 --port 8000
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

run command 
$env:REACT_NATIVE_PACKAGER_HOSTNAME="192.168.50.158"; npx expo start --clear

to avctivate android app

this will build a new apk to test
./gradlew assembleRelease

run ngrok to have a public url for local database
 ngrok http 8000 --url https://unknowing-dropper-starfish.ngrok-free.dev
 url is moved to config.js
 
