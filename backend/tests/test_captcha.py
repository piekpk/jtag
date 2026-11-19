"""Tests for login CAPTCHA after repeated failed sign-ins (backend/main.py:
 /login gate + GET /auth/captcha/site-key, issue #101).

Design:
- Failed password logins are counted per account (email) and per client
  IP (X-Forwarded-For first hop, else the direct peer). After
  CAPTCHA_FAILED_ATTEMPT_THRESHOLD (5) failures for either side, /login
  rejects the login with captcha_required until a valid hCaptcha token is
  supplied and verified server-side. A successful login clears the
  counter for that email and IP.
- All CAPTCHA settings come from env vars only (HCAPTCHA_SITE_KEY /
  HCAPTCHA_SECRET_KEY); the hCaptcha verify call is monkeypatched here
  so no network is touched.
- Equivalence classes: under threshold, at threshold, over threshold
  (wrong password / correct password / no token / bad token / good
  token), per-account vs per-IP counting, CAPTCHA not configured,
  siteverify transport failure.
- Boundary analysis: 4 failures do not gate the login; the 5th failure
  does. A successful login resets the counter, so 4 more failures after
  a success still do not gate.
- Endpoint functions are called directly with a scratch SQLite session
  (no HTTP layer); one behaviour per test, Arrange-Act-Assert throughout.
"""

import json
import os
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
from starlette.requests import Request

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

THRESHOLD = 5


@pytest.fixture(scope="module")
def app(tmp_path_factory):
    """Import backend.main against a scratch DATA_DIR; return the module.

    DATA_DIR must be set before the import, because the module creates its
    engine and runs its lightweight migrations at import time.
    """
    data_dir = tmp_path_factory.mktemp("jtap-data")
    os.environ["DATA_DIR"] = str(data_dir)
    import main

    return main


@pytest.fixture()
def db(app):
    """A fresh session on the scratch DB; wiped after each test."""
    session = app.SessionLocal()
    try:
        yield session
    finally:
        session.query(app.FailedLoginAttempt).delete()
        session.query(app.User).delete()
        session.commit()
        session.close()


