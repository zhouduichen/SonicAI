from sqlalchemy import Column, Integer, String, DateTime, func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=True)
    display_name = Column(String(80), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
