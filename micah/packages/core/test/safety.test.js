import { test } from "node:test";
import assert from "node:assert/strict";
import { isWriteCommand, isWriteToolName, gate } from "../src/safety.js";
test("isWriteCommand recognizes external push commands", () => {
    const writes = [
        "moz-phab submit",
        "moz-phab submit --update",
        "./mach try fuzzy",
        "git push origin main",
        "hg push",
        "gh pr create --draft",
        "gh issue create --title 'foo'",
        "gh release create v1",
        "npm publish",
        "cargo publish",
        "gcloud compute instances create foo",
        "gh api repos/foo/bar/issues -X POST",
    ];
    for (const cmd of writes) {
        assert.equal(isWriteCommand(cmd), true, `should flag: ${cmd}`);
    }
});
test("isWriteCommand allows read-only commands", () => {
    const reads = [
        "./mach build",
        "./mach lint",
        "./mach test --headless",
        "git status",
        "git diff",
        "git log --oneline",
        "hg status",
        "moz-phab patch D283228",
        "gh pr view 123",
        "gh api repos/foo/bar/issues",
        "kubectl get pods -n llm-proxy-prod",
        "rg 'foo' --type ts",
        "searchfox-cli search 'nsImageLoader'",
    ];
    for (const cmd of reads) {
        assert.equal(isWriteCommand(cmd), false, `should allow: ${cmd}`);
    }
});
test("isWriteToolName flags MCP write-shaped tools", () => {
    const writes = [
        "create_issue",
        "update_pull_request",
        "delete_branch",
        "post_comment",
        "submit_revision",
        "moz__add_inline_comment",
        "moz__needinfo_user",
        "transition_jira_issue",
        "merge_pull_request",
        "edit_jira_issue",
    ];
    for (const name of writes) {
        assert.equal(isWriteToolName(name), true, `should flag: ${name}`);
    }
});
test("isWriteToolName allows MCP read tools", () => {
    const reads = [
        "search_files",
        "get_file_contents",
        "list_pull_requests",
        "moz__searchfox_search",
        "get_jira_issue",
        "list_branches",
    ];
    for (const name of reads) {
        assert.equal(isWriteToolName(name), false, `should allow: ${name}`);
    }
});
test("gate denies write Bash when MICAH_WRITE_ENABLED is not 1", async () => {
    const prev = process.env.MICAH_WRITE_ENABLED;
    delete process.env.MICAH_WRITE_ENABLED;
    try {
        const r = await gate("Bash", { command: "moz-phab submit" });
        assert.equal(r.behavior, "deny");
        assert.match(r.behavior === "deny" ? r.message : "", /\[micah:dry-run\]/);
    }
    finally {
        if (prev !== undefined)
            process.env.MICAH_WRITE_ENABLED = prev;
    }
});
test("gate allows write Bash when MICAH_WRITE_ENABLED=1", async () => {
    const prev = process.env.MICAH_WRITE_ENABLED;
    process.env.MICAH_WRITE_ENABLED = "1";
    try {
        const r = await gate("Bash", { command: "moz-phab submit" });
        assert.equal(r.behavior, "allow");
    }
    finally {
        if (prev === undefined)
            delete process.env.MICAH_WRITE_ENABLED;
        else
            process.env.MICAH_WRITE_ENABLED = prev;
    }
});
test("gate allows read-only Bash regardless of write mode", async () => {
    const prev = process.env.MICAH_WRITE_ENABLED;
    delete process.env.MICAH_WRITE_ENABLED;
    try {
        const r = await gate("Bash", { command: "./mach lint" });
        assert.equal(r.behavior, "allow");
    }
    finally {
        if (prev !== undefined)
            process.env.MICAH_WRITE_ENABLED = prev;
    }
});
test("gate denies MCP write tools by name shape", async () => {
    const prev = process.env.MICAH_WRITE_ENABLED;
    delete process.env.MICAH_WRITE_ENABLED;
    try {
        const r = await gate("create_issue", { title: "foo" });
        assert.equal(r.behavior, "deny");
    }
    finally {
        if (prev !== undefined)
            process.env.MICAH_WRITE_ENABLED = prev;
    }
});
//# sourceMappingURL=safety.test.js.map