"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, CheckCircle, XCircle, ArrowClockwise, ListBullets, StopCircle, Trash } from "@phosphor-icons/react";
import * as api from "@/lib/api";

const POLL_INTERVAL = 5000;
const SHOW_MAX = 10;

const STAGE_LABELS: Record<string, string> = {
  uploading: "上传中",
  separating: "人声分离",
  extracting: "风格提取",
  generating: "生成中",
  blending: "混合中",
  writing: "歌词创作",
  arranging: "编曲中",
  singing: "演唱中",
  mixing: "混音中",
  training: "训练中",
  starting: "启动中",
  pending: "排队中",
};

const KIND_LABELS: Record<string, string> = {
  audio_upload: "音频处理",
  music_generation: "音乐生成",
  voice_training: "声音训练",
  song_creation: "歌曲创作",
  svs_generation: "人声生成",
};

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${s}秒`;
}

export default function TaskCenter() {
  const [open, setOpen] = useState(false);
  const [activeJobs, setActiveJobs] = useState<api.JobInfo[]>([]);
  const [recentJobs, setRecentJobs] = useState<api.JobInfo[]>([]);
  const [busyJobId, setBusyJobId] = useState<number | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await api.listJobs(0, SHOW_MAX);
      const active = data.items.filter(
        (j) => j.status === "queued" || j.status === "running",
      );
      const recent = data.items.filter(
        (j) => j.status === "completed" || j.status === "failed" || j.status === "cancelled",
      ).slice(0, 5);
      setActiveJobs(active);
      setRecentJobs(recent);
    } catch { /* silent */ }
  }, []);

  // Poll active jobs
  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const handleCancelJob = useCallback(async (jobId: number) => {
    setBusyJobId(jobId);
    try {
      await api.cancelJob(jobId);
      await fetchJobs();
    } finally {
      setBusyJobId(null);
    }
  }, [fetchJobs]);

  const handleDeleteJob = useCallback(async (jobId: number) => {
    if (!window.confirm("Delete this task?")) return;
    setBusyJobId(jobId);
    try {
      await api.deleteJob(jobId);
      await fetchJobs();
    } finally {
      setBusyJobId(null);
    }
  }, [fetchJobs]);

  const activeCount = activeJobs.length;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono tracking-wider transition-colors"
        style={{
          color: activeCount > 0 ? "var(--accent)" : "var(--text-tertiary)",
          background: activeCount > 0 ? "var(--accent-soft)" : "transparent",
          border: "1px solid",
          borderColor: activeCount > 0 ? "rgba(212,168,83,0.2)" : "var(--border-color)",
        }}
      >
        {activeCount > 0 ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--accent)" }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--accent)" }} />
            </span>
            {activeCount} 个任务
          </>
        ) : (
          <>
            <ListBullets size={12} />
            任务
          </>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border shadow-xl backdrop-blur-xl overflow-hidden"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
            }}
          >
            <div className="p-3 border-b" style={{ borderColor: "var(--border-color)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>任务中心</p>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {/* Active jobs */}
              {activeJobs.length === 0 && recentJobs.length === 0 && (
                <div className="p-6 text-center">
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>暂无任务</p>
                </div>
              )}

              {activeJobs.length > 0 && (
                <div className="p-3 space-y-2">
                  <p className="text-[9px] font-mono tracking-widest uppercase" style={{ color: "var(--accent)" }}>
                    进行中 ({activeJobs.length})
                  </p>
                  {activeJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-lg p-3 space-y-2"
                      style={{ background: "var(--bg-tertiary)" }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock size={12} className="shrink-0 animate-pulse" style={{ color: "var(--accent)" }} />
                          <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                            {KIND_LABELS[job.kind] || job.kind}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[9px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                            {job.started_at ? formatElapsed(Math.floor((Date.now() - new Date(job.started_at).getTime()) / 1000)) : "—"}
                          </span>
                          <button
                            type="button"
                            title="Stop task"
                            aria-label="Stop task"
                            disabled={busyJobId === job.id}
                            onClick={() => handleCancelJob(job.id)}
                            className="grid h-6 w-6 place-items-center rounded-full transition-colors"
                            style={{ color: "#f59e0b", opacity: busyJobId === job.id ? 0.5 : 1 }}
                          >
                            <StopCircle size={13} />
                          </button>
                          <button
                            type="button"
                            title="Delete task"
                            aria-label="Delete task"
                            disabled={busyJobId === job.id}
                            onClick={() => handleDeleteJob(job.id)}
                            className="grid h-6 w-6 place-items-center rounded-full transition-colors"
                            style={{ color: "#ef4444", opacity: busyJobId === job.id ? 0.5 : 1 }}
                          >
                            <Trash size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Stage label */}
                      {job.stage && (
                        <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                          {STAGE_LABELS[job.stage] || job.stage}
                        </p>
                      )}

                      {/* Progress bar */}
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-hover)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${job.progress || 0}%`,
                            background: "var(--deco-gradient)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent jobs */}
              {recentJobs.length > 0 && (
                <div className="p-3 space-y-1 border-t" style={{ borderColor: "var(--border-color)" }}>
                  <p className="text-[9px] font-mono tracking-widest uppercase" style={{ color: "var(--text-tertiary)" }}>
                    最近完成
                  </p>
                  {recentJobs.map((job) => (
                    <div key={job.id} className="flex items-center gap-2 py-1.5">
                      {job.status === "completed" ? (
                        <CheckCircle size={12} className="shrink-0" style={{ color: "#22c55e" }} />
                      ) : job.status === "cancelled" ? (
                        <StopCircle size={12} className="shrink-0" style={{ color: "#f59e0b" }} />
                      ) : (
                        <XCircle size={12} className="shrink-0" style={{ color: "#ef4444" }} />
                      )}
                      <span className="text-xs truncate flex-1" style={{ color: "var(--text-primary)" }}>
                        {KIND_LABELS[job.kind] || job.kind}
                      </span>
                      {job.status === "failed" && job.error_message && (
                        <span
                          className="text-[9px] truncate max-w-[120px] shrink-0"
                          style={{ color: "#ef4444" }}
                        >
                          {job.error_message}
                        </span>
                      )}
                      <button
                        type="button"
                        title="Delete task"
                        aria-label="Delete task"
                        disabled={busyJobId === job.id}
                        onClick={() => handleDeleteJob(job.id)}
                        className="grid h-6 w-6 place-items-center rounded-full transition-colors shrink-0"
                        style={{ color: "var(--text-tertiary)", opacity: busyJobId === job.id ? 0.5 : 1 }}
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-2 border-t flex justify-center" style={{ borderColor: "var(--border-color)" }}>
              <button
                onClick={fetchJobs}
                className="flex items-center gap-1 text-[9px] font-mono tracking-wider px-3 py-1.5 rounded-full transition-colors"
                style={{ color: "var(--text-tertiary)" }}
              >
                <ArrowClockwise size={10} /> 刷新
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
