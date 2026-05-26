"""Unified job polling and task control endpoints."""

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.services import job_service
from app.tasks.celery_app import celery_app

router = APIRouter(prefix="/jobs", tags=["jobs"])
logger = logging.getLogger(__name__)


class JobResponse(BaseModel):
    id: int
    kind: str
    status: str
    progress: int
    stage: Optional[str] = None
    result: Optional[dict] = None
    error_message: Optional[str] = None
    celery_task_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    items: list[JobResponse]
    total: int


class JobDeleteResponse(BaseModel):
    ok: bool


@router.get("/{job_id}", response_model=JobResponse)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = job_service.get_job(db, job_id, user)
    if not job:
        raise HTTPException(status_code=404, detail="Task not found")
    return _job_response(job)


@router.post("/{job_id}/cancel", response_model=JobResponse)
def cancel_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = job_service.get_job(db, job_id, user)
    if not job:
        raise HTTPException(status_code=404, detail="Task not found")

    if job.status not in job_service.TERMINAL_STATUSES and job.celery_task_id:
        _revoke_celery_task(job.celery_task_id)

    job = job_service.cancel_job(db, job)
    _mark_related_cancelled(db, job)
    return _job_response(job)


@router.delete("/{job_id}", response_model=JobDeleteResponse)
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = job_service.get_job(db, job_id, user)
    if not job:
        raise HTTPException(status_code=404, detail="Task not found")

    if job.status not in job_service.TERMINAL_STATUSES:
        if job.celery_task_id:
            _revoke_celery_task(job.celery_task_id)
        job = job_service.cancel_job(db, job)
        _mark_related_cancelled(db, job)

    job_service.delete_job(db, job)
    return JobDeleteResponse(ok=True)


@router.get("/", response_model=JobListResponse)
def list_jobs(
    offset: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    jobs = job_service.list_user_jobs(db, user, limit=limit, offset=offset)
    return JobListResponse(items=[_job_response(j) for j in jobs], total=len(jobs))


def _job_response(job) -> JobResponse:
    return JobResponse(
        id=job.id,
        kind=job.kind,
        status=job.status,
        progress=job.progress or 0,
        stage=job.stage,
        result=_parse_json(job.result_json),
        error_message=job.error_message,
        celery_task_id=job.celery_task_id,
        created_at=job.created_at,
        updated_at=job.updated_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
    )


def _parse_json(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _revoke_celery_task(task_id: str) -> None:
    try:
        celery_app.control.revoke(task_id, terminate=True, signal="SIGTERM")
    except Exception as e:
        logger.warning("Failed to revoke celery task %s: %s", task_id, e)


def _mark_related_cancelled(db: Session, job) -> None:
    payload = _parse_json(job.payload_json) or {}
    reason = "Cancelled by user"
    try:
        if job.kind == "audio_upload" and payload.get("asset_id"):
            from app.models.audio_asset import AudioAsset

            asset = db.query(AudioAsset).filter(AudioAsset.id == payload["asset_id"]).first()
            if asset and asset.status not in ("completed", "failed"):
                asset.status = "failed"
        elif job.kind == "voice_training" and payload.get("model_id"):
            from app.models.voice_model import VoiceModel

            model = db.query(VoiceModel).filter(VoiceModel.id == payload["model_id"]).first()
            if model and model.status not in ("ready", "failed"):
                model.status = "failed"
        elif job.kind == "song_creation" and payload.get("song_id"):
            from app.models.song import Song

            song = db.query(Song).filter(Song.id == payload["song_id"]).first()
            if song and song.status not in ("completed", "failed"):
                song.status = "failed"
                song.error_message = reason
        elif job.kind == "svs_generation" and payload.get("generation_id"):
            from app.models.vocal_generation import VocalGeneration

            generation = db.query(VocalGeneration).filter(VocalGeneration.id == payload["generation_id"]).first()
            if generation and generation.status not in ("completed", "failed"):
                generation.status = "failed"
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning("Failed to mark related entity cancelled for job %s: %s", job.id, e)
