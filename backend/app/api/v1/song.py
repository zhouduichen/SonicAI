import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models import GeneratedMusic, AudioAsset
from app.schemas.song import (
    SongCreateRequest, SongCreateResponse,
    SongStatusResponse, SongListResponse,
)
from app.services import song_service
from app.tasks.song_pipeline import create_song

router = APIRouter(prefix="/song", tags=["song"])


@router.post("/create", response_model=SongCreateResponse)
def create(request: SongCreateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    song = song_service.create_song(
        db, user.id, request.theme,
        style_vector_id=request.style_vector_id,
        voice_model_id=request.voice_model_id,
        reference_audio_id=request.reference_audio_id,
    )

    reference_audio_path = None
    if request.reference_audio_id:
        gm = db.query(GeneratedMusic).filter(
            GeneratedMusic.id == request.reference_audio_id,
            GeneratedMusic.user_id == user.id,
        ).first()
        if gm:
            reference_audio_path = gm.file_path
        else:
            asset = db.query(AudioAsset).filter(
                AudioAsset.id == request.reference_audio_id,
                AudioAsset.user_id == user.id,
            ).first()
            if asset:
                reference_audio_path = asset.file_path
        if reference_audio_path:
            song_service.update_song(db, song.id, user.id, reference_vocal_path=reference_audio_path)

    create_song.delay(
        song_id=song.id,
        theme=request.theme,
        voice_model_id=request.voice_model_id,
        style_vector_id=request.style_vector_id,
        reference_audio_path=reference_audio_path,
    )
    return SongCreateResponse(song_id=song.id)


@router.get("/list", response_model=SongListResponse)
def list_songs(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = song_service.list_user_songs(db, user.id)
    return SongListResponse(
        items=[SongStatusResponse.model_validate(s) for s in items],
        total=len(items),
    )


@router.get("/status/{song_id}", response_model=SongStatusResponse)
def get_status(song_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    song = song_service.get_song(db, song_id, user.id)
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")
    return SongStatusResponse.model_validate(song)


@router.get("/{song_id}/download")
def download(song_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    song = song_service.get_song(db, song_id, user.id)
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")
    if not song.mixed_path or not os.path.exists(song.mixed_path):
        raise HTTPException(status_code=404, detail="歌曲文件尚未生成")
    return FileResponse(song.mixed_path, media_type="audio/wav", filename=f"song_{song_id}.wav")
