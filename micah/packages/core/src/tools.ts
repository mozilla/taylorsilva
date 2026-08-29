import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const execFileAsync = promisify(execFile);

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<RunResult> {
  try {
    const r = await execFileAsync(cmd, args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { stdout: r.stdout, stderr: r.stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? String(err),
      code: typeof e.code === "number" ? e.code : 1,
    };
  }
}

function reportRun(label: string, r: RunResult): { content: Array<{ type: "text"; text: string }> } {
  const text = [
    `${label} (exit ${r.code})`,
    r.stdout && `--- stdout ---\n${r.stdout.trim()}`,
    r.stderr && `--- stderr ---\n${r.stderr.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { content: [{ type: "text", text }] };
}

const cwdFor = (override?: string) => override ?? process.env.MICAH_CWD ?? process.cwd();

export const machLint = tool(
  "mach_lint",
  "Run `./mach lint` on a path inside a mozilla-central checkout. Read-only.",
  {
    path: z
      .string()
      .describe("Path to lint, relative to the mozilla-central root. Use '.' for the whole tree."),
    cwd: z.string().optional().describe("Override the checkout root. Defaults to MICAH_CWD."),
  },
  async ({ path, cwd }) => {
    const r = await run("./mach", ["lint", path], { cwd: cwdFor(cwd), timeoutMs: 600_000 });
    return reportRun(`mach lint ${path}`, r);
  },
);

export const searchfox = tool(
  "searchfox_search",
  "Search the mozilla-central codebase via searchfox-cli. Read-only.",
  {
    query: z.string().describe("Symbol, regex, or substring to search for."),
    repo: z
      .enum(["mozilla-central", "mozilla-mobile", "mozilla-services"])
      .default("mozilla-central"),
    limit: z.number().int().min(1).max(500).default(50),
  },
  async ({ query, repo, limit }) => {
    const r = await run(
      "searchfox-cli",
      ["search", "--repo", repo, "--limit", String(limit), query],
      { timeoutMs: 60_000 },
    );
    return reportRun(`searchfox-cli search ${repo} '${query}'`, r);
  },
);

export const tryStatus = tool(
  "try_status",
  "Fetch try-server status for a push via treeherder-cli. Read-only.",
  {
    revision: z.string().describe("The Mercurial or Git revision (or try push hash)."),
  },
  async ({ revision }) => {
    const r = await run("treeherder-cli", ["push", revision], { timeoutMs: 60_000 });
    return reportRun(`treeherder-cli push ${revision}`, r);
  },
);

export const mozPhabPatch = tool(
  "moz_phab_patch",
  "Download and apply a Phabricator revision to the local checkout (`moz-phab patch`). Modifies the working tree but never pushes — read-only with respect to Phabricator.",
  {
    revision: z
      .string()
      .regex(/^D?\d+$/)
      .describe("Phabricator revision id, e.g. 'D283228' or '283228'."),
    cwd: z.string().optional(),
  },
  async ({ revision, cwd }) => {
    const id = revision.startsWith("D") ? revision : `D${revision}`;
    const r = await run("moz-phab", ["patch", id], { cwd: cwdFor(cwd), timeoutMs: 120_000 });
    return reportRun(`moz-phab patch ${id}`, r);
  },
);

export function buildMicahToolServer() {
  return createSdkMcpServer({
    name: "micah-tools",
    version: "0.1.0",
    tools: [machLint, searchfox, tryStatus, mozPhabPatch],
  });
}
