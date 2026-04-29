#!/usr/bin/env node
import { runMicah } from "@micah/core";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.trim();
}

function renderMessage(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const m = msg as Record<string, unknown>;
  if (m.type === "assistant" && m.message && typeof m.message === "object") {
    const content = (m.message as { content?: unknown }).content;
    if (Array.isArray(content)) {
      return content
        .map((c: unknown) => {
          if (c && typeof c === "object" && "text" in c)
            return String((c as { text: unknown }).text);
          return "";
        })
        .join("");
    }
  }
  if (m.type === "result" && typeof m.result === "string") return "";
  return "";
}

async function main() {
  const argv = process.argv.slice(2);
  const stdin = await readStdin();
  const prompt = [argv.join(" ").trim(), stdin].filter(Boolean).join("\n\n");
  if (!prompt) {
    console.error(
      "usage: micah <prompt>   (or pipe prompt on stdin)\n" +
        "       MICAH_CWD=/path/to/mozilla-central micah '<prompt>'",
    );
    process.exit(2);
  }

  for await (const msg of runMicah({ prompt })) {
    const text = renderMessage(msg);
    if (text) process.stdout.write(text);
  }
  process.stdout.write("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
