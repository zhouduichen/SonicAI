# Hardware-Adaptive AI Pipeline Design

**Date:** 2026-05-19  
**Status:** Approved  
**Scope:** 让 SonicAI 在不同配置的硬件上都能运行 AI 推理，从 RTX 5080 (16G) 到无独显 CPU，用户手动选择硬件档位，系统自动推荐模型组合。

## 1. Overview

### 1.1 Problem

当前 SonicAI 针对 RTX 5080 (16GB VRAM) 优化，使用顺序加载/卸载策略运行三个模型。当部署到低配机器（8GB、6GB 甚至无独显）时，部分模型会 OOM 或推理时间过长。

### 1.2 Goal

支持 5 个硬件档位（Ultra → CPU），用户选择档位后系统自动推荐最优模型组合，用户可单独微调单个模型。CPU 路径通过 ONNX INT8 量化模型实现可接受的推理速度（30 秒音乐目标 2-4 分钟）。

### 1.3 Non-Goals

- 不做模型训练/微调，只做推理
- 不在此版本实现远端 API 调用（RemotePath 留接口，后续实现）
- 不做自动硬件检测，用户手动选择档位

## 2. Hardware Tiers

| Tier | Label | Max VRAM | Example GPUs |
|------|-------|----------|--------------|
| `ultra` | 旗舰 | 16G+ | RTX 5080, RTX 4090 |
| `high` | 高端 | 12G+ | RTX 4070, RTX 3080 |
| `mid` | 中端 | 8G+ | RTX 4060, RTX 3070 |
| `low` | 入门 | 6G+ | RTX 3060, RTX 2060 |
| `cpu` | CPU | 0 | 无独显, MacBook Air |

## 3. ModelRecommender

### 3.1 Tier Presets

每个档位有两套预设：speed（速度优先）和 quality（质量优先）。

| Tier | Mode | Vocal Sep | VRAM | Style Extract | VRAM | Music Gen | VRAM | Total VRAM | Est. Time |
|------|------|-----------|------|---------------|------|-----------|------|------------|-----------|
| ultra | speed | demucs_mdx_extra | 5.0 | clap_laion | 1.2 | musicgen_medium | 5.0 | 5.0 (seq) | ~60s |
| ultra | quality | demucs_htdemucs | 6.5 | clap_msclap | 1.5 | musicgen_large | 8.0 | 8.0 (seq) | ~120s |
| high | speed | demucs_mdx_extra | 5.0 | clap_laion | 1.2 | musicgen_medium | 5.0 | 5.0 (seq) | ~80s |
| high | quality | demucs_htdemucs | 6.5 | clap_msclap | 1.5 | musicgen_melody | 5.5 | 6.5 (seq) | ~150s |
| mid | speed | spleeter_2stems | 1.5 | clap_laion | 1.2 | musicgen_small | 2.5 | 2.5 (seq) | ~90s |
| mid | quality | spleeter_5stems | 2.0 | clap_laion | 1.2 | musicgen_medium | 5.0 | 5.0 (seq) | ~180s |
| low | speed | spleeter_2stems | 1.5 | encodec_6kbps | 0.8 | musicgen_small | 2.5 | 2.5 (seq) | ~120s |
| low | quality | spleeter_5stems | 2.0 | encodec_6kbps | 0.8 | musicgen_small | 2.5 | 2.5 (seq) | ~160s |
| cpu | speed | spleeter_2stems ONNX | 0 | encodec_6kbps ONNX | 0 | musicgen_small ONNX | 0 | 0 (CPU) | ~180s |
| cpu | quality | spleeter_5stems ONNX | 0 | clap_laion ONNX | 0 | musicgen_small ONNX | 0 | 0 (CPU) | ~300s |

> Note: Total VRAM is the maximum single-model VRAM since models run sequentially. All VRAM values in GB.

### 3.2 Per-Model Fallback

