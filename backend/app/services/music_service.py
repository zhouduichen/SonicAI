from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.style_vector import StyleVector
from app.models.generated_music import GeneratedMusic
from app.models.user import User


# Fallback style names for music without a style vector
_STYLE_FALLBACKS = {
    "blend": "混合生成",
    "batch": "批量生成",
}


def list_user_music(db: Session, user: User, limit: int = 50, offset: int = 0) -> list[dict]:
    """Return user's generated music with style name joined.

    Uses outer join so blend/batch results (vector_id=None) still appear.
    """
    results = (
        db.query(GeneratedMusic, StyleVector.style_name)
        .outerjoin(StyleVector, GeneratedMusic.vector_id == StyleVector.id)
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
            "style_name": (
                m.style_name
                or _STYLE_FALLBACKS.get(m.GeneratedMusic.provider_mode, "AI 生成")
            ),
            "file_path": m.GeneratedMusic.file_path,
            "duration_seconds": m.GeneratedMusic.duration_seconds,
            "music_gen_model": m.GeneratedMusic.music_gen_model,
            "provider_mode": m.GeneratedMusic.provider_mode or "mock",
            "created_at": m.GeneratedMusic.created_at,
        }
        for m in results
    ]
