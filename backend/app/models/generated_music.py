from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from app.core.database import Base


class GeneratedMusic(Base):
    __tablename__ = "generated_music"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    vector_id = Column(Integer, ForeignKey("style_vectors.id"), nullable=True)
    prompt = Column(Text, nullable=False)
    title = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    duration_seconds = Column(Integer, default=0)
    music_gen_model = Column(String(50), default="musicgen_small", nullable=False)
    provider_mode = Column(String(16), default="mock")
    created_at = Column(DateTime, server_default=func.now())
