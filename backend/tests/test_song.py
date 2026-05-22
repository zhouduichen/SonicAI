"""Tests for song creation endpoints."""


def test_song_create_sync_without_celery(client, auth_headers, monkeypatch):
    """Song creation should work in sync mode without Redis/Celery."""
    called = {}

    def fake_pipeline(song_id: int, theme: str, **kwargs):
        called["song_id"] = song_id
        called["theme"] = theme
        return {"stage": "completed", "song_id": song_id, "mixed_path": "mixed.wav"}

    monkeypatch.setattr("app.api.v1.song.run_song_pipeline_sync", fake_pipeline)

    resp = client.post(
        "/api/v1/song/create?processing_mode=sync",
        json={"theme": "summer night"},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    song_id = resp.json()["song_id"]
    assert called == {"song_id": song_id, "theme": "summer night"}

    status = client.get(f"/api/v1/song/status/{song_id}", headers=auth_headers)
    assert status.status_code == 200
    data = status.json()
    assert data["status"] == "writing"
    assert data["theme"] == "summer night"


def test_song_create_rejects_missing_style(client, auth_headers, monkeypatch):
    """Invalid style ids should fail before the pipeline is started."""

    called = False

    def fake_pipeline(*args, **kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr("app.api.v1.song.run_song_pipeline_sync", fake_pipeline)

    resp = client.post(
        "/api/v1/song/create?processing_mode=sync",
        json={"theme": "summer night", "style_vector_id": 99999},
        headers=auth_headers,
    )

    assert resp.status_code == 404
    assert called is False
