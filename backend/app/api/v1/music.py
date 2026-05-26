import os
import json
import logging

from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.style_vector import StyleVector
from app.models.generated_music import GeneratedMusic
from app.models.model_registry import validate_model_key
from app.schemas.music import GenerateRequest, GenerateResponse, MusicResponse, MusicListResponse, SuggestionsRequest, SuggestionsResponse
from app.schemas.blend import BlendGenerateRequest, BlendGenerateResponse, BLEND_PRESETS, BlendPreset
from app.schemas.batch import BatchGenerateRequest, BatchGenerateResponse, BatchStatusResponse, BatchTaskInfo, BatchCellInfo
from app.schemas.audio import StatusResponse
from app.services.music_service import list_user_music
from app.services.job_service import create_job, update_job_status
from app.tasks.audio_pipeline import process_music_generation, process_blend_generation, process_batch_generation
from app.tasks.celery_app import celery_app

import uuid

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/music", tags=["music"])
limiter = Limiter(key_func=get_remote_address)


def _update_job_celery(db, job_id: int, celery_task_id: str):
    """Associate a Celery task ID with a persistent Job."""
    from app.models.job import Job
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.celery_task_id = celery_task_id
            update_job_status(db, job, "queued", stage="pending")
            db.commit()
    except Exception as e:
        logger.warning(f"Failed to set celery_task_id for job {job_id}: {e}")


def _sync_generate_music(
    embedding_json: str,
    text_prompt: str,
    vector_id: int,
    user_id: int,
    music_gen_model: str,
    job_id: int | None = None,
    db: Session | None = None,
) -> dict:
    """Run music generation synchronously (no Celery needed)."""
    from app.core.database import SessionLocal
    from app.models.generated_music import GeneratedMusic
    from app.models.job import Job
    from app.tasks.audio_pipeline import _generate_music
    from app.models.providers.resource_manager import resource_manager
    import json as _json

    def _update_j(st, *, stage=None, progress=None, error=None, result=None):
        if job_id is None:
            return
        try:
            if db is not None:
                job = db.query(Job).filter(Job.id == job_id).first()
                if job:
                    update_job_status(db, job, st, stage=stage, progress=progress, error_message=error, result=result)
                return

            jdb = SessionLocal()
            try:
                job = jdb.query(Job).filter(Job.id == job_id).first()
                if job:
                    update_job_status(jdb, job, st, stage=stage, progress=progress, error_message=error, result=result)
            finally:
                jdb.close()
        except Exception as e:
            logging.getLogger(__name__).warning(f"Failed to update job {job_id}: {e}")

    _update_j("running", stage="generating", progress=5)
    try:
        embedding = _json.loads(embedding_json)
        result = _generate_music(embedding, text_prompt, task_id="", model=music_gen_model)

        music_db = db or SessionLocal()
        try:
            music = GeneratedMusic(
                user_id=user_id, vector_id=vector_id,
                prompt=text_prompt, title=text_prompt[:30],
                file_path=result["file_path"],
                duration_seconds=result["duration_seconds"],
                music_gen_model=music_gen_model,
                provider_mode=result.get("provider_mode", "mock"),
            )
            music_db.add(music)
            music_db.commit()
            music_db.refresh(music)

            payload = {
                "stage": "completed",
                "music_id": music.id,
                "file_path": music.file_path,
                "title": music.title,
                "prompt": text_prompt,
                "duration_seconds": music.duration_seconds,
                "music_gen_model": music_gen_model,
                "provider_mode": music.provider_mode,
            }
            _update_j("completed", stage="completed", progress=100, result=payload)
            return payload
        finally:
            if db is None:
                music_db.close()
    except Exception as e:
        _update_j("failed", stage="generating", error=str(e))
        raise
    finally:
        resource_manager.release_all()


