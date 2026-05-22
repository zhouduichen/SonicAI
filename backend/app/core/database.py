from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

# SQLite needs check_same_thread=False for FastAPI async usage
connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def _auto_migrate_sqlite():
    """Detect missing columns in SQLite tables and add them automatically.

    Called at startup before create_all, so that CREATE TABLE handles new
    tables while this function patches existing ones.  Only activates when
    the database URL is SQLite — production PostgreSQL deployments use
    Alembic migrations instead.
    """
    if "sqlite" not in settings.DATABASE_URL:
        return

    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if not table_names:
        return  # fresh database, nothing to migrate

    added_any = False
    for table in Base.metadata.sorted_tables:
        if table.name not in table_names:
            continue

        existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
        for col in table.columns:
            if col.name not in existing_cols:
                col_type = col.type.compile(engine.dialect)
                nullable = "" if col.nullable else " NOT NULL"
                default = ""
                if col.default and col.default.arg is not None:
                    default = f" DEFAULT {col.default.arg!r}"
                elif not col.nullable and col.server_default:
                    default = f" DEFAULT ({col.server_default.arg.text})" if hasattr(col.server_default.arg, "text") else ""
                sql = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}{nullable}{default}'
                logger.warning(f"Auto-migrating: {sql}")
                try:
                    with engine.connect() as conn:
                        conn.execute(text(sql))
                        conn.commit()
                    added_any = True
                except Exception as e:
                    logger.error(f"Auto-migration failed for {table.name}.{col.name}: {e}")

    if added_any:
        logger.info("Auto-migration complete — schema updated for new columns")


def get_db():
    """FastAPI dependency: yields a DB session and closes it after."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
