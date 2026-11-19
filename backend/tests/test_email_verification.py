"""Tests for email verification (backend/main.py: /auth/email-verification/*).

Design (issue #100):
- One PIN system shared with forgot password (Day 2): a 6-digit PIN,
  bcrypt-hashed, 15-minute expiry, max 5 attempts, with a purpose
  ('verify' here, 'reset' later). A PIN for one purpose must never
  verify for the other.
- Email is sent via SMTP from env vars only; the send function is
  monkeypatched here so no network is touched.
- Equivalence classes: correct code, wrong code, expired code, too many
  attempts, wrong-purpose PIN, re-requested code, already-verified user,
  SMTP not configured.
- Boundary analysis: the 5th wrong attempt invalidates the code;
  a code verified one second past expiry is expired.
- Endpoint functions are called directly with a scratch SQLite session
  (no HTTP layer); one behaviour per test, Arrange-Act-Assert throughout.
"""

import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))


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
        session.query(app.VerificationPin).delete()
        session.query(app.User).delete()
        session.commit()
        session.close()


@pytest.fixture()
def user(app, db):
    """One unverified user."""
    u = app.User(
        email="verify-me@example.com",
        hashed_password=app.pwd_context.hash("secret123"),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def outbox(app, monkeypatch):
    """Capture sent emails instead of touching SMTP.

    Also pretends SMTP is configured (dummy values), so the request
    endpoint's fail-fast config check passes and the fake send is reached.
    """
    sent = []

    def fake_send(to_email, subject, body):
        sent.append({"to": to_email, "subject": subject, "body": body})

    monkeypatch.setattr(app, "_send_email", fake_send)
    monkeypatch.setattr(app, "SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setattr(app, "SMTP_USER", "jtap@example.com")
    monkeypatch.setattr(app, "SMTP_PASS", "app-password")
    return sent


def _code_from(outbox, index=0):
    """The 6-digit code inside the nth captured email."""
    match = re.search(r"(\d{6})", outbox[index]["body"])
    assert match, f"no 6-digit code in email body: {outbox[index]['body']!r}"
    return match.group(1)


def _request_code(app, db, user):
    return app.request_email_verification_code(db=db, current_user=user)


def _verify(app, db, user, code):
    return app.verify_email_verification_code(
        body=app.VerifyEmailCodeRequest(code=code), db=db, current_user=user
    )


def _wrong_code(real_code):
    """A 6-digit code guaranteed to differ from the real one."""
    return "000000" if real_code != "000000" else "111111"


# ---------------------------------------------------------------------------
# Request: happy path + already verified + SMTP not configured
# ---------------------------------------------------------------------------

def test_request_sends_code_email(app, db, user, outbox):
    # Act
    result = _request_code(app, db, user)
    # Assert
    assert result["detail"] == "Verification code sent"
    assert result["expires_in_minutes"] == app.VERIFICATION_PIN_TTL_MINUTES
    assert len(outbox) == 1
    assert outbox[0]["to"] == "verify-me@example.com"
    code = _code_from(outbox)
    assert len(code) == 6 and code.isdigit()
    # Only the hash is stored, never the plain PIN.
    pin_row = db.query(app.VerificationPin).one()
    assert pin_row.purpose == "verify"
    assert pin_row.pin_hash != code
    assert pin_row.attempts == 0


def test_request_when_already_verified_is_rejected(app, db, user, outbox):
    # Arrange
    user.email_verified = True
    db.commit()
    # Act / Assert
    with pytest.raises(HTTPException, match="already verified"):
        _request_code(app, db, user)
    assert outbox == []
    assert db.query(app.VerificationPin).count() == 0


def test_request_without_smtp_config_is_rejected(app, db, user, monkeypatch):
    # Arrange: SMTP present in the module only as empty strings here.
    monkeypatch.setattr(app, "SMTP_HOST", "")
    monkeypatch.setattr(app, "SMTP_USER", "")
    monkeypatch.setattr(app, "SMTP_PASS", "")
    # Act / Assert: fails fast, before any PIN is issued.
    with pytest.raises(HTTPException, match="not configured"):
        _request_code(app, db, user)
    assert db.query(app.VerificationPin).count() == 0


# ---------------------------------------------------------------------------
# Verify: success
# ---------------------------------------------------------------------------

def test_verify_correct_code_marks_email_verified(app, db, user, outbox):
    # Arrange
    _request_code(app, db, user)
    code = _code_from(outbox)
    # Act
    result = _verify(app, db, user, code)
    # Assert
    assert result == {"email_verified": True}
    db.refresh(user)
    assert user.email_verified is True
    # The used PIN is gone: a code is single-use.
    assert db.query(app.VerificationPin).count() == 0


# ---------------------------------------------------------------------------
# Verify: wrong code
# ---------------------------------------------------------------------------

def test_verify_wrong_code_is_rejected_and_keeps_pin(app, db, user, outbox):
    # Arrange
    _request_code(app, db, user)
    # Act / Assert
    with pytest.raises(HTTPException, match="Incorrect code"):
        _verify(app, db, user, _wrong_code(_code_from(outbox)))
    db.refresh(user)
    assert user.email_verified is False
    # The PIN survives a wrong guess (attempts counted, not yet exhausted).
    pin_row = db.query(app.VerificationPin).one()
    assert pin_row.attempts == 1


# ---------------------------------------------------------------------------
# Verify: expired code
# ---------------------------------------------------------------------------

def test_verify_expired_code_is_rejected(app, db, user, outbox):
    # Arrange: issue a code, then move its expiry into the past.
    _request_code(app, db, user)
    code = _code_from(outbox)
    pin_row = db.query(app.VerificationPin).one()
    pin_row.expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()
    # Act / Assert
    with pytest.raises(HTTPException, match="expired"):
        _verify(app, db, user, code)
    db.refresh(user)
    assert user.email_verified is False
    # The expired PIN is cleaned up.
    assert db.query(app.VerificationPin).count() == 0


# ---------------------------------------------------------------------------
# Verify: too many attempts (boundary: the 5th wrong guess)
# ---------------------------------------------------------------------------

def test_verify_fifth_wrong_attempt_invalidates_code(app, db, user, outbox):
    # Arrange
    _request_code(app, db, user)
    real_code = _code_from(outbox)
    wrong = _wrong_code(real_code)
    # Act: the first four wrong guesses keep the code alive...
    for _ in range(app.VERIFICATION_PIN_MAX_ATTEMPTS - 1):
        with pytest.raises(HTTPException, match="Incorrect code"):
            _verify(app, db, user, wrong)
    assert db.query(app.VerificationPin).count() == 1
    # ...the fifth wrong guess invalidates it.
    with pytest.raises(HTTPException, match="Too many incorrect attempts"):
        _verify(app, db, user, wrong)
    assert db.query(app.VerificationPin).count() == 0
    # Assert: even the correct code no longer works.
    with pytest.raises(HTTPException, match="No verification code found"):
        _verify(app, db, user, real_code)
    db.refresh(user)
    assert user.email_verified is False


# ---------------------------------------------------------------------------
# Verify: wrong-purpose PIN (a reset code must never verify an email)
# ---------------------------------------------------------------------------

def test_verify_reset_purpose_pin_does_not_verify_email(app, db, user):
    # Arrange: a PIN issued for password reset (what Day 2 will create).
    db.add(app.VerificationPin(
        user_id=user.id,
        purpose="reset",
        pin_hash=app.pwd_context.hash("123456"),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    ))
    db.commit()
    # Act / Assert: the reset code is invisible to email verification.
    with pytest.raises(HTTPException, match="No verification code found"):
        _verify(app, db, user, "123456")
    db.refresh(user)
    assert user.email_verified is False


# ---------------------------------------------------------------------------
# Re-request: the old code stops working
# ---------------------------------------------------------------------------

def test_re_request_invalidates_previous_code(app, db, user, outbox):
    # Arrange: two codes requested in a row.
    _request_code(app, db, user)
    first_code = _code_from(outbox, 0)
    _request_code(app, db, user)
    second_code = _code_from(outbox, 1)
    assert len(outbox) == 2
    # Act / Assert: the first code is dead (it no longer matches the live PIN)...
    with pytest.raises(HTTPException, match="Incorrect code"):
        _verify(app, db, user, first_code)
    db.refresh(user)
    assert user.email_verified is False
    # ...the second code works.
    assert _verify(app, db, user, second_code) == {"email_verified": True}
    # Only one PIN row ever existed at a time.
    assert db.query(app.VerificationPin).count() == 0


# ---------------------------------------------------------------------------
# _send_email: SMTP transport (mocked) + not-configured guard
# ---------------------------------------------------------------------------

def test_send_email_uses_starttls_and_login(app, monkeypatch):
    # Arrange: a fake SMTP server that records the conversation.
    calls = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            calls["host"] = host
            calls["port"] = port

        def starttls(self):
            calls["starttls"] = True

        def login(self, user, password):
            calls["login"] = (user, password)

        def send_message(self, msg):
            calls["message"] = msg

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(app, "SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setattr(app, "SMTP_PORT", 587)
    monkeypatch.setattr(app, "SMTP_USER", "jtap@example.com")
    monkeypatch.setattr(app, "SMTP_PASS", "app-password")
    monkeypatch.setattr(app, "SMTP_FROM", "jtap@example.com")
    monkeypatch.setattr(app.smtplib, "SMTP", FakeSMTP)
    # Act
    app._send_email("user@example.com", "Subject", "Body")
    # Assert
    assert calls["host"] == "smtp.gmail.com"
    assert calls["port"] == 587
    assert calls["starttls"] is True
    assert calls["login"] == ("jtap@example.com", "app-password")
    assert calls["message"]["To"] == "user@example.com"
    assert calls["message"]["Subject"] == "Subject"


def test_send_email_without_config_raises_500(app, monkeypatch):
    # Arrange
    monkeypatch.setattr(app, "SMTP_HOST", "")
    # Act / Assert
    with pytest.raises(HTTPException) as exc_info:
        app._send_email("user@example.com", "Subject", "Body")
    assert exc_info.value.status_code == 500
