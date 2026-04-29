import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function tryRead(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

export function buildSystemPrompt(): string {
  const memoryPath =
    process.env.MICAH_MEMORY_PATH ?? resolve(here, "../../../MICAH.md");
  const memory = tryRead(memoryPath);
  const writeEnabled = process.env.MICAH_WRITE_ENABLED === "1";

  const safetyHeader = writeEnabled
    ? "Write mode is ENABLED. External pushes are live. Be deliberate."
    : "Write mode is DISABLED. Every external push is dry-run; report what you would have done.";

  return [
    "# Micah",
    safetyHeader,
    "",
    memory.trim() ||
      "(MICAH.md not found — running with no project memory. This is unusual; flag it to the operator.)",
  ].join("\n");
}