当用户手动切换单个模型时，检查该模型的 VRAM 是否 <= 档位预算。超出时显示黄色警告（不阻止选择，由用户判断）。

### 3.3 Time Estimation

每个 model provider 新增 `time_estimate(duration_seconds=30)` 方法。总耗时 = 三个模型耗时之和。估算基于档位参考基准，非精确计时。

## 4. ResourceManager

### 4.1 Upgrade from GPUMemoryManager

原文件 `backend/app/models/providers/gpu_manager.py` 重命名为 `resource_manager.py`。核心变化：

- **VRAM budget** 不再硬编码 16GB，改为从用户选择的 tier 读取
- **Execution path** 根据 GPU 可用性 + ONNX 可用性决定 local GPU / local CPU / mock 路径
- **保留** 原 sequential load/unload 逻辑

### 4.2 Execution Path Selection

```
load(model_key):
  if GPU available AND model.vram <= budget:
    → load PyTorch on GPU
  elif ONNX model exists:
    → load ONNX on CPU
  else:
    → mock mode (generates sine tone)
```

### 4.3 Provider Interface Changes

`base.py` 中的 `ModelProvider` 新增两个方法：

- `time_estimate(duration_seconds: int = 30) -> float` — 返回预估秒数
- `supports_gpu() -> bool` — 是否支持 GPU 推理（返回 True 表示有 GPU 实现）

ONNX 分支的 provider 继承同一个 base，通过 `supports_gpu()` 返回 False 来区分。

## 5. ONNX CPU Path

### 5.1 Model Storage

```
~/.sonicai/models/
├── musicgen_small_int8.onnx    (~300MB)
├── spleeter_2stems.onnx         (~50MB)
├── encodec_6kbps.onnx           (~30MB)
└── model_manifest.json
```

### 5.2 Setup Command

用户运行一次性安装命令，下载预转换的 ONNX 模型：

```bash
python scripts/setup_cpu_models.py
# OR in Docker:
docker compose run --rm backend python scripts/setup_cpu_models.py
```

### 5.3 ONNX Inference

在 `LocalMusicGenProvider`、`LocalDemucsProvider`、`LocalCLAPProvider` 中各增加一个 `_infer_onnx()` 私有方法。使用 `onnxruntime.InferenceSession` 加载 INT8 模型做 CPU 推理。

### 5.4 Fallback Chain

```
ONNX available? → ONNX inference
ONNX missing?   → PyTorch on CPU (slow but works)
PyTorch fails?  → Mock (sine tone, functional but warns user)
```

### 5.5 New Files

- `backend/app/utils/onnx_helper.py` — ONNX 模型加载/缓存/验证
- `scripts/setup_cpu_models.py` — 下载 ONNX 模型到 `~/.sonicai/models/`

## 6. Docker Deployment

### 6.1 Single Compose File

扩展现有 `docker-compose.yml`，一个文件覆盖所有场景。

### 6.2 Backend Dockerfile

```dockerfile
FROM nvidia/cuda:12.4-runtime-ubuntu22.04
# Python + dependencies + ONNX runtime
# entrypoint.sh handles GPU detection and model setup
```

### 6.3 Entrypoint Script

`backend/entrypoint.sh`:
1. 检查 `nvidia-smi` 是否可用 → 确定 GPU 是否存在
2. 从环境变量读取 `SONICAI_HARDWARE_TIER`
3. 如果 tier=cpu 且 ONNX 模型未安装，自动运行 `setup_cpu_models.py`
4. 启动 supervisor（uvicorn + celery worker）

### 6.4 Environment Configuration

`.env` 文件（用户唯一需要编辑的配置文件）:

```env
SONICAI_HARDWARE_TIER=mid
SONICAI_PREFERENCE=speed
SONICAI_USE_REMOTE=false
SONICAI_REMOTE_URL=
```

### 6.5 Frontend Dockerfile

多阶段构建：`node:20-alpine` → build → `node:20-alpine` production。

