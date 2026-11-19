"""Tests for password reset (backend/main.py: /auth/password-reset/*).

Design (issue #99, Day 2):
- Reuses the Day 1 verification PIN system with purpose='reset': a 6-digit
  PIN, bcrypt-hashed, 15-minute expiry, max 5 attempts. A PIN issued for
  one purpose must never work for the other ('verify' codes cannot reset
  a password, 'reset' codes cannot verify an email).
- The request endpoint is unauthenticated (the user is locked out) and
  always returns success, even for an unknown email — no code is sent in
  that case — so it can never be used to probe which emails are registered.
- Password rules match signup: signup enforces none (no length or
  strength checks anywhere), so reset requires only a non-empty new
  password; the app asks for it twice, like signup does.
- Email is sent via SMTP from env vars only; the send function is
  monkeypatched here so no network is touched.
- Equivalence classes: correct code, wrong code, expired code, too many
  attempts, wrong-purpose PIN, unknown email, empty new password,
  re-requested code, SMTP not configured.
- Boundary analysis: the 5th wrong attempt invalidates the code;
  a code used one second past expiry is expired.
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
    """One user with a known password."""
    u = app.User(
        email="reset-me@example.com",
        hashed_password=app.pwd_context.hash("old-password"),
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


def _request(app, db, email):
    return app.request_password_reset(
        body=app.PasswordResetRequest(email=email), db=db
    )


def _confirm(app, db, email, code, new_password):
    return app.confirm_password_reset(
        body=app.PasswordResetConfirmRequest(
            email=email, code=code, new_password=new_password
        ),
        db=db,
    )


def _wrong_code(real_code):
    """A 6-digit code guaranteed to differ from the real one."""
    return "000000" if real_code != "000000" else "111111"


# ---------------------------------------------------------------------------
# Request: happy path + unknown email + SMTP not configured
# ---------------------------------------------------------------------------

def test_request_sends_reset_code_email(app, db, user, outbox):
    # Act
    result = _request(app, db, "reset-me@example.com")
    # Assert
    assert result["detail"].startswith("If an account exists")
    assert result["expires_in_minutes"] == app.VERIFICATION_PIN_TTL_MINUTES
    assert len(outbox) == 1
    assert outbox[0]["to"] == "reset-me@example.com"
    code = _code_from(outbox)
    assert len(code) == 6 and code.isdigit()
    # Only the hash is stored, never the plain PIN — and its purpose is reset.
    pin_row = db.query(app.VerificationPin).one()
    assert pin_row.purpose == "reset"
    assert pin_row.pin_hash != code
    assert pin_row.attempts == 0


def test_request_unknown_email_returns_success_but_sends_nothing(app, db, user, outbox):
    # Act: an email with no account behind it.
    result = _request(app, db, "nobody-here@example.com")
    # Assert: the response is indistinguishable from the happy path...
    assert result["detail"].startswith("If an account exists")
    # ...but nothing was sent and no PIN was created.
    assert outbox == []
    assert db.query(app.VerificationPin).count() == 0


def test_request_without_smtp_config_is_rejected(app, db, user, monkeypatch):
    # Arrange: SMTP present in the module only as empty strings here.
    monkeypatch.setattr(app, "SMTP_HOST", "")
    monkeypatch.setattr(app, "SMTP_USER", "")
    monkeypatch.setattr(app, "SMTP_PASS", "")
    # Act / Assert: fails fast, before any PIN is issued.
    with pytest.raises(HTTPException, match="not configured"):
        _request(app, db, "reset-me@example.com")
    assert db.query(app.VerificationPin).count() == 0


# ---------------------------------------------------------------------------
# Confirm: success — old password dies, new password works
# ---------------------------------------------------------------------------

def test_confirm_correct_code_resets_password(app, db, user, outbox):
    # Arrange
    _request(app, db, "reset-me@example.com")
    code = _code_from(outbox)
    # Act
    result = _confirm(app, db, "reset-me@example.com", code, "brand-new-password")
    # Assert
    assert result["detail"].startswith("Password has been reset")
    db.refresh(user)
    assert app.pwd_context.verify("brand-new-password", user.hashed_password)
    assert not app.pwd_context.verify("old-password", user.hashed_password)
    # The used PIN is gone: a code is single-use.
    assert db.query(app.VerificationPin).count() == 0


def test_confirm_does_not_change_email_verified(app, db, user, outbox):
    # Arrange: an unverified user resets their password.
    assert user.email_verified is False
    _request(app, db, "reset-me@example.com")
    code = _code_from(outbox)
    # Act
    _confirm(app, db, "reset-me@example.com", code, "brand-new-password")
    # Assert: the reset leaves the verification flag alone.
    db.refresh(user)
    assert user.email_verified is False


# ---------------------------------------------------------------------------
# Confirm: wrong code
# ---------------------------------------------------------------------------

def test_confirm_wrong_code_is_rejected_and_keeps_pin(app, db, user, outbox):
    # Arrange
    _request(app, db, "reset-me@example.com")
    # Act / Assert
    with pytest.raises(HTTPException, match="Incorrect code"):
        _confirm(app, db, "reset-me@example.com", _wrong_code(_code_from(outbox)), "new-password")
    db.refresh(user)
    assert app.pwd_context.verify("old-password", user.hashed_password)
    # The PIN survives a wrong guess (attempts counted, not yet exhausted).
    pin_row = db.query(app.VerificationPin).one()
    assert pin_row.attempts == 1


# ---------------------------------------------------------------------------
# Confirm: expired code
# ---------------------------------------------------------------------------

def test_confirm_expired_code_is_rejected(app, db, user, outbox):
    # Arrange: issue a code, then move its expiry into the past.
    _request(app, db, "reset-me@example.com")
    code = _code_from(outbox)
    pin_row = db.query(app.VerificationPin).one()
    pin_row.expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()
    # Act / Assert
    with pytest.raises(HTTPException, match="expired"):
        _confirm(app, db, "reset-me@example.com", code, "new-password")
    db.refresh(user)
    assert app.pwd_context.verify("old-password", user.hashed_password)
    # The expired PIN is cleaned up.
    assert db.query(app.VerificationPin).count() == 0


# ---------------------------------------------------------------------------
# Confirm: too many attempts (boundary: the 5th wrong guess)
# ---------------------------------------------------------------------------

def test_confirm_fifth_wrong_attempt_invalidates_code(app, db, user, outbox):
    # Arrange
    _request(app, db, "reset-me@example.com")
    real_code = _code_from(outbox)
    wrong = _wrong_code(real_code)
    # Act: the first four wrong guesses keep the code alive...
    for _ in range(app.VERIFICATION_PIN_MAX_ATTEMPTS - 1):
        with pytest.raises(HTTPException, match="Incorrect code"):
            _confirm(app, db, "reset-me@example.com", wrong, "new-password")
    assert db.query(app.VerificationPin).count() == 1
    # ...the fifth wrong guess invalidates it.
    with pytest.raises(HTTPException, match="Too many incorrect attempts"):
        _confirm(app, db, "reset-me@example.com", wrong, "new-password")
    assert db.query(app.VerificationPin).count() == 0
    # Assert: even the correct code no longer works.
    with pytest.raises(HTTPException, match="No reset code found"):
        _confirm(app, db, "reset-me@example.com", real_code, "new-password")
    db.refresh(user)
    assert app.pwd_context.verify("old-password", user.hashed_password)


# ---------------------------------------------------------------------------
# Confirm: wrong-purpose PIN (a verify code must never reset a password)
# ---------------------------------------------------------------------------

def test_confirm_verify_purpose_pin_does_not_reset_password(app, db, user):
    # Arrange: a PIN issued for email verification.
    db.add(app.VerificationPin(
        user_id=user.id,
        purpose="verify",
        pin_hash=app.pwd_context.hash("123456"),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    ))
    db.commit()
    # Act / Assert: the verify code is invisible to password reset.
    with pytest.raises(HTTPException, match="No reset code found"):
        _confirm(app, db, "reset-me@example.com", "123456", "new-password")
    db.refresh(user)
    assert app.pwd_context.verify("old-password", user.hashed_password)


# ---------------------------------------------------------------------------
# Confirm: unknown email — same generic failure as a wrong code
# ---------------------------------------------------------------------------

def test_confirm_unknown_email_is_rejected_generically(app, db, user, outbox):
    # Arrange: a real code exists for the real user.
    _request(app, db, "reset-me@example.com")
    code = _code_from(outbox)
    # Act / Assert: the same code against an unknown email fails generically.
    with pytest.raises(HTTPException, match="Invalid or expired reset code"):
        _confirm(app, db, "nobody-here@example.com", code, "new-password")
    # The real user's PIN is untouched.
    assert db.query(app.VerificationPin).count() == 1


# ---------------------------------------------------------------------------
# Confirm: empty new password — rejected, PIN survives for a retry
# ---------------------------------------------------------------------------

def test_confirm_empty_new_password_is_rejected_and_keeps_pin(app, db, user, outbox):
    # Arrange
    _request(app, db, "reset-me@example.com")
    code = _code_from(outbox)
    # Act / Assert
    with pytest.raises(HTTPException, match="Enter a new password"):
        _confirm(app, db, "reset-me@example.com", code, "   ")
    db.refresh(user)
    assert app.pwd_context.verify("old-password", user.hashed_password)
    assert db.query(app.VerificationPin).count() == 1
    # The same code still works with a real password afterwards.
    _confirm(app, db, "reset-me@example.com", code, "brand-new-password")
    db.refresh(user)
    assert app.pwd_context.verify("brand-new-password", user.hashed_password)


# ---------------------------------------------------------------------------
# Re-request: the old code stops working
# ---------------------------------------------------------------------------

def test_re_request_invalidates_previous_code(app, db, user, outbox):
    # Arrange: two codes requested in a row.
    _request(app, db, "reset-me@example.com")
    first_code = _code_from(outbox, 0)
    _request(app, db, "reset-me@example.com")
    second_code = _code_from(outbox, 1)
    assert len(outbox) == 2
    # Act / Assert: the first code is dead (it no longer matches the live PIN)...
    with pytest.raises(HTTPException, match="Incorrect code"):
        _confirm(app, db, "reset-me@example.com", first_code, "new-password")
    db.refresh(user)
    assert app.pwd_context.verify("old-password", user.hashed_password)
    # ...the second code works.
    _confirm(app, db, "reset-me@example.com", second_code, "brand-new-password")
    db.refresh(user)
    assert app.pwd_context.verify("brand-new-password", user.hashed_password)
    # Only one PIN row ever existed at a time.
    assert db.query(app.VerificationPin).count() == 0
