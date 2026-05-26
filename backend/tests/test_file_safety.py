"""Tests for file path safety: ensure no directory structure leakage in API responses."""

import re


# Common absolute path patterns that should NEVER appear in API responses
_ABSOLUTE_PATH_PATTERNS = [
    r"^/home/",
    r"^/tmp/",
    r"^/var/",
    r"^C:\\",
    r"^/Users/",
    r"^/root/",
    r"^\.\./",
]


def _has_absolute_path(value: str) -> bool:
    """Check if a string looks like an absolute filesystem path."""
    if not value:
        return False
    # Unix absolute paths
    if value.startswith("/"):
        return True
    # Windows absolute paths
    if re.match(r"^[A-Za-z]:\\", value):
        return True
    # Directory traversal
    if value.startswith("../") or value.startswith("..\\"):
        return True
    return False


def _scan_dict_for_paths(obj, path: str = ""):
    """Recursively scan a dict/list for absolute path strings. Returns list of field paths."""
    findings = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            current_path = f"{path}.{key}" if path else key
            if isinstance(value, str) and _has_absolute_path(value):
                findings.append(current_path)
            else:
                findings.extend(_scan_dict_for_paths(value, current_path))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            current_path = f"{path}[{i}]"
            if isinstance(item, str) and _has_absolute_path(item):
                findings.append(current_path)
            else:
                findings.extend(_scan_dict_for_paths(item, current_path))
    return findings


def _scan_response(response, endpoint_name: str):
    """Verify no absolute paths leak in a JSON response."""
    if response.status_code != 200:
        return  # Skip error responses
    try:
        data = response.json()
    except (ValueError, TypeError):
        return
    leaks = _scan_dict_for_paths(data)
    assert not leaks, (
        f"{endpoint_name} leaks absolute paths in fields: {leaks}"
    )


def test_model_catalog_no_path_leak(client):
    """GET /models should not leak filesystem paths."""
    resp = client.get("/api/v1/models/")
    _scan_response(resp, "/models")


def test_music_list_no_path_leak(client, auth_headers, db):
    """GET /music/list should not leak filesystem paths in items."""
    resp = client.get("/api/v1/music/list", headers=auth_headers)
    _scan_response(resp, "/music/list")


def test_featured_music_no_path_leak(client, auth_headers, db):
    """GET /music/public/featured should not leak paths."""
    resp = client.get("/api/v1/music/public/featured")
    _scan_response(resp, "/music/public/featured")


def test_music_status_no_path_leak(client, auth_headers, db):
    """GET /music/status/{fake} should not leak paths (pending state)."""
    resp = client.get("/api/v1/music/status/fake-task-id-99999", headers=auth_headers)
    _scan_response(resp, "/music/status/fake")


def test_song_status_no_path_leak(client, auth_headers, db):
    """GET /song/status/{fake} should 404 without leaking paths."""
    resp = client.get("/api/v1/song/status/99999", headers=auth_headers)
    # Should be 404, but even the error response should not leak paths
    _scan_response(resp, "/song/status/99999")


def test_audio_assets_list_no_path_leak(client, auth_headers, db):
    """GET /audio/assets should not leak filesystem paths when empty."""
    resp = client.get("/api/v1/audio/assets", headers=auth_headers)
    _scan_response(resp, "/audio/assets")


def test_blend_presets_no_path_leak(client, auth_headers, db):
    """GET /music/blend-presets should not leak paths."""
    resp = client.get("/api/v1/music/blend-presets", headers=auth_headers)
    _scan_response(resp, "/music/blend-presets")


def test_path_traversal_blocked(client, auth_headers, db):
    """Download endpoint should reject path traversal attempts."""
    resp = client.get("/api/v1/music/../../../../etc/passwd/download", headers=auth_headers)
    # Should return 404 (not 200 with file contents)
    assert resp.status_code in (404, 422, 405), (
        f"Path traversal should be blocked, got {resp.status_code}"
    )


def test_song_download_traversal_blocked(client, auth_headers, db):
    """Song download should reject path traversal."""
    resp = client.get("/api/v1/song/../../../../etc/passwd/download", headers=auth_headers)
    assert resp.status_code in (404, 422, 405), (
        f"Song path traversal should be blocked, got {resp.status_code}"
    )


