import asyncio
import json
import os
import time
import logging

from typing import Literal
from fastapi import APIRouter, UploadFile, File, Form, Depends, Request, HTTPException, Query
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.model_registry import validate_model_key
from app.schemas.audio import UploadResponse, StatusResponse, AudioAssetResponse, AudioAssetListResponse, StyleVectorResponse
from app.services.audio_service import save_upload_and_create_asset
from app.services.job_service import create_job, update_job_status
from app.tasks.audio_pipeline import process_audio_upload, _separate_vocals, _extract_style_embedding
from app.tasks.celery_app import celery_app
from app.utils.file_utils import validate_audio_file

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audio", tags=["audio"])
limiter = Limiter(key_func=get_remote_address)

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100MB


def _run_pipeline_sync(
    audio_path: str,
    asset_id: int,
    user_id: int,
    vocal_sep_model: str,
    style_extract_model: str,
    job_id: int | None = None,
) -> dict:
    """Run the full audio processing pipeline synchronously (no Celery needed)."""
    from app.core.database import SessionLocal
    from app.models.audio_asset import AudioAsset
    from app.models.style_vector import StyleVector
    from app.models.providers.resource_manager import resource_manager
    from app.models.job import Job

    _t0 = time.perf_counter()
    _file_size_mb = 0.0
    try:
        if os.path.exists(audio_path):
            _file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
    except OSError:
        pass

    logger.info(f"Sync pipeline start: asset={asset_id} vocal_sep={vocal_sep_model} style_ext={style_extract_model}")

    def _update_job(db_session, status: str, *, stage: str | None = None, progress: int | None = None, error: str | None = None, result: dict | None = None):
        if job_id is None:
            return
        try:
            job = db_session.query(Job).filter(Job.id == job_id).first()
            if job:
                update_job_status(db_session, job, status, stage=stage, progress=progress, error_message=error, result=result)
        except Exception as e:
            logger.warning(f"Failed to update job {job_id}: {e}")

    # Mark job as running
    _db = SessionLocal()
    try:
        _update_job(_db, "running", stage="separating", progress=5)
    finally:
        _db.close()

    try:
        logger.info(f"Step 1/2: vocal separation for asset {asset_id}")
        _t1 = time.perf_counter()
        instrumental_path = _separate_vocals(audio_path, task_id="", model=vocal_sep_model)
        _t_vocal = time.perf_counter() - _t1
        logger.info(f"Step 1/2 done: instrumental at {instrumental_path} ({_t_vocal:.2f}s)")

        _db2 = SessionLocal()
        try:
            _update_job(_db2, "running", stage="extracting", progress=50)
        finally:
            _db2.close()

        logger.info(f"Step 2/2: style extraction for asset {asset_id}")
        _t2 = time.perf_counter()
        embedding = _extract_style_embedding(instrumental_path, task_id="", model=style_extract_model)
        _t_style = time.perf_counter() - _t2
        logger.info(f"Step 2/2 done: embedding dim={len(embedding)} ({_t_style:.2f}s)")

        db = SessionLocal()
        try:
            asset = db.query(AudioAsset).filter(AudioAsset.id == asset_id).first()
            if not asset:
                logger.error(f"Asset {asset_id} not found in DB during sync pipeline")
                return {"stage": "failed", "reason": "asset not found"}

            asset.status = "completed"
            style_name = os.path.splitext(os.path.basename(audio_path))[0] + "_风格"
            style_vector = StyleVector(
                user_id=user_id, asset_id=asset_id,
                style_name=style_name,
                embedding=json.dumps(embedding),
                style_extract_model=style_extract_model,
            )
            db.add(style_vector)
            db.commit()
            db.refresh(style_vector)
            logger.info(f"Sync pipeline complete: asset={asset_id} style_vector={style_vector.id}")
            _update_job(db, "completed", stage="completed", progress=100, result={
                "asset_id": asset_id,
                "style_vector_id": style_vector.id,
            })

            _total = time.perf_counter() - _t0
            logger.info(
                "PIPELINE_TIMING sync asset=%d vocal_sep=%.2fs style_extract=%.2fs db_write=%.2fs "
                "total=%.2fs vocal_model=%s style_model=%s file_size=%.1fMB dim=%d",
                asset_id, _t_vocal, _t_style, _total - _t_vocal - _t_style,
                _total, vocal_sep_model, style_extract_model, _file_size_mb, len(embedding),
            )

            return {
                "stage": "completed",
                "asset_id": asset_id,
                "style_vector_id": style_vector.id,
                "style_vector": {
                    "id": style_vector.id,
                    "style_name": style_vector.style_name,
                    "asset_id": asset_id,
                    "style_extract_model": style_extract_model,
                    "created_at": style_vector.created_at.isoformat() if style_vector.created_at else None,
                },
            }
        finally:
            db.close()
    except Exception as e:
        _total = time.perf_counter() - _t0
        logger.error(
            "PIPELINE_TIMING sync FAILED asset=%d after=%.2fs vocal_model=%s style_model=%s file_size=%.1fMB error=%s",
            asset_id, _total, vocal_sep_model, style_extract_model, _file_size_mb, e,
        )
        _mark_asset_failed(asset_id)
        _fail_db = SessionLocal()
        try:
            _update_job(_fail_db, "failed", stage="pipeline", error=str(e))
        finally:
            _fail_db.close()
        raise
    finally:
        # Keep models warm in memory for fast reprocessing
        pass