@pytest.fixture()
def user(app, db):
    """One registered user with password 'secret123'."""
    u = app.User(
        email="login-user@example.com",
        hashed_password=app.pwd_context.hash("secret123"),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _request(ip="127.0.0.1", forwarded_for=None):
    """A bare starlette Request carrying the given client IP."""
    headers = []
    if forwarded_for is not None:
        headers.append((b"x-forwarded-for", forwarded_for.encode()))
    return Request({
        "type": "http",
        "method": "POST",
        "path": "/login",
        "headers": headers,
        "client": (ip, 12345),
    })


def _login(app, db, email, password, token=None, ip="127.0.0.1", forwarded_for=None):
    """Call POST /login directly. Returns (status, detail-or-response)."""
    try:
        result = app.login(
            body=app.LoginRequest(email=email, password=password, captcha_token=token),
            request=_request(ip=ip, forwarded_for=forwarded_for),
            db=db,
        )
    except HTTPException as exc:
        return exc.status_code, exc.detail
    return 200, result


def _fail_logins(app, db, count, email="login-user@example.com", ip="127.0.0.1"):
    """Record `count` failed password logins; each must come back 401."""
    for _ in range(count):
        status, _ = _login(app, db, email, "wrong-password", ip=ip)
        assert status == 401


# ---------------------------------------------------------------------------
# Under threshold: plain password login, no CAPTCHA involved
# ---------------------------------------------------------------------------

def test_login_under_threshold_succeeds_without_captcha(app, db, user):
    # Act
    status, result = _login(app, db, user.email, "secret123")
    # Assert
    assert status == 200
    assert result.email == user.email
    assert result.access_token


def test_four_failures_do_not_gate_login(app, db, user):
    # Arrange: 4 wrong passwords (one below the threshold)
    _fail_logins(app, db, THRESHOLD - 1)
    # Act: the correct password still logs in with no token
    status, result = _login(app, db, user.email, "secret123")
    # Assert
    assert status == 200
    assert result.access_token


def test_wrong_password_returns_401_and_counts(app, db, user):
    # Act
    status, detail = _login(app, db, user.email, "wrong-password")
    # Assert
    assert status == 401
    assert detail == "Invalid email or password"
    assert db.query(app.FailedLoginAttempt).count() == 1


# ---------------------------------------------------------------------------
# At / over threshold: the CAPTCHA gate
# ---------------------------------------------------------------------------

def test_five_failures_gate_login(app, db, user):
    # Arrange: 5 wrong passwords trip the threshold
    _fail_logins(app, db, THRESHOLD)
    # Act: even the correct password is rejected without a token
    status, detail = _login(app, db, user.email, "secret123")
    # Assert
    assert status == 403
    assert isinstance(detail, dict)
    assert detail["captcha_required"] is True


def test_over_threshold_wrong_password_still_requires_captcha(app, db, user):
    # Arrange: 5 wrong passwords trip the threshold
    _fail_logins(app, db, THRESHOLD)
    # Act: another wrong password gets the CAPTCHA signal, not a 401
    status, detail = _login(app, db, user.email, "still-wrong")
    # Assert
    assert status == 403
    assert isinstance(detail, dict)
    assert detail["captcha_required"] is True


def test_over_threshold_invalid_token_rejected(app, db, user, monkeypatch):
    # Arrange: 5 failures, and the hCaptcha check will fail
    _fail_logins(app, db, THRESHOLD)
    monkeypatch.setattr(app, "_verify_hcaptcha", lambda token, ip: False)
    monkeypatch.setattr(app, "HCAPTCHA_SECRET_KEY", "secret-key")
    # Act: correct password + a token that does not verify
    status, detail = _login(app, db, user.email, "secret123", token="bad-token")
    # Assert
    assert status == 403
    assert isinstance(detail, dict)
    assert detail["captcha_required"] is True
    assert "verification failed" in detail["message"]


def test_over_threshold_valid_token_allows_login_and_resets(app, db, user, monkeypatch):
    # Arrange: 5 failures, and the hCaptcha check will pass
    _fail_logins(app, db, THRESHOLD)
    monkeypatch.setattr(app, "_verify_hcaptcha", lambda token, ip: True)
    monkeypatch.setattr(app, "HCAPTCHA_SECRET_KEY", "secret-key")
    # Act: correct password + a valid token
    status, result = _login(app, db, user.email, "secret123", token="good-token")
    # Assert: the login succeeds...
    assert status == 200
    assert result.access_token
    # ...and the counter is reset, so the next login needs no token
    status, result = _login(app, db, user.email, "secret123")
    assert status == 200


def test_successful_login_resets_counter(app, db, user):
    # Arrange: 3 failures, then a success (counter cleared)
    _fail_logins(app, db, 3)
    status, _ = _login(app, db, user.email, "secret123")
    assert status == 200
    # Act: 4 more failures (one below the threshold again)
    _fail_logins(app, db, THRESHOLD - 1)
    status, result = _login(app, db, user.email, "secret123")
    # Assert: still no CAPTCHA gate, because the earlier failures were cleared
    assert status == 200
    assert result.access_token


def test_per_ip_threshold_gates_other_accounts(app, db, user):
    # Arrange: 5 failures from one IP, each against a different
    # (nonexistent) email — the IP itself trips the threshold
    for i in range(THRESHOLD):
        status, _ = _login(app, db, f"nobody-{i}@example.com", "wrong", ip="198.51.100.7")
        assert status == 401
    # Act: the real user logs in from that same IP without a token
    status, detail = _login(app, db, user.email, "secret123", ip="198.51.100.7")
    # Assert: gated by the IP counter
    assert status == 403
    assert isinstance(detail, dict)
    assert detail["captcha_required"] is True
    # ...but the same user from a different IP is unaffected
    status, result = _login(app, db, user.email, "secret123", ip="203.0.113.9")
    assert status == 200


def test_captcha_not_configured_returns_500(app, db, user, monkeypatch):
    # Arrange: 5 failures, a token is supplied, but no secret key is set
    _fail_logins(app, db, THRESHOLD)
    monkeypatch.setattr(app, "HCAPTCHA_SECRET_KEY", "")
    # Act
    status, detail = _login(app, db, user.email, "secret123", token="some-token")
    # Assert: fail fast instead of calling siteverify without a secret
    assert status == 500
    assert "not configured" in detail


# ---------------------------------------------------------------------------
# hCaptcha verification helper (fails closed)
# ---------------------------------------------------------------------------

class _FakeResp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        self.text = json.dumps(payload)

    def json(self):
        return self._payload


def test_verify_hcaptcha_success(app, monkeypatch):
    # Arrange: siteverify says success
    monkeypatch.setattr(
        app.requests, "post",
        lambda url, data, timeout: _FakeResp(200, {"success": True}),
    )
    monkeypatch.setattr(app, "HCAPTCHA_SECRET_KEY", "secret-key")
    # Act / Assert
    assert app._verify_hcaptcha("token", "127.0.0.1") is True


def test_verify_hcaptcha_rejected(app, monkeypatch):
    # Arrange: siteverify says success=false
    monkeypatch.setattr(
        app.requests, "post",
        lambda url, data, timeout: _FakeResp(200, {"success": False, "error-codes": ["invalid-input-response"]}),
    )
    monkeypatch.setattr(app, "HCAPTCHA_SECRET_KEY", "secret-key")
    # Act / Assert
    assert app._verify_hcaptcha("token", "127.0.0.1") is False


def test_verify_hcaptcha_transport_failure_fails_closed(app, monkeypatch):
    # Arrange: the siteverify request itself raises
    def _boom(url, data, timeout):
        raise app.requests.RequestException("network down")

    monkeypatch.setattr(app.requests, "post", _boom)
    monkeypatch.setattr(app, "HCAPTCHA_SECRET_KEY", "secret-key")
    # Act / Assert
    assert app._verify_hcaptcha("token", "127.0.0.1") is False


def test_verify_hcaptcha_non_200_fails_closed(app, monkeypatch):
    # Arrange: siteverify answers with a server error
    monkeypatch.setattr(
        app.requests, "post",
        lambda url, data, timeout: _FakeResp(500, {}),
    )
    monkeypatch.setattr(app, "HCAPTCHA_SECRET_KEY", "secret-key")
    # Act / Assert
    assert app._verify_hcaptcha("token", "127.0.0.1") is False


def test_verify_hcaptcha_empty_token_rejected(app):
    # Act / Assert: no token, no network call, just False
    assert app._verify_hcaptcha("", "127.0.0.1") is False
    assert app._verify_hcaptcha(None, "127.0.0.1") is False


# ---------------------------------------------------------------------------
# Client IP resolution + site-key endpoint
# ---------------------------------------------------------------------------

def test_client_ip_prefers_forwarded_for(app):
    req = _request(ip="10.0.0.1", forwarded_for="203.0.113.9, 10.0.0.1")
    assert app._client_ip(req) == "203.0.113.9"


def test_client_ip_falls_back_to_direct_peer(app):
    assert app._client_ip(_request(ip="198.51.100.3")) == "198.51.100.3"


def test_client_ip_without_request_is_unknown(app):
    assert app._client_ip(None) == "unknown"


def test_site_key_endpoint(app, monkeypatch):
    # Arrange: a site key is configured...
    monkeypatch.setattr(app, "HCAPTCHA_SITE_KEY", "site-key-123")
    # Act / Assert
    assert app.get_captcha_site_key() == {"site_key": "site-key-123", "configured": True}
    # ...and without one the app is told plainly there is no key
    monkeypatch.setattr(app, "HCAPTCHA_SITE_KEY", "")
    assert app.get_captcha_site_key() == {"site_key": None, "configured": False}
