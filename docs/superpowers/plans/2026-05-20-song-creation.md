# Song Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete song creation pipeline: user inputs a theme → LLM generates lyrics → MusicGen creates instrumental → RVC synthesizes vocals → ffmpeg mixes into a final song.

**Architecture:** New Song ORM model, 4 REST endpoints, Celery pipeline (write→arrange→sing→mix), new SongCreator frontend component. Reuses existing LLM provider chain for lyrics and MusicGen/RVC for audio generation.

**Tech Stack:** FastAPI + SQLAlchemy + Celery + ffmpeg-python + React/Next.js + Framer Motion

---

## File Map

```
backend/
├── app/
│   ├── main.py                          # Modify: register song router
│   ├── models/
│   │   ├── __init__.py                  # Modify: export Song
│   │   └── song.py                      # Create: Song ORM
│   ├── schemas/
│   │   └── song.py                      # Create: song Pydantic schemas
│   ├── services/
│   │   └── song_service.py              # Create: song CRUD
│   ├── tasks/
│   │   └── song_pipeline.py             # Create: write→arrange→sing→mix chain
│   └── api/v1/
│       └── song.py                      # Create: /song/* endpoints

frontend/
├── src/
│   ├── types/
│   │   └── index.ts                     # Modify: add Song type
│   ├── components/
│   │   ├── Sidebar.tsx                  # Modify: add SONG nav item
│   │   └── SongCreator.tsx             # Create: main song creation UI
│   └── app/create/
│       └── page.tsx                     # Modify: add song tab
```

---

### Task 1: Song ORM model

**Files:**
- Create: `backend/app/models/song.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Create Song model**

```python
# backend/app/models/song.py
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
    status = Column(String(20), default="pending")  # writing→arranging→singing→mixing→completed→failed
    created_at = Column(DateTime, server_default=func.now())
```

- [ ] **Step 2: Register in __init__.py**

```python
# backend/app/models/__init__.py — add Song to imports
from app.models.song import Song
# Add "Song" to __all__
```

- [ ] **Step 3: Commit**

---

### Task 2: Song Pydantic schemas

**Files:**
- Create: `backend/app/schemas/song.py`

- [ ] **Step 1: Create song schemas**

```python
# backend/app/schemas/song.py
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class SongCreateRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    theme: str
    style_vector_id: Optional[int] = None
    voice_model_id: Optional[int] = None
    reference_audio_id: Optional[int] = None  # user-uploaded reference singing


class SongCreateResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    song_id: int
    status: str = "writing"


class SongStatusResponse(BaseModel):
    id: int
    theme: str
    status: str
    lyrics: str
    instrumental_path: str
    vocal_path: str
    mixed_path: str
    created_at: datetime

    class Config:
        from_attributes = True


class SongListResponse(BaseModel):
    items: list[SongStatusResponse]
    total: int
```

- [ ] **Step 2: Commit**

---

### Task 3: Song service (CRUD)

**Files:**
- Create: `backend/app/services/song_service.py`

- [ ] **Step 1: Create song service**

```python
# backend/app/services/song_service.py
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
```

- [ ] **Step 2: Commit**

---

### Task 4: Song creation pipeline (Celery task)

**Files:**
- Create: `backend/app/tasks/song_pipeline.py`

- [ ] **Step 1: Create song pipeline**

```python
# backend/app/tasks/song_pipeline.py
"""Celery task for full song creation: lyrics → instrumental → vocals → mix."""

import os
import json
import logging
import shutil
import ffmpeg
from app.tasks.celery_app import celery_app
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

LYRICS_PROMPT = """你是一个专业的歌词创作助手。根据用户提供的主题，创作一首中文歌词。

要求：
- 包含主歌（Verse）×2、副歌（Chorus）×2、桥段（Bridge）×1
- 每段4-6行
- 押韵、有韵律感
- 用【主歌1】【主歌2】【副歌】【桥段】【副歌（重复）】标记段落

主题：{theme}

只返回歌词，不要额外解释。"""

FALLBACK_LYRICS = """【主歌1】
那一刻的风吹过你的脸庞
我站在街角看夕阳渐渐落下
不知道未来的路会通向何方
但此刻只想把这首歌唱给你听

【主歌2】
回忆像电影在脑海里回放
每一个画面都那么清晰又温暖
时间过得再快也带不走思念
就让我用音乐来诉说这份情感

【副歌】
这是我的歌 唱出心中的声音
每一个音符都是对你的心意
这是我们的歌 不管过了多少年
旋律响起的时候 我们依然在一起

【副歌（重复）】
这是我的歌 唱出心中的声音
每一个音符都是对你的心意
这是我们的歌 不管过了多少年
旋律响起的时候 我们依然在一起"""


