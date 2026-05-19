"""Celery async tasks for the AI music pipeline using Model Providers."""

import os
import json
import logging
from app.tasks.celery_app import celery_app
from app.core.config import get_settings
from app.models.providers.registry import get_provider
from app.models.providers.gpu_manager import gpu_manager

logger = logging.getLogger(__name__)
settings = get_settings()


def _report_progress(task_id: str, stage: str, progress: int, message: str):
    """Update Celery task progress via backend."""
    if not task_id:
        return
    celery_app.backend.store_result(
        task_id,
        {"stage": stage, "progress": progress, "message": message},
        "PROGRESS",
    )


def _separate_vocals(audio_path: str, task_id: str = "", model: str = "demucs_htdemucs") -> str:
    """Vocal separation via provider."""
    logger.info(f"Vocal separation: model={model}")
    _report_progress(task_id, "separating", 10, f"正在加载 {model} 模型...")

    provider = get_provider(model)
    gpu_manager.acquire(provider)

    _report_progress(task_id, "separating", 40, "正在分离人声与伴奏...")
    result = provider.separate(audio_path)

    _report_progress(task_id, "separating", 100, "人声分离完成")
    return result


def _extract_style_embedding(instrumental_path: str, task_id: str = "", model: str = "clap_laion") -> list[float]:
    """Style embedding extraction via provider."""
    logger.info(f"Style extraction: model={model}")
    _report_progress(task_id, "extracting", 10, f"正在加载 {model} 模型...")

    provider = get_provider(model)
    gpu_manager.acquire(provider)

    _report_progress(task_id, "extracting", 50, "正在提取风格向量...")
    embedding = provider.extract(instrumental_path)

    _report_progress(task_id, "extracting", 100, "风格向量提取完成")
    return embedding


def _generate_music(style_embedding: list[float], text_prompt: str, task_id: str = "", model: str = "musicgen_small") -> dict:
    """Music generation via provider."""
    logger.info(f"Music generation: model={model}")
    _report_progress(task_id, "generating", 10, f"正在加载 {model} 模型...")

    provider = get_provider(model)
    gpu_manager.acquire(provider)

    _report_progress(task_id, "generating", 40, "正在生成音乐...")
    result = provider.generate(style_embedding, text_prompt)

    _report_progress(task_id, "completed", 100, "音乐生成完成")
    return result


# === Celery Task: Full Audio Upload Pipeline ===

@celery_app.task(bind=True, name="process_audio_upload")
def process_audio_upload(
    self, audio_path: str, asset_id: int, user_id: int,
    vocal_sep_model: str = "demucs_htdemucs",
    style_extract_model: str = "clap_laion",
):
    """Full pipeline: separate -> extract -> save to DB. Sequential GPU loading."""
    from app.core.database import SessionLocal
    from app.models.audio_asset import AudioAsset
    from app.models.style_vector import StyleVector

    task_id = self.request.id
    logger.info(f"process_audio_upload: task={task_id} vocal_sep={vocal_sep_model} style_ext={style_extract_model}")

    try:
        instrumental_path = _separate_vocals(audio_path, task_id, model=vocal_sep_model)
        embedding = _extract_style_embedding(instrumental_path, task_id, model=style_extract_model)

        db = SessionLocal()
        try:
            asset = db.query(AudioAsset).filter(AudioAsset.id == asset_id).first()
            if asset:
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

                self.update_state(state="SUCCESS", meta={
                    "stage": "completed", "progress": 100, "message": "处理完成",
                    "style_vector": {"id": style_vector.id, "style_name": style_vector.style_name, "asset_id": asset_id, "style_extract_model": style_extract_model},
                    "vocal_sep_model": vocal_sep_model, "style_extract_model": style_extract_model,
                })
                return {"stage": "completed", "asset_id": asset_id, "style_vector_id": style_vector.id}
            return {"stage": "failed", "reason": "asset not found"}
        finally:
            db.close()
    except Exception as e:
        db = SessionLocal()
        try:
            asset = db.query(AudioAsset).filter(AudioAsset.id == asset_id).first()
            if asset:
                asset.status = "failed"
                db.commit()
        finally:
            db.close()
        self.update_state(state="FAILURE", meta={"stage": "failed", "message": str(e)})
        raise
    finally:
        gpu_manager.release_all()


# === Celery Task: Full Music Generation ===

@celery_app.task(bind=True, name="process_music_generation")
def process_music_generation(
    self, embedding_json: str, text_prompt: str,
    vector_id: int, user_id: int,
    music_gen_model: str = "musicgen_small",
):
    """Load MusicGen, generate, save to DB."""
    from app.core.database import SessionLocal
    from app.models.generated_music import GeneratedMusic

    task_id = self.request.id
    embedding = json.loads(embedding_json)
    logger.info(f"process_music_generation: task={task_id} model={music_gen_model}")

    try:
        result = _generate_music(embedding, text_prompt, task_id, model=music_gen_model)

        db = SessionLocal()
        try:
            music = GeneratedMusic(
                user_id=user_id, vector_id=vector_id,
                prompt=text_prompt, title=text_prompt[:30],
                file_path=result["file_path"],
                duration_seconds=result["duration_seconds"],
                music_gen_model=music_gen_model,
            )
            db.add(music)
            db.commit()
            db.refresh(music)

            self.update_state(state="SUCCESS", meta={
                "stage": "completed", "progress": 100, "message": "音乐生成完成",
                "music_id": music.id, "file_path": music.file_path,
                "title": music.title, "duration_seconds": music.duration_seconds,
                "music_gen_model": music_gen_model,
            })
            return {
                "stage": "completed", "music_id": music.id,
                "file_path": music.file_path, "title": music.title,
                "duration_seconds": music.duration_seconds,
                "music_gen_model": music_gen_model,
            }
        finally:
            db.close()
    except Exception as e:
        self.update_state(state="FAILURE", meta={"stage": "failed", "message": str(e)})
        raise
    finally:
        gpu_manager.release_all()


