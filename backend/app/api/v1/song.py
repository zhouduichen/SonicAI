import os
import logging
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models import GeneratedMusic, AudioAsset, StyleVector, VoiceModel
from app.schemas.song import (
    SongCreateRequest, SongCreateResponse,
    SongStatusResponse, SongListResponse,
)
from app.services import song_service
from app.services.job_service import create_job, update_job_status
from app.tasks.song_pipeline import create_song as create_song_task, run_song_pipeline_sync

router = APIRouter(prefix="/song", tags=["song"])
logger = logging.getLogger(__name__)


@router.post("/create", response_model=SongCreateResponse)
def create(
    request: SongCreateRequest,
    processing_mode: Literal["sync", "async", "auto"] = Query("auto"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if request.style_vector_id:
        style = db.query(StyleVector).filter(
            StyleVector.id == request.style_vector_id,
            StyleVector.user_id == user.id,
        ).first()
        if not style:
            raise HTTPException(status_code=404, detail="风格标签不存在")

    if request.voice_model_id:
        voice_model = db.query(VoiceModel).filter(
            VoiceModel.id == request.voice_model_id,
            VoiceModel.user_id == user.id,
        ).first()
        if not voice_model:
            raise HTTPException(status_code=404, detail="声音模型不存在")
        if voice_model.status != "ready":
            raise HTTPException(status_code=400, detail="声音模型尚未训练完成")

    song = song_service.create_song(
        db, user.id, request.theme,
        style_vector_id=request.style_vector_id,
        voice_model_id=request.voice_model_id,
        reference_audio_id=request.reference_audio_id,
    )

    reference_audio_path = None
    if request.reference_audio_id:
        gm = db.query(GeneratedMusic).filter(
            GeneratedMusic.id == request.reference_audio_id,
            GeneratedMusic.user_id == user.id,
        ).first()
        if gm:
            reference_audio_path = gm.file_path
        else:
            asset = db.query(AudioAsset).filter(
                AudioAsset.id == request.reference_audio_id,
                AudioAsset.user_id == user.id,
            ).first()
            if asset:
                reference_audio_path = asset.file_path
        if reference_audio_path:
            song_service.update_song(db, song.id, user.id, reference_vocal_path=reference_audio_path)

    if processing_mode == "sync":
        job = create_job(db, user, "song_creation", {
            "song_id": song.id,
            "theme": request.theme,
            "voice_model_id": request.voice_model_id,
            "style_vector_id": request.style_vector_id,
            "reference_audio_path": reference_audio_path,
        })
        run_song_pipeline_sync(
            song_id=song.id,
            theme=request.theme,
            voice_model_id=request.voice_model_id,
            style_vector_id=request.style_vector_id,
            reference_audio_path=reference_audio_path,
            job_id=job.id,
        )
        update_job_status(db, job, "completed", stage="completed", progress=100)
        job_id = job.id
    elif processing_mode == "async":
        job = create_job(db, user, "song_creation", {
            "song_id": song.id,
            "theme": request.theme,
            "voice_model_id": request.voice_model_id,
            "style_vector_id": request.style_vector_id,
            "reference_audio_path": reference_audio_path,
        })
        try:
            task = create_song_task.delay(job_id=job.id)
            job.celery_task_id = task.id
            db.commit()
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"后台队列不可用: {e}") from e
        job_id = job.id
    else:
        # Auto: prefer Celery when available, otherwise keep the one-click sync app usable.
        job = create_job(db, user, "song_creation", {
            "song_id": song.id,
            "theme": request.theme,
            "voice_model_id": request.voice_model_id,
            "style_vector_id": request.style_vector_id,
            "reference_audio_path": reference_audio_path,
        })
        try:
            task = create_song_task.delay(job_id=job.id)
            job.celery_task_id = task.id
            db.commit()
        except Exception as e:
            logger.warning(f"Celery unavailable ({e}), creating song synchronously")
            try:
                run_song_pipeline_sync(
                    song_id=song.id,
                    theme=request.theme,
                    voice_model_id=request.voice_model_id,
                    style_vector_id=request.style_vector_id,
                    reference_audio_path=reference_audio_path,
                    job_id=job.id,
                )
                update_job_status(db, job, "completed", stage="completed", progress=100)
            except Exception as sync_e:
                raise HTTPException(status_code=500, detail=f"歌曲创作失败: {sync_e}") from sync_e
        job_id = job.id

    return SongCreateResponse(song_id=song.id, job_id=job_id)


@router.get("/list", response_model=SongListResponse)
def list_songs(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = song_service.list_user_songs(db, user.id)
    return SongListResponse(
        items=[SongStatusResponse.model_validate(s) for s in items],
        total=len(items),
    )


@router.get("/status/{song_id}", response_model=SongStatusResponse)
def get_status(song_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    song = song_service.get_song(db, song_id, user.id)
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")
    return SongStatusResponse.model_validate(song)


@router.get("/{song_id}/download")
def download(
    song_id: int,
    stem: str = Query("mixed", pattern="^(mixed|instrumental|vocal)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    song = song_service.get_song(db, song_id, user.id)
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")

    if stem == "mixed":
        path = song.mixed_path
    elif stem == "instrumental":
        path = song.instrumental_path
    elif stem == "vocal":
        path = song.vocal_path
    else:
        path = song.mixed_path

    if not path or not os.path.exists(path):
        stem_labels = {"mixed": "混音", "instrumental": "伴奏", "vocal": "人声"}
        raise HTTPException(status_code=404, detail=f"{stem_labels.get(stem, stem)}文件尚未生成")

    return FileResponse(path, media_type="audio/wav", filename=f"song_{song_id}_{stem}.wav")
