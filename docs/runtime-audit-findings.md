# Runtime Audit Findings

## Summary

当前项目主要阻塞不是单点崩溃，而是三层问题叠加：

1. 观测失效：前端 mock、demo token、模型 loaded 假象掩盖真实失败。
2. 执行不可靠：Celery `.delay()` 误判 worker 可用，`resource_manager` 无锁。
3. 入口分裂：轻量框架入口和完整产品入口共存，容易跑错。

## Priority Fix Order

1. 移除或显式标记前端 mock/demo fallback。
2. 修正 music/song/batch 的 Celery worker 仲裁逻辑。
3. 给 `resource_manager.acquire()` / `release_all()` 加锁。
4. 统一 README 中的启动入口说明。
5. 为模型加载失败增加 hard-fail 或明确 degraded 状态。

## Known Failure Modes

### P0: Demo token hides auth failure

相关文件：

- `frontend/src/lib/auth.ts`
- `frontend/src/lib/api.ts`

现象：后端不可达时生成本地假 token，后端恢复后继续 401。

### P0: Mock data hides empty or failed backend state

相关文件：

- `frontend/src/lib/use-audio-assets.ts`
- `frontend/src/lib/use-music-generation.ts`
- `frontend/src/lib/use-voice-models.ts`
- `frontend/src/lib/use-songs.ts`

现象：真实数据库为空或 API 失败时，UI 显示 mock 数据，后续操作使用不存在的 ID。

### P1: Celery `.delay()` does not prove worker availability

相关文件：

- `backend/app/api/v1/music.py`
- `backend/app/api/v1/song.py`

现象：Redis 可写但 worker 未消费，任务长期 queued/running。

### P1: Global resource manager is not thread-safe

相关文件：

- `backend/app/models/providers/resource_manager.py`

现象：并发模型加载/释放可能互相抢占 GPU 或卸载正在使用的模型。

### P1: Model load failure marked as loaded

相关文件：

- `backend/app/models/providers/local_clap.py`
- `backend/app/models/providers/local_musicgen.py`

现象：模型加载失败后仍进入 mock 或延迟失败，用户难以判断真实状态。

### P2: Entry point split

相关文件：

- `main.py`
- `start_all.py`
- `backend/app/main.py`

现象：`python main.py` 只跑轻量框架，不启动完整产品。

## Fix Log

- 2026-05-29: Document created from runtime audit.
- 2026-05-29: **P0 fixes** — `auth.ts`: removed `btoa()` demo token generation, throws on backend unreachable. `use-audio-assets.ts`, `use-music-generation.ts`, `use-voice-models.ts`, `use-songs.ts`: removed mock data fallback, keep empty state on API failure.
- 2026-05-29: **P1.1 Celery worker check** — Added `_celery_worker_available()` (uses `celery_app.control.inspect(timeout=2).stats()`) to `music.py` and `song.py`. Auto mode now checks worker liveness before `.delay()`, falling back to sync on `_celery_worker_available()` returning false or `.delay()` raising.
- 2026-05-29: **P1.2 Thread-safe resource_manager** — Added `threading.Lock` to `ResourceManager.__init__()`. `acquire()` and `release_all()` guard GPU model operations with `self._lock`.
- 2026-05-29: **P1.3 CLAP load failure masking** — `local_clap.py`: restructured `load()` to set `self._loaded = True` only on successful model load, `self._loaded = False` on failure. `local_musicgen.py`: already correct (exception path sets `_loaded = False`, `else` branch for mock mode is a legitimate configuration, not a load failure).
