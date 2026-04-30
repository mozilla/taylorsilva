import { createAuditLogger, type AuditLogger } from "./audit.js";

type CanUseToolResult =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string; interrupt?: boolean };

let sharedAudit: AuditLogger | null = null;

function audit(): AuditLogger {
  if (!sharedAudit) sharedAudit = createAuditLogger();
  return sharedAudit;
}

export function setAuditLogger(logger: AuditLogger | null): void {
  sharedAudit = logger;
}

const WRITE_BASH_PATTERNS: RegExp[] = [
  /\bmoz-phab\s+(submit|land)\b/,
  /\bmach\s+try\b/,
  /\bgit\s+push\b/,
  /\bgit\s+(commit|tag)\s+.*--sign/,
  /\bhg\s+push\b/,
  /\bhg\s+(commit|amend)\b.*--push/,
  /\bgh\s+pr\s+(create|merge|close|edit)\b/,
  /\bgh\s+issue\s+(create|edit|close|comment)\b/,
  /\bgh\s+release\s+create\b/,
  /\bgh\s+api\s+.*\s-X\s+(POST|PUT|PATCH|DELETE)\b/,
  /\bnpm\s+publish\b/,
  /\bcargo\s+publish\b/,
  /\bbq\s+(insert|load|cp|rm|update)\b/,
  /\bgcloud\s+.*\s(create|delete|update|deploy)\b/,
];

const WRITE_MCP_TOOL_PREFIXES: RegExp[] = [
  /^create_/i,
  /^update_/i,
  /^delete_/i,
  /^post_/i,
  /^submit_/i,
  /^write_/i,
  /^add_comment/i,
  /^add_inline_comment/i,
  /^needinfo/i,
  /^assign_/i,
  /^transition_/i,
  /^merge_/i,
  /^edit_/i,
];

export function isWriteCommand(command: string): boolean {
  return WRITE_BASH_PATTERNS.some((p) => p.test(command));
}

export function isWriteToolName(name: string): boolean {
  const tail = name.includes("__") ? name.split("__").pop()! : name;
  return WRITE_MCP_TOOL_PREFIXES.some((p) => p.test(tail));
}

function dryRunMessage(action: string): string {
  return [
    `[micah:dry-run] ${action}`,
    "Write mode is disabled (MICAH_WRITE_ENABLED!=1). Treat this as the deliverable;",
    "the operator will replay it once they're ready.",
  ].join(" ");
}

export const gate = async (
  toolName: string,
  input: Record<string, unknown>,
): Promise<CanUseToolResult> => {
  const writeEnabled = process.env.MICAH_WRITE_ENABLED === "1";
  if (writeEnabled) return { behavior: "allow", updatedInput: input };

  if (toolName === "Bash" && typeof input?.command === "string") {
    const cmd = input.command as string;
    if (isWriteCommand(cmd)) {
      const action = `shell: ${cmd}`;
      audit().dryRun(action, input);
      return {
        behavior: "deny",
        message: dryRunMessage(`Would have run ${action}`),
      };
    }
  }

  if (isWriteToolName(toolName)) {
    audit().dryRun(toolName, input);
    return {
      behavior: "deny",
      message: dryRunMessage(
        `Would have called ${toolName} with ${JSON.stringify(input)}`,
      ),
    };
  }

  return { behavior: "allow", updatedInput: input };
};
