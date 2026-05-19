"""Celery tasks for RVC voice training and inference."""

import os
import sys
import json
import logging
import subprocess
from app.tasks.celery_app import celery_app
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Path to RVC codebase (git submodule)
_RVC_ROOT = os.path.join(os.path.dirname(__file__), "..", "services", "rvc")


def _rvc_preprocess(audio_path: str, output_dir: str):
    """Step 1: Slice, normalize, and trim silence from vocals."""
    os.makedirs(output_dir, exist_ok=True)
    script = os.path.join(_RVC_ROOT, "infer", "modules", "train", "preprocess.py")
    cmd = [
        sys.executable, script,
        os.path.dirname(audio_path),  # input root
        "40000",                       # sample rate
        "1",                           # n_p (processes)
        output_dir,                    # exp_dir
        "False",                       # noparallel
        "3.7",                        # per (segment length)
    ]
    logger.info(f"RVC preprocess: {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=_RVC_ROOT)
    logger.info(f"RVC preprocess complete: {output_dir}")


def _rvc_extract_features(dataset_dir: str, output_dir: str):
    """Step 2: Extract HuBERT content features."""
    os.makedirs(output_dir, exist_ok=True)
    script = os.path.join(_RVC_ROOT, "infer", "modules", "train", "extract_feature_print.py")
    # RVC feature extraction expects: device n_part i_part exp_dir version is_half
    cmd = [
        sys.executable, script,
        "cuda",          # device
        "1",             # n_part
        "0",             # i_part
        "0",             # i_gpu
        dataset_dir,     # exp_dir
        "v2",            # version
        "True",          # is_half
    ]
    logger.info(f"RVC feature extraction: {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=_RVC_ROOT)
    logger.info(f"RVC feature extraction complete: {output_dir}")


def _rvc_train(output_dir: str, total_epochs: int, model_id: int):
    """Step 3: Train VITS voice model. Saves checkpoints to output_dir."""
    os.makedirs(output_dir, exist_ok=True)
    # RVC training uses a config file — write one from template
    config_path = os.path.join(output_dir, "config.json")
    _write_train_config(config_path, output_dir, total_epochs)

    script = os.path.join(_RVC_ROOT, "infer", "modules", "train", "train.py")
    cmd = [
        sys.executable, script,
        "--config", config_path,
        "--exp_dir", output_dir,
    ]
    logger.info(f"RVC train: {' '.join(cmd)}")
    # Stream stdout to track epoch progress
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=_RVC_ROOT,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        logger.info(f"[RVC train] {line}")
        # Parse epoch progress from RVC output: "epoch X/Y" or similar
        if "epoch" in line.lower():
            try:
                parts = line.lower().split("epoch")
                if len(parts) > 1:
                    nums = parts[1].strip().split("/")
                    epoch = int(nums[0].split()[-1])
                    _report_training_progress(model_id, epoch)
            except (ValueError, IndexError):
                pass
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"RVC training failed with exit code {proc.returncode}")
    logger.info(f"RVC training complete: {total_epochs} epochs -> {output_dir}")


def _rvc_infer(model_path: str, config_path: str, reference_audio: str, output_path: str):
    """Step 4: Voice conversion inference — replace timbre, keep melody/style."""
    try:
        _rvc_infer_direct(model_path, config_path, reference_audio, output_path)
    except Exception as e:
        logger.warning(f"Direct RVC inference failed ({e}), falling back to subprocess")
        _rvc_infer_subprocess(model_path, config_path, reference_audio, output_path)


def _rvc_infer_direct(model_path: str, config_path: str, reference_audio: str, output_path: str):
    """Use RVC's VC class directly for inference."""
    sys.path.insert(0, _RVC_ROOT)

    from infer.lib.audio import load_audio
    from infer.modules.vc.modules import VC
    import soundfile as sf
    import torch
    import numpy as np

    class SimpleConfig:
        def __init__(self):
            self.x_pad = 3
            self.x_query = 10
            self.x_center = 60
            self.x_max = 100
            self.is_half = torch.cuda.is_available()
            self.sr = 40000
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            self.n_cpu = min(os.cpu_count() or 4, 8)

    rvc_config = SimpleConfig()
    vc = VC(rvc_config)

    # Load the trained model
    cpt = torch.load(model_path, map_location="cpu")
    vc.get_vc(str(cpt.get("sid", 0)))
    tgt_sr = cpt.get("sr", 40000)

    # Load and process reference audio
    audio = load_audio(reference_audio, 16000)
    audio_opt = vc.pipeline.pipeline(
        vc.hubert_model,
        vc.net_g,
        0,  # sid
        audio,
        reference_audio,
        tgt_sr,
        rvc_config,
        vc.version,
        0,   # f0_up_key
        "rmvpe",  # f0_method
        None,  # file_index
        None,  # file_big_npy
        0,    # index_rate
        0.33, # filter_radius
        0,    # resample_sr
        0.5,  # protect
    )
    sf.write(output_path, audio_opt, tgt_sr)
    logger.info(f"RVC inference complete: {output_path}")


def _rvc_infer_subprocess(model_path: str, config_path: str, reference_audio: str, output_path: str):
    """Fallback: call RVC's CLI inference script."""
    script = os.path.join(_RVC_ROOT, "tools", "infer", "infer.py")
    cmd = [
        sys.executable, script,
        "--model", model_path,
        "--input", reference_audio,
        "--output", output_path,
    ]
    subprocess.run(cmd, check=True, cwd=_RVC_ROOT)


def _write_train_config(config_path: str, exp_dir: str, total_epochs: int):
    """Write RVC training config JSON."""
    config = {
        "train": {
            "log_interval": 10,
            "eval_interval": 100,
            "seed": 1234,
            "epochs": total_epochs,
            "learning_rate": 0.0001,
            "betas": [0.8, 0.99],
            "eps": 1e-09,
            "batch_size": 8,
            "fp16_run": True,
            "lr_decay": 0.999875,
            "segment_size": 12800,
            "c_mel": 80,
            "c_vec": 256,
        },
        "data": {
            "training_files": os.path.join(exp_dir, "filelist.txt"),
            "validation_files": os.path.join(exp_dir, "val_filelist.txt"),
            "max_wav_value": 32768.0,
            "sampling_rate": 40000,
            "filter_length": 2048,
            "hop_length": 400,
            "win_length": 2048,
            "n_mel_channels": 80,
            "mel_fmin": 0.0,
            "mel_fmax": 8000.0,
        },
        "model": {
            "inter_channels": 192,
            "hidden_channels": 192,
            "filter_channels": 768,
            "n_heads": 2,
            "n_layers": 6,
            "kernel_size": 3,
            "p_dropout": 0.1,
            "resblock": "1",
            "resblock_kernel_sizes": [3, 7, 11],
            "resblock_dilation_sizes": [[1, 3, 5], [1, 3, 5], [1, 3, 5]],
            "upsample_rates": [8, 8, 2, 2],
            "upsample_initial_channel": 512,
            "upsample_kernel_sizes": [16, 16, 4, 4],
            "n_layers_q": 3,
            "use_spectral_norm": False,
        },
        "version": "v2",
    }
    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
    logger.info(f"Wrote RVC training config: {config_path}")


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


# === Celery Tasks ===

@celery_app.task(bind=True, name="train_voice_model")
def train_voice_model(self, model_id: int, audio_path: str, quality_target: str = "premium"):
    """Full voice training pipeline: separate vocals -> preprocess -> train RVC."""
    from app.core.database import SessionLocal
    from app.models.voice_model import VoiceModel
    from app.tasks.audio_pipeline import _separate_vocals

    epoch_map = {"preview": 20, "standard": 100, "premium": 200}
    total_epochs = epoch_map.get(quality_target, 200)

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

            # Step 1: Vocal separation (uses existing Demucs provider)
            vocal_path = _separate_vocals(audio_path, task_id=task_id)
            model.duration_seconds = _get_audio_duration(vocal_path)
            db.commit()

            # Step 2: RVC preprocessing (slicing + normalization)
            dataset_dir = os.path.join(output_dir, "dataset")
            _rvc_preprocess(vocal_path, dataset_dir)

            # Step 3: HuBERT feature extraction
            model.status = "preprocessing"
            db.commit()
            _rvc_extract_features(dataset_dir, output_dir)

            # Step 4: Train (single run — RVC saves checkpoints internally)
            model.status = "training"
            model.epoch = 0
            db.commit()

            checkpoint_dir = os.path.join(output_dir, "checkpoints")
            _rvc_train(output_dir, total_epochs, model_id)

            model.status = "ready"
            model.epoch = total_epochs
            model.quality_tier = quality_target
            model.checkpoint_path = os.path.join(checkpoint_dir, "G_latest.pth")
            model.config_path = os.path.join(output_dir, "config.json")
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
            gen.duration_seconds = _get_audio_duration(output_path)
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


def _get_audio_duration(filepath: str) -> float:
    """Return audio duration in seconds."""
    try:
        import soundfile as sf
        info = sf.info(filepath)
        return info.duration
    except Exception:
        return 0.0
