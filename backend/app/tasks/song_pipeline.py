"""Celery task for full song creation: lyrics → instrumental → vocals → mix."""

import os
import json
import logging
import shutil
import ffmpeg
import httpx
from app.tasks.celery_app import celery_app
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

LYRICS_PROMPT = """你是一个专业的歌词创作助手。根据用户提供的主题，创作一首中文歌词。

要求：
- 包含主歌（Verse）×2、副歌（Chorus）×2、桥段（Bridge）×1
- 每段4-6行
- 押韵、有韵律感
- 用【主歌1】【主歌2】【副歌】【桥段】【副歌（重复）】标记段落

主题：{theme}

只返回歌词，不要额外解释。"""

FALLBACK_LYRICS = """【主歌1】
那一刻的风吹过你的脸庞
我站在街角看夕阳渐渐落下
不知道未来的路会通向何方
但此刻只想把这首歌唱给你听

【主歌2】
回忆像电影在脑海里回放
每一个画面都那么清晰又温暖
时间过得再快也带不走思念
就让我用音乐来诉说这份情感

【副歌】
这是我的歌 唱出心中的声音
每一个音符都是对你的心意
这是我们的歌 不管过了多少年
旋律响起的时候 我们依然在一起

【副歌（重复）】
这是我的歌 唱出心中的声音
每一个音符都是对你的心意
这是我们的歌 不管过了多少年
旋律响起的时候 我们依然在一起"""


def _generate_lyrics(theme: str) -> tuple[str, str]:
    """Generate lyrics via LLM. Tries OpenAI (DeepSeek) -> Ollama -> fallback.
    Returns (lyrics, provider_name).
    """
    # Tier 1: OpenAI-compatible (DeepSeek)
    if settings.OPENAI_API_KEY:
        try:
            url = f"{settings.OPENAI_BASE_URL}/v1/chat/completions"
            resp = httpx.post(url, json={
                "model": settings.OPENAI_MODEL,
                "messages": [
                    {"role": "system", "content": "你是一个专业的歌词创作助手，直接输出歌词，不要额外解释。"},
                    {"role": "user", "content": LYRICS_PROMPT.format(theme=theme)},
                ],
                "temperature": 0.9, "max_tokens": 800,
            }, headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}, timeout=60)
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices", [])
                if choices:
                    content = choices[0]["message"]["content"]
                    if content.strip():
                        logger.info("Lyrics generated via OpenAI/DeepSeek")
                        return content.strip(), "openai"
        except Exception as e:
            logger.warning(f"OpenAI lyrics failed: {e}")

    # Tier 2: Ollama
    try:
        url = f"{settings.OLLAMA_HOST}/api/generate"
        resp = httpx.post(url, json={
            "model": settings.OLLAMA_MODEL,
            "prompt": LYRICS_PROMPT.format(theme=theme),
            "stream": False,
        }, timeout=60)
        if resp.status_code == 200:
            content = resp.json().get("response", "")
            if content.strip():
                logger.info("Lyrics generated via Ollama")
                return content.strip(), "ollama"
    except Exception as e:
        logger.warning(f"Ollama lyrics failed: {e}")

    # Tier 3: Fallback with theme interpolation
    logger.info("Using fallback lyrics")
    fallback = _build_fallback_lyrics(theme)
    return fallback, "fallback"


def _build_fallback_lyrics(theme: str) -> str:
    """Build fallback lyrics that at least interpolate the theme keyword."""
    return f"""【主歌1】
    {theme}的风吹过你的脸庞
    我站在街角看夕阳渐渐落下
    不知道未来的路会通向何方
    但此刻只想把这首歌唱给你听

    【主歌2】
    回忆像电影在脑海里回放
    每一个画面都那么清晰又温暖
    关于{theme}的故事还在继续
    就让我用音乐来诉说这份情感

    【副歌】
    这是我的歌 唱出心中的声音
    每一个音符都是对{theme}的心意
    这是我们的歌 不管过了多少年
    旋律响起的时候 我们依然在一起

    【副歌（重复）】
    这是我的歌 唱出心中的声音
    每一个音符都是对{theme}的心意
    这是我们的歌 不管过了多少年
    旋律响起的时候 我们依然在一起"""


def _mix_audio(instrumental_path: str, vocal_path: str, output_path: str):
    """Mix instrumental and vocal into a single audio file."""
    instrumental = ffmpeg.input(instrumental_path)
    vocal = ffmpeg.input(vocal_path)
    mixed = ffmpeg.filter([instrumental, vocal], 'amix', inputs=2, duration='longest', weights='0.4 0.6')
    ffmpeg.output(mixed, output_path).run(overwrite_output=True, quiet=True)
    logger.info(f"Mixed audio: {output_path}")


def _get_audio_duration(filepath: str) -> float:
    try:
        import soundfile as sf
        return sf.info(filepath).duration
    except Exception:
        return 0.0


