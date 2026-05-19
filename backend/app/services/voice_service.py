from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.voice_model import VoiceModel
from app.models.vocal_generation import VocalGeneration


def create_voice_model(db: Session, user_id: int, name: str, source_audio_id: int, quality_target: str = "premium") -> VoiceModel:
    model = VoiceModel(
        user_id=user_id,
        name=name,
        source_audio_id=source_audio_id,
        status="pending",
        quality_tier=quality_target,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


def get_voice_model(db: Session, model_id: int, user_id: int) -> VoiceModel | None:
    return db.query(VoiceModel).filter(
        VoiceModel.id == model_id, VoiceModel.user_id == user_id
    ).first()


def list_user_voice_models(db: Session, user_id: int) -> list[VoiceModel]:
    return (
        db.query(VoiceModel)
        .filter(VoiceModel.user_id == user_id)
        .order_by(desc(VoiceModel.updated_at))
        .all()
    )


def update_voice_model_status(db: Session, model_id: int, user_id: int, **kwargs) -> VoiceModel | None:
    model = get_voice_model(db, model_id, user_id)
    if not model:
        return None
    for key, value in kwargs.items():
        if hasattr(model, key):
            setattr(model, key, value)
    db.commit()
    db.refresh(model)
    return model


def delete_voice_model(db: Session, model_id: int, user_id: int) -> bool:
    import os, shutil
    model = get_voice_model(db, model_id, user_id)
    if not model:
        return False
    if model.checkpoint_path and os.path.exists(model.checkpoint_path):
        checkpoint_dir = os.path.dirname(model.checkpoint_path)
        if os.path.exists(checkpoint_dir):
            shutil.rmtree(checkpoint_dir, ignore_errors=True)
    db.delete(model)
    db.commit()
    return True


def create_vocal_generation(db: Session, user_id: int, voice_model_id: int, reference_audio_id: int) -> VocalGeneration:
    gen = VocalGeneration(
        user_id=user_id,
        voice_model_id=voice_model_id,
        reference_audio_id=reference_audio_id,
        status="pending",
    )
    db.add(gen)
    db.commit()
    db.refresh(gen)
    return gen


def list_user_vocal_generations(db: Session, user_id: int) -> list[VocalGeneration]:
    return (
        db.query(VocalGeneration)
        .filter(VocalGeneration.user_id == user_id)
        .order_by(desc(VocalGeneration.created_at))
        .all()
    )