def _generate_lyrics(theme: str) -> str:
    """Generate lyrics via LLM provider chain."""
    from app.models.providers.prompt_registry import generate_suggestions

    # Repurpose the existing suggestion pipeline for lyrics generation
    # Try Ollama/OpenAI with lyrics-specific prompt; fall back to FALLBACK_LYRICS
    try:
        settings_obj = get_settings()
        if settings_obj.OPENAI_API_KEY:
            import httpx
            url = f"{settings_obj.OPENAI_BASE_URL}/v1/chat/completions"
            resp = httpx.post(url, json={
                "model": settings_obj.OPENAI_MODEL,
                "messages": [
                    {"role": "system", "content": "你是一个专业的歌词创作助手，直接输出歌词，不要额外解释。"},
                    {"role": "user", "content": LYRICS_PROMPT.format(theme=theme)},
                ],
                "temperature": 0.9, "max_tokens": 800,
            }, headers={"Authorization": f"Bearer {settings_obj.OPENAI_API_KEY}"}, timeout=60)
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                if content.strip():
                    return content.strip()
    except Exception as e:
        logger.warning(f"LLM lyrics failed: {e}")

    # Try Ollama
    try:
        from app.models.providers.ollama_prompt import OllamaPromptProvider
        provider = OllamaPromptProvider(
            host=settings.OLLAMA_HOST,
            model=settings.OLLAMA_MODEL,
            timeout=60,
        )
        result = provider.generate_suggestions(LYRICS_PROMPT.format(theme=theme))
        if result:
            return "\n".join(result)
    except Exception as e:
        logger.warning(f"Ollama lyrics failed: {e}")

    return FALLBACK_LYRICS


def _mix_audio(instrumental_path: str, vocal_path: str, output_path: str):
    """Mix instrumental and vocal into a single audio file."""
    instrumental = ffmpeg.input(instrumental_path)
    vocal = ffmpeg.input(vocal_path)
    mixed = ffmpeg.filter([instrumental, vocal], 'amix', inputs=2, duration='longest', weights='0.4 0.6')
    ffmpeg.output(mixed, output_path).run(overwrite_output=True, quiet=True)
    logger.info(f"Mixed audio: {output_path}")


@celery_app.task(bind=True, name="create_song")
def create_song(self, song_id: int, theme: str,
                voice_model_id: int | None = None,
                style_vector_id: int | None = None,
                reference_audio_path: str | None = None):
    """Full song creation pipeline."""
    from app.core.database import SessionLocal
    from app.models.song import Song
    from app.models.voice_model import VoiceModel
    from app.models.style_vector import StyleVector
    from app.tasks.audio_pipeline import _generate_music
    from app.tasks.voice_pipeline import _rvc_infer

    task_id = self.request.id
    logger.info(f"create_song: song_id={song_id} theme={theme}")

    output_dir = os.path.join(settings.GENERATED_DIR, "songs", str(song_id))
    os.makedirs(output_dir, exist_ok=True)

    try:
        db = SessionLocal()
        try:
            song = db.query(Song).filter(Song.id == song_id).first()
            if not song:
                return {"stage": "failed", "reason": "song not found"}

            # Step 1: Generate lyrics
            song.status = "writing"
            db.commit()
            lyrics = _generate_lyrics(theme)
            song.lyrics = lyrics
            db.commit()

            # Step 2: Generate instrumental (MusicGen)
            song.status = "arranging"
            db.commit()
            # Build music prompt from lyrics + theme
            music_prompt = f"一首关于{theme}的流行歌曲伴奏，情绪饱满，旋律优美"
            embedding = []
            if style_vector_id:
                sv = db.query(StyleVector).filter(StyleVector.id == style_vector_id).first()
                if sv:
                    embedding = json.loads(sv.embedding)

            instrumental_path = os.path.join(output_dir, "instrumental.wav")
            if embedding:
                result = _generate_music(embedding, music_prompt, task_id=task_id)
                if os.path.exists(result.get("file_path", "")):
                    shutil.copy(result["file_path"], instrumental_path)
            else:
                # Without style embedding, MusicGen will use only text prompt
                result = _generate_music([0.0] * 512, music_prompt, task_id=task_id)
                if os.path.exists(result.get("file_path", "")):
                    shutil.copy(result["file_path"], instrumental_path)

            song.instrumental_path = instrumental_path
            db.commit()

            # Step 3: Generate vocals (RVC)
            song.status = "singing"
            db.commit()
            vocal_path = os.path.join(output_dir, "vocals.wav")

            if voice_model_id:
                model = db.query(VoiceModel).filter(VoiceModel.id == voice_model_id).first()
                if model and model.status == "ready":
                    ref_audio = reference_audio_path or instrumental_path
                    try:
                        _rvc_infer(
                            model_path=model.checkpoint_path,
                            config_path=model.config_path,
                            reference_audio=ref_audio,
                            output_path=vocal_path,
                        )
                        song.vocal_path = vocal_path
                    except Exception as e:
                        logger.warning(f"RVC inference failed: {e}, using instrumental as vocal placeholder")
                        shutil.copy(instrumental_path, vocal_path)
                        song.vocal_path = vocal_path
                else:
                    # No ready voice model — use instrumental as vocal placeholder
                    shutil.copy(instrumental_path, vocal_path)
                    song.vocal_path = vocal_path
            else:
                shutil.copy(instrumental_path, vocal_path)
                song.vocal_path = vocal_path
            db.commit()

            # Step 4: Mix
            song.status = "mixing"
            db.commit()
            mixed_path = os.path.join(output_dir, "mixed.wav")
            _mix_audio(instrumental_path, vocal_path, mixed_path)
            song.mixed_path = mixed_path
            song.status = "completed"
            db.commit()

            return {"stage": "completed", "song_id": song_id, "mixed_path": mixed_path}
        finally:
            db.close()
    except Exception as e:
        db = SessionLocal()
        try:
            song = db.query(Song).filter(Song.id == song_id).first()
            if song:
                song.status = "failed"
                db.commit()
        finally:
            db.close()
        logger.error(f"Song creation failed: {e}")
        raise
