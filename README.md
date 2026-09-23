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
cp .env.example .env      # then set JTAP_SECRET_KEY
python seed.py            # Generates mock profiles around your area
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000` (health check: `/health`).
Uploads and the SQLite database live under `DATA_DIR` (defaults to the backend folder).

### 2. Mobile App Setup
```bash
cd mobile
# Point the app at your backend (use your machine's LAN IP for a physical device,
# or an ngrok URL if you need public access):
# EXPO_PUBLIC_API_URL=http://192.168.x.x:8000
npx expo start --clear
```

To build a standalone Android APK for testing:
```bash
cd mobile/android
./gradlew assembleRelease
```

### Notes
- The backend must be reachable from your phone: run both on the same Wi-Fi,
  or expose it publicly with e.g. `ngrok http 8000` and set `EXPO_PUBLIC_API_URL`
  to the public URL in `mobile/app/config.js` (via env).
- `*.db`, `uploads/`, and `.env` are gitignored and stay local.
