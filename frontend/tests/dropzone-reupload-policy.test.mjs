import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "../src/components/Dropzone.tsx"), "utf8");

assert(
  source.includes('item.status === "failed" || item.status === "completed"'),
  "failed and completed asset rows should both expose a re-upload action",
);

assert(
  source.includes("mainFileInputRef") && source.includes("openFilePicker"),
  "terminal dropzone states should keep a main file picker available",
);

assert(
  /onClick=\{openFilePicker\}/.test(source),
  "clicking the dropzone after extraction finishes or fails should open upload again",
);

assert(
  /e\.target\.value = ""/.test(source),
  "file inputs should clear their value so selecting the same audio again fires change",
);
