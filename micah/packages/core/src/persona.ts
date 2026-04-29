import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

function tryRead(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function loadFragments(): { name: string; body: string }[] {
  const paths = [
    { name: "MICAH.md", path: process.env.MICAH_MEMORY_PATH ?? resolve(repoRoot, "MICAH.md") },
    { name: "voice-examples", path: resolve(repoRoot, "prompts/voice-examples.md") },
    { name: "house-style", path: resolve(repoRoot, "prompts/house-style.md") },
  ];
  return paths
    .map(({ name, path }) => ({ name, body: tryRead(path).trim() }))
    .filter((f) => f.body.length > 0);
}

export function buildSystemPrompt(): string {
  const writeEnabled = process.env.MICAH_WRITE_ENABLED === "1";
  const safetyHeader = writeEnabled
    ? "Write mode is ENABLED. External pushes are live. Be deliberate."
    : "Write mode is DISABLED. Every external push is dry-run; report what you would have done.";

  const fragments = loadFragments();
  if (fragments.length === 0) {
    return [
      "# Micah",
      safetyHeader,
      "(No project memory or prompt fragments found. Flag this to the operator.)",
    ].join("\n");
  }

  return [
    "# Micah",
    safetyHeader,
    "",
    ...fragments.map((f) => `<!-- ${f.name} -->\n\n${f.body}`),
  ].join("\n\n");
}
