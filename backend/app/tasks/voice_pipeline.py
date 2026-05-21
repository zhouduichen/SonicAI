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

# Check RVC dependencies at module load time
_RVC_DEPS_OK = True
_RVC_DEPS_REPORT: list[str] = []

# fairseq is NOT required — we use HuggingFace transformers as replacement
try:
    import transformers
except ImportError:
    _RVC_DEPS_OK = False
    _RVC_DEPS_REPORT.append("transformers 未安装 — pip install transformers")

_HUBERT_CKPT = os.path.join(_RVC_ROOT, "assets", "hubert", "hubert_base.pt")
_HUBERT_HF_AVAILABLE = False
try:
    from huggingface_hub import hf_hub_download
    _HUBERT_HF_AVAILABLE = True
except ImportError:
    pass

if not os.path.exists(_HUBERT_CKPT) and not _HUBERT_HF_AVAILABLE:
    _RVC_DEPS_OK = False
    _RVC_DEPS_REPORT.append("HuBERT 模型不可用，且无法从 HuggingFace 下载")

if _RVC_DEPS_REPORT:
    logger.warning(f"RVC voice training issues ({len(_RVC_DEPS_REPORT)}):")
    for msg in _RVC_DEPS_REPORT:
        logger.warning(f"  - {msg}")


