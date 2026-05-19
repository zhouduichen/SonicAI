from fastapi import APIRouter, UploadFile, File, Form, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.model_registry import validate_model_key
from app.schemas.audio import UploadResponse, StatusResponse
from app.services.audio_service import save_upload_and_create_asset
from app.tasks.audio_pipeline import process_audio_upload
from app.tasks.celery_app import celery_app
from app.utils.file_utils import validate_audio_file

router = APIRouter(prefix="/audio", tags=["audio"])
limiter = Limiter(key_func=get_remote_address)


MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100MB

@router.post("/upload", response_model=UploadResponse)
@limiter.limit("10/minute")
async def upload_audio(
    request: Request,
    file: UploadFile = File(...),
    vocal_sep_model: str = Form("demucs_htdemucs"),
    style_extract_model: str = Form("clap_laion"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload an audio file and start the processing pipeline."""
    if not validate_model_key("vocal_sep", vocal_sep_model):
        raise HTTPException(status_code=400, detail=f"Unknown vocal separation model: {vocal_sep_model}")
    if not validate_model_key("style_extract", style_extract_model):
        raise HTTPException(status_code=400, detail=f"Unknown style extraction model: {style_extract_model}")

    content = await file.read()

    error = validate_audio_file(file.filename or "unknown.mp3", len(content))
    if error:
        raise HTTPException(status_code=400, detail=error)

    asset = save_upload_and_create_asset(db, user, file.filename or "audio.mp3", content, vocal_sep_model=vocal_sep_model)

    task = process_audio_upload.delay(
        audio_path=asset.file_path,
        asset_id=asset.id,
        user_id=user.id,
        vocal_sep_model=vocal_sep_model,
        style_extract_model=style_extract_model,
    )

    return UploadResponse(
        asset_id=asset.id, task_id=task.id,
        vocal_sep_model=vocal_sep_model, style_extract_model=style_extract_model,
    )


@router.get("/status/{task_id}", response_model=StatusResponse)
def get_task_status(task_id: str):
    """Poll the status of an async audio processing task."""
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
