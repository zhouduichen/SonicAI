# AI Music Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the FastAPI backend for SonicAI music generation SaaS — user auth, audio upload with async processing, and music generation API.

**Architecture:** FastAPI REST API with SQLAlchemy ORM (SQLite → PostgreSQL), Celery + Redis for async audio pipeline, JWT-based auth. Sequential model loading (Demucs → CLAP → MusicGen) in a single Celery worker for RTX 5080 16GB VRAM.

**Tech Stack:** FastAPI, SQLAlchemy, Celery, Redis, SQLite, Alembic, PyJWT, python-multipart

---

## File Map

```
backend/
├── app/
│   ├── main.py               # FastAPI app, CORS, router includes
│   ├── core/
│   │   ├── config.py         # Pydantic Settings from env
│   │   ├── database.py       # engine, SessionLocal, Base
│   │   ├── security.py       # JWT token create/verify
│   │   └── deps.py           # get_db, get_current_user
│   ├── models/
│   │   ├── user.py           # User model
│   │   ├── audio_asset.py    # AudioAsset model
│   │   ├── style_vector.py   # StyleVector model
│   │   └── generated_music.py # GeneratedMusic model
│   ├── schemas/
│   │   ├── auth.py           # LoginRequest, TokenResponse
│   │   ├── audio.py          # UploadResponse, StatusResponse
│   │   └── music.py          # GenerateRequest, MusicResponse
│   ├── services/
│   │   ├── auth_service.py   # authenticate_user, create_user
│   │   ├── audio_service.py  # save_upload, create_asset
│   │   └── music_service.py  # create_generation_task
│   ├── tasks/
│   │   ├── celery_app.py     # Celery instance config
│   │   └── audio_pipeline.py # Celery chain: separate → extract → generate
│   ├── api/v1/
│   │   ├── auth.py           # POST /login
│   │   ├── audio.py          # POST /upload, GET /status/{id}
│   │   └── music.py          # GET /list, POST /generate
│   └── utils/
│       └── file_utils.py     # save_uploaded_file, validate_audio
├── requirements.txt
├── alembic.ini
└── .env.example
```