def _rvc_preprocess(input_dir: str, output_dir: str):
    """Step 1: Slice, normalize, and trim silence from vocals.

    RVC preprocess.py expects: inp_root sr n_p exp_dir noparallel per
    inp_root is a directory of 40kHz WAV files (our separated vocals).
    Uses absolute paths because the RVC script runs with cwd=_RVC_ROOT.
    """
    input_dir = os.path.abspath(input_dir)
    output_dir = os.path.abspath(output_dir)
    os.makedirs(output_dir, exist_ok=True)

    if not os.path.isdir(input_dir):
        raise RuntimeError(f"Input directory not found: {input_dir}")

    wav_count = len([f for f in os.listdir(input_dir) if f.endswith(".wav")])
    if wav_count == 0:
        raise RuntimeError(f"No WAV files found in {input_dir} — vocal separation may have failed")

    script = os.path.join(_RVC_ROOT, "infer", "modules", "train", "preprocess.py")
    cmd = [
        sys.executable, script,
        input_dir,
        "40000",
        "1",
        output_dir,
        "False",
        "3.7",
    ]
    logger.info(f"RVC preprocess ({wav_count} files): {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=_RVC_ROOT)
    logger.info(f"RVC preprocess complete: {output_dir}")


def _rvc_extract_features(dataset_dir: str, output_dir: str):
    """Step 2: Extract HuBERT content features using HuggingFace transformers.

    Replaces the original fairseq-based extract_feature_print.py.
    Downloads TencentGameMate/chinese-hubert-base from HuggingFace on first run.
    """
    import numpy as np
    import torch
    import soundfile as sf
    from transformers import HubertModel

    dataset_dir = os.path.abspath(dataset_dir)
    output_dir = os.path.abspath(output_dir)
    os.makedirs(output_dir, exist_ok=True)
    wav_dir = os.path.join(dataset_dir, "1_16k_wavs")
    out_dir = os.path.join(output_dir, "3_feature768")  # RVC v2: 768-dim layer-12 features
    os.makedirs(out_dir, exist_ok=True)

    if not os.path.isdir(wav_dir):
        raise RuntimeError(f"RVC preprocess output not found: {wav_dir}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Loading HuBERT model on {device}...")

    # Download from HuggingFace (cached after first download, ~400MB)
    model = HubertModel.from_pretrained("TencentGameMate/chinese-hubert-base")
    model = model.to(device)
    model.eval()
    logger.info("HuBERT model loaded")

    wav_files = sorted([f for f in os.listdir(wav_dir) if f.endswith(".wav")])
    logger.info(f"Extracting features for {len(wav_files)} files...")

    for idx, file in enumerate(wav_files):
        out_path = os.path.join(out_dir, file.replace(".wav", ".npy"))
        if os.path.exists(out_path):
            continue

        wav, sr = sf.read(os.path.join(wav_dir, file))
        assert sr == 16000, f"Expected 16kHz, got {sr}"
        feats = torch.from_numpy(wav).float()
        if feats.dim() == 2:
            feats = feats.mean(-1)
        feats = feats.view(1, -1).to(device)

        with torch.no_grad():
            outputs = model(feats, output_hidden_states=True)
            # RVC v2 uses 12th transformer layer output (index 12 in hidden_states)
            hidden = outputs.hidden_states[12]  # (1, seq_len, 768)

        feats = hidden.squeeze(0).float().cpu().numpy()
        if np.isnan(feats).sum() == 0:
            np.save(out_path, feats, allow_pickle=False)
        else:
            logger.warning(f"NaN in features for {file}")

        if (idx + 1) % 10 == 0 or idx == len(wav_files) - 1:
            logger.info(f"Feature extraction: {idx + 1}/{len(wav_files)}")

    logger.info(f"RVC feature extraction complete: {len(wav_files)} files -> {out_dir}")


def _rvc_train(output_dir: str, total_epochs: int, model_id: int):
    """Step 3: Train VITS voice model.

    RVC train.py uses argparse (see infer/lib/train/utils.py:308-365):
      -se SAVE_EVERY_EPOCH  -te TOTAL_EPOCH  -bs BATCH_SIZE
      -e  EXPERIMENT_DIR    -sr SAMPLE_RATE   -v  VERSION
      -f0 IF_F0             -l  IF_LATEST     -c  IF_CACHE_DATA_IN_GPU
      [-g GPUS]  [-pg PRETRAIN_G]  [-pd PRETRAIN_D]

    It reads config.json from {experiment_dir}/config.json and
    training file list from {experiment_dir}/filelist.txt.
    experiment_dir = os.path.join("./logs", args.experiment_dir),
    so passing an absolute path for -e works (os.path.join quirk).
    """
    os.makedirs(output_dir, exist_ok=True)

    # Write RVC training config
    config_path = os.path.join(output_dir, "config.json")
    _write_train_config(config_path, output_dir, total_epochs)

    # Generate filelist.txt pointing to preprocessed wavs
    dataset_dir = os.path.join(output_dir, "dataset")
    gt_wavs_dir = os.path.join(dataset_dir, "0_gt_wavs")
    filelist_path = os.path.join(output_dir, "filelist.txt")
    wav_files = []
    if os.path.isdir(gt_wavs_dir):
        wav_files = sorted(
            os.path.join(gt_wavs_dir, f)
            for f in os.listdir(gt_wavs_dir)
            if f.endswith(".wav")
        )
    if not wav_files:
        raise RuntimeError(f"No preprocessed WAV files found in {gt_wavs_dir} — voice separation may have failed")
    with open(filelist_path, "w") as f:
        f.write("\n".join(wav_files))
    logger.info(f"Training filelist: {len(wav_files)} files -> {filelist_path}")

    script = os.path.join(_RVC_ROOT, "infer", "modules", "train", "train.py")
    cmd = [
        sys.executable, script,
        "-se", "5",                    # save checkpoint every 5 epochs
        "-te", str(total_epochs),      # total epochs
        "-bs", "8",                    # batch size
        "-e", os.path.abspath(output_dir),  # experiment dir (absolute path → ignores ./logs/ prefix)
        "-sr", "40k",                  # sample rate
        "-v", "v2",                    # RVC version
        "-f0", "1",                    # use F0 pitch
        "-l", "1",                     # only keep latest checkpoint
        "-c", "0",                     # do NOT cache dataset in GPU (safer, avoids OOM)
    ]
    logger.info(f"RVC train: {' '.join(cmd)}")
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
        # Parse epoch progress: "epoch X/Y" or "Epoch X"
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
    """Use RVC's VC class directly for inference.

    Pipeline signature (from infer/modules/vc/pipeline.py:281):
      pipeline(model, net_g, sid, audio, input_audio_path, times,
               f0_up_key, f0_method, file_index, index_rate, if_f0,
               filter_radius, tgt_sr, resample_sr, rms_mix_rate, version, protect)
    """
    # Temporarily add RVC root; restore after imports
    _saved_path = sys.path.copy()
    sys.path.insert(0, _RVC_ROOT)
    try:
        from infer.lib.audio import load_audio
        from infer.modules.vc.modules import VC
    finally:
        sys.path[:] = _saved_path

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
            self.hubert_path = os.path.join(_RVC_ROOT, "assets", "hubert", "hubert_base.pt")

    rvc_config = SimpleConfig()
    vc = VC(rvc_config)

    cpt = torch.load(model_path, map_location="cpu", weights_only=True)
    sid = int(cpt.get("sid", 0))
    vc.get_vc(str(sid))
    tgt_sr = cpt.get("sr", 40000)

    audio = load_audio(reference_audio, 16000)
    audio_opt = vc.pipeline.pipeline(
        vc.hubert_model,   # model
        vc.net_g,           # net_g
        sid,                # sid
        audio,              # audio
        reference_audio,    # input_audio_path
        [0, 0, 0],          # times (start/end/cross-fade)
        0,                  # f0_up_key
        "rmvpe",            # f0_method
        "",                 # file_index (no index file)
        0.0,                # index_rate (0 = skip index)
        vc.if_f0,           # if_f0
        3,                  # filter_radius
        tgt_sr,             # tgt_sr
        0,                  # resample_sr
        1.0,                # rms_mix_rate
        vc.version,         # version
        0.33,               # protect
    )
    sf.write(output_path, audio_opt, tgt_sr)
    logger.info(f"RVC inference complete: {output_path}")


def _rvc_infer_subprocess(model_path: str, config_path: str, reference_audio: str, output_path: str):
    """Fallback: run the same corrected inference code in an isolated subprocess."""
    code = f'''
import os, sys
sys.path.insert(0, {_RVC_ROOT!r})
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
        self.hubert_path = os.path.join({_RVC_ROOT!r}, "assets", "hubert", "hubert_base.pt")

rvc_config = SimpleConfig()
vc = VC(rvc_config)
cpt = torch.load({model_path!r}, map_location="cpu")
sid = int(cpt.get("sid", 0))
vc.get_vc(str(sid))
tgt_sr = cpt.get("sr", 40000)
audio = load_audio({reference_audio!r}, 16000)
audio_opt = vc.pipeline.pipeline(
    vc.hubert_model, vc.net_g, sid, audio, {reference_audio!r},
    [0, 0, 0], 0, "rmvpe", "", 0.0, vc.if_f0, 3,
    tgt_sr, 0, 1.0, vc.version, 0.33,
)
sf.write({output_path!r}, audio_opt, tgt_sr)
print("RVC_INFER_OK")
'''
    proc = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True, text=True,
        timeout=600,
        cwd=_RVC_ROOT,
    )
    if proc.returncode != 0:
        logger.error(f"RVC subprocess stderr: {proc.stderr}")
        raise RuntimeError(f"RVC subprocess inference failed: {proc.stderr}")
    if "RVC_INFER_OK" not in proc.stdout:
        raise RuntimeError(f"RVC subprocess did not confirm completion")
    logger.info(f"RVC subprocess inference complete: {output_path}")


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

