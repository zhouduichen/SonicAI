"""End-to-end mock-mode smoke tests.

Validates the full API chain works end-to-end with no external dependencies
(no Redis, no Celery, no real models). All provider calls fall back to
mock via ENABLE_MOCK_FALLBACK.

This is the minimal "happy path" that must pass before any release.
Uses the conftest fixtures (client, auth_headers) for consistency.
"""

import pytest


def test_e2e_health(client):
    """Smoke: health endpoint and root endpoint work."""
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"

    r = client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "running"
    assert data["name"] == "SonicAI"


def test_e2e_model_catalog(client, auth_headers):
    """Smoke: model catalog lists available providers."""
    r = client.get("/api/v1/models/", headers=auth_headers)
    assert r.status_code == 200, f"Catalog failed: {r.text}"
    catalog = r.json()
    assert isinstance(catalog, dict), f"Expected dict, got {type(catalog)}"
    for cat in ("music_generation", "vocal_separation", "style_extraction"):
        assert cat in catalog, f"{cat} missing from catalog keys: {list(catalog.keys())}"
        assert isinstance(catalog[cat], list), f"{cat} should be a list"
        assert len(catalog[cat]) > 0, f"{cat} should have at least one model"


def test_e2e_missing_style_returns_404(client, auth_headers):
    """Generate with nonexistent style returns proper error."""
    r = client.post(
        "/api/v1/music/generate?processing_mode=sync",
        json={
            "style_vector_id": 99999,
            "text_prompt": "test prompt",
            "music_gen_model": "musicgen_small",
        },
        headers=auth_headers,
    )
    assert r.status_code == 404
    assert "风格向量不存在" in r.text


def test_e2e_blend_presets(client, auth_headers):
    """Blend presets endpoint returns valid templates."""
    r = client.get("/api/v1/music/blend-presets", headers=auth_headers)
    assert r.status_code == 200
    presets = r.json()
    assert isinstance(presets, list)


def test_e2e_voice_models_list(client, auth_headers):
    """Voice models list returns empty for fresh DB."""
    r = client.get("/api/v1/voice/models", headers=auth_headers)
    assert r.status_code == 200


def test_e2e_song_list(client, auth_headers):
    """Song list returns empty for fresh DB."""
    r = client.get("/api/v1/song/list", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data


def test_e2e_jobs_list(client, auth_headers):
    """Job list returns empty for fresh DB."""
    r = client.get("/api/v1/jobs/", headers=auth_headers)
    assert r.status_code == 200


def test_e2e_audio_list(client, auth_headers):
    """Audio assets list returns empty for fresh DB."""
    r = client.get("/api/v1/audio/list", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data


def test_e2e_music_list(client, auth_headers):
    """Generated music list returns empty for fresh DB."""
    r = client.get("/api/v1/music/list", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
