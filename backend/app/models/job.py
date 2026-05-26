from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from app.core.database import Base


class Job(Base):
    """Persistent task job table — survives process restarts, not tied to Celery task id."""

    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(String(32), nullable=False)
    status = Column(String(16), nullable=False, default="queued")
    progress = Column(Integer, default=0)
    stage = Column(String(32), nullable=True)
    payload_json = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    celery_task_id = Column(String(64), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    # Allowed values for kind:
    #   audio_upload, music_generation, voice_training, song_creation, svs_generation
    # Allowed values for status:
    #   queued, running, completed, failed, cancelled