def _update_job(db, job_id: int, status: str, *, stage: str | None = None, progress: int | None = None, error_message: str | None = None, result: dict | None = None):
    """Helper to update job status from within a Celery task."""
    try:
        from app.services.job_service import update_job_status
        from app.models.job import Job
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            update_job_status(db, job, status, stage=stage, progress=progress, error_message=error_message, result=result)
    except Exception as e:
        logging.getLogger(__name__).warning(f"Failed to update job {job_id}: {e}")


@celery_app.task(bind=True, name="create_song")
def create_song(self, job_id: int):
    """Full song creation pipeline, driven by a persistent Job.

    Reads song_id, theme, voice_model_id, etc. from job.payload_json.
    """
    from app.core.database import SessionLocal
    from app.models.job import Job
    import json as _json

    celery_task_id = self.request.id
    logger.info(f"create_song: job_id={job_id} celery_task_id={celery_task_id}")

    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return {"stage": "failed", "reason": "job not found"}
        job.celery_task_id = celery_task_id
        _update_job(db, job_id, "running", stage="starting")
        payload = _json.loads(job.payload_json) if job.payload_json else {}
        song_id = payload["song_id"]
        theme = payload["theme"]
        voice_model_id = payload.get("voice_model_id")
        style_vector_id = payload.get("style_vector_id")
        reference_audio_path = payload.get("reference_audio_path")
    finally:
        db.close()

    try:
        result = run_song_pipeline_sync(
            song_id=song_id,
            theme=theme,
            voice_model_id=voice_model_id,
            style_vector_id=style_vector_id,
            reference_audio_path=reference_audio_path,
            task_id=celery_task_id,
        )
        db2 = SessionLocal()
        try:
            _update_job(db2, job_id, "completed", stage="completed", progress=100, result=result)
        finally:
            db2.close()
        return result
    except Exception as e:
        logger.error(f"Song creation job {job_id} failed: {e}", exc_info=True)
        db2 = SessionLocal()
        try:
            _update_job(db2, job_id, "failed", stage="creation", error_message=str(e))
        finally:
            db2.close()
        raise


