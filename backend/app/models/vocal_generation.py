from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func
from app.core.database import Base


class VocalGeneration(Base):
    __tablename__ = "vocal_generations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    voice_model_id = Column(Integer, ForeignKey("voice_models.id"), nullable=False)
    reference_audio_id = Column(Integer, ForeignKey("audio_assets.id"), nullable=True)
    output_path = Column(String(512), nullable=True)
    status = Column(String(20), default="pending")  # pending, processing, completed, failed
    duration_seconds = Column(Float, default=0.0)
    created_at = Column(DateTime, server_default=func.now())
