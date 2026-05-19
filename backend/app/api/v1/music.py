from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.style_vector import StyleVector
from app.models.generated_music import GeneratedMusic
from app.models.model_registry import validate_model_key
from app.schemas.music import GenerateRequest, GenerateResponse, MusicResponse, MusicListResponse
from app.schemas.blend import BlendGenerateRequest, BlendGenerateResponse, BLEND_PRESETS, BlendPreset
from app.schemas.batch import BatchGenerateRequest, BatchGenerateResponse, BatchStatusResponse, BatchTaskInfo, BatchCellInfo
from app.services.music_service import list_user_music
from app.tasks.audio_pipeline import process_music_generation, process_blend_generation, process_batch_generation

import uuid

router = APIRouter(prefix="/music", tags=["music"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/generate", response_model=GenerateResponse)
@limiter.limit("20/minute")
def generate(
    request: Request,
    body: GenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate music using a cached style vector and text prompt."""
    # Verify the style vector belongs to this user
    vector = (
        db.query(StyleVector)
        .filter(StyleVector.id == body.style_vector_id, StyleVector.user_id == user.id)
        .first()
    )
    if not vector:
        raise HTTPException(status_code=404, detail="风格向量不存在")

    if not validate_model_key("music_gen", body.music_gen_model):
        raise HTTPException(status_code=400, detail=f"Unknown music generation model: {body.music_gen_model}")

    task = process_music_generation.delay(
        embedding_json=vector.embedding,
        text_prompt=body.text_prompt,
        vector_id=vector.id,
        user_id=user.id,
        music_gen_model=body.music_gen_model,
    )

    return GenerateResponse(task_id=task.id, music_gen_model=body.music_gen_model)


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
        items=[MusicResponse(**{**item, "music_gen_model": item.get("music_gen_model", "musicgen_small")}) for item in items],
        total=total,
    )


@router.post("/blend-generate", response_model=BlendGenerateResponse)
@limiter.limit("20/minute")
def blend_generate(
    request: Request,
    body: BlendGenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate music from a weighted blend of multiple style vectors."""
    if len(body.blends) < 2 or len(body.blends) > 3:
        raise HTTPException(status_code=400, detail="需要 2-3 个风格向量进行混合")

    if not validate_model_key("music_gen", body.music_gen_model):
        raise HTTPException(status_code=400, detail=f"Unknown music generation model: {body.music_gen_model}")

    # Verify all vectors belong to user and collect embeddings
    embeddings = []
    for b in body.blends:
        vector = db.query(StyleVector).filter(
            StyleVector.id == b.style_vector_id, StyleVector.user_id == user.id
        ).first()
        if not vector:
            raise HTTPException(status_code=404, detail=f"风格向量 {b.style_vector_id} 不存在")
        embeddings.append((vector.embedding, b.weight))

    task = process_blend_generation.delay(
        embeddings=embeddings,
        text_prompt=body.text_prompt,
        user_id=user.id,
        music_gen_model=body.music_gen_model,
    )

    return BlendGenerateResponse(
        task_id=task.id, music_gen_model=body.music_gen_model,
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate music in a prompt × model matrix grid."""
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

    # Register batch in Redis SET for efficient polling
    from app.tasks.celery_app import celery_app
    batch_key = f"batch:{batch_id}"

    for prompt in body.prompts:
        for model in body.music_gen_models:
            task = process_batch_generation.delay(
                embedding_json=vector.embedding,
                text_prompt=prompt,
                user_id=user.id,
                music_gen_model=model,
                batch_id=batch_id,
            )
            celery_app.backend.client.sadd(batch_key, task.id)
            tasks.append(BatchTaskInfo(task_id=task.id, prompt=prompt, model=model))

    # Set TTL on batch index (1 hour)
    celery_app.backend.client.expire(batch_key, 3600)

    return BatchGenerateResponse(batch_id=batch_id, tasks=tasks)


@router.get("/batch/{batch_id}", response_model=BatchStatusResponse)
def get_batch_status(
    batch_id: str,
    user: User = Depends(get_current_user),
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
            except Exception:
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
                model=result.get("model", ""),
                status=status,
                music_id=result.get("music_id"),
                file_path=result.get("file_path"),
            ))
    except Exception:
        pass

    return BatchStatusResponse(batch_id=batch_id, cells=cells, total=len(cells), completed=completed)
