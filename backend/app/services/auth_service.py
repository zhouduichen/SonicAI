import os
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.user import User
from app.core.security import hash_password, verify_password, create_access_token


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


def create_default_user(db: Session) -> User:
    """Create a default user for MVP if none exists."""
    user = db.query(User).filter(User.username == "admin").first()
    if user:
        return user

    default_password = os.environ.get("DEFAULT_ADMIN_PASSWORD", "admin123")
    user = User(
        username="admin",
        hashed_password=hash_password(default_password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