# === Celery Task: Style Blending Generation ===

def _blend_embeddings(embeddings: list[tuple[str, float]]) -> list[float]:
    """Weighted blend of multiple embedding vectors with normalization."""
    embeds = [(json.loads(e), w) for e, w in embeddings]
    dim = len(embeds[0][0])

    # Normalize each embedding to unit length
    import math as _math
    normalized = []
    for emb, _ in embeds:
        norm = _math.sqrt(sum(x * x for x in emb))
        normalized.append([x / max(norm, 1e-8) for x in emb] if norm > 1e-8 else emb)

    # Apply weights and sum
    total_weight = sum(w for _, w in embeds)
    blended = [0.0] * dim
    for i, (_, w) in enumerate(embeds):
        weight = w / max(total_weight, 1e-8)
        for j in range(dim):
            blended[j] += normalized[i][j] * weight

    # Re-normalize blended result
    blended_norm = _math.sqrt(sum(x * x for x in blended))
    if blended_norm > 1e-8:
        blended = [x / blended_norm for x in blended]

    return blended


@celery_app.task(bind=True, name="process_blend_generation")
def process_blend_generation(
    self, embeddings: list[tuple[str, float]], text_prompt: str,
    user_id: int, music_gen_model: str = "musicgen_small",
):
    """Blend multiple style vectors and generate music."""
    from app.core.database import SessionLocal
    from app.models.generated_music import GeneratedMusic

    task_id = self.request.id
    logger.info(f"process_blend_generation: task={task_id} num_sources={len(embeddings)} model={music_gen_model}")

    try:
        blended_embedding = _blend_embeddings(embeddings)

        result = _generate_music(blended_embedding, text_prompt, task_id, model=music_gen_model)

        db = SessionLocal()
        try:
            music = GeneratedMusic(
                user_id=user_id, vector_id=None,
                prompt=text_prompt, title=f"[混合] {text_prompt[:25]}",
                file_path=result["file_path"],
                duration_seconds=result["duration_seconds"],
                music_gen_model=music_gen_model,
            )
            db.add(music)
            db.commit()
            db.refresh(music)

            self.update_state(state="SUCCESS", meta={
                "stage": "completed", "progress": 100, "message": "混合音乐生成完成",
                "music_id": music.id, "file_path": music.file_path,
                "title": music.title, "duration_seconds": music.duration_seconds,
                "music_gen_model": music_gen_model,
            })
            return {
                "stage": "completed", "music_id": music.id,
                "file_path": music.file_path, "title": music.title,
                "duration_seconds": music.duration_seconds,
                "music_gen_model": music_gen_model,
            }
        finally:
            db.close()
    except Exception as e:
        self.update_state(state="FAILURE", meta={"stage": "failed", "message": str(e)})
        raise
    finally:
        gpu_manager.release_all()


# === Celery Task: Batch Generation (single cell) ===

@celery_app.task(bind=True, name="process_batch_generation")
def process_batch_generation(
    self, embedding_json: str, text_prompt: str,
    user_id: int, music_gen_model: str = "musicgen_small",
    batch_id: str = "",
):
    """Single cell in a batch grid. Stores batch_id in result for polling."""
    from app.core.database import SessionLocal
    from app.models.generated_music import GeneratedMusic

    task_id = self.request.id
    embedding = json.loads(embedding_json)
    logger.info(f"process_batch_generation: batch={batch_id} task={task_id} model={music_gen_model}")

    try:
        result = _generate_music(embedding, text_prompt, task_id, model=music_gen_model)

        db = SessionLocal()
        try:
            music = GeneratedMusic(
                user_id=user_id, vector_id=None,
                prompt=text_prompt, title=text_prompt[:30],
                file_path=result["file_path"],
                duration_seconds=result["duration_seconds"],
                music_gen_model=music_gen_model,
            )
            db.add(music)
            db.commit()
            db.refresh(music)

            self.update_state(state="SUCCESS", meta={
                "stage": "completed", "progress": 100,
                "batch_id": batch_id, "prompt": text_prompt, "model": music_gen_model,
                "music_id": music.id, "file_path": music.file_path,
                "title": music.title, "duration_seconds": music.duration_seconds,
            })
            return {
                "stage": "completed", "music_id": music.id, "batch_id": batch_id,
                "file_path": music.file_path, "title": music.title,
                "duration_seconds": music.duration_seconds,
            }
        finally:
            db.close()
    except Exception as e:
        self.update_state(state="FAILURE", meta={
            "stage": "failed", "message": str(e), "batch_id": batch_id,
            "prompt": text_prompt, "model": music_gen_model,
        })
        raise
    finally:
        gpu_manager.release_all()