def run_song_pipeline_sync(
    song_id: int,
    theme: str,
    voice_model_id: int | None = None,
    style_vector_id: int | None = None,
    reference_audio_path: str | None = None,
    task_id: str = "",
    job_id: int | None = None,
):
    """Run the full song creation pipeline in-process for Redis-free installs."""
    from app.core.database import SessionLocal
    from app.models.song import Song
    from app.models.voice_model import VoiceModel
    from app.models.audio_asset import AudioAsset
    from app.models.style_vector import StyleVector
    from app.tasks.audio_pipeline import _generate_music
    from app.tasks.voice_pipeline import _rvc_infer
    from app.models.providers.resource_manager import resource_manager
    from app.models.providers.local_musicgen import MUSICGEN_AVAILABLE, AUDIOLDM_AVAILABLE
    from app.models.providers.svs_provider import get_svs_provider, SVSResult

    logger.info(f"create_song: song_id={song_id} theme={theme} voice_model={voice_model_id}")

    def _update_j(st: str, *, stage: str | None = None, progress: int | None = None, error: str | None = None):
        if job_id is None:
            return
        try:
            jdb = SessionLocal()
            try:
                from app.models.job import Job
                job = jdb.query(Job).filter(Job.id == job_id).first()
                if job:
                    update_job_status(jdb, job, st, stage=stage, progress=progress, error_message=error)
            finally:
                jdb.close()
        except Exception as e:
            logger.warning(f"Failed to update job {job_id}: {e}")

    output_dir = os.path.join(settings.GENERATED_DIR, "songs", str(song_id))
    os.makedirs(output_dir, exist_ok=True)

    db = None
    try:
        db = SessionLocal()
        try:
            song = db.query(Song).filter(Song.id == song_id).first()
            if not song:
                return {"stage": "failed", "reason": "song not found"}

            _update_j("running", stage="writing", progress=5)

            # Step 1: Generate lyrics
            song.status = "writing"
            db.commit()
            lyrics, lyrics_provider = _generate_lyrics(theme)
            song.lyrics = lyrics
            song.lyrics_provider = lyrics_provider
            db.commit()

            # Step 2: Generate instrumental (MusicGen)
            song.status = "arranging"
            db.commit()
            music_prompt = f"一首关于{theme}的流行歌曲伴奏，情绪饱满，旋律优美"
            embedding = []
            if style_vector_id:
                sv = db.query(StyleVector).filter(StyleVector.id == style_vector_id).first()
                if sv:
                    embedding = json.loads(sv.embedding)

            # Resolve reference audio path from style vector's source asset
            ref_audio_path = reference_audio_path
            if not ref_audio_path and style_vector_id:
                sv_with_asset = db.query(StyleVector, AudioAsset)\
                    .join(AudioAsset, AudioAsset.id == StyleVector.asset_id)\
                    .filter(StyleVector.id == style_vector_id).first()
                if sv_with_asset:
                    ref_audio_path = sv_with_asset[1].file_path  # AudioAsset.file_path

            instrumental_path = os.path.join(output_dir, "instrumental.wav")
            instrumental_result = None
            if embedding:
                instrumental_result = _generate_music(embedding, music_prompt, task_id=task_id, reference_audio_path=ref_audio_path)
            else:
                instrumental_result = _generate_music([0.0] * 512, music_prompt, task_id=task_id, reference_audio_path=ref_audio_path)

            if instrumental_result and os.path.exists(instrumental_result.get("file_path", "")):
                shutil.copy(instrumental_result["file_path"], instrumental_path)

            song.instrumental_path = instrumental_path
            song.instrumental_provider = instrumental_result.get("provider_mode", "mock") if instrumental_result else "mock"
            db.commit()
            resource_manager.release_all()

            _update_j("running", stage="arranging", progress=30)

            # Step 3: SVS — lyrics to raw sung vocals
            song.status = "singing"
            db.commit()
            raw_vocal_path = os.path.join(output_dir, "raw_vocals.wav")

            svs_provider = get_svs_provider()
            song.svs_provider = svs_provider.name
            try:
                svs_result = svs_provider.synthesize(
                    lyrics=lyrics,
                    output_path=raw_vocal_path,
                    melody_audio_path=instrumental_path,
                    voice_reference_path=reference_audio_path,
                )
                song.raw_vocal_path = svs_result.file_path
                logger.info(f"SVS vocals generated: provider={svs_result.provider_name} duration={svs_result.duration_seconds:.1f}s")
            except Exception as e:
                logger.error(f"SVS synthesis failed: {e}")
                song.status = "failed"
                song.error_message = f"人声合成失败 (SVS/{svs_provider.name}): {e}"
                song.has_vocals = False
                db.commit()
                _update_j("failed", stage="svs", error=str(e))
                return {
                    "stage": "failed",
                    "reason": f"SVS synthesis failed: {e}",
                    "song_id": song_id,
                }

            # Step 3.5: RVC voice conversion (optional — only if user has a trained voice model)
            final_vocal_path = raw_vocal_path
            vocal_provider_name = svs_provider.name

            if voice_model_id:
                model = db.query(VoiceModel).filter(VoiceModel.id == voice_model_id).first()
                if model and model.status == "ready" and model.checkpoint_path:
                    converted_path = os.path.join(output_dir, "converted_vocals.wav")
                    try:
                        _rvc_infer(
                            model_path=model.checkpoint_path,
                            config_path=model.config_path,
                            reference_audio=raw_vocal_path,
                            output_path=converted_path,
                        )
                        song.converted_vocal_path = converted_path
                        final_vocal_path = converted_path
                        vocal_provider_name = f"svs({svs_provider.name})+rvc"
                        logger.info(f"RVC voice conversion applied: {converted_path}")
                    except Exception as e:
                        logger.warning(f"RVC inference failed, using raw SVS vocals: {e}")
                        song.error_message = f"RVC音色转换失败(保留SVS原声): {e}"
                        # Fall through — use raw SVS vocals
                else:
                    logger.info(f"Voice model not ready, using raw SVS vocals")
            else:
                logger.info(f"No voice model selected, using raw SVS vocals")

            song.vocal_path = final_vocal_path
            song.vocal_provider = vocal_provider_name
            song.has_vocals = True
            db.commit()

            # Step 4: Mix instrumental + final vocals
            song.status = "mixing"
            db.commit()
            _update_j("running", stage="mixing", progress=70)
            mixed_path = os.path.join(output_dir, "mixed.wav")
            _mix_audio(instrumental_path, final_vocal_path, mixed_path)
            song.mixed_path = mixed_path
            song.status = "completed"
            db.commit()
            _update_j("completed", stage="completed", progress=100)

            return {
                "stage": "completed",
                "song_id": song_id,
                "mixed_path": mixed_path,
                "lyrics_provider": lyrics_provider,
                "instrumental_provider": song.instrumental_provider,
                "svs_provider": song.svs_provider,
                "vocal_provider": song.vocal_provider,
                "has_vocals": True,
            }
        finally:
            db.close()
            db = None  # Prevent double-close in outer finally
    except Exception as e:
        logger.error(f"Song creation failed: {e}", exc_info=True)
        # Use a fresh session to mark the song failed — the original session
        # is already closed (or never opened) and may be in an invalid state.
        try:
            fail_db = SessionLocal()
            try:
                song = fail_db.query(Song).filter(Song.id == song_id).first()
                if song:
                    song.status = "failed"
                    song.error_message = str(e)[:500]
                    fail_db.commit()
            finally:
                fail_db.close()
        except Exception as db_err:
            logger.error(f"Failed to update song status after pipeline error: {db_err}")
        _update_j("failed", stage="pipeline", error=str(e))
        raise
    finally:
        if db is not None:
            db.close()