## 7. Frontend Settings UI

### 7.1 Design Rule

**不改变现有前端结构。** 侧边栏三栏目（Studio/Library/Archive）、create 页面的三栏布局和 Tab 切换逻辑完全不动。

### 7.2 Additions

| Change | File |
|--------|------|
| 新增 | `frontend/src/components/SettingsPanel.tsx` |
| 新增 | `frontend/src/lib/hardware-tiers.ts` |
| 修改 | `frontend/src/components/Sidebar.tsx` — 底部加 SETTINGS 导航项 |
| 修改 | `frontend/src/app/create/page.tsx` — 加 `showSettings` state |

### 7.3 SettingsPanel Behavior

- 点击侧边栏底部的 SETTINGS 导航项触发
- 以滑出面板（Sheet）形式从右侧滑入，覆盖在创作页之上
- 关闭即回到创作页，不影响已有布局
- 设置存入 `localStorage`，持久化到下次打开

### 7.4 SettingsPanel Content

- 硬件档位下拉选择（5 档）
- 速度/质量偏好切换
- 推荐模型组合展示（每个模型可单独切换，实时更新耗时和显存估算）
- 远端服务器地址输入（Beta，留空即仅本地）
- 保存按钮

### 7.5 Hardware Tiers Data

`frontend/src/lib/hardware-tiers.ts` — 纯常量数据文件，包含：
- 5 个档位定义
- 每个档位的 speed/quality 预设模型组合
- 每个模型的 VRAM 和时间估算值

所有值和后端 `model_registry.py` 保持一致。

## 8. File Change Summary

### New Files

| File | Purpose |
|------|---------|
| `backend/app/services/model_recommender.py` | 档位→组合映射 + VRAM 校验 |
| `backend/app/models/providers/resource_manager.py` | 升级版 GPU manager |
| `backend/app/utils/onnx_helper.py` | ONNX 模型加载工具 |
| `scripts/setup_cpu_models.py` | ONNX 模型下载脚本 |
| `backend/Dockerfile` | 后端容器 |
| `frontend/Dockerfile` | 前端容器 |
| `backend/entrypoint.sh` | 容器启动脚本 |
| `.env.example` | 用户配置模板 |
| `frontend/src/components/SettingsPanel.tsx` | 设置滑出面板 |
| `frontend/src/lib/hardware-tiers.ts` | 档位预设常量 |

### Modified Files

| File | Change |
|------|--------|
| `backend/app/models/providers/gpu_manager.py` | 重命名为 `resource_manager.py` |
| `backend/app/models/providers/base.py` | 新增 `time_estimate()` 和 `supports_gpu()` |
| `backend/app/models/providers/local_demucs.py` | 新增 ONNX 推理分支 |
| `backend/app/models/providers/local_clap.py` | 新增 ONNX 推理分支 |
| `backend/app/models/providers/local_musicgen.py` | 新增 ONNX 推理分支 |
| `backend/app/tasks/audio_pipeline.py` | 改用 ResourceManager |
| `backend/requirements.txt` | 新增 `onnxruntime` |
| `docker-compose.yml` | 扩展为完整多服务编排 |
| `frontend/src/components/Sidebar.tsx` | 底部加 SETTINGS 导航项 |
| `frontend/src/app/create/page.tsx` | 加 showSettings state + 渲染 SettingsPanel |

### Unchanged Files

- `frontend/src/components/Dropzone.tsx`
- `frontend/src/components/StyleLibrary.tsx`
- `frontend/src/components/GenerationConsole.tsx`
- `frontend/src/components/MusicPlayer.tsx`
- `frontend/src/components/Playlist.tsx`
- `frontend/src/components/ModelSelector.tsx`
- `frontend/src/components/BatchConsole.tsx`
- `frontend/src/components/BlendPanel.tsx`
- `frontend/src/components/landing/*`
- 所有 `/app` 路由结构