```

- [ ] **Step 2: Commit**

---

### Task 5: Song API routes

**Files:**
- Create: `backend/app/api/v1/song.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create song router**

```python
# backend/app/api/v1/song.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.deps import get_db, get_current_user
from app.models.user import User
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

    create_song.delay(
        song_id=song.id,
        theme=request.theme,
        voice_model_id=request.voice_model_id,
        style_vector_id=request.style_vector_id,
        reference_audio_path=None,  # resolved in the task if needed
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
    return FileResponse(song.mixed_path, media_type="audio/wav",
                        filename=f"song_{song_id}.wav")

import os
```

- [ ] **Step 2: Register in main.py**

```python
# In backend/app/main.py:
from app.api.v1 import song
app.include_router(song.router, prefix="/api/v1")
```

- [ ] **Step 3: Commit**

---

### Task 6: Frontend — Song type + Sidebar

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Add Song type**

```typescript
// frontend/src/types/index.ts — append
export interface Song {
  id: string;
  theme: string;
  status: "writing" | "arranging" | "singing" | "mixing" | "completed" | "failed";
  lyrics: string;
  instrumentalPath: string;
  vocalPath: string;
  mixedPath: string;
  createdAt: string;
}
```

- [ ] **Step 2: Add SONG nav item**

```typescript
// In Sidebar.tsx navItems array, after voice entry:
{ id: "song", label: "SONG", sub: "歌曲创作", icon: MusicNotes },
```

Import `MusicNotes` already exists in Sidebar imports.

- [ ] **Step 3: Commit**

---

### Task 7: Frontend — SongCreator component

**Files:**
- Create: `frontend/src/components/SongCreator.tsx`

- [ ] **Step 1: Create SongCreator component**

