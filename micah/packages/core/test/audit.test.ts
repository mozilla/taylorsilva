import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, createAuditLogger } from "../src/audit.js";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("redact strips Anthropic/OpenAI sk- keys", () => {
  const text = "key=sk-ant-api03-abcdefghijklmnopqrstuvwx done";
  const out = redact(text);
  assert.equal(out.includes("sk-ant"), false);
  assert.match(out, /<redacted-anthropic-or-openai-key>/);
});

test("redact strips Slack tokens", () => {
  const text = "SLACK_BOT_TOKEN=xoxb-1234567890-abcdef-ghijkl";
  const out = redact(text);
  assert.equal(out.includes("xoxb-1234567890"), false);
  assert.match(out, /<redacted-slack-token>/);
});

test("redact strips GitHub PATs", () => {
  const text = "token=github_pat_11AAAAAAA0BBBBBBB000123456789012345678901234567890";
  const out = redact(text);
  assert.equal(out.includes("github_pat_11"), false);
  assert.match(out, /<redacted-github-pat>/);
});

test("redact strips classic ghp_ tokens", () => {
  const text = "auth: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const out = redact(text);
  assert.match(out, /<redacted-github-classic-token>/);
});

test("redact strips AWS access key IDs", () => {
  const text = "id=AKIAIOSFODNN7EXAMPLE";
  const out = redact(text);
  assert.match(out, /<redacted-aws-key-id>/);
});

test("redact strips JWTs", () => {
  const text = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYm9iIn0.signaturehere";
  const out = redact(text);
  assert.match(out, /<redacted-jwt>/);
});

test("redact strips PEM private keys", () => {
  const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
-----END RSA PRIVATE KEY-----`;
  const out = redact(text);
  assert.match(out, /<redacted-private-key>/);
});

test("redact strips inline secret/token assignments", () => {
  const cases = [
    `api_key: "abcdef1234567890"`,
    `password = "hunter2hunter2"`,
    `BEARER_TOKEN="aaaaaaaaaaaaaaaa"`,
  ];
  for (const c of cases) {
    const out = redact(c);
    assert.match(out, /<redacted>/, c);
  }
});

test("redact leaves benign text alone", () => {
  const text = "the bug is in mlpa-stage; replicas=2; sasha is on it";
  assert.equal(redact(text), text);
});

test("createAuditLogger writes redacted JSONL events", () => {
  const dir = mkdtempSync(join(tmpdir(), "micah-audit-"));
  const path = join(dir, "session.jsonl");
  const log = createAuditLogger({ sessionId: "test-1", filePath: path });

  log.toolCall("Bash", { command: "git status" });
  log.dryRun("shell: git push origin main", { command: "git push origin main" });
  log.blocked("credential file", "Read", { file_path: "~/.aws/credentials" });
  log.message("assistant", "API key is sk-ant-api03-secretkeyhere1234567890.");

  const lines = readFileSync(path, "utf8").trim().split("\n");
  assert.equal(lines.length, 4);
  for (const line of lines) {
    const evt = JSON.parse(line);
    assert.equal(evt.session, "test-1");
    assert.ok(evt.ts);
    assert.ok(evt.kind);
  }
  // Last message should have its API key redacted
  const last = JSON.parse(lines[3]);
  assert.equal(last.data.text.includes("sk-ant"), false);
  assert.match(last.data.text, /<redacted-anthropic-or-openai-key>/);
});

test("audit logger is no-op when disabled", () => {
  const dir = mkdtempSync(join(tmpdir(), "micah-audit-"));
  const path = join(dir, "session.jsonl");
  const log = createAuditLogger({ sessionId: "test-2", filePath: path, enabled: false });
  log.toolCall("Bash", { command: "git status" });
  // File should not exist
  let exists = false;
  try {
    readFileSync(path, "utf8");
    exists = true;
  } catch {
    /* expected */
  }
  assert.equal(exists, false);
});
