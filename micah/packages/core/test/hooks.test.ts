import { test } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { checkCredentialPath, preToolUseHook } from "../src/hooks.js";

const HOME = homedir();

test("blocks .aws credentials", () => {
  const r = checkCredentialPath(`${HOME}/.aws/credentials`);
  assert.equal(r.blocked, true);
});

test("blocks .ssh keys", () => {
  for (const p of [
    `${HOME}/.ssh/id_rsa`,
    `${HOME}/.ssh/id_ed25519`,
    `${HOME}/.ssh/known_hosts`,
  ]) {
    assert.equal(checkCredentialPath(p).blocked, true, p);
  }
});

test("blocks .pem and .key files", () => {
  for (const p of ["/etc/ssl/private.pem", "/tmp/server.key", "./id_rsa.pub"]) {
    assert.equal(checkCredentialPath(p).blocked, true, p);
  }
});

test("blocks .env files but allows .env.example", () => {
  assert.equal(checkCredentialPath("./.env").blocked, true);
  assert.equal(checkCredentialPath("./.env.production").blocked, true);
  assert.equal(checkCredentialPath("./.env.example").blocked, false);
  assert.equal(checkCredentialPath("./.env.sample").blocked, false);
});

test("blocks credentials.json, secrets.yaml, token.txt", () => {
  for (const p of [
    "./credentials.json",
    "./secrets.yaml",
    "./auth.json",
    "./token.txt",
  ]) {
    assert.equal(checkCredentialPath(p).blocked, true, p);
  }
});

test("blocks kubeconfig and gcloud config", () => {
  assert.equal(checkCredentialPath(`${HOME}/.kube/config`).blocked, true);
  assert.equal(
    checkCredentialPath(`${HOME}/.config/gcloud/credentials.db`).blocked,
    true,
  );
});

test("allows ordinary source files", () => {
  for (const p of [
    "./src/index.ts",
    "./README.md",
    "./MICAH.md",
    "./packages/core/src/agent.ts",
    "./browser/components/SmartWindow.jsm",
  ]) {
    assert.equal(checkCredentialPath(p).blocked, false, p);
  }
});

test("preToolUseHook blocks Read on .aws/credentials", async () => {
  const r = await preToolUseHook({
    tool_name: "Read",
    tool_input: { file_path: `${HOME}/.aws/credentials` },
  });
  assert.equal(r.decision, "block");
});

test("preToolUseHook allows Read on regular files", async () => {
  const r = await preToolUseHook({
    tool_name: "Read",
    tool_input: { file_path: "./README.md" },
  });
  assert.equal(r.decision, undefined);
});

test("preToolUseHook blocks `cat ~/.aws/credentials` via Bash", async () => {
  const r = await preToolUseHook({
    tool_name: "Bash",
    tool_input: { command: "cat ~/.aws/credentials" },
  });
  assert.equal(r.decision, "block");
});

test("preToolUseHook blocks bare 'env' shell dump", async () => {
  const r = await preToolUseHook({
    tool_name: "Bash",
    tool_input: { command: "env" },
  });
  assert.equal(r.decision, "block");
});

test("preToolUseHook allows env-prefixed command (env VAR=x foo)", async () => {
  const r = await preToolUseHook({
    tool_name: "Bash",
    tool_input: { command: "env DEBUG=1 ./mach test" },
  });
  assert.equal(r.decision, undefined);
});

test("preToolUseHook allows piped env (env | grep -v TOKEN)", async () => {
  const r = await preToolUseHook({
    tool_name: "Bash",
    tool_input: { command: "env | grep -v TOKEN" },
  });
  assert.equal(r.decision, undefined);
});
