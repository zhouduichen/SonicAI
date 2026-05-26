"""Job service: create, query, and reconcile persistent task jobs."""

import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.job import Job
from app.models.user import User

logger = logging.getLogger(__name__)

VALID_KINDS = {"audio_upload", "music_generation", "voice_training", "song_creation", "svs_generation"}
VALID_STATUSES = {"queued", "running", "completed", "failed", "cancelled"}
TERMINAL_STATUSES = {"completed", "failed", "cancelled"}
ACTIVE_STATUSES = {"queued", "running"}


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def create_job(
    db: Session,
    user: User,
    kind: str,
    payload: dict | None = None,
) -> Job:
    if kind not in VALID_KINDS:
        raise ValueError(f"Invalid job kind: {kind}")
    job = Job(
        user_id=user.id,
        kind=kind,
        status="queued",
        payload_json=json.dumps(payload) if payload else None,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    logger.info("Job %s created: kind=%s user=%s", job.id, kind, user.id)
    return job


def get_job(db: Session, job_id: int, user: User) -> Job | None:
    return db.query(Job).filter(Job.id == job_id, Job.user_id == user.id).first()


def update_job_status(
    db: Session,
    job: Job,
    status: str,
    *,
    stage: str | None = None,
    progress: int | None = None,
    error_message: str | None = None,
    result: dict | None = None,
):
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid job status: {status}")
    if job.status == "cancelled" and status != "cancelled":
        logger.info("Ignoring late update for cancelled job %s: %s", job.id, status)
        return
    job.status = status
    if stage is not None:
        job.stage = stage
    if progress is not None:
        job.progress = progress
    if error_message is not None:
        job.error_message = error_message
    if result is not None:
        job.result_json = json.dumps(result)
    if status == "running" and job.started_at is None:
        job.started_at = datetime.now(timezone.utc)
    if status in TERMINAL_STATUSES:
        job.finished_at = datetime.now(timezone.utc)
    db.commit()


def cancel_job(db: Session, job: Job, reason: str = "Cancelled by user") -> Job:
    if job.status in TERMINAL_STATUSES:
        return job
    update_job_status(
        db,
        job,
        "cancelled",
        stage="cancelled",
        error_message=reason,
    )
    db.refresh(job)
    return job


def cancel_interrupted_jobs(
    db: Session,
    reason: str = "Cancelled because the app restarted before this task finished",
) -> int:
    jobs = db.query(Job).filter(Job.status.in_(ACTIVE_STATUSES)).all()
    if not jobs:
        return 0

    now = datetime.now(timezone.utc)
    for job in jobs:
        job.status = "cancelled"
        job.stage = "cancelled"
        job.error_message = reason
        job.finished_at = now
    db.commit()
    return len(jobs)


def reconcile_orphaned_runtime_state(
    db: Session,
    *,
    stale_after_seconds: int = 600,
    reason: str = "Recovered stale in-progress state after interrupted processing",
) -> dict[str, int]:
    """Fail stale processing rows that no longer have a live active job."""
    from app.models.audio_asset import AudioAsset
    from app.models.song import Song
    from app.models.vocal_generation import VocalGeneration
    from app.models.voice_model import VoiceModel

    cutoff = _utcnow_naive() - timedelta(seconds=max(stale_after_seconds, 0))
    counts = {
        "audio_assets": 0,
        "voice_models": 0,
        "vocal_generations": 0,
        "songs": 0,
        "total": 0,
    }

    active_refs = {
        "audio_upload": set(),
        "voice_training": set(),
        "svs_generation": set(),
        "song_creation": set(),
    }
    active_jobs = db.query(Job).filter(Job.status.in_(ACTIVE_STATUSES)).all()
    for job in active_jobs:
        try:
            payload = json.loads(job.payload_json) if job.payload_json else {}
        except (json.JSONDecodeError, TypeError):
            payload = {}
        if job.kind == "audio_upload" and payload.get("asset_id"):
            active_refs["audio_upload"].add(int(payload["asset_id"]))
        elif job.kind == "voice_training" and payload.get("model_id"):
            active_refs["voice_training"].add(int(payload["model_id"]))
        elif job.kind == "svs_generation" and payload.get("generation_id"):
            active_refs["svs_generation"].add(int(payload["generation_id"]))
        elif job.kind == "song_creation" and payload.get("song_id"):
            active_refs["song_creation"].add(int(payload["song_id"]))

    def is_stale(created_at: datetime | None) -> bool:
        return created_at is None or created_at <= cutoff

    for asset in db.query(AudioAsset).filter(AudioAsset.status == "processing").all():
        if asset.id in active_refs["audio_upload"] or not is_stale(asset.created_at):
            continue
        asset.status = "failed"
        counts["audio_assets"] += 1

    for model in db.query(VoiceModel).filter(VoiceModel.status.in_(("pending", "preprocessing", "training"))).all():
        if model.id in active_refs["voice_training"] or not is_stale(model.updated_at or model.created_at):
            continue
        model.status = "failed"
        counts["voice_models"] += 1

    for generation in db.query(VocalGeneration).filter(VocalGeneration.status.in_(("pending", "processing"))).all():
        if generation.id in active_refs["svs_generation"] or not is_stale(generation.created_at):
            continue
        generation.status = "failed"
        counts["vocal_generations"] += 1

    nonterminal_song_statuses = ("pending", "writing", "arranging", "singing", "mixing")
    for song in db.query(Song).filter(Song.status.in_(nonterminal_song_statuses)).all():
        if song.id in active_refs["song_creation"] or not is_stale(song.created_at):
            continue
        song.status = "failed"
        if not song.error_message:
            song.error_message = reason
        counts["songs"] += 1

    counts["total"] = (
        counts["audio_assets"]
        + counts["voice_models"]
        + counts["vocal_generations"]
        + counts["songs"]
    )
    if counts["total"] > 0:
        logger.info("Recovered orphaned runtime state: %s", counts)
        db.commit()

    return counts


def delete_job(db: Session, job: Job) -> None:
    db.delete(job)
    db.commit()


def is_job_cancelled(db: Session, job_id: int) -> bool:
    job = db.query(Job.status).filter(Job.id == job_id).first()
    return bool(job and job[0] == "cancelled")


def set_celery_task_id(db: Session, job: Job, celery_task_id: str):
    job.celery_task_id = celery_task_id
    db.commit()


def get_job_by_celery_task_id(db: Session, celery_task_id: str) -> Job | None:
    return db.query(Job).filter(Job.celery_task_id == celery_task_id).first()


def list_user_jobs(
    db: Session, user: User, limit: int = 20, offset: int = 0
) -> list[Job]:
    return (
        db.query(Job)
        .filter(Job.user_id == user.id)
        .order_by(Job.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
