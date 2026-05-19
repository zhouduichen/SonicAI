# SonicAI - AI 音乐生成引擎

上传音频 → 提取风格向量 → 输入文字描述 → AI 生成原创音乐

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Next.js 14 (App Router) + Tailwind CSS + Framer Motion |
| 后端 | FastAPI + SQLAlchemy + Celery + Redis |
| 数据库 | SQLite (开发) / PostgreSQL (生产) |
| AI 模型 | Demucs (人声分离) + CLAP (风格向量) + MusicGen (音乐生成) |

## 快速开始

### 1. 前置依赖

- **Node.js 18+** 
- **Python 3.10+**
- **Redis** — 任选一种方式：
  - Docker Desktop → `docker compose up -d`（项目已包含 docker-compose.yml）
  - 或 Windows 原生 Redis：`winget install Redis`

### 2. 安装依赖

```bash
# 前端
cd frontend
npm install

# 后端
cd backend
pip install -r requirements.txt
```

### 3. 启动服务（需要 4 个终端窗口）

**终端 1 — 启动 Redis**
```bash
docker compose up -d
```

**终端 2 — 启动后端 API**
```bash
cd backend
uvicorn app.main:app --reload --port 8000
# API 文档: http://localhost:8000/docs
```

**终端 3 — 启动 Celery Worker**
```bash
cd backend
celery -A app.tasks.celery_app worker -l info -P solo
```

**终端 4 — 启动前端**
```bash
cd frontend
npm run dev
# 打开: http://localhost:3000
```

### 4. 默认账号

| 用户名 | 密码 |
|--------|------|
| admin | admin123 |

### 5. 仅预览前端（不需要后端/Redis）

```bash
cd frontend
npm run dev
```

前端内置了 Mock 数据，可以直接看到 UI 效果。

## 项目结构

```
aimusic/
├── frontend/                    # Next.js 前端
│   └── src/
│       ├── app/                 # 页面路由 + 布局
│       └── components/          # UI 组件
│           ├── Sidebar.tsx      # 导航侧边栏
│           ├── Dropzone.tsx     # 拖拽上传
│           ├── StyleLibrary.tsx # 风格库
│           ├── GenerationConsole.tsx # 创作控制台
│           ├── MusicPlayer.tsx  # 音频播放器
│           └── Playlist.tsx     # 生成记录
├── backend/                     # FastAPI 后端
│   └── app/
│       ├── core/                # 配置、数据库、JWT
│       ├── models/              # SQLAlchemy ORM
│       ├── schemas/             # Pydantic 模型
│       ├── services/            # 业务逻辑
│       ├── tasks/               # Celery 异步任务
│       ├── api/v1/              # REST API 路由
│       └── utils/               # 工具函数
├── docker-compose.yml           # Redis 容器
└── README.md
```

## API 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/v1/auth/login` | 登录获取 Token | 否 |
| POST | `/api/v1/audio/upload` | 上传音频 | JWT |
| GET | `/api/v1/audio/status/{task_id}` | 查询处理进度 | JWT |
| POST | `/api/v1/music/generate` | 生成音乐 | JWT |
| GET | `/api/v1/music/list` | 历史生成列表 | JWT |

## AI 模型接入

当前音频处理管线为 Mock 模式（可立即运行）。要接入真实模型：

```bash
pip install demucs laion-clap audiocraft
```

然后修改 `backend/app/tasks/audio_pipeline.py` 中的三个函数：

- `separate_vocals()` → 调用 `demucs.separate.main()`
- `extract_style_embedding()` → 调用 `laion_clap.CLAP_Module()`
- `generate_music()` → 调用 `audiocraft.models.MusicGen`

模型按需加载策略（适配 RTX 5080 16GB 显存）：
1. 加载 Demucs → 分离人声 → 卸载
2. 加载 CLAP → 提取向量 → 卸载
3. 加载 MusicGen → 生成音乐 → 卸载

## License

MIT
