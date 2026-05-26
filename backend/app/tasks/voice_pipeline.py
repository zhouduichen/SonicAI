"""Celery tasks for RVC voice training and inference."""

import os
import sys
import json
import logging
import subprocess
import shutil
from app.tasks.celery_app import celery_app
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Find ffmpeg at module load time — RVC's load_audio depends on it
_FFMPEG_DIR = os.path.dirname(shutil.which("ffmpeg")) if shutil.which("ffmpeg") else None
if _FFMPEG_DIR:
    os.environ["PATH"] = _FFMPEG_DIR + os.pathsep + os.environ.get("PATH", "")
    logger.info(f"ffmpeg found at: {_FFMPEG_DIR}")
else:
    logger.warning("ffmpeg not found in PATH — RVC preprocessing will fail")

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

try:
    import parselmouth  # noqa: F401
except ImportError:
    _RVC_DEPS_OK = False
    _RVC_DEPS_REPORT.append("parselmouth missing - pip install praat-parselmouth")

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


def _cuda_status() -> tuple[bool, str]:
    """Return CUDA availability plus a short diagnostic string."""
    try:
        import torch
    except Exception as e:
        return False, f"torch unavailable: {type(e).__name__}: {e}"
    if not torch.cuda.is_available():
        return False, f"torch={torch.__version__} cuda_runtime={torch.version.cuda} cuda_available=False"
    names = [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]
    return True, f"torch={torch.__version__} cuda_runtime={torch.version.cuda} devices={names}"


def _cpu_training_allowed() -> bool:
    """CPU training is opt-in because it is usually hours to days slower."""
    return bool(getattr(settings, "SONICAI_ALLOW_CPU_TRAINING", False))


class JobCancelled(RuntimeError):
    """Raised when a user stops a running job."""


def _is_job_cancelled(job_id: int | None) -> bool:
    if job_id is None:
        return False
    try:
        from app.core.database import SessionLocal
        from app.services.job_service import is_job_cancelled

        db = SessionLocal()
        try:
            return is_job_cancelled(db, job_id)
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Failed to check cancellation for job {job_id}: {e}")
        return False


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
    # Explicitly pass env with ffmpeg on PATH so RVC's load_audio can find it
    proc_env = os.environ.copy()
    if _FFMPEG_DIR and _FFMPEG_DIR not in proc_env.get("PATH", ""):
        proc_env["PATH"] = _FFMPEG_DIR + os.pathsep + proc_env.get("PATH", "")
    subprocess.run(cmd, check=True, cwd=_RVC_ROOT, env=proc_env)
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


