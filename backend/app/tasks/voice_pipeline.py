"""Celery tasks for RVC voice training and inference."""

import os
import logging
from app.tasks.celery_app import celery_app
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@celery_app.task(bind=True, name="train_voice_model")
def train_voice_model(self, model_id: int, audio_path: str, quality_target: str = "premium"):
    """Full voice training pipeline: separate vocals -> preprocess -> train RVC."""
    from app.core.database import SessionLocal
    from app.models.voice_model import VoiceModel
    from app.models.audio_asset import AudioAsset
    from app.tasks.audio_pipeline import _separate_vocals

    epoch_map = {"preview": 20, "standard": 100, "premium": 200}
    total_epochs = epoch_map.get(quality_target, 200)
    quality_tiers = []
    if total_epochs >= 20:
        quality_tiers.append(("preview", 20))
    if total_epochs >= 100:
        quality_tiers.append(("standard", 100))
    if total_epochs >= 200:
        quality_tiers.append(("premium", 200))

    task_id = self.request.id
    logger.info(f"train_voice_model: model_id={model_id} quality_target={quality_target} total_epochs={total_epochs}")

    output_dir = os.path.join(settings.GENERATED_DIR, "voice_models", str(model_id))
    os.makedirs(output_dir, exist_ok=True)

    try:
        db = SessionLocal()
        try:
            model = db.query(VoiceModel).filter(VoiceModel.id == model_id).first()
            if not model:
                return {"stage": "failed", "reason": "voice model not found"}
            model.status = "preprocessing"
            db.commit()

            # Step 1: Vocal separation
            vocal_path = _separate_vocals(audio_path, task_id=task_id)

            # Step 2: RVC preprocessing
            model.status = "preprocessing"
            db.commit()
            preprocessed_dir = os.path.join(output_dir, "dataset")
            _rvc_preprocess(vocal_path, preprocessed_dir)

            # Step 3: HuBERT feature extraction
            hubert_dir = os.path.join(output_dir, "hubert")
            _rvc_extract_features(preprocessed_dir, hubert_dir)

            # Step 4: Progressive training
            model.status = "training"
            model.epoch = 0
            db.commit()

            for tier_name, tier_epochs in quality_tiers:
                checkpoint_dir = os.path.join(output_dir, f"checkpoint_{tier_name}")
                _rvc_train(
                    hubert_dir=hubert_dir,
                    output_dir=checkpoint_dir,
                    total_epochs=tier_epochs,
                    start_epoch=model.epoch,
                    on_progress=lambda ep: _report_training_progress(model_id, ep),
                )
                model.epoch = tier_epochs
                model.quality_tier = tier_name
                model.checkpoint_path = os.path.join(checkpoint_dir, "model.pth")
                model.config_path = os.path.join(checkpoint_dir, "config.json")
                db.commit()

            model.status = "ready"
            db.commit()

            return {
                "stage": "completed",
                "model_id": model_id,
                "quality_tier": quality_target,
                "epoch": total_epochs,
            }
        finally:
            db.close()
    except Exception as e:
        db = SessionLocal()
        try:
            model = db.query(VoiceModel).filter(VoiceModel.id == model_id).first()
            if model:
                model.status = "failed"
                db.commit()
        finally:
            db.close()
        logger.error(f"Voice training failed: {e}")
        raise


@celery_app.task(bind=True, name="infer_rvc_vocals")
def infer_rvc_vocals(self, generation_id: int, voice_model_id: int, reference_audio_path: str):
    """Convert reference vocals to target voice using trained RVC model."""
    from app.core.database import SessionLocal
    from app.models.voice_model import VoiceModel
    from app.models.vocal_generation import VocalGeneration

    task_id = self.request.id
    logger.info(f"infer_rvc_vocals: generation_id={generation_id} model_id={voice_model_id}")

    output_dir = os.path.join(settings.GENERATED_DIR, "vocals")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"vocal_{generation_id}.wav")

    try:
        db = SessionLocal()
        try:
            model = db.query(VoiceModel).filter(VoiceModel.id == voice_model_id).first()
            if not model or model.status != "ready":
                raise ValueError("Voice model not ready")

            gen = db.query(VocalGeneration).filter(VocalGeneration.id == generation_id).first()
            gen.status = "processing"
            db.commit()

            _rvc_infer(
                model_path=model.checkpoint_path,
                config_path=model.config_path,
                reference_audio=reference_audio_path,
                output_path=output_path,
            )

            gen.status = "completed"
            gen.output_path = output_path
            db.commit()

            return {"stage": "completed", "generation_id": generation_id, "output_path": output_path}
        finally:
            db.close()
    except Exception as e:
        db = SessionLocal()
        try:
            gen = db.query(VocalGeneration).filter(VocalGeneration.id == generation_id).first()
            if gen:
                gen.status = "failed"
                db.commit()
        finally:
            db.close()
        logger.error(f"Voice inference failed: {e}")
        raise


# === Placeholder RVC functions (replace with real RVC imports after submodule setup) ===

def _rvc_preprocess(audio_path: str, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    import shutil
    dst = os.path.join(output_dir, os.path.basename(audio_path))
    shutil.copy(audio_path, dst)
    logger.info(f"RVC preprocess: {audio_path} -> {output_dir}")


def _rvc_extract_features(dataset_dir: str, hubert_dir: str):
    os.makedirs(hubert_dir, exist_ok=True)
    logger.info(f"RVC feature extraction: {dataset_dir} -> {hubert_dir}")


def _rvc_train(hubert_dir: str, output_dir: str, total_epochs: int, start_epoch: int, on_progress):
    os.makedirs(output_dir, exist_ok=True)
    import time
    for ep in range(start_epoch + 1, total_epochs + 1):
        time.sleep(0.01)
        on_progress(ep)
    logger.info(f"RVC training complete: {total_epochs} epochs -> {output_dir}")


def _rvc_infer(model_path: str, config_path: str, reference_audio: str, output_path: str):
    import shutil
    shutil.copy(reference_audio, output_path)
    logger.info(f"RVC inference: {reference_audio} -> {output_path}")


def _report_training_progress(model_id: int, current_epoch: int):
    from app.core.database import SessionLocal
    from app.models.voice_model import VoiceModel

    db = SessionLocal()
    try:
        model = db.query(VoiceModel).filter(VoiceModel.id == model_id).first()
        if model:
            model.epoch = current_epoch
            db.commit()
    finally:
        db.close()
