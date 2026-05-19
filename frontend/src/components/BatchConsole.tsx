"use client";

import { useState } from "react";
import { GridFour, Play, Pause, Plus, X } from "@phosphor-icons/react";
import type { ModelInfo } from "@/types";

interface BatchCell {
  task_id: string;
  prompt: string;
  model: string;
  status: string;
  file_path?: string;
}

interface BatchConsoleProps {
  musicGenModels: ModelInfo[];
  onGenerate: (prompts: string[], models: string[]) => Promise<void>;
  isGenerating: boolean;
  cells: BatchCell[];
  currentPlayingCell: string | null;
  onPlayCell: (taskId: string, filePath: string) => void;
}

export default function BatchConsole({
  musicGenModels, onGenerate, isGenerating, cells, currentPlayingCell, onPlayCell,
}: BatchConsoleProps) {
  const [prompts, setPrompts] = useState<string[]>(["", "", ""]);
  const [selectedModels, setSelectedModels] = useState<string[]>(["musicgen_small", "musicgen_medium"]);

  const toggleModel = (key: string) => {
    if (selectedModels.includes(key)) {
      if (selectedModels.length > 1) setSelectedModels(selectedModels.filter((m) => m !== key));
    } else if (selectedModels.length < 5) {
      setSelectedModels([...selectedModels, key]);
    }
  };

  const setPrompt = (i: number, val: string) => {
    const newPrompts = [...prompts];
    newPrompts[i] = val;
    setPrompts(newPrompts);
  };

  const addPrompt = () => {
    if (prompts.length < 5) setPrompts([...prompts, ""]);
  };

  const removePrompt = (i: number) => {
    if (prompts.length > 1) setPrompts(prompts.filter((_, idx) => idx !== i));
  };

  const handleGenerate = () => {
    const validPrompts = prompts.filter((p) => p.trim());
    if (validPrompts.length === 0 || selectedModels.length === 0) return;
    onGenerate(validPrompts, selectedModels);
  };

  const gridCols = Math.min(selectedModels.length, 5);

  return (
    <div className="card-outer">
      <div className="card-inner p-6 space-y-5">
        <div className="flex items-center gap-2">
          <GridFour size={18} style={{ color: "var(--accent)" }} />
          <h3 className="text-lg italic font-medium" style={{ color: "var(--text-primary)", fontFamily: "'Playfair Display', serif" }}>
            Batch Studio
          </h3>
          <span className="eyebrow">批量创作</span>
        </div>

        {/* Prompts input */}
        <div className="space-y-2">
          <p className="text-xs font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            提示词 ({prompts.filter((p) => p.trim()).length}/{prompts.length})
          </p>
          {prompts.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] font-mono w-5" style={{ color: "var(--text-tertiary)" }}>
                {i + 1}.
              </span>
              <input
                type="text"
                value={p}
                onChange={(e) => setPrompt(i, e.target.value)}
                placeholder={`提示词 ${i + 1}...`}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg"
                style={{
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                  outline: "none",
                }}
              />
              {prompts.length > 1 && (
                <button onClick={() => removePrompt(i)} style={{ color: "var(--text-tertiary)" }}>
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {prompts.length < 5 && (
            <button onClick={addPrompt} className="text-xs flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
              <Plus size={12} /> 添加提示词
            </button>
          )}
        </div>

        {/* Model selection */}
        <div>
          <p className="text-xs font-mono tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
            模型选择 ({selectedModels.length})
          </p>
          <div className="flex gap-2 flex-wrap">
            {musicGenModels.map((m) => {
              const active = selectedModels.includes(m.key);
              return (
                <button
                  key={m.key}
                  onClick={() => toggleModel(m.key)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all"
                  style={{
                    background: active ? "var(--accent-soft)" : "var(--bg-tertiary)",
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border-color)",
                  }}
                >
                  {m.display_name.slice(0, 14)}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || prompts.filter((p) => p.trim()).length === 0}
          className="btn-primary w-full text-xs"
        >
          <span>{isGenerating ? "生成中..." : `批量生成 (${prompts.filter((p) => p.trim()).length} × ${selectedModels.length})`}</span>
        </button>

        {/* Results Grid */}
        {cells.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-mono tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              结果矩阵 ({cells.filter((c) => c.status === "completed").length}/{cells.length})
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th style={{ color: "var(--text-tertiary)", padding: "4px 8px", textAlign: "left" }}></th>
                    {selectedModels.map((mk) => (
                      <th key={mk} style={{ color: "var(--accent)", padding: "4px 8px", fontFamily: "monospace" }}>
                        {musicGenModels.find((m) => m.key === mk)?.display_name.slice(0, 12) || mk}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prompts.filter((p) => p.trim()).map((prompt, ri) => (
                    <tr key={ri}>
                      <td style={{ color: "var(--text-primary)", padding: "4px 8px", maxWidth: 120 }} className="truncate">
                        {prompt.slice(0, 15)}
                      </td>
                      {selectedModels.map((mk) => {
                        const cell = cells.find((c) => c.prompt === prompt && c.model === mk);
                        const isPlaying = cell?.task_id === currentPlayingCell;
                        return (
                          <td key={mk} style={{ padding: 2 }}>
                            {cell ? (
                              <button
                                onClick={() => cell.file_path && onPlayCell(cell.task_id, cell.file_path)}
                                disabled={!cell.file_path || cell.status !== "completed"}
                                className="w-full px-2 py-1.5 rounded text-[10px] font-mono transition-all"
                                style={{
                                  background: cell.status === "completed"
                                    ? (isPlaying ? "var(--accent)" : "var(--accent-soft)")
                                    : "var(--bg-tertiary)",
                                  color: cell.status === "completed"
                                    ? (isPlaying ? "#fff" : "var(--accent)")
                                    : "var(--text-tertiary)",
                                  border: "1px solid var(--border-color)",
                                  cursor: cell.status === "completed" ? "pointer" : "default",
                                }}
                              >
                                {isPlaying ? <Pause size={10} /> : <Play size={10} />}
                              </button>
                            ) : (
                              <div className="px-2 py-1.5 text-center" style={{ color: "var(--text-tertiary)" }}>
                                -
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