def _rvc_extract_f0(output_dir: str, dataset_dir: str | None = None):
    """Step 2.5: Extract F0 (fundamental frequency / pitch) features.

    Required by RVC when training with -f0 1. Reads 1_16k_wavs/,
    writes 2a_f0/ (coarse pitch) and 2b-f0nsf/ (continuous pitch).
    Uses the rmvpe method (best quality, GPU-accelerated).
    Falls back to pm method if rmvpe model is unavailable.
    """
    import numpy as np

    exp_dir = os.path.abspath(output_dir)
    # 16kHz WAVs are written by preprocess into dataset/1_16k_wavs.
    # Link them into exp_dir so the F0 extraction subprocess can find them.
    actual_wav_dir = os.path.join(os.path.abspath(dataset_dir) if dataset_dir else exp_dir, "1_16k_wavs")
    expected_wav_dir = os.path.join(exp_dir, "1_16k_wavs")
    if not os.path.isdir(actual_wav_dir):
        raise RuntimeError(f"16kHz WAV directory not found: {actual_wav_dir} — run _rvc_preprocess first")

    wav_files = sorted([f for f in os.listdir(actual_wav_dir) if f.endswith(".wav")])
    if not wav_files:
        raise RuntimeError(f"No 16kHz WAV files in {actual_wav_dir}")

    # Create junction so the RVC F0 script sees 1_16k_wavs at exp_dir
    if not os.path.exists(expected_wav_dir):
        try:
            import subprocess as _sp
            _sp.run(["cmd", "/c", "mklink", "/J", expected_wav_dir, actual_wav_dir],
                    capture_output=True, check=True)
            logger.info(f"Created junction: {expected_wav_dir} -> {actual_wav_dir}")
        except Exception:
            # Fallback: copy (slower but always works)
            import shutil
            shutil.copytree(actual_wav_dir, expected_wav_dir, dirs_exist_ok=True)
            logger.info(f"Copied 16kHz WAVs to {expected_wav_dir}")

    # Try RMVPE first (best quality), fall back to pm.
    # RVC ships two RMVPE extractors: extract_f0_print.py is CPU-only, while
    # extract_f0_rmvpe.py uses CUDA. Pick the CUDA script when PyTorch can see
    # the GPU; otherwise log loudly so the slow path is visible.
    rmvpe_model = os.path.join(_RVC_ROOT, "assets", "rmvpe", "rmvpe.pt")
    f0_method = "rmvpe" if os.path.exists(rmvpe_model) else "pm"
    if f0_method == "pm":
        logger.info("RMVPE model not found, falling back to pm (parselmouth) for F0 extraction")

    cuda_ok, cuda_diag = _cuda_status()
    logger.info(f"F0 extraction: method={f0_method} files={len(wav_files)} cuda_ok={cuda_ok} {cuda_diag}")
    if not cuda_ok and not _cpu_training_allowed():
        raise RuntimeError(
            "CUDA is not available for voice training, so CPU fallback was blocked. "
            f"{cuda_diag}. Re-run install.bat to install CUDA PyTorch, or set "
            "SONICAI_ALLOW_CPU_TRAINING=true if you really want the slow CPU path."
        )

    if f0_method == "rmvpe" and cuda_ok:
        script = os.path.join(_RVC_ROOT, "infer", "modules", "train", "extract", "extract_f0_rmvpe.py")
        cmd = [
            sys.executable, script,
            "1",          # n_part
            "0",          # i_part
            "0",          # i_gpu
            exp_dir,
            "True",       # is_half
        ]
    else:
        if f0_method == "rmvpe":
            logger.warning("CUDA RMVPE unavailable; using CPU RMVPE F0 extraction. This can be very slow.")
        script = os.path.join(_RVC_ROOT, "infer", "modules", "train", "extract", "extract_f0_print.py")
        cmd = [
            sys.executable, script,
            exp_dir,
            "1",          # n_p = 1 (single process, avoids multiprocessing issues)
            f0_method,
        ]
    logger.info(f"RVC F0 extract: {' '.join(cmd)}")
    f0_env = os.environ.copy()
    if _FFMPEG_DIR and _FFMPEG_DIR not in f0_env.get("PATH", ""):
        f0_env["PATH"] = _FFMPEG_DIR + os.pathsep + f0_env.get("PATH", "")
    subprocess.run(cmd, check=True, cwd=_RVC_ROOT, env=f0_env)

    f0_dir = os.path.join(exp_dir, "2a_f0")
    f0nsf_dir = os.path.join(exp_dir, "2b-f0nsf")
    f0_count = len([f for f in os.listdir(f0_dir) if f.endswith(".npy")]) if os.path.isdir(f0_dir) else 0
    logger.info(f"RVC F0 extraction complete: {f0_count} files -> {f0_dir}")


