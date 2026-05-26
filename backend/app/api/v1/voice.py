import os
import logging
import threading
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.audio_asset import AudioAsset
from app.schemas.voice import (
    TrainVoiceRequest, TrainVoiceResponse,
    VoiceModelStatus, VoiceModelResponse, VoiceModelListResponse,
    SingRequest, SingResponse,
    VocalGenerationResponse, VocalGenerationListResponse,
    VocalGenerationStatusResponse,
)
from app.services import voice_service
from app.tasks.celery_app import celery_app
from app.tasks.voice_pipeline import (
    train_voice_model,
    run_voice_training_job,
    infer_rvc_vocals,
    infer_rvc_vocals_sync,
    _cpu_training_allowed,
    _cuda_status,
)
from app.services.job_service import create_job, update_job_status

router = APIRouter(prefix="/voice", tags=["voice"])
logger = logging.getLogger(__name__)

from app.services.voice_service import EPOCH_TARGETS, TIER_MILESTONES


def _ensure_voice_training_ready(processing_mode: str = "auto"):
    """Check CUDA availability; only check Celery when mode requires it."""
    cuda_ok, cuda_diag = _cuda_status()
    if not cuda_ok and not _cpu_training_allowed():
        raise HTTPException(
            status_code=503,
            detail=(
                "CUDA is unavailable, so CPU voice training was blocked to avoid huge ETAs. "
                f"Current runtime: {cuda_diag}. Re-run install.bat and start with python start_all.py --async."
            ),
        )

    if processing_mode == "async":
        try:
            stats = celery_app.control.inspect(timeout=2).stats()
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"Voice training worker is unavailable: {e}. Start with python start_all.py --async.",
            ) from e
        if not stats:
            raise HTTPException(
                status_code=503,
                detail="Voice training worker is not responding. Start with python start_all.py --async.",
            )


@router.post("/train", response_model=TrainVoiceResponse)
def train(
    request: TrainVoiceRequest,
    processing_mode: Literal["sync", "async", "auto"] = Query("auto"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not request.audio_asset_ids:
        raise HTTPException(status_code=400, detail="至少需要选择一个音频文件")

    assets = []
    for aid in request.audio_asset_ids:
        asset = db.query(AudioAsset).filter(
            AudioAsset.id == aid, AudioAsset.user_id == user.id
        ).first()
        if not asset:
            raise HTTPException(status_code=404, detail=f"音频文件 {aid} 不存在")
        if asset.status != "completed":
            raise HTTPException(status_code=400, detail=f"音频 {asset.file_name} 尚未处理完成")
        assets.append(asset)

    _ensure_voice_training_ready(processing_mode)

    model = voice_service.create_voice_model(
        db, user.id, request.name, request.audio_asset_ids, request.quality_target
    )

    audio_paths = [a.file_path for a in assets]
    job = create_job(db, user, "voice_training", {
        "model_id": model.id,
        "audio_paths": audio_paths,
        "quality_target": request.quality_target,
    })

    # Dispatch: async → Celery only; sync → background thread;
    # auto → skip Redis check, go directly to background thread
    # (the celery-broker port check is unreliable — a stale process on 6379
    # falsely signals Redis-is-alive, then the task queues but never runs).
    if processing_mode == "async":
        try:
            stats = celery_app.control.inspect(timeout=2).stats()
            if not stats:
                raise RuntimeError("Celery worker not responding")
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"Voice training worker is unavailable: {e}. Start with python start_all.py --async.",
            ) from e
        try:
            task = train_voice_model.delay(job_id=job.id)
            job.celery_task_id = task.id
            db.commit()
            logger.info(f"Async training dispatched: model_id={model.id} celery_task={task.id}")
            return TrainVoiceResponse(model_id=model.id, job_id=job.id, status="preprocessing")
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"后台任务队列不可用 (Redis/Celery 未启动): {e}",
            ) from e

    # Sync or auto → background thread, no dependency on Redis/Celery at all
    logger.info(f"Sync training: model_id={model.id} quality={request.quality_target}")
    t = threading.Thread(
        target=run_voice_training_job,
        args=(model.id, audio_paths, request.quality_target, job.id),
        daemon=True,
    )
    t.start()
    db.commit()
    return TrainVoiceResponse(model_id=model.id, job_id=job.id, status="preprocessing")


