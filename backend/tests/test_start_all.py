"""Regression tests for the local service launcher."""

import importlib.util
from pathlib import Path


def _load_start_all():
    path = Path(__file__).resolve().parents[2] / "start_all.py"
    spec = importlib.util.spec_from_file_location("start_all", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_aimusic_health_check_rejects_foreign_backend():
    start_all = _load_start_all()

    assert not start_all._is_aimusic_backend_health(
        200,
        b'{"status":"ok","version":"0.1.0"}',
    )


def test_aimusic_health_check_accepts_aimusic_backend():
    start_all = _load_start_all()

    assert start_all._is_aimusic_backend_health(
        200,
        b'{"status":"healthy"}',
    )


def test_frontend_cache_is_kept_by_default():
    start_all = _load_start_all()

    assert not start_all._should_remove_frontend_cache(clean=False)


def test_frontend_cache_is_removed_for_clean_start():
    start_all = _load_start_all()

    assert start_all._should_remove_frontend_cache(clean=True)
