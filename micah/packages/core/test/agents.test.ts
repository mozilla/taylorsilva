import { test } from "node:test";
import assert from "node:assert/strict";
import { agents, listAgents } from "../src/agents.js";

test("registry exposes the four subagents", () => {
  const names = Object.keys(agents).sort();
  assert.deepEqual(names, [
    "bug-triager",
    "incident-responder",
    "patch-author",
    "reviewer",
  ]);
});

test("each subagent has a description and prompt", () => {
  for (const [name, def] of Object.entries(agents)) {
    assert.ok(def.description.length > 20, `${name}: description too short`);
    assert.ok(def.prompt.length > 100, `${name}: prompt too short`);
  }
});

test("read-only subagents do not list write tools", () => {
  const readOnly = ["bug-triager", "reviewer", "incident-responder"];
  const writeTools = new Set(["Bash", "Write", "Edit", "NotebookEdit"]);
  for (const name of readOnly) {
    const tools = agents[name].tools ?? [];
    for (const t of tools) {
      assert.equal(
        writeTools.has(t),
        false,
        `${name} should not have write tool ${t}`,
      );
    }
  }
});

test("patch-author has local edit tools but the safety gate still blocks pushes", () => {
  const tools = agents["patch-author"].tools ?? [];
  assert.ok(tools.includes("Bash"), "patch-author needs Bash for ./mach");
  assert.ok(tools.includes("Edit"), "patch-author needs Edit for files");
  // The gate (separate concern) prevents moz-phab submit, mach try, git push.
});

test("listAgents returns all agents with metadata", () => {
  const list = listAgents();
  assert.equal(list.length, 4);
  for (const a of list) {
    assert.ok(a.name);
    assert.ok(a.description);
  }
});

test("subagent prompts mention their key constraints", () => {
  assert.match(agents["bug-triager"].prompt, /\[aife\]|\[aimodels\]|\[aiplatform\]/);
  assert.match(agents.reviewer.prompt, /Phabricator|GitHub PR/);
  assert.match(agents["incident-responder"].prompt, /Sentry|Grafana|CrashLoopBackOff/);
  assert.match(agents["patch-author"].prompt, /mach lint|moz-phab/);
});

test("incident-responder prompt forbids destructive ops", () => {
  assert.match(agents["incident-responder"].prompt, /NEVER suggest 'kubectl delete'/);
});

test("patch-author prompt forbids pushing", () => {
  assert.match(
    agents["patch-author"].prompt,
    /Do NOT moz-phab submit|Do NOT mach try|Do NOT git push/,
  );
});
