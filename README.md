# Jtap: 4x4 Proximity Community App

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
 
gitignore file was updated to ignore database backend



the apk is standalone and will need to be installed on each users phone
the backend server needs to be running locally on a laptop 
two terminal windows are requiered to run the backend server
both terminals need to be in the C:\jeep-proximity-app\jtag\backend> directory
1 terminal will need to run ngrok
 ngrok http 8000 --url https://unknowing-dropper-starfish.ngrok-free.dev 
 2 terminal will need to run the lightSQL
 python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload