# SonicAI — AI 音乐创作引擎

上传音频 → AI 分离人声提取风格 → 输入文字描述 → AI 生成原创音乐

## 快速开始

### 前置条件

- Python 3.10+（推荐 3.12）
- Node.js 18+
- **ffmpeg**（RVC 声音训练需要，音频处理也需要）
- （可选）Redis — 仅 Celery 异步模式需要，默认同步模式不需要

### 安装 ffmpeg

```bash
# Windows (winget)
winget install -e --id Gyan.FFmpeg

# macOS
brew install ffmpeg

# Linux
sudo apt install ffmpeg
```

### 启动

```bash
# 1. 安装依赖
cd frontend && npm install
cd ../backend && pip install -r requirements.txt

# 2. 启动后端
cd backend
# Windows: 确保 ffmpeg 在 PATH 中
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 3. 启动前端
cd frontend
# Mac/Linux:
npm run dev
# Windows (Git Bash 有 npx 引号 bug):
npm run dev:win
# 或直接: node node_modules/next/dist/bin/next dev -p 3000
```

打开 http://localhost:3000，默认账号 `admin / admin123`。

> **注意：** 不需要 Redis 和 Celery。所有处理默认使用同步模式，直接在请求中完成。声音训练在后台线程中运行。

## 当前 AI 模型状态

| 模型 | 状态 | 说明 |
|------|------|------|
| **Demucs** (人声分离) | ✅ 真实 GPU 推理 | RTX 5080，~0.5s/首 |
| **CLAP** (风格提取) | ✅ 真实 GPU 推理 | 630k-audioset 模型，~8s/首 |
| **MusicGen** (音乐生成) | ⚠️ Mock | audiocraft 不兼容 PyTorch 2.12 nightly |
| **RVC** (声音训练) | ✅ 真实 GPU | HuggingFace transformers 替代 fairseq，Windows 可用 |

### 技术说明

- **PyTorch 2.12 nightly** — RTX 5080 (Blackwell sm_120) 需要 CUDA 12.8+，稳定版 PyTorch 2.6 不支持
- **fairseq 替代** — 原 RVC 依赖 fairseq（Windows 不可安装），已用 HuggingFace `transformers.HubertModel` 替代
- **demucs 补丁** — PyTorch 2.6+ 对 in-place tensor 操作更严格，已打补丁修复 `separate.py` 和 `audio.py`

## 功能

| 模块 | 说明 |
|------|------|
| **创作工作室** | 上传音频 → 自动提取风格向量 → 输入文字描述 → AI 生成音乐 |
| **多文件上传** | 一次性拖入/选择多个音频文件，并行处理 |
| **风格库** | 管理已提取的风格标签，选择/删除 |
| **混合创作** | 2-3 个风格标签按权重混合融合生成 |
| **批量创作** | 多个提示词 × 多个模型，一键生成对比矩阵 |
| **声音模型库** | 上传歌曲训练声音克隆模型（RVC，Windows 可用） |
| **音乐播放器** | 波形图/频谱图可视化，播放/下载 |
| **硬件设置** | 根据 GPU 显存自动配置模型档次 |

## Windows 特别说明

### Node.js PATH 问题

如果 `npm run dev` 报 `'"node"' 不是内部或外部命令`，是因为 Node.js 装在 `Program Files` 路径含空格，Git Bash 的 npx 引号处理有 bug。使用：

```bash
npm run dev:win
```

### ffmpeg

RVC 声音训练的预处理步骤需要 ffmpeg 读取音频。安装后确保在 PATH 中。

### fairseq

Windows 上无法通过 pip 安装 fairseq。本项目已用 HuggingFace transformers 替代，无需 fairseq。

## API 参考

### 音频

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/audio/upload` | 上传音频（multipart, max 100MB） |
| GET | `/api/v1/audio/list` | 列出所有音频资产和风格向量 |
| GET | `/api/v1/audio/status/{task_id}` | 轮询处理进度 |
| DELETE | `/api/v1/audio/{asset_id}` | 删除音频资产及关联风格 |

### 音乐生成

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/music/generate` | 单曲生成 |
| POST | `/api/v1/music/blend-generate` | 风格混合生成 |
| POST | `/api/v1/music/generate-batch` | 批量矩阵生成 |
| GET | `/api/v1/music/list` | 用户历史列表 |
| GET | `/api/v1/music/{id}/download` | 下载音频文件 |

### 声音模型

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/voice/train` | 训练声音模型（后台线程，无需 Celery） |
| GET | `/api/v1/voice/status/{model_id}` | 训练进度 |
| GET | `/api/v1/voice/models` | 模型列表 |
| DELETE | `/api/v1/voice/models/{model_id}` | 删除模型 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SECRET_KEY` | - | JWT 签名密钥 |
| `DATABASE_URL` | `sqlite:///./aimusic.db` | 数据库连接 |
| `UPLOAD_DIR` | `./uploads` | 上传文件目录 |
| `GENERATED_DIR` | `./generated` | 生成文件目录 |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | 跨域来源 |
| `SONICAI_HARDWARE_TIER` | `ultra` | GPU 档位 |

## License

MIT
