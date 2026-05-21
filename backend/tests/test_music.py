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


def test_featured_music_empty(client):
    """Featured endpoint should work without auth and return empty list."""
    resp = client.get("/api/v1/music/public/featured")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
