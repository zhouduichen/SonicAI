from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from app.core.database import Base


class AudioAsset(Base):
    __tablename__ = "audio_assets"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    status = Column(String(20), default="processing")  # processing, completed, failed
    vocal_sep_model = Column(String(50), default="demucs_htdemucs", nullable=False)
    created_at = Column(DateTime, server_default=func.now())
