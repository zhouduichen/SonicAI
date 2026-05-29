"""Tests for Alembic migration upgrade/downgrade rollback safety."""

import os
import tempfile
import pytest

_db_path: str | None = None


def _db_url() -> str:
    global _db_path
    if _db_path is None:
        tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        tmp.close()
        _db_path = tmp.name
    return f"sqlite:///{_db_path}"


@pytest.fixture(autouse=True)
def clean_migration_db():
    """Remove the test DB before each migration test (fresh slate)."""
    path = _db_url().replace("sqlite:///", "")
    try:
        os.unlink(path)
    except OSError:
        pass
    yield
    try:
        os.unlink(path)
    except OSError:
        pass


def _run_alembic(command: str, revision: str = "head"):
    """Run an alembic command against the test database."""
    import os
    from alembic.config import Config
    from alembic import command as cmd

    backend_dir = os.path.join(os.path.dirname(__file__), "..")
    alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "migrations"))
    alembic_cfg.set_main_option("sqlalchemy.url", _db_url())

    if command == "upgrade":
        cmd.upgrade(alembic_cfg, revision)
    elif command == "downgrade":
        cmd.downgrade(alembic_cfg, revision)
    elif command == "current":
        return cmd.current(alembic_cfg)
    elif command == "history":
        return cmd.history(alembic_cfg)
    return None


def test_all_migrations_apply_and_rollback():
    """Apply all migrations then roll back to base, verifying no errors."""
    # Upgrade to latest
    _run_alembic("upgrade", "head")

    # Verify the tables exist
    from sqlalchemy import create_engine, inspect
    engine = create_engine(_db_url())
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "jobs" in tables, "jobs table should exist after migration"
    assert "songs" in tables, "songs table should exist after migration"
    assert "generated_music" in tables
    assert "style_vectors" in tables

    # Verify jobs table columns
    jobs_cols = {c["name"] for c in inspector.get_columns("jobs")}
    for col in ("id", "user_id", "kind", "status", "progress", "stage",
                "payload_json", "result_json", "error_message", "celery_task_id",
                "created_at", "updated_at"):
        assert col in jobs_cols, f"jobs table missing column: {col}"

    # Verify song columns added by the latest migration
    songs_cols = {c["name"] for c in inspector.get_columns("songs")}
    for col in ("raw_vocal_path", "converted_vocal_path", "svs_provider"):
        assert col in songs_cols, f"songs table missing column: {col}"

    engine.dispose()

    # Roll back all the way to the beginning
    _run_alembic("downgrade", "base")

    # Verify tables are gone
    engine = create_engine(_db_url())
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "jobs" not in tables, "jobs table should be dropped after full downgrade"
    engine.dispose()


def test_incremental_downgrade_re_apply():
    """Upgrade, downgrade one step, then upgrade again — validates non-linear safety."""
    _run_alembic("upgrade", "head")

    # Record the revision before downgrade
    from sqlalchemy import create_engine, text
    engine = create_engine(_db_url())
    with engine.connect() as conn:
        result = conn.execute(text("SELECT version_num FROM alembic_version"))
        before_downgrade = result.scalar()
    engine.dispose()

    # Downgrade one step
    _run_alembic("downgrade", "-1")

    engine = create_engine(_db_url())
    with engine.connect() as conn:
        result = conn.execute(text("SELECT version_num FROM alembic_version"))
        after_downgrade = result.scalar()
    engine.dispose()

    assert after_downgrade != before_downgrade, "Downgrade should change alembic_version"

    # Re-apply the latest
    _run_alembic("upgrade", "head")

    engine = create_engine(_db_url())
    with engine.connect() as conn:
        result = conn.execute(text("SELECT version_num FROM alembic_version"))
        re_upgraded = result.scalar()
    assert re_upgraded == before_downgrade, "Re-upgrade should return to head revision"
    engine.dispose()
