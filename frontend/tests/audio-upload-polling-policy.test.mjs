import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "../src/lib/use-audio-assets.ts"), "utf8");

const timeoutMatch = source.match(/export const AUDIO_JOB_TIMEOUT_MS\s*=\s*([\d_]+)/);
assert(timeoutMatch, "use-audio-assets should export AUDIO_JOB_TIMEOUT_MS");

const timeoutMs = Number(timeoutMatch[1].replaceAll("_", ""));
assert(
  timeoutMs >= 30 * 60 * 1000,
  "audio analysis polling timeout should allow long local inference and queue waits",
);

const timeoutBlock = source.match(
  /timeout = setTimeout\(\(\) => \{([\s\S]*?)\}, AUDIO_JOB_TIMEOUT_MS\);/,
);
assert(timeoutBlock, "audio upload timeout should use AUDIO_JOB_TIMEOUT_MS");
assert(
  !timeoutBlock[1].includes('status: "failed"'),
  "client-side timeout should not mark an in-flight backend job as failed",
);
assert(
  timeoutBlock[1].includes("reloadAssets"),
  "client-side timeout should reload backend state before giving up polling",
);