```tsx
"use client";

import { useState, useEffect } from "react";
import { MusicNotes, Spinner } from "@phosphor-icons/react";
import type { Song, VoiceModel } from "@/types";

interface SongCreatorProps {
  voiceModels: VoiceModel[];
  onSongCreated: (song: Song) => void;
}

const STEP_LABELS: Record<string, string> = {
  writing: "写词中...",
  arranging: "编曲中...",
  singing: "人声中...",
  mixing: "混音中...",
  completed: "完成",
  failed: "失败",
};

export default function SongCreator({ voiceModels, onSongCreated }: SongCreatorProps) {
  const [theme, setTheme] = useState("");
  const [voiceModelId, setVoiceModelId] = useState("");
  const [creating, setCreating] = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);

  const handleCreate = async () => {
    if (!theme.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/song/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("sonicai_token") || ""}`,
        },
        body: JSON.stringify({
          theme: theme.trim(),
          voice_model_id: voiceModelId ? Number(voiceModelId) : null,
        }),
      });
      if (!res.ok) throw new Error("Creation failed");
      const { song_id } = await res.json();
      // Poll for status
      const interval = setInterval(async () => {
        const sr = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/song/status/${song_id}`);
        if (!sr.ok) return;
        const song: Song = await sr.json();
        setCurrentSong(song);
        if (song.status === "completed" || song.status === "failed") {
          clearInterval(interval);
          setCreating(false);
          if (song.status === "completed") onSongCreated(song);
        }
      }, 2000);
    } catch {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Input section */}
      <div className="card-outer">
        <div className="card-inner p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="eyebrow">创作</span>
            <h3 className="text-lg italic font-medium"
              style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
              歌曲创作
            </h3>
          </div>

          <div>
            <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
              歌曲主题
            </p>
            <textarea
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="例如：关于夏天的离别、对未来的期待..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm resize-none"
              style={{
                background: "var(--bg-primary)", border: "1px solid var(--border-color)",
                color: "var(--text-primary)", outline: "none",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            />
          </div>

          <div>
            <p className="text-[10px] font-mono tracking-[0.1em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
              声音模型（可选）
            </p>
            <select
              value={voiceModelId}
              onChange={(e) => setVoiceModelId(e.target.value)}
              className="settings-select"
              style={{ padding: "8px 36px 8px 12px", fontSize: "0.8125rem" }}
            >
              <option value="">纯器乐（没有人声）...</option>
              {voiceModels.filter(m => m.status === "ready").map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleCreate}
            disabled={!theme.trim() || creating}
            className="btn-primary w-full text-sm"
          >
            <span className="flex items-center justify-center gap-2">
              {creating ? <Spinner size={16} className="animate-spin" /> : <MusicNotes size={16} />}
              {creating ? "创作中..." : "开始创作"}
            </span>
          </button>
        </div>
      </div>

      {/* Progress & Results */}
      {currentSong && (
        <div className="card-outer">
          <div className="card-inner p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="eyebrow">{STEP_LABELS[currentSong.status] || currentSong.status}</span>
            </div>

            {/* Lyrics */}
            {currentSong.lyrics && (
              <div className="space-y-2">
                <p className="text-[10px] font-mono tracking-[0.1em]" style={{ color: "var(--text-tertiary)" }}>
                  歌词
                </p>
                <div className="p-4 rounded-xl text-sm leading-relaxed whitespace-pre-line"
                  style={{ background: "var(--bg-primary)", color: "var(--text-secondary)",
                    fontFamily: "'Plus Jakarta Sans', sans-serif", border: "1px solid var(--border-color)" }}>
                  {currentSong.lyrics}
                </div>
              </div>
            )}

            {/* Status */}
            {currentSong.status !== "completed" && currentSong.status !== "failed" && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {STEP_LABELS[currentSong.status]}
                </span>
              </div>
            )}

            {/* Complete */}
            {currentSong.status === "completed" && (
              <div>
                <p className="text-sm" style={{ color: "#22c55e" }}>创作完成!</p>
                {currentSong.mixedPath && (
                  <audio controls className="w-full mt-3" src={currentSong.mixedPath} />
                )}
              </div>
            )}

            {/* Failed */}
            {currentSong.status === "failed" && (
              <p className="text-sm" style={{ color: "#ef4444" }}>创作失败，请重试</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

---

### Task 8: Frontend — page.tsx integration

**Files:**
- Modify: `frontend/src/app/create/page.tsx`

- [ ] **Step 1: Import + state + tab**

Add import:
```typescript
import SongCreator from "@/components/SongCreator";
import type { Song } from "@/types";
```

Add state (after voice models section):
```typescript
const [songs, setSongs] = useState<Song[]>([]);
```

Add SONG tab (after VOICE tab block):
```tsx
{activeTab === "song" && (
  <motion.div key="song" animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="max-w-2xl">
    <SongCreator
      voiceModels={voiceModels}
      onSongCreated={(song) => setSongs((prev) => [song, ...prev])}
    />
  </motion.div>
)}
```

Add "song" to the header eyebrow/h2 ternary (after "voice" entries).

- [ ] **Step 2: Commit**

---

### Task 9: Verification

- [ ] **Step 1: Start services**

```bash
# Terminal 1: Redis
D:\aimusic\redis\redis-server.exe

# Terminal 2: Backend
cd D:\aimusic\backend && uvicorn app.main:app --reload --port 8000

# Terminal 3: Frontend
cd D:\aimusic\frontend && npm run dev
```

- [ ] **Step 2: Test API**

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Create song
curl -s -X POST http://localhost:8000/api/v1/song/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"theme":"关于夏天的离别"}' | python -m json.tool

# Check list
curl -s http://localhost:8000/api/v1/song/list \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

- [ ] **Step 3: Open frontend**

1. `http://localhost:3000/create`
2. Click "SONG · 歌曲创作" in sidebar
3. Enter a theme → click "开始创作"
4. Verify lyrics appear, progress shows, audio player appears on completion

- [ ] **Step 4: Commit final fixes**
