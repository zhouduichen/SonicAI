import os
import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.user import User
from app.core.security import hash_password, verify_password, create_access_token
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def authenticate_user(db: Session, username: str, password: str) -> dict:
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )

    token = create_access_token(data={"sub": str(user.id), "username": user.username})
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.username,
    }


def register_user(
    db: Session,
    username: str,
    password: str,
    email: str | None = None,
    display_name: str | None = None,
) -> dict:
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="用户名已存在",
        )

    if email:
        existing_email = db.query(User).filter(User.email == email).first()
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="邮箱已被注册",
            )

    user = User(
        username=username,
        email=email,
        display_name=display_name or username,
        hashed_password=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(data={"sub": str(user.id), "username": user.username})
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.username,
    }


def create_default_user(db: Session) -> User | None:
    """Create a default admin user on first run.

    In DEBUG=True (dev): creates admin/admin123 unless DEFAULT_ADMIN_PASSWORD is set.
    In production: only creates if DEFAULT_ADMIN_PASSWORD is explicitly configured.
    Returns None when the admin user is intentionally skipped.
    """
    user = db.query(User).filter(User.username == "admin").first()
    if user:
        return user

    if not settings.DEBUG and not settings.DEFAULT_ADMIN_PASSWORD:
        logger.info("Production mode: no DEFAULT_ADMIN_PASSWORD set, skipping default admin")
        return None

    # Dev: use env var or fallback admin123. Production: env var is required.
    default_password = settings.DEFAULT_ADMIN_PASSWORD or "admin123"
    if not settings.DEBUG:
        logger.info("Creating default admin from DEFAULT_ADMIN_PASSWORD")
    else:
        logger.info(f"Creating default admin (password={'<env>' if settings.DEFAULT_ADMIN_PASSWORD else 'admin123'})")

    user = User(
        username="admin",
        email="admin@sonicai.local",
        display_name="管理员",
        hashed_password=hash_password(default_password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
