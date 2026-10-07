"""Direct FCM (HTTP v1) push delivery, bypassing Expo's push service.

Why this exists: Expo's push API kept returning InvalidCredentials
("Unable to retrieve the FCM server key for the recipient's app") even with
a correctly uploaded FCM V1 service-account key, so the backend now talks to
Firebase Cloud Messaging directly. The Expo path is kept as a fallback.

Setup on the backend machine (one time):
  1. pip install cryptography        (needed to sign the OAuth JWT)
  2. Copy the Firebase service-account JSON (Firebase console ->
     Project settings -> Service accounts -> Generate new private key)
     to  backend/fcm-service-account.json
     (or set the FCM_SERVICE_ACCOUNT_FILE env var to its path).
     NEVER commit this file - it is gitignored.

The mobile app sends its native Android FCM token to POST /users/me/fcm-token
(see mobile/app/push.js). _notify_user() in main.py prefers this direct path
and falls back to the Expo Push API when no native token is on file.
"""

import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

_OAUTH_URL = "https://oauth2.googleapis.com/token"
_FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"

_cache = {"token": None, "exp": 0}
_warned_no_key = False
_warned_no_crypto = False


def key_path():
    """Where the service-account JSON is expected."""
    return os.environ.get("FCM_SERVICE_ACCOUNT_FILE") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "fcm-service-account.json")


def _load_service_account():
    global _warned_no_key
    path = key_path()
    if not os.path.exists(path):
        if not _warned_no_key:
            print(f"FCM direct: no service-account key at {path}; "
                  "direct push disabled (Expo fallback still active).")
            _warned_no_key = True
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            sa = json.load(f)
    except Exception as e:
        print(f"FCM direct: could not read service-account file: {e}")
        return None
    if (sa.get("type") != "service_account" or not sa.get("private_key")
            or not sa.get("client_email") or not sa.get("project_id")):
        print("FCM direct: service-account file is missing required fields.")
        return None
    return sa


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _mint_access_token(sa):
    """OAuth2 access token via the JWT-bearer grant. Returns (token, expires_at)."""
    global _warned_no_crypto
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
    except ImportError:
        if not _warned_no_crypto:
            print("FCM direct: the 'cryptography' package is not installed "
                  "(run: pip install cryptography). Direct push disabled.")
            _warned_no_crypto = True
        return None, 0
    now = int(time.time())
    header = _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = _b64url(json.dumps({
        "iss": sa["client_email"],
        "scope": _FCM_SCOPE,
        "aud": _OAUTH_URL,
        "iat": now,
        "exp": now + 3600,
    }).encode())
    try:
        key = serialization.load_pem_private_key(
            sa["private_key"].encode(), password=None)
        sig = key.sign(f"{header}.{claims}".encode("ascii"),
                       padding.PKCS1v15(), hashes.SHA256())
    except Exception as e:
        print(f"FCM direct: could not sign OAuth JWT: {e}")
        return None, 0
    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": f"{header}.{claims}.{_b64url(sig)}",
    }).encode()
    req = urllib.request.Request(
        _OAUTH_URL, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data["access_token"], now + int(data.get("expires_in", 3600))
    except Exception as e:
        print(f"FCM direct: OAuth token request failed: {e}")
        return None, 0


def _access_token(sa):
    now = int(time.time())
    if _cache["token"] and _cache["exp"] - 60 > now:
        return _cache["token"]
    token, exp = _mint_access_token(sa)
    _cache["token"], _cache["exp"] = token, exp
    return token


def send_fcm_direct(fcm_token, title, body, data=None):
    """Send a push straight through FCM HTTP v1.

    Never raises. Returns True when FCM accepted the message.
    """
    if not fcm_token:
        return False
    sa = _load_service_account()
    if not sa:
        return False
    token = _access_token(sa)
    if not token:
        return False
    url = ("https://fcm.googleapis.com/v1/projects/"
           f"{sa['project_id']}/messages:send")
    payload = json.dumps({
        "message": {
            "token": fcm_token,
            "notification": {"title": title, "body": body},
            "data": {str(k): str(v) for k, v in (data or {}).items()},
            "android": {
                "priority": "HIGH",
                "notification": {
                    "channel_id": "default",
                    "sound": "default",
                },
            },
        }
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            name = json.loads(resp.read().decode("utf-8")).get("name")
        print(f"FCM direct ok: {name}")
        return True
    except urllib.error.HTTPError as e:
        print(f"FCM direct failed: HTTP {e.code}: "
              f"{e.read().decode('utf-8', 'replace')[:300]}")
        return False
    except Exception as e:
        print(f"FCM direct failed: {e}")
        return False
