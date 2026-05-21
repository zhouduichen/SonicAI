import json
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func
from app.core.database import Base


class VoiceModel(Base):
    __tablename__ = "voice_models"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    source_audio_ids = Column(String(1024), default="[]")  # JSON array of int IDs
    checkpoint_path = Column(String(512), nullable=True)
    config_path = Column(String(512), nullable=True)
    status = Column(String(20), default="pending")  # pending, preprocessing, training, ready, failed
    epoch = Column(Integer, default=0)
    quality_tier = Column(String(20), default="preview")  # preview, standard, premium
    duration_seconds = Column(Float, default=0.0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    @property
    def source_ids(self) -> list[int]:
        try:
            return json.loads(self.source_audio_ids or "[]")
        except (json.JSONDecodeError, TypeError):
            return []

    @source_ids.setter
    def source_ids(self, ids: list[int]) -> None:
        self.source_audio_ids = json.dumps(ids)
