"""Tests for music generation and model endpoints."""


def test_model_catalog(client, auth_headers):
    """GET /models should return catalog without auth."""
    resp = client.get("/api/v1/models/")
    assert resp.status_code == 200
    data = resp.json()
    assert "vocal_separation" in data
    assert "style_extraction" in data
    assert "music_generation" in data


def test_list_music_empty(client, auth_headers):
    """Music list should return empty for new user."""
    resp = client.get("/api/v1/music/list", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_blend_presets(client, auth_headers):
    """Blend presets should return available presets."""
    resp = client.get("/api/v1/music/blend-presets", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_music_generate_without_style(client, auth_headers):
    """Generate with invalid style vector should fail."""
    resp = client.post("/api/v1/music/generate", json={
        "style_vector_id": 99999,
        "text_prompt": "test prompt",
    }, headers=auth_headers)
    assert resp.status_code == 404


def test_music_download_not_found(client, auth_headers):
    """Download of non-existent music should fail."""
    resp = client.get("/api/v1/music/99999/download", headers=auth_headers)
    assert resp.status_code == 404


def test_music_status_invalid_task(client, auth_headers):
    """Status check for fake task should return pending."""
    resp = client.get("/api/v1/music/status/fake-task-id-12345", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["stage"] == "pending"


def test_music_generate_default_auto_sync_fallback_updates_job(monkeypatch, db, client):
    """Default /music/generate auto mode should create a Job and persist sync fallback results."""
    import json
    from app.main import app
    from app.api.v1 import music as music_api
    from app.core.deps import get_db as deps_get_db
    from app.core.security import create_access_token, hash_password
    from app.models.style_vector import StyleVector
    from app.models.user import User
    from app.tasks import audio_pipeline

    def override_db():
        yield db

    app.dependency_overrides[deps_get_db] = override_db

    user = User(
        username="music-auto-user",
        email="music-auto-user@sonicai.local",
        display_name="Music Auto User",
        hashed_password=hash_password("test123456"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    auth_headers = {
        "Authorization": f"Bearer {create_access_token({'sub': str(user.id), 'username': user.username})}",
    }

    vector = StyleVector(
        user_id=user.id,
        asset_id=1,
        style_name="Auto Test Style",
        embedding=json.dumps([0.1] * 8),
        style_extract_model="encodec_6kbps",
    )
    db.add(vector)
    db.commit()
    db.refresh(vector)

    def unavailable_queue(**kwargs):
        raise RuntimeError("queue unavailable")

    monkeypatch.setattr(music_api.process_music_generation, "delay", unavailable_queue)
    monkeypatch.setattr(
        audio_pipeline,
        "_generate_music",
        lambda embedding, text_prompt, task_id="", model="musicgen_small", reference_audio_path=None: {
            "file_path": "generated/test.wav",
            "duration_seconds": 12,
            "provider_mode": "mock",
        },
    )

    resp = client.post("/api/v1/music/generate", json={
        "style_vector_id": vector.id,
        "text_prompt": "auto fallback prompt",
        "music_gen_model": "musicgen_small",
    }, headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["job_id"] is not None
    assert data["task_id"].startswith("sync-")

    db.expire_all()
    job_resp = client.get(f"/api/v1/jobs/{data['job_id']}", headers=auth_headers)
    assert job_resp.status_code == 200
    job = job_resp.json()
    assert job["status"] == "completed"
    assert job["result"]["prompt"] == "auto fallback prompt"
    assert job["result"]["music_gen_model"] == "musicgen_small"
    assert job["result"]["provider_mode"] == "mock"


def test_featured_music_empty(client):
    """Featured endpoint should work without auth and return empty list."""
    resp = client.get("/api/v1/music/public/featured")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_list_music_includes_null_vector(db, client):
    """Blend/batch music (vector_id=None) must appear in history list."""
    from app.models.generated_music import GeneratedMusic
    from app.models.user import User
    from app.services.music_service import list_user_music
    import datetime

    user = db.query(User).first()
    assert user is not None

    music = GeneratedMusic(
        user_id=user.id,
        vector_id=None,
        prompt="test blend prompt",
        title="Test Blend",
        file_path="/tmp/test.wav",
        duration_seconds=30,
        music_gen_model="musicgen_small",
        provider_mode="blend",
        created_at=datetime.datetime.now(),
    )
    db.add(music)
    db.commit()

    items = list_user_music(db, user, limit=50, offset=0)
    assert len(items) == 1
    item = items[0]
    assert item["title"] == "Test Blend"
    assert item["provider_mode"] == "blend"
    assert item["style_name"] == "混合生成"


def test_list_music_style_name_present(db, client):
    """Music with a real style vector should show the vector's style_name."""
    from app.models.generated_music import GeneratedMusic
    from app.models.style_vector import StyleVector
    from app.models.user import User
    from app.services.music_service import list_user_music
    import datetime, json

    user = db.query(User).first()
    assert user is not None

    sv = StyleVector(
        user_id=user.id,
        asset_id=1,
        style_name="My Rock Style",
        embedding=json.dumps([0.1] * 512),
        style_extract_model="clap_laion",
    )
    db.add(sv)
    db.commit()
    db.refresh(sv)

    music = GeneratedMusic(
        user_id=user.id,
        vector_id=sv.id,
        prompt="test",
        title="Styled Track",
        file_path="/tmp/styled.wav",
        duration_seconds=60,
        music_gen_model="musicgen_medium",
        provider_mode="real",
        created_at=datetime.datetime.now(),
    )
    db.add(music)
    db.commit()

    items = list_user_music(db, user, limit=50, offset=0)
    assert len(items) == 1
    item = items[0]
    assert item["title"] == "Styled Track"
    assert item["style_name"] == "My Rock Style"
    assert item["provider_mode"] == "real"