def _ensure_pretrained_weights():
    """Download RVC pretrained G/D weights from HuggingFace if missing.

    For v2, f0, 40k: assets/pretrained_v2/f0G40k.pth and f0D40k.pth
    """
    pretrained_dir = os.path.join(_RVC_ROOT, "assets", "pretrained_v2")
    g_path = os.path.join(pretrained_dir, "f0G40k.pth")
    d_path = os.path.join(pretrained_dir, "f0D40k.pth")

    if os.path.exists(g_path) and os.path.exists(d_path):
        return g_path, d_path

    os.makedirs(pretrained_dir, exist_ok=True)

    try:
        from huggingface_hub import hf_hub_download
        logger.info("Downloading RVC pretrained weights from HuggingFace (lj1995/VoiceConversionWebUI)...")
        g_src = hf_hub_download(
            repo_id="lj1995/VoiceConversionWebUI",
            filename="pretrained_v2/f0G40k.pth",
            cache_dir=os.path.join(_RVC_ROOT, "assets"),
        )
        d_src = hf_hub_download(
            repo_id="lj1995/VoiceConversionWebUI",
            filename="pretrained_v2/f0D40k.pth",
            cache_dir=os.path.join(_RVC_ROOT, "assets"),
        )
        import shutil
        shutil.copy(g_src, g_path)
        shutil.copy(d_src, d_path)
        logger.info(f"Pretrained weights downloaded: {g_path}, {d_path}")
        return g_path, d_path
    except Exception as e:
        logger.warning(f"Failed to download pretrained weights: {e}. Training will start from scratch (slower convergence).")
        return None, None


def _rvc_train(output_dir: str, total_epochs: int, model_id: int, job_id: int | None = None):
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

    cuda_ok, cuda_diag = _cuda_status()
    logger.info(f"RVC training CUDA status: cuda_ok={cuda_ok} {cuda_diag}")
    if not cuda_ok:
        if not _cpu_training_allowed():
            raise RuntimeError(
                "CUDA is not available for RVC training, so CPU fallback was blocked. "
                f"{cuda_diag}. Re-run install.bat to install CUDA PyTorch, or set "
                "SONICAI_ALLOW_CPU_TRAINING=true if you really want the slow CPU path."
            )
        logger.warning("RVC training is falling back to CPU. This is expected to be extremely slow.")

    # Write RVC training config
    config_path = os.path.join(output_dir, "config.json")
    _write_train_config(config_path, output_dir, total_epochs, fp16_run=cuda_ok)

    # Generate filelist.txt in RVC format: wav|feature|f0|f0nsf|sid
    dataset_dir = os.path.join(output_dir, "dataset")
    gt_wavs_dir = os.path.join(dataset_dir, "0_gt_wavs")
    feature_dir = os.path.join(output_dir, "3_feature768")
    f0_dir = os.path.join(output_dir, "2a_f0")
    f0nsf_dir = os.path.join(output_dir, "2b-f0nsf")
    filelist_path = os.path.join(output_dir, "filelist.txt")
    wav_files = []
    if os.path.isdir(gt_wavs_dir):
        wav_files = sorted(f for f in os.listdir(gt_wavs_dir) if f.endswith(".wav"))
    if not wav_files:
        raise RuntimeError(f"No preprocessed WAV files found in {gt_wavs_dir} — voice separation may have failed")

    filelist_entries = []
    for wav_name in wav_files:
        base = wav_name  # e.g., "song_00_slice_0.wav"
        name_no_ext = base.replace(".wav", "")
        feature_path = os.path.join(feature_dir, name_no_ext + ".npy")
        f0_path = os.path.join(f0_dir, base + ".npy")
        f0nsf_path = os.path.join(f0nsf_dir, base + ".npy")
        wav_path = os.path.join(gt_wavs_dir, base)
        filelist_entries.append(f"{wav_path}|{feature_path}|{f0_path}|{f0nsf_path}|0")

    with open(filelist_path, "w") as f:
        f.write("\n".join(filelist_entries))
    logger.info(f"Training filelist: {len(filelist_entries)} files -> {filelist_path}")

    # Download pretrained weights if available
    pretrain_g, pretrain_d = _ensure_pretrained_weights()

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
        "-c", "1",                     # cache dataset in GPU (safe w/o DDP, much faster)
        "-g", "0",                     # explicit first CUDA device; train.py maps this to CUDA_VISIBLE_DEVICES
    ]
    if pretrain_g:
        cmd.extend(["-pg", pretrain_g])
    if pretrain_d:
        cmd.extend(["-pd", pretrain_d])
    logger.info(f"RVC train: {' '.join(cmd)}")
    train_env = os.environ.copy()
    train_env["PYTHONUNBUFFERED"] = "1"
    train_env["CUDA_VISIBLE_DEVICES"] = "0"
    if _FFMPEG_DIR and _FFMPEG_DIR not in train_env.get("PATH", ""):
        train_env["PATH"] = _FFMPEG_DIR + os.pathsep + train_env.get("PATH", "")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=_RVC_ROOT,
        env=train_env,
    )
    for line in proc.stdout:
        if _is_job_cancelled(job_id):
            logger.info(f"RVC train cancelled by user: job_id={job_id}")
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
            raise JobCancelled("Voice training cancelled")
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
    if _is_job_cancelled(job_id):
        raise JobCancelled("Voice training cancelled")
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