def train_voice_model_sync(model_id: int, audio_paths: list[str], quality_target: str = "premium"):
    """Run the full voice training pipeline synchronously (no Celery needed).

    Called from a background thread by the /voice/train API endpoint.
    """
    from app.core.database import SessionLocal
    from app.models.voice_model import VoiceModel
    from app.tasks.audio_pipeline import _separate_vocals
    from app.models.providers.resource_manager import resource_manager
    import shutil

    from app.services.voice_service import EPOCH_TARGETS
    total_epochs = EPOCH_TARGETS.get(quality_target, 200)

    logger.info(f"train_voice_model_sync: model_id={model_id} songs={len(audio_paths)} quality_target={quality_target} total_epochs={total_epochs}")

    if not _RVC_DEPS_OK:
        error_msg = "RVC 声音训练环境不完整:\n" + "\n".join(f"  - {m}" for m in _RVC_DEPS_REPORT)
        logger.error(error_msg)
        db = SessionLocal()
        try:
            model = db.query(VoiceModel).filter(VoiceModel.id == model_id).first()
            if model:
                model.status = "failed"
                db.commit()
        finally:
            db.close()
        return {"stage": "failed", "reason": error_msg}

    output_dir = os.path.abspath(os.path.join(settings.GENERATED_DIR, "voice_models", str(model_id)))
    os.makedirs(output_dir, exist_ok=True)
    dataset_dir = os.path.join(output_dir, "dataset")

    try:
        db = SessionLocal()
        try:
            model = db.query(VoiceModel).filter(VoiceModel.id == model_id).first()
            if not model:
                return {"stage": "failed", "reason": "voice model not found"}
            model.status = "preprocessing"
            db.commit()

            # Step 1: Vocal separation for each song
            os.makedirs(dataset_dir, exist_ok=True)
            total_duration = 0.0
            for i, audio_path in enumerate(audio_paths):
                logger.info(f"[Voice {model_id}] Separating vocals {i+1}/{len(audio_paths)}")
                vocal_path = _separate_vocals(audio_path, task_id="")
                total_duration += _get_audio_duration(vocal_path)
                song_name = f"song_{i:02d}_{os.path.basename(vocal_path)}"
                shutil.copy(vocal_path, os.path.join(dataset_dir, song_name))

            model.duration_seconds = total_duration
            db.commit()
            resource_manager.release_all()

            # Step 2: RVC preprocessing (slicing + normalization)
            logger.info(f"[Voice {model_id}] RVC preprocess...")
            _rvc_preprocess(dataset_dir, dataset_dir)

            # Step 3: HuBERT feature extraction (HuggingFace transformers)
            logger.info(f"[Voice {model_id}] HuBERT feature extraction...")
            _rvc_extract_features(dataset_dir, output_dir)

            # Step 4: Train
            model.status = "training"
            model.epoch = 0
            db.commit()

            checkpoint_dir = os.path.join(output_dir, "checkpoints")
            logger.info(f"[Voice {model_id}] Training {total_epochs} epochs...")
            _rvc_train(output_dir, total_epochs, model_id)

            model.status = "ready"
            model.epoch = total_epochs
            model.quality_tier = quality_target
            model.checkpoint_path = os.path.join(checkpoint_dir, "G_latest.pth")
            model.config_path = os.path.join(output_dir, "config.json")
            db.commit()

            logger.info(f"[Voice {model_id}] Training complete!")
            return {
                "stage": "completed",
                "model_id": model_id,
                "quality_tier": quality_target,
                "epoch": total_epochs,
            }
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[Voice {model_id}] Training failed: {e}", exc_info=True)
        try:
            db2 = SessionLocal()
            try:
                model = db2.query(VoiceModel).filter(VoiceModel.id == model_id).first()
                if model:
                    model.status = "failed"
                    db2.commit()
            finally:
                db2.close()
        except Exception as db_err:
            logger.error(f"[Voice {model_id}] Failed to update model status after training error: {db_err}")
        raise


