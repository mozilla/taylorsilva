import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildSystemPrompt } from "./persona.js";
import { gate } from "./safety.js";
import { getMcpServers } from "./mcp.js";
import { buildMicahToolServer } from "./tools.js";
import { preToolUseHook } from "./hooks.js";
import { agents } from "./agents.js";
import { getSessionId, setSessionId } from "./sessions.js";

export interface MicahInput {
  prompt: string;
  cwd?: string;
  sessionKey?: string;
  extraSystemPrompt?: string;
}

export type MicahMessage = unknown;

const ALLOWED_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Grep",
  "Glob",
  "WebFetch",
  "WebSearch",
  "mcp__moz",
  "mcp__micah-tools",
];

function captureSessionId(msg: unknown): string | undefined {
  if (!msg || typeof msg !== "object") return undefined;
  const m = msg as { type?: string; subtype?: string; session_id?: string };
  if (m.type === "system" && m.subtype === "init" && m.session_id) {
    return m.session_id;
  }
  return undefined;
}

export async function* runMicah(
  input: MicahInput,
): AsyncGenerator<MicahMessage> {
  const cwd = input.cwd ?? process.env.MICAH_CWD ?? process.cwd();
  const append = [buildSystemPrompt(), input.extraSystemPrompt ?? ""]
    .filter(Boolean)
    .join("\n\n");

  const mcpServers = {
    ...getMcpServers(),
    "micah-tools": buildMicahToolServer(),
  };

  const resume = input.sessionKey ? getSessionId(input.sessionKey) : undefined;

  const options: Record<string, unknown> = {
    cwd,
    systemPrompt: { type: "preset", preset: "claude_code", append },
    mcpServers,
    agents,
    allowedTools: ALLOWED_TOOLS,
    canUseTool: gate,
    permissionMode: "default",
    hooks: {
      PreToolUse: [
        {
          hooks: [
            async (hookInput: unknown) =>
              preToolUseHook(
                hookInput as { tool_name: string; tool_input: unknown },
              ),
          ],
        },
      ],
    },
  };
  if (resume) options.resume = resume;

  for await (const msg of query({ prompt: input.prompt, options } as never)) {
    if (input.sessionKey) {
      const id = captureSessionId(msg);
      if (id) setSessionId(input.sessionKey, id);
    }
    yield msg;
  }
}
