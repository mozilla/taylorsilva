import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildSystemPrompt } from "./persona.js";
import { gate } from "./safety.js";
import { getMcpServers } from "./mcp.js";

export interface MicahInput {
  prompt: string;
  cwd?: string;
  resumeSessionId?: string;
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
];

export async function* runMicah(
  input: MicahInput,
): AsyncGenerator<MicahMessage> {
  const cwd = input.cwd ?? process.env.MICAH_CWD ?? process.cwd();
  const append = [buildSystemPrompt(), input.extraSystemPrompt ?? ""]
    .filter(Boolean)
    .join("\n\n");

  const options: Record<string, unknown> = {
    cwd,
    systemPrompt: { type: "preset", preset: "claude_code", append },
    mcpServers: getMcpServers(),
    allowedTools: ALLOWED_TOOLS,
    canUseTool: gate,
    permissionMode: "default",
  };
  if (input.resumeSessionId) options.resume = input.resumeSessionId;

  for await (const msg of query({ prompt: input.prompt, options } as never)) {
    yield msg;
  }
}
