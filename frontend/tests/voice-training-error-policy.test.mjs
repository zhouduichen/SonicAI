import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiSource = readFileSync(join(__dirname, "../src/lib/api.ts"), "utf8");
const hookSource = readFileSync(join(__dirname, "../src/lib/use-voice-models.ts"), "utf8");

const trainVoiceBlock = apiSource.match(/export async function trainVoice[\s\S]*?^}/m)?.[0] ?? "";
assert(
  trainVoiceBlock.includes("readApiError"),
  "trainVoice should preserve backend error detail instead of throwing a generic message",
);

const trainHandlerBlock = hookSource.match(/const handleTrainVoice = useCallback[\s\S]*?\n  \}, \[/)?.[0] ?? "";
assert(
  trainHandlerBlock.includes("toast(") && trainHandlerBlock.includes("variant: \"error\""),
  "voice training failures should be shown to the user with an error toast",
);

assert(
  trainHandlerBlock.includes("setIsTraining(false)"),
  "voice training should clear the submitting state when the request fails inside the hook",
);