@router.post("/generate", response_model=GenerateResponse)
@limiter.limit("20/minute")
def generate(
    request: Request,
    body: GenerateRequest,
    processing_mode: Literal["sync", "async", "auto"] = Query("auto"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate music using a cached style vector and text prompt.

    processing_mode: "auto" / "sync" / "async"
    """
    vector = (
        db.query(StyleVector)
        .filter(StyleVector.id == body.style_vector_id, StyleVector.user_id == user.id)
        .first()
    )
    if not vector:
        raise HTTPException(status_code=404, detail="风格向量不存在")

    if not validate_model_key("music_gen", body.music_gen_model):
        raise HTTPException(status_code=400, detail=f"Unknown music generation model: {body.music_gen_model}")

    from app.api.v1.audio import _store_sync_result

    # Create a persistent Job
    job = create_job(db, user, "music_generation", {
        "style_vector_id": body.style_vector_id,
        "text_prompt": body.text_prompt,
        "music_gen_model": body.music_gen_model,
    })

    if processing_mode == "sync":
        result = _sync_generate_music(
            vector.embedding, body.text_prompt, vector.id, user.id, body.music_gen_model,
            job_id=job.id, db=db,
        )
        task_id = f"sync-{result.get('music_id', 'unknown')}"
        _store_sync_result(task_id, result)
    elif processing_mode == "async":
        try:
            task = process_music_generation.delay(
                embedding_json=vector.embedding, text_prompt=body.text_prompt,
                vector_id=vector.id, user_id=user.id, music_gen_model=body.music_gen_model,
            )
            task_id = task.id
            _update_job_celery(db, job.id, task.id)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"后台队列不可用 (Redis/Celery 未启动): {e}")
    else:
        # Auto
        task_id = None
        try:
            task = process_music_generation.delay(
                embedding_json=vector.embedding, text_prompt=body.text_prompt,
                vector_id=vector.id, user_id=user.id, music_gen_model=body.music_gen_model,
            )
            task_id = task.id
            _update_job_celery(db, job.id, task.id)
        except Exception as e:
            logger.warning(f"Celery unavailable ({e}), generating music synchronously")
            result = _sync_generate_music(
                vector.embedding, body.text_prompt, vector.id, user.id, body.music_gen_model,
                job_id=job.id, db=db,
            )
            task_id = f"sync-{result.get('music_id', 'unknown')}"
            _store_sync_result(task_id, result)

    return GenerateResponse(task_id=task_id, job_id=job.id, music_gen_model=body.music_gen_model)


@router.get("/list", response_model=MusicListResponse)
def list_music(
    offset: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List generated music for current user."""
    items = list_user_music(db, user, limit=limit, offset=offset)
    total = db.query(GeneratedMusic).filter(GeneratedMusic.user_id == user.id).count()

    return MusicListResponse(
        items=[MusicResponse(**item) for item in items],
        total=total,
    )


@router.post("/blend-generate", response_model=BlendGenerateResponse)
@limiter.limit("20/minute")
def blend_generate(
    request: Request,
    body: BlendGenerateRequest,
    processing_mode: Literal["sync", "async", "auto"] = Query("auto"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate music from a weighted blend of multiple style vectors.

    processing_mode: "auto" / "sync" / "async"
    """
    if len(body.blends) < 2 or len(body.blends) > 3:
        raise HTTPException(status_code=400, detail="需要 2-3 个风格向量进行混合")

    if not validate_model_key("music_gen", body.music_gen_model):
        raise HTTPException(status_code=400, detail=f"Unknown music generation model: {body.music_gen_model}")

    embeddings = []
    for b in body.blends:
        vector = db.query(StyleVector).filter(
            StyleVector.id == b.style_vector_id, StyleVector.user_id == user.id
        ).first()
        if not vector:
            raise HTTPException(status_code=404, detail=f"风格向量 {b.style_vector_id} 不存在")
        embeddings.append((vector.embedding, b.weight))

    from app.api.v1.audio import _store_sync_result
    from app.tasks.audio_pipeline import _blend_embeddings

    # Create a persistent Job
    job = create_job(db, user, "music_generation", {
        "blend": [{"style_vector_id": b.style_vector_id, "weight": b.weight} for b in body.blends],
        "text_prompt": body.text_prompt,
        "music_gen_model": body.music_gen_model,
    })

    if processing_mode == "sync":
        blended = _blend_embeddings(embeddings)
        result = _sync_generate_music(json.dumps(blended), body.text_prompt, 0, user.id, body.music_gen_model, job_id=job.id, db=db)
        task_id = f"sync-{result.get('music_id', 'blend')}"
        _store_sync_result(task_id, result)
    elif processing_mode == "async":
        try:
            task = process_blend_generation.delay(
                embeddings=embeddings, text_prompt=body.text_prompt,
                user_id=user.id, music_gen_model=body.music_gen_model,
            )
            task_id = task.id
            _update_job_celery(db, job.id, task.id)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"后台队列不可用 (Redis/Celery 未启动): {e}")
    else:
        try:
            task = process_blend_generation.delay(
                embeddings=embeddings, text_prompt=body.text_prompt,
                user_id=user.id, music_gen_model=body.music_gen_model,
            )
            task_id = task.id
            _update_job_celery(db, job.id, task.id)
        except Exception as e:
            logger.warning(f"Celery unavailable ({e}), blending synchronously")
            blended = _blend_embeddings(embeddings)
            result = _sync_generate_music(json.dumps(blended), body.text_prompt, 0, user.id, body.music_gen_model, job_id=job.id, db=db)
            task_id = f"sync-{result.get('music_id', 'blend')}"
            _store_sync_result(task_id, result)

    return BlendGenerateResponse(
        task_id=task_id, job_id=job.id, music_gen_model=body.music_gen_model,
        num_blends=len(body.blends),
    )


@router.get("/blend-presets", response_model=list[BlendPreset])
def list_blend_presets():
    """Return available blending preset templates."""
    return BLEND_PRESETS


@router.post("/generate-batch", response_model=BatchGenerateResponse)
@limiter.limit("10/minute")
def generate_batch(
    request: Request,
    body: BatchGenerateRequest,
    processing_mode: Literal["sync", "async", "auto"] = Query("auto"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate music in a prompt × model matrix grid.

    processing_mode: "auto" / "sync" / "async"
    """
    vector = db.query(StyleVector).filter(
        StyleVector.id == body.style_vector_id, StyleVector.user_id == user.id
    ).first()
    if not vector:
        raise HTTPException(status_code=404, detail="风格向量不存在")

    for m in body.music_gen_models:
        if not validate_model_key("music_gen", m):
            raise HTTPException(status_code=400, detail=f"Unknown model: {m}")

    batch_id = uuid.uuid4().hex[:12]
    tasks: list[BatchTaskInfo] = []
    from app.api.v1.audio import _store_sync_result

    # Create a single Job representing the batch operation
    job = create_job(db, user, "music_generation", {
        "batch_id": batch_id,
        "style_vector_id": body.style_vector_id,
        "prompts": body.prompts,
        "music_gen_models": body.music_gen_models,
    })

    if processing_mode == "sync":
        for prompt in body.prompts:
            for model in body.music_gen_models:
                result = _sync_generate_music(vector.embedding, prompt, vector.id, user.id, model)
                sid = f"sync-{result.get('music_id', 'unknown')}-{batch_id}"
                _store_sync_result(sid, result)
                tasks.append(BatchTaskInfo(task_id=sid, prompt=prompt, model=model))
        # Mark batch job completed
        update_job_status(db, job, "completed", stage="completed", progress=100)
    elif processing_mode == "async":
        try:
            from app.tasks.celery_app import celery_app
            batch_key = f"batch:{batch_id}"
            for prompt in body.prompts:
                for model in body.music_gen_models:
                    task = process_batch_generation.delay(
                        embedding_json=vector.embedding, text_prompt=prompt,
                        user_id=user.id, music_gen_model=model, batch_id=batch_id,
                    )
                    celery_app.backend.client.sadd(batch_key, task.id)
                    tasks.append(BatchTaskInfo(task_id=task.id, prompt=prompt, model=model))
            celery_app.backend.client.expire(batch_key, 3600)
            celery_app.backend.client.setex(f"batch-job:{batch_id}", 3600, str(job.id))
            update_job_status(db, job, "running", stage="queued", progress=0)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"后台队列不可用 (Redis/Celery 未启动): {e}")
    else:
        try:
            from app.tasks.celery_app import celery_app
            batch_key = f"batch:{batch_id}"
            for prompt in body.prompts:
                for model in body.music_gen_models:
                    task = process_batch_generation.delay(
                        embedding_json=vector.embedding, text_prompt=prompt,
                        user_id=user.id, music_gen_model=model, batch_id=batch_id,
                    )
                    celery_app.backend.client.sadd(batch_key, task.id)
                    tasks.append(BatchTaskInfo(task_id=task.id, prompt=prompt, model=model))
            celery_app.backend.client.expire(batch_key, 3600)
            celery_app.backend.client.setex(f"batch-job:{batch_id}", 3600, str(job.id))
            update_job_status(db, job, "running", stage="queued", progress=0)
        except Exception as e:
            logger.warning(f"Celery unavailable ({e}), running batch synchronously")
            for prompt in body.prompts:
                for model in body.music_gen_models:
                    result = _sync_generate_music(vector.embedding, prompt, vector.id, user.id, model)
                    sid = f"sync-{result.get('music_id', 'unknown')}-{batch_id}"
                    _store_sync_result(sid, result)
                    tasks.append(BatchTaskInfo(task_id=sid, prompt=prompt, model=model))
            update_job_status(db, job, "completed", stage="completed", progress=100)

    return BatchGenerateResponse(batch_id=batch_id, tasks=tasks)


@router.get("/batch/{batch_id}", response_model=BatchStatusResponse)
def get_batch_status(
    batch_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get status of all tasks in a batch using Redis SET index."""
    from app.tasks.celery_app import celery_app
    import json as _json

    cells: list[BatchCellInfo] = []
    completed = 0
    try:
        backend = celery_app.backend
        batch_key = f"batch:{batch_id}"
        task_ids = backend.client.smembers(batch_key)
        for tid_bytes in (task_ids or []):
            tid = tid_bytes.decode() if isinstance(tid_bytes, bytes) else tid_bytes
            raw = backend.client.get(f"celery-task-meta-{tid}")
            if not raw:
                cells.append(BatchCellInfo(task_id=tid, prompt="", model="", status="pending"))
                continue
            try:
                meta = _json.loads(raw)
            except (json.JSONDecodeError, TypeError, ValueError):
                cells.append(BatchCellInfo(task_id=tid, prompt="", model="", status="pending"))
                continue
            result = meta.get("result", {}) if isinstance(meta.get("result"), dict) else {}
            status = "pending"
            if meta.get("status") == "SUCCESS":
                status = "completed"
                completed += 1
            elif meta.get("status") == "PROGRESS":
                status = "generating"
            elif meta.get("status") == "FAILURE":
                status = "failed"
            cells.append(BatchCellInfo(
                task_id=tid,
                prompt=result.get("prompt", ""),
                model=result.get("model") or result.get("music_gen_model", ""),
                status=status,
                music_id=result.get("music_id"),
                file_path=result.get("file_path"),
            ))
    except (ConnectionError, TimeoutError, OSError) as e:
        logger.debug(f"Redis/broker unavailable for batch {batch_id}: {e}")
        # Fall through to sync check below

    # Fallback: check in-memory sync results when Redis had no data
    if not cells:
        from app.api.v1.audio import _sync_results
        for key, entry in _sync_results.items():
            if batch_id in key:
                meta = entry["data"] if isinstance(entry, dict) and "data" in entry else entry
                cells.append(BatchCellInfo(
                    task_id=key,
                    prompt=meta.get("prompt", ""),
                    model=meta.get("music_gen_model", ""),
                    status="completed",
                    music_id=meta.get("music_id"),
                    file_path=meta.get("file_path"),
                ))
                completed += 1

    failed = sum(1 for cell in cells if cell.status == "failed")
    done = completed + failed
    total = len(cells)
    if total:
        try:
            raw_job_id = celery_app.backend.client.get(f"batch-job:{batch_id}")
            if raw_job_id:
                job_id = int(raw_job_id.decode() if isinstance(raw_job_id, bytes) else raw_job_id)
                from app.models.job import Job
                job = db.query(Job).filter(Job.id == job_id, Job.user_id == user.id).first()
                if job and job.status not in ("completed", "failed", "cancelled"):
                    progress = min(100, int(done * 100 / total))
                    if done >= total:
                        terminal = "failed" if completed == 0 and failed > 0 else "completed"
                        update_job_status(db, job, terminal, stage="completed", progress=100, result={
                            "batch_id": batch_id,
                            "total": total,
                            "completed": completed,
                            "failed": failed,
                        })
                    else:
                        update_job_status(db, job, "running", stage="generating", progress=progress)
        except Exception as e:
            logger.debug(f"Failed to update batch job status for {batch_id}: {e}")

    return BatchStatusResponse(batch_id=batch_id, cells=cells, total=total, completed=completed)


@router.get("/status/{task_id}", response_model=StatusResponse)
def get_music_task_status(task_id: str):
    """Poll the status of a music generation / blend / batch task."""
    # Check in-memory sync results first (same pattern as audio.py's _sync_results)
    from app.api.v1.audio import _sync_results
    if task_id in _sync_results:
        entry = _sync_results[task_id]
        meta = entry["data"] if isinstance(entry, dict) and "data" in entry else entry
        return StatusResponse(
            task_id=task_id,
            stage=meta.get("stage", "completed"),
            progress=100,
            message=meta.get("message", "完成"),
            music_id=meta.get("music_id"),
            file_path=meta.get("file_path"),
            title=meta.get("title"),
            duration_seconds=meta.get("duration_seconds"),
            music_gen_model=meta.get("music_gen_model"),
            provider_mode=meta.get("provider_mode"),
            style_vector=meta.get("style_vector"),
        )

    try:
        result = celery_app.AsyncResult(task_id)
        state = result.state
    except Exception as e:
        logger.debug(f"Celery backend unavailable for task {task_id}: {e}")
        return StatusResponse(task_id=task_id, stage="pending", progress=0, message="任务排队中")

    if state == "PENDING":
        return StatusResponse(task_id=task_id, stage="pending", progress=0, message="任务排队中")

    if state == "PROGRESS":
        info = (result.info or {}) if isinstance(result.info, dict) else {}
        return StatusResponse(
            task_id=task_id,
            stage=info.get("stage", "generating"),
            progress=info.get("progress", 0),
            message=info.get("message", "生成中..."),
        )

    if state == "SUCCESS":
        meta = (result.result or {}) if isinstance(result.result, dict) else {}
        return StatusResponse(
            task_id=task_id,
            stage=meta.get("stage", "completed"),
            progress=100,
            message=meta.get("message", "完成"),
            music_id=meta.get("music_id"),
            file_path=meta.get("file_path"),
            title=meta.get("title"),
            duration_seconds=meta.get("duration_seconds"),
            music_gen_model=meta.get("music_gen_model"),
            provider_mode=meta.get("provider_mode"),
        )

    if state == "FAILURE":
        return StatusResponse(task_id=task_id, stage="failed", progress=0, message=str(result.info or ""))

    return StatusResponse(task_id=task_id, stage=str(state), progress=0, message="")


@router.get("/public/{music_id}/download")
def download_public_music(
    music_id: int,
    db: Session = Depends(get_db),
):
    """Download a public featured music file."""
    music = db.query(GeneratedMusic).filter(GeneratedMusic.id == music_id).first()
    if not music:
        raise HTTPException(status_code=404, detail="Music not found")
    if not os.path.isfile(music.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(
        path=music.file_path,
        media_type="audio/wav",
        filename=os.path.basename(music.file_path),
    )


@router.get("/{music_id}/download")
def download_music(
    music_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Download a generated music file."""
    music = db.query(GeneratedMusic).filter(
        GeneratedMusic.id == music_id, GeneratedMusic.user_id == user.id
    ).first()
    if not music:
        raise HTTPException(status_code=404, detail="音乐不存在")
    if not os.path.isfile(music.file_path):
        raise HTTPException(status_code=404, detail="音频文件不存在")
    return FileResponse(
        path=music.file_path,
        media_type="audio/wav",
        filename=os.path.basename(music.file_path),
    )


@router.get("/public/featured", response_model=list[MusicResponse])
def list_featured_music(
    limit: int = 6,
    db: Session = Depends(get_db),
):
    """List recent generated music from all users (no auth required, for landing page)."""
    items = (
        db.query(GeneratedMusic)
        .order_by(GeneratedMusic.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        MusicResponse(
            id=m.id,
            title=m.title,
            prompt=m.prompt,
            style_name="AI 生成",
            file_path=m.file_path,
            duration_seconds=m.duration_seconds,
            music_gen_model=m.music_gen_model or "musicgen_small",
            provider_mode=m.provider_mode or "mock",
            created_at=m.created_at,
        )
        for m in items
    ]


@router.post("/suggestions", response_model=SuggestionsResponse)
def get_suggestions(
    body: SuggestionsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate music description suggestions for a style vector."""
    vector = (
        db.query(StyleVector)
        .filter(StyleVector.id == body.style_vector_id, StyleVector.user_id == user.id)
        .first()
    )
    if not vector:
        raise HTTPException(status_code=404, detail="风格向量不存在")

    from app.models.providers.prompt_registry import generate_suggestions

    suggestions, provider = generate_suggestions(vector.style_name)
    return SuggestionsResponse(suggestions=suggestions, provider=provider)