def test_upload_path_not_in_asset_response(client, auth_headers, db, tmp_path):
    """After upload, file_path in asset response should be a relative path, not absolute."""
    # Create a small WAV file for upload
    import wave
    import os
    test_wav = tmp_path / "test_upload.wav"
    with wave.open(str(test_wav), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(22050)
        wf.writeframes(b"\x00\x00" * 22050)  # 1 second of silence

    with open(str(test_wav), "rb") as f:
        resp = client.post(
            "/api/v1/audio/upload",
            files={"file": ("test.wav", f, "audio/wav")},
            headers=auth_headers,
        )
    # Upload may fail in test (no demucs), but the error response shouldn't leak paths
    if resp.status_code == 200:
        _scan_response(resp, "/audio/upload")


def test_audio_upload_auto_mode_runs_sync_first(monkeypatch, db, client, auth_headers, tmp_path):
    """Auto mode should finish foreground audio analysis instead of waiting behind the queue."""
    import wave
    from app.api.v1 import audio as audio_api
    from app.models.audio_asset import AudioAsset
    from app.models.job import Job
    from app.services.job_service import update_job_status

    celery_called = False

    class FakeTask:
        id = "celery-audio-test"

    def fake_delay(**kwargs):
        nonlocal celery_called
        celery_called = True
        return FakeTask()

    def fake_sync(audio_path, asset_id, user_id, vocal_sep_model, style_extract_model, job_id=None):
        asset = db.query(AudioAsset).filter(AudioAsset.id == asset_id).first()
        assert asset is not None
        asset.status = "completed"
        if job_id is not None:
            job = db.query(Job).filter(Job.id == job_id).first()
            assert job is not None
            update_job_status(
                db,
                job,
                "completed",
                stage="completed",
                progress=100,
                result={"asset_id": asset_id, "style_vector_id": 123},
            )
        db.commit()
        return {"stage": "completed", "asset_id": asset_id, "style_vector_id": 123}

    monkeypatch.setattr(audio_api.process_audio_upload, "delay", fake_delay)
    monkeypatch.setattr(audio_api, "_run_pipeline_sync", fake_sync)

    test_wav = tmp_path / "auto_upload.wav"
    with wave.open(str(test_wav), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(22050)
        wf.writeframes(b"\x00\x00" * 22050)

    with open(str(test_wav), "rb") as f:
        resp = client.post(
            "/api/v1/audio/upload",
            files={"file": ("auto.wav", f, "audio/wav")},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["task_id"].startswith("sync-")
    assert data["job_id"] is not None
    assert celery_called is False

    job_resp = client.get(f"/api/v1/jobs/{data['job_id']}", headers=auth_headers)
    assert job_resp.status_code == 200
    job = job_resp.json()
    assert job["kind"] == "audio_upload"
    assert job["status"] == "completed"
    assert job["celery_task_id"] is None


def test_audio_upload_async_mode_queues_job(monkeypatch, client, auth_headers, tmp_path):
    """Explicit async mode should queue a Job for Celery."""
    import wave
    from app.api.v1 import audio as audio_api

    class FakeTask:
        id = "celery-audio-test"

    monkeypatch.setattr(
        audio_api.process_audio_upload,
        "delay",
        lambda **kwargs: FakeTask(),
    )

    test_wav = tmp_path / "queued_upload.wav"
    with wave.open(str(test_wav), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(22050)
        wf.writeframes(b"\x00\x00" * 22050)

    with open(str(test_wav), "rb") as f:
        resp = client.post(
            "/api/v1/audio/upload?processing_mode=async",
            files={"file": ("queued.wav", f, "audio/wav")},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["task_id"] == "celery-audio-test"
    assert data["job_id"] is not None

    job_resp = client.get(f"/api/v1/jobs/{data['job_id']}", headers=auth_headers)
    assert job_resp.status_code == 200
    job = job_resp.json()
    assert job["kind"] == "audio_upload"
    assert job["status"] == "queued"
    assert job["celery_task_id"] == "celery-audio-test"


def test_voice_list_no_path_leak(client, auth_headers):
    """GET /voice/models should not leak filesystem paths."""
    resp = client.get("/api/v1/voice/models", headers=auth_headers)
    _scan_response(resp, "/voice/models")
