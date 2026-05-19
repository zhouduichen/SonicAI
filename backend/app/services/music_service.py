from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.style_vector import StyleVector
from app.models.generated_music import GeneratedMusic
from app.models.user import User


def create_music_record(
    db: Session,
    user: User,
    vector_id: int,
    prompt: str,
    title: str,
    file_path: str,
    duration_seconds: int,
) -> GeneratedMusic:
    music = GeneratedMusic(
        user_id=user.id,
        vector_id=vector_id,
        prompt=prompt,
        title=title,
        file_path=file_path,
        duration_seconds=duration_seconds,
    )
    db.add(music)
    db.commit()
    db.refresh(music)
    return music


def list_user_music(db: Session, user: User, limit: int = 50, offset: int = 0) -> list[dict]:
    """Return user's generated music with style name joined."""
    results = (
        db.query(GeneratedMusic, StyleVector.style_name)
        .join(StyleVector, GeneratedMusic.vector_id == StyleVector.id)
        .filter(GeneratedMusic.user_id == user.id)
        .order_by(GeneratedMusic.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        {
            "id": m.GeneratedMusic.id,
            "title": m.GeneratedMusic.title,
            "prompt": m.GeneratedMusic.prompt,
            "style_name": m.style_name,
            "file_path": m.GeneratedMusic.file_path,
            "duration_seconds": m.GeneratedMusic.duration_seconds,
            "music_gen_model": m.GeneratedMusic.music_gen_model,
            "created_at": m.GeneratedMusic.created_at,
        }
        for m in results
    ]
