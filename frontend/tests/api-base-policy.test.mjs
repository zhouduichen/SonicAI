import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const files = [
  "../src/lib/auth.ts",
  "../src/components/BlendPanel.tsx",
  "../src/lib/use-model-catalog.ts",
  "../src/components/landing/FeaturedTracks.tsx",
  "../src/components/SettingsPanel.tsx",
];

for (const file of files) {
  const source = readFileSync(join(__dirname, file), "utf8");
  assert(
    !source.includes("http://localhost:8000"),
    `${file} should default to 127.0.0.1:8000 so Docker/WSL cannot hijack localhost`,
  );
}
