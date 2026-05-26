"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as api from "@/lib/api";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface JobPollingState {
  status: "idle" | JobStatus;
  progress: number;
  stage: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  elapsed: number;
}

interface UseJobPollingOptions {
  interval?: number;
  timeout?: number;
  onCompleted?: (result: Record<string, unknown>) => void;
  onFailed?: (error: string) => void;
  onTimeout?: () => void;
  /** Custom fetch function for non-standard job endpoints (e.g. song status) */
  fetcher?: (jobId: number) => Promise<{
    status: string;
    progress?: number;
    stage?: string | null;
    result?: Record<string, unknown> | null;
    error_message?: string | null;
  }>;
}

/**
 * Poll a unified Job by ID. Starts when jobId is non-null,
 * auto-stops at terminal status.
 */
export function useJobPolling(
  jobId: number | null,
  options: UseJobPollingOptions = {},
) {
  const { interval = 2000, timeout = 300000, onCompleted, onFailed, onTimeout, fetcher } = options;

  const [state, setState] = useState<JobPollingState>({
    status: "idle",
    progress: 0,
    stage: null,
    result: null,
    error: null,
    elapsed: 0,
  });

  const mountedRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
  }, []);

  const start = useCallback(() => {
    if (!jobId) return;
    stop();

    startedRef.current = Date.now();
    setState({ status: "queued", progress: 0, stage: null, result: null, error: null, elapsed: 0 });

    elapsedRef.current = setInterval(() => {
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, elapsed: Math.floor((Date.now() - startedRef.current) / 1000) }));
      }
    }, 1000);

    const poll = async () => {
      if (!mountedRef.current || !jobId) return;
      try {
        const job = await (fetcher ?? api.getJob)(jobId);
        if (!mountedRef.current) return;

        const jStatus = job.status as JobStatus;
        const jProgress = job.progress ?? 0;
        const jStage = job.stage ?? null;
        const jResult = job.result as Record<string, unknown> | null;
        const jError = job.error_message ?? null;

        setState((prev) => ({ ...prev, status: jStatus, progress: jProgress, stage: jStage, result: jResult, error: jError }));

        if (jStatus === "completed") {
          stop();
          onCompleted?.(jResult ?? {});
        } else if (jStatus === "failed") {
          stop();
          onFailed?.(jError || "任务失败");
        }
      } catch {
        // transient — keep polling
      }
    };

    poll();
    pollRef.current = setInterval(poll, interval);

    if (timeout > 0) {
      timeoutRef.current = setTimeout(() => {
        stop();
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, status: "failed", error: "任务超时" }));
          onTimeout?.();
        }
      }, timeout);
    }
  }, [jobId, interval, timeout, stop, onCompleted, onFailed, onTimeout, fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    if (jobId) start();
    else { stop(); setState({ status: "idle", progress: 0, stage: null, result: null, error: null, elapsed: 0 }); }
    return () => { mountedRef.current = false; stop(); };
  }, [jobId, start, stop]);

  return { ...state, start, stop };
}

