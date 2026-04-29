import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

interface AuditEvent {
  ts: string;
  session: string;
  kind: "tool_call" | "tool_result" | "dry_run" | "blocked" | "agent_message";
  data: Record<string, unknown>;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(["']?)([A-Za-z0-9_-]*(?:secret|token|password|api[_-]?key|bearer)[A-Za-z0-9_-]*)\1\s*[:=]\s*["']([^"']{8,})["']/gi, "$1$2$1: \"<redacted>\""],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, "<redacted-anthropic-or-openai-key>"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, "<redacted-slack-token>"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/g, "<redacted-github-pat>"],
  [/\bghp_[A-Za-z0-9]{30,}\b/g, "<redacted-github-classic-token>"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "<redacted-aws-key-id>"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "<redacted-jwt>"],
  [/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----/g, "<redacted-private-key>"],
];

export function redact(input: string): string {
  let out = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export interface AuditLogger {
  toolCall(name: string, input: unknown): void;
  toolResult(name: string, output: unknown): void;
  dryRun(action: string, input: unknown): void;
  blocked(reason: string, name: string, input: unknown): void;
  message(role: string, text: string): void;
}

export function createAuditLogger(opts?: {
  sessionId?: string;
  filePath?: string;
  enabled?: boolean;
}): AuditLogger {
  const enabled = opts?.enabled ?? process.env.MICAH_AUDIT_LOG !== "0";
  const sessionId = opts?.sessionId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filePath =
    opts?.filePath ??
    process.env.MICAH_AUDIT_PATH ??
    resolve(process.cwd(), "logs", `${sessionId}.jsonl`);

  if (enabled) {
    try {
      mkdirSync(dirname(filePath), { recursive: true });
    } catch {
      /* best-effort */
    }
  }

  function write(event: AuditEvent) {
    if (!enabled) return;
    const line = redact(JSON.stringify(event)) + "\n";
    try {
      appendFileSync(filePath, line);
    } catch {
      /* best-effort; never crash the agent on logging */
    }
  }

  function event(kind: AuditEvent["kind"], data: Record<string, unknown>) {
    write({ ts: new Date().toISOString(), session: sessionId, kind, data });
  }

  return {
    toolCall: (name, input) => event("tool_call", { name, input }),
    toolResult: (name, output) => event("tool_result", { name, output: summarize(output) }),
    dryRun: (action, input) => event("dry_run", { action, input }),
    blocked: (reason, name, input) => event("blocked", { reason, name, input }),
    message: (role, text) => event("agent_message", { role, text: text.slice(0, 4000) }),
  };
}

function summarize(value: unknown): unknown {
  if (typeof value === "string" && value.length > 4000) {
    return value.slice(0, 4000) + `… [+${value.length - 4000} more chars]`;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, summarize(v)]),
    );
  }
  return value;
}

export function ensureAuditDirExists(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
