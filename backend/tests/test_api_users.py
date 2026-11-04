"""Integration tests for user profiles: viewing, editing, permissions."""


def test_get_other_profile_ok(client, user_a, user_b):
    _a_id, a_headers = user_a
    b_id, _b_headers = user_b
    response = client.get(f"/users/{b_id}/profile", headers=a_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == b_id
    assert "settings" in body


def test_get_missing_user_404(client, user_a):
    _a_id, a_headers = user_a
    response = client.get("/users/999999/profile", headers=a_headers)
    assert response.status_code == 404


def test_patch_own_profile_saves_settings(client, user_a):
    a_id, a_headers = user_a
    response = client.patch(
        f"/users/{a_id}/profile",
        json={"settings": {"vehicleTitle": "Trail Tester"}},
        headers=a_headers,
    )
    assert response.status_code == 200, response.text
    check = client.get(f"/users/{a_id}/profile", headers=a_headers)
    assert check.json()["settings"]["vehicleTitle"] == "Trail Tester"


def test_patch_other_profile_403(client, user_a, user_b):
    _a_id, a_headers = user_a
    b_id, _b_headers = user_b
    response = client.patch(
        f"/users/{b_id}/profile",
        json={"settings": {"vehicleTitle": "Not Mine"}},
        headers=a_headers,
    )
    assert response.status_code == 403


def test_patch_profane_vehicle_title_400(client, user_a):
    a_id, a_headers = user_a
    response = client.patch(
        f"/users/{a_id}/profile",
        json={"settings": {"vehicleTitle": "shit wagon"}},
        headers=a_headers,
    )
    assert response.status_code == 400


def test_patch_oversized_owner_name_400(client, user_a):
    a_id, a_headers = user_a
    response = client.patch(
        f"/users/{a_id}/profile",
        json={"settings": {"ownerName": "x" * 31}},
        headers=a_headers,
    )
    assert response.status_code == 400


# Story 1.2: profile-photo validation (JPG/PNG only, strict 5MB limit).
# Format is checked from magic bytes, so a renamed file must not pass.

_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 100
_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
_GIF = b"GIF89a" + b"\x00" * 100
_PDF = b"%PDF-1.4" + b"\x00" * 100
_PHOTO_LIMIT = 5 * 1024 * 1024


def _upload_photo(client, user_id, headers, filename, data, content_type):
    return client.post(
        f"/users/{user_id}/profile-picture",
        files={"file": (filename, data, content_type)},
        headers=headers,
    )


def test_upload_valid_jpg_ok(client, user_a):
    a_id, a_headers = user_a
    response = _upload_photo(client, a_id, a_headers, "rig.jpg", _JPEG, "image/jpeg")
    assert response.status_code == 200, response.text
    assert response.json()["url"].endswith(".jpg")


def test_upload_valid_png_ok(client, user_a):
    a_id, a_headers = user_a
    response = _upload_photo(client, a_id, a_headers, "rig.png", _PNG, "image/png")
    assert response.status_code == 200, response.text
    assert response.json()["url"].endswith(".png")


def test_upload_gif_rejected(client, user_a):
    a_id, a_headers = user_a
    response = _upload_photo(client, a_id, a_headers, "rig.gif", _GIF, "image/gif")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid file format. Please upload a JPG or PNG"


def test_upload_pdf_rejected(client, user_a):
    a_id, a_headers = user_a
    response = _upload_photo(client, a_id, a_headers, "rig.pdf", _PDF, "application/pdf")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid file format. Please upload a JPG or PNG"


def test_upload_renamed_pdf_rejected(client, user_a):
    # Extension alone must not pass: a PDF renamed to .jpg is still a PDF.
    a_id, a_headers = user_a
    response = _upload_photo(client, a_id, a_headers, "rig.jpg", _PDF, "image/jpeg")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid file format. Please upload a JPG or PNG"


def test_upload_over_5mb_rejected(client, user_a):
    a_id, a_headers = user_a
    big = b"\xff\xd8\xff\xe0" + b"\x00" * _PHOTO_LIMIT
    response = _upload_photo(client, a_id, a_headers, "rig.jpg", big, "image/jpeg")
    assert response.status_code == 400
    assert response.json()["detail"] == "File size exceeds 5MB limit"


def test_upload_exactly_5mb_ok(client, user_a):
    a_id, a_headers = user_a
    exact = b"\xff\xd8\xff\xe0" + b"\x00" * (_PHOTO_LIMIT - 4)
    response = _upload_photo(client, a_id, a_headers, "rig.jpg", exact, "image/jpeg")
    assert response.status_code == 200, response.text