@celery_app.task(bind=True, name="train_voice_model")
def train_voice_model(self, model_id: int, audio_paths: list[str], quality_target: str = "premium"):
    """Full voice training pipeline: separate vocals for each song -> preprocess -> train RVC."""
    from app.core.database import SessionLocal
    from app.models.voice_model import VoiceModel
    from app.tasks.audio_pipeline import _separate_vocals
    from app.models.providers.resource_manager import resource_manager
    import shutil

    from app.services.voice_service import EPOCH_TARGETS
    total_epochs = EPOCH_TARGETS.get(quality_target, 200)

    task_id = self.request.id
    logger.info(f"train_voice_model: model_id={model_id} songs={len(audio_paths)} quality_target={quality_target} total_epochs={total_epochs}")

    # Pre-flight check: RVC dependencies
    if not _RVC_DEPS_OK:
        error_msg = "RVC 声音训练环境不完整:\\n" + "\\n".join(f"  - {m}" for m in _RVC_DEPS_REPORT)
        logger.error(error_msg)
        db = SessionLocal()
        try:
            model = db.query(VoiceModel).filter(VoiceModel.id == model_id).first()
            if model:
                model.status = "failed"
                db.commit()
        finally:
            db.close()
        return {"stage": "failed", "reason": error_msg}

    output_dir = os.path.join(settings.GENERATED_DIR, "voice_models", str(model_id))
    os.makedirs(output_dir, exist_ok=True)
    dataset_dir = os.path.join(output_dir, "dataset")

    try:
        db = SessionLocal()
        try:
            model = db.query(VoiceModel).filter(VoiceModel.id == model_id).first()
            if not model:
                return {"stage": "failed", "reason": "voice model not found"}
            model.status = "preprocessing"
            db.commit()

            # Step 1: Vocal separation for each song, collect vocals into dataset dir
            os.makedirs(dataset_dir, exist_ok=True)
            total_duration = 0.0
            for i, audio_path in enumerate(audio_paths):
                vocal_path = _separate_vocals(audio_path, task_id=task_id)
                total_duration += _get_audio_duration(vocal_path)
                # Copy separated vocal into dataset dir with unique name
                song_name = f"song_{i:02d}_{os.path.basename(vocal_path)}"
                shutil.copy(vocal_path, os.path.join(dataset_dir, song_name))
                logger.info(f"Vocal {i+1}/{len(audio_paths)}: {vocal_path} -> {dataset_dir}")

            model.duration_seconds = total_duration
            db.commit()

            # Unload Demucs — RVC training needs its own VRAM budget
            resource_manager.release_all()

            # Step 2: RVC preprocessing (slicing + normalization on combined dataset)
            _rvc_preprocess(dataset_dir, dataset_dir)

            # Step 3: HuBERT feature extraction
            model.status = "preprocessing"
            db.commit()
            _rvc_extract_features(dataset_dir, output_dir)

            # Step 4: Train
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
