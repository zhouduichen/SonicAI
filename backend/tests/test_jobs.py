"""Tests for Job model CRUD and lifecycle transitions."""

import pytest
from datetime import datetime, timezone


def test_create_job(db, client):
    """Create a Job via job_service and verify all fields."""
    from app.models.user import User
    from app.services.job_service import create_job

    user = db.query(User).first()
    assert user is not None

    job = create_job(db, user, "music_generation", {
        "style_vector_id": 1,
        "text_prompt": "test",
    })

    assert job.id is not None
    assert job.user_id == user.id
    assert job.kind == "music_generation"
    assert job.status == "queued"
    assert job.progress == 0
    assert job.payload_json is not None
    assert "test" in job.payload_json
    assert job.created_at is not None
    assert job.updated_at is not None


def test_create_job_payload_round_trip(db, client):
    """Job payload should survive JSON serialize/deserialize."""
    import json
    from app.models.user import User
    from app.services.job_service import create_job

    user = db.query(User).first()
    payload = {"vector_id": 42, "prompt": "hello world", "model": "musicgen_small"}
    job = create_job(db, user, "music_generation", payload)

    parsed = json.loads(job.payload_json)
    assert parsed["vector_id"] == 42
    assert parsed["prompt"] == "hello world"
    assert parsed["model"] == "musicgen_small"


def test_update_job_status(db, client):
    """Update job through status transitions: queued → running → completed."""
    from app.models.user import User
    from app.services.job_service import create_job, update_job_status

    user = db.query(User).first()
    job = create_job(db, user, "voice_training", {})
    assert job.status == "queued"

    # queued → running
    update_job_status(db, job, "running", stage="preprocessing", progress=5)
    assert job.status == "running"
    assert job.stage == "preprocessing"
    assert job.progress == 5
    assert job.started_at is not None

    # running → completed
    update_job_status(db, job, "completed", stage="done", progress=100, result={"model_id": 7})
    assert job.status == "completed"
    assert job.progress == 100
    assert job.finished_at is not None
    assert "model_id" in (job.result_json or "")


def test_update_job_to_failed(db, client):
    """Job can transition to failed with an error message."""
    from app.models.user import User
    from app.services.job_service import create_job, update_job_status

    user = db.query(User).first()
    job = create_job(db, user, "audio_upload", {})
    update_job_status(db, job, "running", stage="processing")
    update_job_status(db, job, "failed", error_message="GPU out of memory")
    assert job.status == "failed"
    assert "GPU" in (job.error_message or "")
    assert job.finished_at is not None


def test_query_jobs_by_user(db, client):
    """Jobs should be queryable by user_id."""
    from app.models.user import User
    from app.models.job import Job
    from app.services.job_service import create_job

    user = db.query(User).first()
    create_job(db, user, "music_generation", {})
    create_job(db, user, "voice_training", {})

    user_jobs = db.query(Job).filter(Job.user_id == user.id).all()
    assert len(user_jobs) == 2


def test_celery_task_id_linkage(db, client):
    """Job can be found by celery_task_id."""
    from app.models.user import User
    from app.models.job import Job
    from app.services.job_service import create_job, update_job_status, get_job_by_celery_task_id

    user = db.query(User).first()
    job = create_job(db, user, "music_generation", {})
    celery_id = "celery-task-abc-123"

    # Simulate linking a Celery task
    job.celery_task_id = celery_id
    db.commit()

    found = get_job_by_celery_task_id(db, celery_id)
    assert found is not None
    assert found.id == job.id
    assert found.kind == "music_generation"


def test_multiple_job_kinds(db, client):
    """All job kinds should be storable and queryable."""
    from app.models.user import User
    from app.models.job import Job
    from app.services.job_service import create_job

    user = db.query(User).first()
    kinds = ["music_generation", "audio_upload", "voice_training", "song_creation"]
    for k in kinds:
        create_job(db, user, k, {})

    counts = {}
    for k in kinds:
        counts[k] = db.query(Job).filter(Job.kind == k, Job.user_id == user.id).count()
    for k in kinds:
        assert counts[k] == 1, f"Should have exactly 1 {k} job"


def test_job_timestamps_auto_update(db, client):
    """updated_at should change on modification; created_at should stay."""
    from app.models.user import User
    from app.services.job_service import create_job
    import time

    user = db.query(User).first()
    job = create_job(db, user, "music_generation", {})
    original_updated = job.updated_at
    original_created = job.created_at

    time.sleep(1.1)  # SQLite has second-level precision on CURRENT_TIMESTAMP
    job.status = "running"
    db.commit()

    # Refresh to get updated timestamp from DB
    db.refresh(job)
    assert job.updated_at > original_updated, "updated_at should advance on modification"
    assert job.created_at == original_created, "created_at should remain unchanged"


