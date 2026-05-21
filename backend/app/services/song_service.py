from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.song import Song


def create_song(db: Session, user_id: int, theme: str,
                style_vector_id: int | None = None,
                voice_model_id: int | None = None,
                reference_audio_id: int | None = None) -> Song:
    song = Song(
        user_id=user_id,
        theme=theme,
        style_vector_id=style_vector_id,
        voice_model_id=voice_model_id,
        status="writing",
    )
    db.add(song)
    db.commit()
    db.refresh(song)
    return song


def get_song(db: Session, song_id: int, user_id: int) -> Song | None:
    return db.query(Song).filter(Song.id == song_id, Song.user_id == user_id).first()


def list_user_songs(db: Session, user_id: int) -> list[Song]:
    return db.query(Song).filter(Song.user_id == user_id).order_by(desc(Song.created_at)).all()


def update_song(db: Session, song_id: int, user_id: int, **kwargs) -> Song | None:
    song = get_song(db, song_id, user_id)
    if not song:
        return None
    for key, value in kwargs.items():
        if hasattr(song, key):
            setattr(song, key, value)
    db.commit()
    db.refresh(song)
    return song
