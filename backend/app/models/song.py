from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from app.core.database import Base


class Song(Base):
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    theme = Column(String(500), nullable=False)
    lyrics = Column(Text, default="")
    style_vector_id = Column(Integer, ForeignKey("style_vectors.id"), nullable=True)
    voice_model_id = Column(Integer, ForeignKey("voice_models.id"), nullable=True)
    instrumental_path = Column(String(512), default="")
    vocal_path = Column(String(512), default="")
    mixed_path = Column(String(512), default="")
    reference_vocal_path = Column(String(512), default="")
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, server_default=func.now())
