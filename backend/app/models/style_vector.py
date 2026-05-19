from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from app.core.database import Base


class StyleVector(Base):
    __tablename__ = "style_vectors"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    asset_id = Column(Integer, ForeignKey("audio_assets.id"), nullable=False, unique=True)
    style_name = Column(String(255), nullable=False)
    embedding = Column(Text)  # JSON string of float array (512-dims)
    style_extract_model = Column(String(50), default="clap_laion", nullable=False)
    created_at = Column(DateTime, server_default=func.now())
