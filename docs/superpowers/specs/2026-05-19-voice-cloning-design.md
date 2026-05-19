# SonicAI 人声克隆 — 设计文档

**日期：** 2026-05-19
**方案：** 分阶段推进（Phase 1 → 2 → 3）

## 1. 目标

为 SonicAI 增加人声合成能力。用户上传歌曲 → 提取干声 → 训练 RVC 声音模型 → 用自己的声音（或用唱歌参考 + 声音模型）生成带人声的歌曲。

## 2. 分阶段路线

| Phase | 内容 | 模型 |
|-------|------|------|
| 1 | RVC 核心链路：人声分离 → 训练 → 推理 | RVC (HuBERT + VITS) |
| 2 | 歌词编辑器 + 人声/伴奏混音 + 数字水印 | 音频处理库 |
| 3 | DiffSinger 预置 AI 歌手 + 授权声音库 | DiffSinger |

**本次设计聚焦 Phase 1。**

## 3. 技术选型

- **主方案：RVC**（Retrieval-based Voice Conversion）— GitHub 58k+ stars，中文社区活跃，"AI孙燕姿"同款技术。学习声音音色 + 保留腔调。
- **关键特性：** 渐进式训练（20/100/200 epochs），20min 完整训练，2min 出初版可用。
- **模型加载策略：** 顺序加载/卸载，每次只一个模型驻留显存（适配 RTX 5080 16GB）。

## 4. 架构概览

```
新增模块融入现有三层架构：
┌─ Next.js Frontend ────────────────────────────┐
│  新增：VoiceModelLibrary.tsx（侧边栏导航项）      │
├─ FastAPI REST API ────────────────────────────┤
│  新增：/voice/train, /voice/status, /voice/models│
│       /voice/sing, /voice/generations          │
├─ Celery Task Queue (Redis) ───────────────────┤
│  新增人声管线：separate_vocals → train_rvc      │
│  新增推理管线：infer_rvc_vocals                 │
├─ Storage ─────────────────────────────────────┤
│  新增：VoiceModels/（RVC 权重文件）              │
└───────────────────────────────────────────────┘
```

## 5. 数据模型

### VoiceModel
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | PK |
| user_id | FK → User | 归属用户 |
| name | str | 用户命名 |
| source_audio_id | FK → AudioAsset | 训练的源音频 |
| checkpoint_path | str | RVC 模型权重路径 |
| config_path | str | RVC 配置文件路径 |
| status | enum | pending / preprocessing / training / ready / failed |
| epoch | int | 当前训练到第几个 epoch |
| quality_tier | enum | preview / standard / premium |
| duration_seconds | float | 训练音频总时长 |
| created_at, updated_at | datetime | |

### VocalGeneration
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | PK |
| user_id | FK → User | |
| voice_model_id | FK → VoiceModel | 使用的声音模型 |
| reference_audio_id | FK → AudioAsset | 参考人声 |
| output_path | str | 生成的人声文件 |
| status | enum | pending / processing / completed / failed |
| duration_seconds | float | |
| created_at | datetime | |

## 6. API 端点（全部 JWT 认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/voice/train` | 提交训练任务 |
| GET | `/api/v1/voice/status/{model_id}` | 查询训练进度 |
| GET | `/api/v1/voice/models` | 声音模型列表 |
| DELETE | `/api/v1/voice/models/{model_id}` | 删除模型 |
| POST | `/api/v1/voice/sing` | 生成人声 |
| GET | `/api/v1/voice/generations` | 人声生成历史 |

## 7. 训练管线（Celery Chain）

```
Step 1 — 人声分离（UVR/Demucs）
  → 2min, ~4GB 显存 → 卸载
Step 2 — 音频预处理（切片 + 归一化 + 裁剪）
  → 30s, CPU
Step 3 — HuBERT 特征提取
  → 2min, ~3GB 显存 → 卸载
Step 4 — RVC 渐进式训练（VITS fine-tune）
  → 20 epochs(~2min) → Preview checkpoint
  → 100 epochs(~8min) → Standard checkpoint
  → 200 epochs(~20min) → Premium checkpoint
  → ~8GB 显存 → 卸载
Step 5 — RVC 推理（用户触发，参考人声 → 目标声音）
  → 10-30s/分钟音频, ~5GB 显存 → 卸载
```

**进度通知：** 前端轮询 `GET /voice/status/{id}`（3 秒间隔），返回当前 epoch、质量档位、可用 checkpoint 列表。

## 8. RVC 集成方式

Git 子模块引入 RVC 核心代码到 `backend/app/services/rvc/`，直接复用 HuBERT 预处理、VITS 训练、推理模块。不通过 subprocess 调用。

## 9. 前端改动

### 新增文件
- **VoiceModelLibrary.tsx** — 以 StyleLibrary.tsx 为模板复制，仅改以下 10 处：

| # | StyleLibrary 原值 | VoiceModelLibrary 新值 |
|---|-------------------|----------------------|
| 1 | Props: StyleTag[] | Props: VoiceModel[] |
| 2 | eyebrow "第 2 步" | eyebrow "声音模型" |
| 3 | 标题 "风格标签库" | 标题 "声音模型库" |
| 4 | 计数 "N 个风格" | 计数 "N 个声音" |
| 5 | 图标 Disc | 图标 Microphone |
| 6 | 空状态 "暂无风格标签" | 空状态 "暂无声音模型" |
| 7 | 空状态副标题 "上传音频后自动提取" | 空状态副标题 "上传歌曲训练你的专属声音" |
| 8 | 列表项副标题 "128 维向量" | 列表项副标题 "PREMIUM · 200 epochs · 2:30" / "TRAINING · 45/200" |
| 9 | 选中 chip "已选" | 选中 chip 质量档位 (Preview/Standard/Premium) |
| 10 | 其余结构 | 完全相同 |

### 修改文件
- **Sidebar.tsx** — navItems 数组新增 1 项：`{ id: "voice", label: "VOICE", sub: "声音模型库", icon: Microphone }`
- **create/page.tsx** — 新增 1 个 tab 条件渲染：`activeTab === "voice" && <VoiceModelLibrary ... />`
- **types/index.ts** — 新增 VoiceModel、VocalGeneration 类型

## 10. 版权 & 合规

- **不设声纹验证**（用户反馈：不需要，增加摩擦）
- 用户自行上传歌曲训练，模型绑定到个人账号，不可跨用户共享
- 后续 Phase 3 引入授权声音库时再考虑合规机制（数字水印、歌手分成）

## 11. 错误处理

- 人声分离失败 → status = failed，返回错误信息，用户可重试
- 训练中断 → 保留最近 checkpoint，支持断点续训
- 推理失败 → status = failed，不清除已训练模型
- 上传非人声音频 → 分离后检测干声时长 < 5s，提示用户上传包含人声的歌曲

## 12. 测试要点

- 后端：VoiceModel CRUD、训练管线 Celery task 正确启动/状态更新/checkpoint 保存
- 前端：VoiceModelLibrary 渲染（空状态、列表、选中态、删除）、侧边栏导航切换
- 集成：上传音频 → 训练 → 轮询进度 → 训练完成 → 推理生成 → 播放结果
