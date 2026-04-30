#!/usr/bin/env node
import { runMicah } from "@micah/core";
import { auditCommand } from "./audit.js";

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
  return "";
}

function usage(code: number): never {
  console.error(
    [
      "usage: micah <prompt>            run a one-shot prompt",
      "       micah audit show [opts]   pretty-print audit log entries",
      "                                   --session=<id>",
      "                                   --kind=<tool_call|dry_run|blocked|...>",
      "                                   --last=<n>",
      "                                   --path=<file>",
      "",
      "env:   MICAH_CWD                  path to your mozilla-central checkout",
      "       MICAH_WRITE_ENABLED=1      enable external pushes (default off)",
      "       ANTHROPIC_API_KEY          (or use the `claude` CLI's SSO login)",
    ].join("\n"),
  );
  process.exit(code);
}

async function runPromptCommand(argv: string[]) {
  const stdin = await readStdin();
  const prompt = [argv.join(" ").trim(), stdin].filter(Boolean).join("\n\n");
  if (!prompt) usage(2);

  for await (const msg of runMicah({ prompt })) {
    const text = renderMessage(msg);
    if (text) process.stdout.write(text);
  }
  process.stdout.write("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) usage(2);
  if (argv[0] === "-h" || argv[0] === "--help" || argv[0] === "help") usage(0);

  if (argv[0] === "audit") {
    await auditCommand(argv.slice(1));
    return;
  }

  await runPromptCommand(argv);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
