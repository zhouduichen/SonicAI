/**
 * Error logging utility for API calls.
 * Provides consistent logging and user-friendly error messages.
 */

const LOG_PREFIX = "[SonicAI]";

export type ErrorLevel = "warn" | "error" | "info";

/** Log an error with context. In development, logs to console. */
export function logError(context: string, err: unknown, level: ErrorLevel = "warn"): string {
  const message = extractMessage(err);
  const detail = `${LOG_PREFIX} ${context}: ${message}`;
  if (level === "error") {
    console.error(detail, err);
  } else if (level === "warn") {
    console.warn(detail, err);
  } else {
    console.info(detail, err);
  }
  return message;
}

/** Extract a human-readable message from an unknown error. */
export function extractMessage(err: unknown): string {
  if (!err) return "未知错误";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const detail = (err as Record<string, unknown>).detail;
    if (typeof detail === "string") return detail;
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return String(err);
}

/** Determine if error is a network connectivity issue. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && (
    err.message.includes("fetch") ||
    err.message.includes("network") ||
    err.message.includes("Failed to fetch") ||
    err.message.includes("NetworkError")
  );
}

/** Wrap a promise with error logging, returning null on failure. */
export async function logAndNull<T>(context: string, promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    logError(context, err);
    return null;
  }
}