def test_cancel_job_endpoint_marks_cancelled_and_revokes_celery(db, client, auth_headers, monkeypatch):
    """Cancelling an active job should persist cancellation and revoke the Celery task."""
    from app.models.user import User
    from app.services.job_service import create_job
    from app.api.v1 import jobs as jobs_api

    user = db.query(User).filter(User.username == "testuser").first()
    job = create_job(db, user, "voice_training", {})
    job.status = "running"
    job.celery_task_id = "celery-task-to-stop"
    db.commit()

    revoke_calls = []

    def fake_revoke(task_id):
        revoke_calls.append(task_id)

    monkeypatch.setattr(jobs_api, "_revoke_celery_task", fake_revoke, raising=False)

    resp = client.post(f"/api/v1/jobs/{job.id}/cancel", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "cancelled"
    assert data["stage"] == "cancelled"
    assert data["finished_at"] is not None
    assert revoke_calls == ["celery-task-to-stop"]


def test_delete_job_endpoint_removes_job(db, client, auth_headers):
    """Deleting a job should remove it from the task list."""
    from app.models.user import User
    from app.models.job import Job
    from app.services.job_service import create_job, update_job_status

    user = db.query(User).filter(User.username == "testuser").first()
    job = create_job(db, user, "music_generation", {})
    update_job_status(db, job, "completed", progress=100)
    job_id = job.id

    resp = client.delete(f"/api/v1/jobs/{job_id}", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert db.query(Job).filter(Job.id == job_id).first() is None


def test_cancelled_job_is_not_overwritten_by_late_task_update(db, client):
    """Late worker updates should not revive a user-cancelled job."""
    from app.models.user import User
    from app.services.job_service import create_job, cancel_job, update_job_status

    user = db.query(User).first()
    job = create_job(db, user, "voice_training", {})
    update_job_status(db, job, "running", stage="training", progress=10)
    cancel_job(db, job)

    update_job_status(db, job, "completed", stage="completed", progress=100)
    db.refresh(job)

    assert job.status == "cancelled"
    assert job.stage == "cancelled"


def test_cancel_interrupted_jobs_marks_active_only(db, client):
    """Startup cleanup should cancel orphaned active jobs without touching finished ones."""
    from app.models.user import User
    from app.services.job_service import (
        cancel_interrupted_jobs,
        create_job,
        update_job_status,
    )

    user = db.query(User).first()
    queued = create_job(db, user, "music_generation", {})
    running = create_job(db, user, "voice_training", {})
    completed = create_job(db, user, "audio_upload", {})
    update_job_status(db, running, "running", stage="training", progress=10)
    update_job_status(db, completed, "completed", progress=100)

    count = cancel_interrupted_jobs(db)
    db.refresh(queued)
    db.refresh(running)
    db.refresh(completed)

    assert count == 2
    assert queued.status == "cancelled"
    assert running.status == "cancelled"
    assert queued.finished_at is not None
    assert running.finished_at is not None
    assert completed.status == "completed"


def test_reconcile_orphaned_audio_asset_marks_stale_processing_failed(db, client):
    """Stale processing assets without an active job should stop showing as in-progress forever."""
    from datetime import timedelta
    from app.models.audio_asset import AudioAsset
    from app.models.user import User
    from app.services.job_service import reconcile_orphaned_runtime_state

    user = db.query(User).first()
    asset = AudioAsset(
        user_id=user.id,
        file_name="stuck.wav",
        file_path="./uploads/1/stuck.wav",
        status="processing",
        vocal_sep_model="demucs_htdemucs",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    asset.created_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2)
    db.commit()

    counts = reconcile_orphaned_runtime_state(db, stale_after_seconds=60)
    db.refresh(asset)

    assert counts["audio_assets"] == 1
    assert counts["total"] == 1
    assert asset.status == "failed"


def test_reconcile_orphaned_audio_asset_keeps_active_job_processing(db, client):
    """Processing assets with a live active job must not be marked failed."""
    from datetime import timedelta
    from app.models.audio_asset import AudioAsset
    from app.models.user import User
    from app.services.job_service import (
        create_job,
        reconcile_orphaned_runtime_state,
        update_job_status,
    )

    user = db.query(User).first()
    asset = AudioAsset(
        user_id=user.id,
        file_name="running.wav",
        file_path="./uploads/1/running.wav",
        status="processing",
        vocal_sep_model="demucs_htdemucs",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    asset.created_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2)
    db.commit()

    job = create_job(db, user, "audio_upload", {"asset_id": asset.id})
    update_job_status(db, job, "running", stage="separating", progress=5)

    counts = reconcile_orphaned_runtime_state(db, stale_after_seconds=60)
    db.refresh(asset)

    assert counts["audio_assets"] == 0
    assert counts["total"] == 0
    assert asset.status == "processing"
