"""Regression tests for voice model training orchestration."""

import importlib.util
import json


def test_rvc_dependency_report_tracks_parselmouth_availability():
    """RVC preflight should report the package used by F0 extraction."""
    from app.tasks import voice_pipeline

    parselmouth_missing = importlib.util.find_spec("parselmouth") is None
    parselmouth_reported = any(
        "parselmouth" in item.lower() for item in voice_pipeline._RVC_DEPS_REPORT
    )

    assert parselmouth_reported is parselmouth_missing


def test_run_voice_training_job_marks_job_failed_when_pipeline_errors(db, client, monkeypatch):
    """Background sync training must not leave the persistent job queued forever."""
    from app.core import database
    from app.models.user import User
    from app.models.voice_model import VoiceModel
    from app.services.job_service import create_job
    from app.tasks import voice_pipeline

    class SessionProxy:
        def __getattr__(self, name):
            return getattr(db, name)

        def close(self):
            pass

    def fail_training(*args, **kwargs):
        raise RuntimeError("missing parselmouth")

    user = db.query(User).first()
    model = VoiceModel(user_id=user.id, name="test voice", status="pending")
    db.add(model)
    db.commit()
    db.refresh(model)
    job = create_job(db, user, "voice_training", {"model_id": model.id})

    monkeypatch.setattr(database, "SessionLocal", lambda: SessionProxy())
    monkeypatch.setattr(voice_pipeline, "train_voice_model_sync", fail_training)

    result = voice_pipeline.run_voice_training_job(
        model.id,
        ["input.wav"],
        "preview",
        job.id,
    )

    db.refresh(job)
    assert result["stage"] == "failed"
    assert job.status == "failed"
    assert job.stage == "training"
    assert "missing parselmouth" in (job.error_message or "")
    assert job.finished_at is not None


def test_write_train_config_matches_rvc_40k_model_requirements(tmp_path):
    """Generated RVC config should include the model fields required by train.py."""
    from app.tasks.voice_pipeline import _write_train_config

    config_path = tmp_path / "config.json"
    _write_train_config(str(config_path), str(tmp_path), total_epochs=20, fp16_run=True)

    config = json.loads(config_path.read_text())
    assert config["model"]["spk_embed_dim"] == 109
    assert config["model"]["gin_channels"] == 256
    assert config["model"]["upsample_rates"] == [10, 10, 2, 2]
    assert config["data"]["sampling_rate"] == 40000
