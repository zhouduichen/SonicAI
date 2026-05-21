from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.audio_asset import AudioAsset
from app.schemas.voice import (
    TrainVoiceRequest, TrainVoiceResponse,
    VoiceModelStatus, VoiceModelResponse, VoiceModelListResponse,
    SingRequest, SingResponse,
    VocalGenerationResponse, VocalGenerationListResponse,
)
from app.services import voice_service
from app.tasks.voice_pipeline import train_voice_model, infer_rvc_vocals

router = APIRouter(prefix="/voice", tags=["voice"])

from app.services.voice_service import EPOCH_TARGETS, TIER_MILESTONES


@router.post("/train", response_model=TrainVoiceResponse)
def train(request: TrainVoiceRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
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

    model = voice_service.create_voice_model(
        db, user.id, request.name, request.audio_asset_ids, request.quality_target
    )

    # Run training in background thread (no Celery/Redis needed)
    import threading
    audio_paths = [a.file_path for a in assets]
    quality_target = request.quality_target
    model_id = model.id

    def _train_in_thread():
        from app.tasks.voice_pipeline import train_voice_model_sync
        train_voice_model_sync(model_id, audio_paths, quality_target)

    t = threading.Thread(target=_train_in_thread, daemon=True)
    t.start()

    return TrainVoiceResponse(model_id=model.id, status="preprocessing")


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
def sing(request: SingRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    model = voice_service.get_voice_model(db, request.voice_model_id, user.id)
    if not model:
        raise HTTPException(status_code=404, detail="声音模型不存在")
    if model.status != "ready":
        raise HTTPException(status_code=400, detail="声音模型尚未训练完成")

    ref_audio = db.query(AudioAsset).filter(
        AudioAsset.id == request.reference_audio_id, AudioAsset.user_id == user.id
    ).first()
    if not ref_audio:
        raise HTTPException(status_code=404, detail="参考音频不存在")

    gen = voice_service.create_vocal_generation(db, user.id, request.voice_model_id, request.reference_audio_id)
    infer_rvc_vocals.delay(
        generation_id=gen.id,
        voice_model_id=model.id,
        reference_audio_path=ref_audio.file_path,
    )

    return SingResponse(generation_id=gen.id, status="pending")


@router.get("/generations", response_model=VocalGenerationListResponse)
def list_generations(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = voice_service.list_user_vocal_generations(db, user.id)
    return VocalGenerationListResponse(
        items=[VocalGenerationResponse.model_validate(g) for g in items],
        total=len(items),
    )