@router.post("/upload", response_model=UploadResponse)
@limiter.limit("10/minute")
async def upload_audio(
    request: Request,
    file: UploadFile = File(...),
    vocal_sep_model: str = Form("demucs_htdemucs"),
    style_extract_model: str = Form("clap_laion"),
    processing_mode: Literal["sync", "async", "auto"] = Query("auto"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload an audio file and start the processing pipeline.

    processing_mode: "auto" and "sync" run foreground analysis; "async" queues Celery.
    """
    if not validate_model_key("vocal_sep", vocal_sep_model):
        raise HTTPException(status_code=400, detail=f"Unknown vocal separation model: {vocal_sep_model}")
    if not validate_model_key("style_extract", style_extract_model):
        raise HTTPException(status_code=400, detail=f"Unknown style extraction model: {style_extract_model}")

    content = await file.read()
    _file_size_mb = len(content) / (1024 * 1024)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"文件过大，最大 {MAX_UPLOAD_BYTES // (1024*1024)}MB")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="文件为空")

    error = validate_audio_file(file.filename or "unknown.mp3", len(content))
    if error:
        raise HTTPException(status_code=400, detail=error)

    _t_save = time.perf_counter()
    asset = save_upload_and_create_asset(db, user, file.filename or "audio.mp3", content, vocal_sep_model=vocal_sep_model)
    logger.info(
        "PIPELINE_TIMING upload file=%s size=%.1fMB save=%.2fs asset_id=%d mode=%s",
        file.filename, _file_size_mb, time.perf_counter() - _t_save,
        asset.id, processing_mode,
    )

    # Create a persistent Job for this upload
    job = create_job(db, user, "audio_upload", {
        "asset_id": asset.id,
        "vocal_sep_model": vocal_sep_model,
        "style_extract_model": style_extract_model,
    })

    task_id: str | None = None

    if processing_mode in ("sync", "auto"):
        logger.info(f"Processing asset {asset.id} in {processing_mode} mode (foreground sync)")
        try:
            result = await asyncio.to_thread(
                _run_pipeline_sync,
                asset.file_path, asset.id, user.id,
                vocal_sep_model, style_extract_model,
                job_id=job.id,
            )
        except Exception as sync_e:
            # _run_pipeline_sync already called _mark_asset_failed internally
            raise HTTPException(status_code=500, detail=f"音频处理失败: {sync_e}") from sync_e
        task_id = f"sync-{asset.id}"
        if result.get("style_vector_id"):
            _store_sync_result(task_id, result)
        elif result.get("stage") == "failed":
            # _mark_asset_failed already called inside _run_pipeline_sync
            raise HTTPException(status_code=500, detail=f"音频处理失败: {result.get('reason', '未知错误')}")
    elif processing_mode == "async":
        logger.info(f"Processing asset {asset.id} in async mode (Celery queue)")
        job.celery_task_id = "celery-pending"
        db.commit()
        try:
            task = process_audio_upload.delay(
                audio_path=asset.file_path,
                asset_id=asset.id,
                user_id=user.id,
                vocal_sep_model=vocal_sep_model,
                style_extract_model=style_extract_model,
            )
            task_id = task.id
            # Update job with celery_task_id
            try:
                from app.models.job import Job
                j = db.query(Job).filter(Job.id == job.id).first()
                if j:
                    j.celery_task_id = task.id
                    db.commit()
            except Exception:
                pass
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"后台队列不可用 (Redis/Celery 未启动): {e}")
    return UploadResponse(
        asset_id=asset.id, task_id=task_id or f"sync-{asset.id}", job_id=job.id,
        vocal_sep_model=vocal_sep_model, style_extract_model=style_extract_model,
    )


# In-memory store for sync tasks when Celery/Redis is unavailable
import threading as _threading
_sync_results: dict[str, dict] = {}
_sync_lock = _threading.Lock()
_SYNC_TTL_SECONDS = 3600
_SYNC_MAX_ENTRIES = 500


def _evict_stale_sync_results() -> None:
    """Remove stale sync result entries, keeping total under max."""
    now = time.time()
    with _sync_lock:
        stale = [k for k, v in _sync_results.items() if now - v.get("ts", 0) > _SYNC_TTL_SECONDS]
        for k in stale:
            del _sync_results[k]
        # If still over max, evict oldest
        if len(_sync_results) > _SYNC_MAX_ENTRIES:
            sorted_keys = sorted(_sync_results, key=lambda k: _sync_results[k].get("ts", 0))
            for k in sorted_keys[:len(_sync_results) - _SYNC_MAX_ENTRIES]:
                del _sync_results[k]


def _mark_asset_failed(asset_id: int) -> None:
    """Set asset status to failed in the database."""
    from app.core.database import SessionLocal
    from app.models.audio_asset import AudioAsset
    db = SessionLocal()
    try:
        a = db.query(AudioAsset).filter(AudioAsset.id == asset_id).first()
        if a:
            a.status = "failed"
            db.commit()
    finally:
        db.close()


def _store_sync_result(task_id: str, data: dict) -> None:
    _evict_stale_sync_results()
    with _sync_lock:
        _sync_results[task_id] = {"data": data, "ts": time.time()}


def _lookup_sync_asset(task_id: str):
    """Query the database for a sync task's asset and style vector. Returns StatusResponse or None."""
    if not task_id.startswith("sync-"):
        return None
    try:
        asset_id_str = task_id[len("sync-"):]
        asset_id = int(asset_id_str)
    except (ValueError, TypeError):
        return None

    from app.core.database import SessionLocal
    from app.models.audio_asset import AudioAsset
    from app.models.style_vector import StyleVector

    db = SessionLocal()
    try:
        asset = db.query(AudioAsset).filter(AudioAsset.id == asset_id).first()
        if not asset:
            return None
        if asset.status == "failed":
            return StatusResponse(task_id=task_id, stage="failed", progress=0, message="处理失败")
        if asset.status == "processing":
            return StatusResponse(task_id=task_id, stage="processing", progress=50, message="处理中...")

        sv = db.query(StyleVector).filter(StyleVector.asset_id == asset_id).first()
        if asset.status == "completed" and sv:
            return StatusResponse(
                task_id=task_id,
                stage="completed",
                progress=100,
                message="完成",
                style_vector={
                    "id": sv.id,
                    "style_name": sv.style_name,
                    "asset_id": sv.asset_id,
                    "style_extract_model": sv.style_extract_model,
                    "created_at": sv.created_at.isoformat() if sv.created_at else None,
                },
            )
        return None
    finally:
        db.close()


@router.get("/list", response_model=AudioAssetListResponse)
def list_audio_assets(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all audio assets and their style vectors for the current user."""
    from app.models.audio_asset import AudioAsset
    from app.models.style_vector import StyleVector

    assets = (
        db.query(AudioAsset)
        .filter(AudioAsset.user_id == user.id)
        .order_by(AudioAsset.created_at.desc())
        .all()
    )
    # Batch load style vectors (avoid N+1)
    asset_ids = [a.id for a in assets]
    sv_map: dict[int, StyleVector] = {}
    if asset_ids:
        svs = db.query(StyleVector).filter(StyleVector.asset_id.in_(asset_ids)).all()
        sv_map = {sv.asset_id: sv for sv in svs}

    items = []
    for a in assets:
        sv = sv_map.get(a.id)
        sv_data = None
        if sv:
            sv_data = StyleVectorResponse(
                id=sv.id,
                style_name=sv.style_name,
                asset_id=sv.asset_id,
                style_extract_model=sv.style_extract_model,
                created_at=sv.created_at,
            )
        items.append(AudioAssetResponse(
            id=a.id,
            file_name=a.file_name,
            file_path=a.file_path,
            status=a.status,
            vocal_sep_model=a.vocal_sep_model,
            style_vector=sv_data,
            created_at=a.created_at,
        ))
    return AudioAssetListResponse(items=items, total=len(items))


@router.delete("/{asset_id}")
def delete_audio_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete an audio asset, its style vector, and uploaded files."""
    from app.models.audio_asset import AudioAsset
    from app.models.style_vector import StyleVector

    asset = db.query(AudioAsset).filter(
        AudioAsset.id == asset_id, AudioAsset.user_id == user.id
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="音频资产不存在")

    # Delete associated style vector
    sv = db.query(StyleVector).filter(StyleVector.asset_id == asset_id).first()
    if sv:
        # Remove generated music referencing this style vector
        from app.models.generated_music import GeneratedMusic
        db.query(GeneratedMusic).filter(GeneratedMusic.vector_id == sv.id).delete()
        db.delete(sv)

    # Delete uploaded file and generated files
    import shutil
    asset_dir = os.path.dirname(asset.file_path) if asset.file_path else None
    if asset_dir and os.path.isdir(asset_dir):
        try:
            shutil.rmtree(asset_dir, ignore_errors=True)
        except OSError:
            logger.warning(f"Failed to remove asset directory: {asset_dir}", exc_info=True)

    db.delete(asset)
    db.commit()
    return {"ok": True}


@router.get("/status/{task_id}", response_model=StatusResponse)
def get_task_status(task_id: str):
    """Poll the status of an async audio processing task."""
    # Check in-memory sync results first
    if task_id.startswith("sync-") and task_id in _sync_results:
        entry = _sync_results[task_id]
        meta = entry["data"] if isinstance(entry, dict) and "data" in entry else entry
        return StatusResponse(
            task_id=task_id,
            stage=meta.get("stage", "completed"),
            progress=100,
            message=meta.get("message", "完成"),
            style_vector=meta.get("style_vector"),
            music_id=meta.get("music_id"),
            file_path=meta.get("file_path"),
            title=meta.get("title"),
            duration_seconds=meta.get("duration_seconds"),
            music_gen_model=meta.get("music_gen_model"),
        )

    # Fallback: for sync tasks, query the database directly
    if task_id.startswith("sync-"):
        db_result = _lookup_sync_asset(task_id)
        if db_result is not None:
            return db_result
        # Asset not found or result indeterminate — return not-found
        return StatusResponse(task_id=task_id, stage="failed", progress=0, message="任务未找到")

    try:
        result = celery_app.AsyncResult(task_id)
    except Exception as e:
        return StatusResponse(task_id=task_id, stage="pending", progress=0, message=f"查询失败: {e}")

    try:
        state = result.state
    except Exception:
        return StatusResponse(task_id=task_id, stage="pending", progress=0, message="任务排队中")

    if state == "PENDING":
        return StatusResponse(task_id=task_id, stage="pending", progress=0, message="任务排队中")

    if state == "PROGRESS":
        info = (result.info or {}) if isinstance(result.info, dict) else {}
        return StatusResponse(
            task_id=task_id,
            stage=info.get("stage", "processing"),
            progress=info.get("progress", 0),
            message=info.get("message", "处理中..."),
        )

    if state == "SUCCESS":
        meta = (result.result or {}) if isinstance(result.result, dict) else {}
        return StatusResponse(
            task_id=task_id,
            stage=meta.get("stage", "completed"),
            progress=100,
            message=meta.get("message", "完成"),
            style_vector=meta.get("style_vector"),
            music_id=meta.get("music_id"),
            file_path=meta.get("file_path"),
            title=meta.get("title"),
            duration_seconds=meta.get("duration_seconds"),
            music_gen_model=meta.get("music_gen_model"),
        )

    if state == "FAILURE":
        return StatusResponse(task_id=task_id, stage="failed", progress=0, message=str(result.info or ""))

    return StatusResponse(task_id=task_id, stage=str(state), progress=0, message="")