@router.get("/status/{model_id}", response_model=VoiceModelStatus)
def get_status(model_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    model = voice_service.get_voice_model(db, model_id, user.id)
    if not model:
        raise HTTPException(status_code=404, detail="声音模型不存在")

    total_epochs = EPOCH_TARGETS.get(model.quality_tier, 200)
    available_tiers = []
    for tier_name, tier_epochs in TIER_MILESTONES:
        if model.epoch >= tier_epochs:
            available_tiers.append(tier_name)

    remaining = None  # epoch time varies too much to estimate statically

    return VoiceModelStatus(
        id=model.id,
        name=model.name,
        status=model.status,
        current_epoch=model.epoch,
        total_epochs=total_epochs,
        current_tier=model.quality_tier,
        available_tiers=available_tiers,
        estimated_remaining_seconds=remaining,
    )


@router.get("/models", response_model=VoiceModelListResponse)
def list_models(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = voice_service.list_user_voice_models(db, user.id)
    return VoiceModelListResponse(
        items=[VoiceModelResponse.model_validate(m) for m in items],
        total=len(items),
    )


@router.delete("/models/{model_id}")
def delete_model(model_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    success = voice_service.delete_voice_model(db, model_id, user.id)
    if not success:
        raise HTTPException(status_code=404, detail="声音模型不存在")
    return {"ok": True}


@router.post("/sing", response_model=SingResponse)
def sing(
    request: SingRequest,
    processing_mode: Literal["sync", "async", "auto"] = Query("auto"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    model = voice_service.get_voice_model(db, request.voice_model_id, user.id)
    if not model:
        raise HTTPException(status_code=404, detail="声音模型不存在")
    if model.status != "ready":
        raise HTTPException(status_code=400, detail="声音模型尚未训练完成")
    if not model.checkpoint_path or not os.path.exists(model.checkpoint_path):
        raise HTTPException(status_code=400, detail="声音模型检查点文件不存在，请重新训练")

    ref_audio = db.query(AudioAsset).filter(
        AudioAsset.id == request.reference_audio_id, AudioAsset.user_id == user.id
    ).first()
    if not ref_audio:
        raise HTTPException(status_code=404, detail="参考音频不存在")
    if not os.path.exists(ref_audio.file_path):
        raise HTTPException(status_code=400, detail="参考音频文件不存在")

    gen = voice_service.create_vocal_generation(db, user.id, request.voice_model_id, request.reference_audio_id)
    job = create_job(db, user, "svs_generation", {
        "generation_id": gen.id,
        "voice_model_id": request.voice_model_id,
        "reference_audio_id": request.reference_audio_id,
    })

    if processing_mode == "sync":
        try:
            result = infer_rvc_vocals_sync(
                generation_id=gen.id,
                voice_model_id=model.id,
                reference_audio_path=ref_audio.file_path,
            )
            update_job_status(db, job, "completed", stage="completed", progress=100)
            return SingResponse(
                generation_id=gen.id,
                job_id=job.id,
                status=result.get("stage", "completed"),
                message="人声生成完成" if result.get("stage") == "completed" else "人声生成失败",
            )
        except Exception as e:
            update_job_status(db, job, "failed", stage="inference", error_message=str(e))
            raise HTTPException(status_code=500, detail=f"人声生成失败: {e}") from e
    elif processing_mode == "async":
        try:
            infer_rvc_vocals.delay(
                generation_id=gen.id,
                voice_model_id=model.id,
                reference_audio_path=ref_audio.file_path,
            )
            return SingResponse(generation_id=gen.id, job_id=job.id, status="pending")
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"后台队列不可用 (Redis/Celery 未启动): {e}",
            ) from e
    else:
        # "auto": try async first, fall back to sync
        try:
            infer_rvc_vocals.delay(
                generation_id=gen.id,
                voice_model_id=model.id,
                reference_audio_path=ref_audio.file_path,
            )
            return SingResponse(generation_id=gen.id, job_id=job.id, status="pending")
        except Exception as e:
            logger.warning(f"Celery unavailable ({e}), running RVC inference synchronously")
            try:
                result = infer_rvc_vocals_sync(
                    generation_id=gen.id,
                    voice_model_id=model.id,
                    reference_audio_path=ref_audio.file_path,
                )
                update_job_status(db, job, "completed", stage="completed", progress=100)
                return SingResponse(
                    generation_id=gen.id,
                    job_id=job.id,
                    status=result.get("stage", "completed"),
                    message="人声生成完成" if result.get("stage") == "completed" else "人声生成失败",
                )
            except Exception as sync_e:
                update_job_status(db, job, "failed", stage="inference", error_message=str(sync_e))
                raise HTTPException(status_code=500, detail=f"人声生成失败: {sync_e}") from sync_e


@router.get("/generations", response_model=VocalGenerationListResponse)
def list_generations(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = voice_service.list_user_vocal_generations(db, user.id)
    return VocalGenerationListResponse(
        items=[VocalGenerationResponse.model_validate(g) for g in items],
        total=len(items),
    )


@router.get("/generations/{generation_id}", response_model=VocalGenerationStatusResponse)
def get_generation_status(
    generation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    gen = voice_service.get_vocal_generation(db, generation_id, user.id)
    if not gen:
        raise HTTPException(status_code=404, detail="人声生成记录不存在")
    return VocalGenerationStatusResponse(
        id=gen.id,
        voice_model_id=gen.voice_model_id,
        status=gen.status,
        output_path=gen.output_path or "",
        duration_seconds=gen.duration_seconds or 0.0,
        created_at=gen.created_at,
    )


@router.get("/generations/{generation_id}/download")
def download_generation(
    generation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from fastapi.responses import FileResponse
    gen = voice_service.get_vocal_generation(db, generation_id, user.id)
    if not gen:
        raise HTTPException(status_code=404, detail="人声生成记录不存在")
    if not gen.output_path or not os.path.exists(gen.output_path):
        raise HTTPException(status_code=404, detail="人声文件尚未生成")
    return FileResponse(gen.output_path, media_type="audio/wav", filename=f"vocal_{generation_id}.wav")
