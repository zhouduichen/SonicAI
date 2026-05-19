# Fix: Waveform & Spectrogram Visualization

## Problem

生成记录中播放乐曲时，波形图和频谱图无法正常显示。根因是 `WaveformViewer` 通过 `fetch()` 获取跨域音频文件失败导致画布空白，且无错误反馈。

## Solution

将双路径架构（`<audio>` 播放 + 独立 `fetch` → `decodeAudioData` → 手动 DFT → canvas）合并为单一路径：`<audio>` → `MediaElementSourceNode` → `AnalyserNode` → `requestAnimationFrame` 驱动 canvas 渲染。

### Architecture

```
<audio> → MediaElementSourceNode → AnalyserNode
                                       ↓
                          getByteTimeDomainData()    →  波形
                          getByteFrequencyData()     →  频谱
                                       ↓
                          WaveformViewer (纯 canvas 渲染)
```

### Component Changes

**WaveformViewer** — 删除 fetch/解码/DFT 逻辑，变为纯 canvas 渲染器：

- Props: `{ analyserNode, mode, isPlaying, currentTime, duration, onSeek }`
- 不再自己管理 AudioContext 或音频文件
- 从 AnalyserNode 读取数据，每帧绘制

**MusicPlayer** — 接管音频分析职责：

- 懒创建 AudioContext（首次播放时，满足 autoplay 策略）
- `<audio>` 连接 `MediaElementSourceNode` → `AnalyserNode`
- 播放时启动 requestAnimationFrame 循环驱动 WavesurferViewer 重绘
- 整个组件生命周期复用同一 AudioContext，切换曲目只重建 MediaElementSourceNode
- 仅组件卸载时关闭 AudioContext

### State Matrix

| 状态 | 表现 |
|------|------|
| 音频未加载 | skeleton shimmer（符合 DESIGN.md 规范） |
| AnalyserNode 不可用（跨域 taint） | `"可视化不可用"` 文字 + brass 装饰线 |
| 播放中 | 实时 canvas 动画 |
| 暂停中 | 保持最后一帧，进度线停在当前位置 |
| 切换曲目 | AudioContext 复用，AnalyserNode 重新连接新 `<audio>` |

### Files Touched

- `frontend/src/components/WaveformViewer.tsx` — 重写，约 80 行（从 ~290 行精简）
- `frontend/src/components/MusicPlayer.tsx` — 新增 AudioContext/AnalyserNode 管理