def _write_train_config(config_path: str, exp_dir: str, total_epochs: int, fp16_run: bool = True):
    """Write RVC training config JSON."""
    template_path = os.path.join(_RVC_ROOT, "configs", "v1", "40k.json")
    with open(template_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    config["train"].update({
        "log_interval": 10,
        "epochs": total_epochs,
        "batch_size": 8,
        "fp16_run": fp16_run,
    })
    config["data"]["training_files"] = os.path.join(exp_dir, "filelist.txt")
    config["data"]["validation_files"] = os.path.join(exp_dir, "val_filelist.txt")
    config["version"] = "v2"
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

def train_voice_model_sync(model_id: int, audio_paths: list[str], quality_target: str = "premium", job_id: int | None = None):
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
            def _raise_if_cancelled() -> None:
                if _is_job_cancelled(job_id):
                    raise JobCancelled("Voice training cancelled")

            _raise_if_cancelled()
            model = db.query(VoiceModel).filter(VoiceModel.id == model_id).first()
            if not model:
                return {"stage": "failed", "reason": "voice model not found"}
            model.status = "preprocessing"
            db.commit()

            # Step 1: Vocal separation for each song
            os.makedirs(dataset_dir, exist_ok=True)
            total_duration = 0.0
            for i, audio_path in enumerate(audio_paths):
                _raise_if_cancelled()
                logger.info(f"[Voice {model_id}] Separating vocals {i+1}/{len(audio_paths)}")
                vocal_path = _separate_vocals(audio_path, task_id="", stem="vocals")
                total_duration += _get_audio_duration(vocal_path)
                song_name = f"song_{i:02d}_{os.path.basename(vocal_path)}"
                shutil.copy(vocal_path, os.path.join(dataset_dir, song_name))

            model.duration_seconds = total_duration
            db.commit()
            resource_manager.release_all()

            # Step 2: RVC preprocessing (slicing + normalization)
            _raise_if_cancelled()
            logger.info(f"[Voice {model_id}] RVC preprocess...")
            _rvc_preprocess(dataset_dir, dataset_dir)

            # Step 3: HuBERT feature extraction (HuggingFace transformers)
            _raise_if_cancelled()
            logger.info(f"[Voice {model_id}] HuBERT feature extraction...")
            _rvc_extract_features(dataset_dir, output_dir)

            # Step 3.5: F0 (pitch) extraction
            _raise_if_cancelled()
            logger.info(f"[Voice {model_id}] F0 pitch extraction...")
            _rvc_extract_f0(output_dir, dataset_dir=dataset_dir)

            # Step 4: Train
            model.status = "training"
            model.epoch = 0
            db.commit()

            _raise_if_cancelled()
            logger.info(f"[Voice {model_id}] Training {total_epochs} epochs...")
            _rvc_train(output_dir, total_epochs, model_id, job_id=job_id)

            # RVC saves checkpoint as G_2333333.pth when -l 1 is set
            _raise_if_cancelled()
            ckpt_path = os.path.join(output_dir, "G_2333333.pth")
            if not os.path.exists(ckpt_path):
                raise RuntimeError(f"Checkpoint not found after training: {ckpt_path}")

            model.status = "ready"
            model.epoch = total_epochs
            model.quality_tier = quality_target
            model.checkpoint_path = ckpt_path
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


def run_voice_training_job(
    model_id: int,
    audio_paths: list[str],
    quality_target: str = "premium",
    job_id: int | None = None,
):
    """Run sync voice training and keep the persistent Job in sync."""
    from app.core.database import SessionLocal
    from app.models.job import Job
    from app.services.job_service import update_job_status

    def _set_job_status(
        status: str,
        *,
        stage: str | None = None,
        progress: int | None = None,
        error_message: str | None = None,
        result: dict | None = None,
    ) -> None:
        if job_id is None:
            return
        db = SessionLocal()
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                update_job_status(
                    db,
                    job,
                    status,
                    stage=stage,
                    progress=progress,
                    error_message=error_message,
                    result=result,
                )
        finally:
            db.close()

    _set_job_status("running", stage="preprocessing", progress=1)

    try:
        result = train_voice_model_sync(
            model_id,
            audio_paths,
            quality_target,
            job_id=job_id,
        )
    except JobCancelled as e:
        message = str(e)
        _set_job_status("cancelled", stage="cancelled", error_message=message)
        return {"stage": "cancelled", "reason": message}
    except Exception as e:
        message = str(e)
        logger.error("Voice training job %s failed: %s", job_id, message, exc_info=True)
        _set_job_status("failed", stage="training", error_message=message)
        return {"stage": "failed", "reason": message}

    stage = result.get("stage") if isinstance(result, dict) else None
    if stage == "completed":
        _set_job_status("completed", stage="completed", progress=100, result=result)
    elif stage == "cancelled":
        reason = result.get("reason") if isinstance(result, dict) else None
        _set_job_status("cancelled", stage="cancelled", error_message=reason)
    else:
        reason = result.get("reason") if isinstance(result, dict) else "Voice training failed"
        _set_job_status("failed", stage=stage or "training", error_message=reason)
    return result


def _update_job(db, job_id: int, status: str, *, stage: str | None = None, progress: int | None = None, error_message: str | None = None, result: dict | None = None):
    """Helper to update job status from within a Celery task."""
    try:
        from app.services.job_service import update_job_status
        from app.models.job import Job
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            update_job_status(db, job, status, stage=stage, progress=progress, error_message=error_message, result=result)
    except Exception as e:
        logger.warning(f"Failed to update job {job_id}: {e}")


@celery_app.task(bind=True, name="train_voice_model")
def train_voice_model(self, job_id: int):
    """Full voice training pipeline, driven by a persistent Job.

    Reads model_id, audio_paths, quality_target from job.payload_json.
    Updates job.stage / job.progress / job.status throughout.
    """
    from app.core.database import SessionLocal
    from app.models.voice_model import VoiceModel
    from app.models.job import Job
    from app.tasks.audio_pipeline import _separate_vocals
    from app.models.providers.resource_manager import resource_manager
    from app.services.voice_service import EPOCH_TARGETS
    import shutil, json as _json

    celery_task_id = self.request.id
    logger.info(f"train_voice_model: job_id={job_id} celery_task_id={celery_task_id}")

    # Load job payload
    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return {"stage": "failed", "reason": "job not found"}
        job.celery_task_id = celery_task_id
        _update_job(db, job_id, "running", stage="starting")
        payload = _json.loads(job.payload_json) if job.payload_json else {}
        model_id = payload["model_id"]
        audio_paths = payload["audio_paths"]
        quality_target = payload.get("quality_target", "premium")
    finally:
        db.close()

    total_epochs = EPOCH_TARGETS.get(quality_target, 200)
    logger.info(f"train_voice_model: job={job_id} model={model_id} songs={len(audio_paths)} quality_target={quality_target}")

    # Pre-flight check: RVC dependencies
    if not _RVC_DEPS_OK:
        error_msg = "RVC 声音训练环境不完整:\n" + "\n".join(f"  - {m}" for m in _RVC_DEPS_REPORT)
        db2 = SessionLocal()
        try:
            model = db2.query(VoiceModel).filter(VoiceModel.id == model_id).first()
            if model:
                model.status = "failed"
            _update_job(db2, job_id, "failed", stage="preflight", error_message=error_msg)
        finally:
            db2.close()
        return {"stage": "failed", "reason": error_msg}

    try:
        result = train_voice_model_sync(model_id, audio_paths, quality_target, job_id=job_id)

        db2 = SessionLocal()
        try:
            _update_job(db2, job_id, "completed", stage="completed", progress=100, result=result)
        finally:
            db2.close()
        return result
    except JobCancelled as e:
        logger.info(f"Voice training job {job_id} cancelled: {e}")
        db2 = SessionLocal()
        try:
            _update_job(db2, job_id, "cancelled", stage="cancelled", error_message=str(e))
        finally:
            db2.close()
        return {"stage": "cancelled", "reason": str(e)}
    except Exception as e:
        logger.error(f"Voice training job {job_id} failed: {e}", exc_info=True)
        db2 = SessionLocal()
        try:
            _update_job(db2, job_id, "failed", stage="training", error_message=str(e))
        finally:
            db2.close()
        raise


def infer_rvc_vocals_sync(generation_id: int, voice_model_id: int, reference_audio_path: str):
    """Run RVC voice inference synchronously (no Celery needed).

    Called from a background thread by the /voice/sing API endpoint.
    """
    from app.core.database import SessionLocal
    from app.models.voice_model import VoiceModel
    from app.models.vocal_generation import VocalGeneration

    logger.info(f"infer_rvc_vocals_sync: generation_id={generation_id} model_id={voice_model_id}")

    output_dir = os.path.join(settings.GENERATED_DIR, "vocals")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"vocal_{generation_id}.wav")

    try:
        db = SessionLocal()
        try:
            model = db.query(VoiceModel).filter(VoiceModel.id == voice_model_id).first()
            if not model or model.status != "ready":
                raise ValueError("Voice model not ready")

            if not model.checkpoint_path or not os.path.exists(model.checkpoint_path):
                raise ValueError(f"Voice model checkpoint not found: {model.checkpoint_path}")

            gen = db.query(VocalGeneration).filter(VocalGeneration.id == generation_id).first()
            if not gen:
                raise ValueError(f"VocalGeneration {generation_id} not found")
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

            logger.info(f"infer_rvc_vocals_sync complete: {output_path}")
            return {"stage": "completed", "generation_id": generation_id, "output_path": output_path}
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Voice inference failed: {e}", exc_info=True)
        db = SessionLocal()
        try:
            gen = db.query(VocalGeneration).filter(VocalGeneration.id == generation_id).first()
            if gen:
                gen.status = "failed"
                db.commit()
        finally:
            db.close()
        raise


@celery_app.task(bind=True, name="infer_rvc_vocals")
def infer_rvc_vocals(self, generation_id: int, voice_model_id: int, reference_audio_path: str):
    """Convert reference vocals to target voice using trained RVC model (Celery task)."""
    return infer_rvc_vocals_sync(generation_id, voice_model_id, reference_audio_path)


def _get_audio_duration(filepath: str) -> float:
    """Return audio duration in seconds."""
    try:
        import soundfile as sf
        info = sf.info(filepath)
        return info.duration
    except Exception:
        return 0.0
