import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configureSessions,
  getSessionId,
  setSessionId,
  clearSession,
  clearAllSessions,
  listSessions,
  slackKey,
  githubKey,
  matrixKey,
} from "../src/sessions.js";

test("session keys for each adapter", () => {
  assert.equal(slackKey("C123", "1234.5"), "slack:C123:1234.5");
  assert.equal(slackKey("C123"), "slack:C123");
  assert.equal(slackKey("D456", undefined, "U789"), "slack:dm:U789");
  assert.equal(githubKey("Firefox-AI/MLPA", 42), "github:Firefox-AI/MLPA#42");
  assert.equal(matrixKey("!abc:mozilla.org"), "matrix:!abc:mozilla.org");
  assert.equal(
    matrixKey("!abc:mozilla.org", "$thread"),
    "matrix:!abc:mozilla.org:$thread",
  );
});

test("set/get session id round-trips ephemerally", () => {
  configureSessions({ ephemeral: true });
  clearAllSessions();
  setSessionId("slack:C1:t1", "sess-abc");
  assert.equal(getSessionId("slack:C1:t1"), "sess-abc");
  clearSession("slack:C1:t1");
  assert.equal(getSessionId("slack:C1:t1"), undefined);
});

test("listSessions returns all keys with metadata", () => {
  configureSessions({ ephemeral: true });
  clearAllSessions();
  setSessionId("a", "1");
  setSessionId("b", "2");
  const list = listSessions().sort((x, y) => x.key.localeCompare(y.key));
  assert.equal(list.length, 2);
  assert.equal(list[0].key, "a");
  assert.equal(list[0].id, "1");
  assert.ok(list[0].updatedAt);
});

test("session store persists to disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "micah-sessions-"));
  const path = join(dir, "sessions.json");
  configureSessions({ path });
  clearAllSessions();
  setSessionId("github:Firefox-AI/MLPA#42", "sess-123");

  // Reload by reconfiguring
  configureSessions({ path });
  assert.equal(getSessionId("github:Firefox-AI/MLPA#42"), "sess-123");
});

test("session store ignores corrupt files", () => {
  const dir = mkdtempSync(join(tmpdir(), "micah-sessions-"));
  const path = join(dir, "sessions.json");
  writeFileSync(path, "{not valid json");
  configureSessions({ path });
  // Should not throw, should just be empty
  assert.equal(getSessionId("anything"), undefined);
});
