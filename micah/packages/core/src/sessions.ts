import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface SessionRecord {
  id: string;
  updatedAt: string;
}

const store = new Map<string, SessionRecord>();
let persistPath: string | null = null;
let loaded = false;

export function configureSessions(opts?: {
  path?: string | null;
  ephemeral?: boolean;
}): void {
  if (opts?.ephemeral) {
    persistPath = null;
    return;
  }
  persistPath =
    opts?.path ??
    process.env.MICAH_SESSIONS_PATH ??
    resolve(process.cwd(), "logs", "sessions.json");
  loaded = false;
  loadIfNeeded();
}

function loadIfNeeded(): void {
  if (loaded || !persistPath) return;
  loaded = true;
  if (!existsSync(persistPath)) return;
  try {
    const raw = readFileSync(persistPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, SessionRecord>;
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.id === "string") store.set(k, v);
    }
  } catch {
    /* ignore corrupt store */
  }
}

function persist(): void {
  if (!persistPath) return;
  try {
    mkdirSync(dirname(persistPath), { recursive: true });
    const obj = Object.fromEntries(store);
    writeFileSync(persistPath, JSON.stringify(obj, null, 2));
  } catch {
    /* best-effort */
  }
}

export function getSessionId(key: string): string | undefined {
  loadIfNeeded();
  return store.get(key)?.id;
}

export function setSessionId(key: string, id: string): void {
  loadIfNeeded();
  store.set(key, { id, updatedAt: new Date().toISOString() });
  persist();
}

export function clearSession(key: string): void {
  loadIfNeeded();
  store.delete(key);
  persist();
}

export function clearAllSessions(): void {
  store.clear();
  persist();
}

export function listSessions(): Array<{ key: string; id: string; updatedAt: string }> {
  loadIfNeeded();
  return [...store.entries()].map(([key, v]) => ({ key, ...v }));
}

export function slackKey(channel: string, threadTs?: string, userId?: string): string {
  if (threadTs) return `slack:${channel}:${threadTs}`;
  if (userId) return `slack:dm:${userId}`;
  return `slack:${channel}`;
}

export function githubKey(repoFull: string, number: number): string {
  return `github:${repoFull}#${number}`;
}

export function matrixKey(roomId: string, threadId?: string): string {
  return threadId ? `matrix:${roomId}:${threadId}` : `matrix:${roomId}`;
}
