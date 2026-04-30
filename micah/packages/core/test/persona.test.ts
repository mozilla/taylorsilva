import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../src/persona.js";

test("system prompt includes MICAH.md identity", () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /You are \*\*Micah\*\*/);
  assert.match(prompt, /Firefox AI and ML Team/);
});

test("system prompt includes voice examples", () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /Voice examples/);
  assert.match(prompt, /Phabricator — review comment/);
});

test("system prompt includes house style", () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /House style/);
  assert.match(prompt, /Bug NNNNNN/);
});

test("system prompt advertises write-mode state", () => {
  const prev = process.env.MICAH_WRITE_ENABLED;
  delete process.env.MICAH_WRITE_ENABLED;
  try {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /Write mode is DISABLED/);
  } finally {
    if (prev !== undefined) process.env.MICAH_WRITE_ENABLED = prev;
  }
});

test("system prompt flips when write mode is enabled", () => {
  const prev = process.env.MICAH_WRITE_ENABLED;
  process.env.MICAH_WRITE_ENABLED = "1";
  try {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /Write mode is ENABLED/);
  } finally {
    if (prev === undefined) delete process.env.MICAH_WRITE_ENABLED;
    else process.env.MICAH_WRITE_ENABLED = prev;
  }
});

test("system prompt mentions key Mozilla AI policy guardrails", () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /Firefox Development MCP/);
  assert.match(prompt, /MICAH_WRITE_ENABLED/);
  assert.match(prompt, /credentials, tokens, cookies/);
});
