import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

interface AuditEvent {
  ts: string;
  session: string;
  kind: string;
  data: Record<string, unknown>;
}

interface Filters {
  session?: string;
  kind?: string;
  last?: number;
}

function parseArgs(argv: string[]): { sub: string; opts: Filters; path?: string } {
  const sub = argv[0] ?? "show";
  const opts: Filters = {};
  let path: string | undefined;
  for (const arg of argv.slice(1)) {
    if (arg.startsWith("--session=")) opts.session = arg.slice("--session=".length);
    else if (arg.startsWith("--kind=")) opts.kind = arg.slice("--kind=".length);
    else if (arg.startsWith("--last=")) opts.last = Number(arg.slice("--last=".length));
    else if (arg.startsWith("--path=")) path = arg.slice("--path=".length);
  }
  return { sub, opts, path };
}

function discoverLogFiles(path?: string): string[] {
  if (path) return [path];
  const dir = process.env.MICAH_AUDIT_DIR ?? resolve(process.cwd(), "logs");
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
}

function parseEvents(files: string[]): AuditEvent[] {
  const out: AuditEvent[] = [];
  for (const file of files) {
    let body: string;
    try {
      body = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of body.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as AuditEvent);
      } catch {
        /* skip malformed line */
      }
    }
  }
  return out;
}

function applyFilters(events: AuditEvent[], f: Filters): AuditEvent[] {
  let out = events;
  if (f.session) out = out.filter((e) => e.session === f.session);
  if (f.kind) out = out.filter((e) => e.kind === f.kind);
  if (f.last && Number.isFinite(f.last)) out = out.slice(-f.last);
  return out;
}

function format(event: AuditEvent): string {
  const ts = event.ts.replace("T", " ").replace(/\.\d+Z$/, "Z");
  const tag = `[${event.kind}]`.padEnd(14);
  const sess = `(${event.session.slice(0, 8)})`;
  const data = inlineSummary(event.data);
  return `${ts} ${tag} ${sess} ${data}`;
}

function inlineSummary(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    let s: string;
    if (typeof v === "string") s = v.length > 200 ? v.slice(0, 200) + "…" : v;
    else s = JSON.stringify(v);
    if (s && s.length > 200) s = s.slice(0, 200) + "…";
    parts.push(`${k}=${s}`);
  }
  return parts.join(" ");
}

export async function auditCommand(argv: string[]): Promise<void> {
  const { sub, opts, path } = parseArgs(argv);
  if (sub !== "show") {
    console.error(`unknown audit subcommand: ${sub}`);
    process.exit(2);
  }

  const files = discoverLogFiles(path);
  if (files.length === 0) {
    console.error("no audit log files found in logs/. set MICAH_AUDIT_DIR or pass --path.");
    process.exit(1);
  }

  const events = applyFilters(parseEvents(files), opts);
  if (events.length === 0) {
    console.error("no events match those filters.");
    process.exit(0);
  }

  for (const e of events) {
    console.log(format(e));
  }
}
