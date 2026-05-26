"""Tests for audio upload pipeline edge cases."""

from pathlib import Path
from types import SimpleNamespace

import pytest


def test_local_demucs_assertion_error_falls_back_to_copy(monkeypatch, tmp_path):
    from app.models.providers import local_demucs

    source = tmp_path / "short.wav"
    source.write_bytes(b"RIFFfakewav")
    generated = tmp_path / "generated"
    generated.mkdir()

    monkeypatch.setattr(local_demucs.settings, "GENERATED_DIR", str(generated))
    monkeypatch.setattr(local_demucs, "DEMUCS_AVAILABLE", True)
    monkeypatch.setattr(local_demucs._demucs_separate, "main", lambda args: (_ for _ in ()).throw(AssertionError()))

    provider = local_demucs.LocalDemucsProvider("demucs_htdemucs")
    provider.load()

    output = Path(provider.separate(str(source)))

    assert output.exists()
    assert output.read_bytes() == source.read_bytes()


def test_process_audio_upload_formats_failure_without_custom_failure_meta(monkeypatch):
    from app.core import database as database_module
    from app.tasks.audio_pipeline import process_audio_upload, resource_manager

    states: list[tuple[str, dict | None]] = []
    job_updates: list[tuple[str, dict]] = []
    asset = SimpleNamespace(status="processing")

    class DummyQuery:
        def filter(self, *args, **kwargs):
            return self

        def first(self):
            return asset

    class DummySession:
        def query(self, model):
            return DummyQuery()

        def commit(self):
            return None

        def close(self):
            return None

    def raise_assertion(*args, **kwargs):
        raise AssertionError()

    monkeypatch.setattr(process_audio_upload, "update_state", lambda state, meta=None: states.append((state, meta)), raising=False)
    monkeypatch.setattr(database_module, "SessionLocal", lambda: DummySession())
    monkeypatch.setattr(resource_manager, "release_all", lambda: None)

    import app.tasks.audio_pipeline as audio_pipeline

    monkeypatch.setattr(audio_pipeline, "_separate_vocals", raise_assertion)
    monkeypatch.setattr(
        audio_pipeline,
        "_update_job_from_celery",
        lambda task_id, status, **kwargs: job_updates.append((status, kwargs)),
    )

    process_audio_upload.push_request(id="task-audio-fail")
    try:
        with pytest.raises(AssertionError):
            process_audio_upload.run(
                audio_path="test.wav",
                asset_id=1,
                user_id=1,
                vocal_sep_model="demucs_htdemucs",
                style_extract_model="clap_laion",
            )
    finally:
        process_audio_upload.pop_request()

    assert [state for state, _ in states].count("FAILURE") == 0
    assert job_updates[-1][0] == "failed"
    assert job_updates[-1][1]["error_message"] == "AssertionError"
    assert asset.status == "failed"
