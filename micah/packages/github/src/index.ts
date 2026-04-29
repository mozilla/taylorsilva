import { createServer } from "node:http";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { runMicah, buildGitHubPrompt } from "@micah/core";

const MENTION = /(^|\s)@micah(\b|\s)/i;

const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET ?? "dev",
});

function octokitFor(installationId: number): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      installationId,
    },
  });
}

function extractText(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const m = msg as Record<string, unknown>;
  if (m.type !== "assistant" || !m.message || typeof m.message !== "object")
    return "";
  const content = (m.message as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c: unknown) =>
      c && typeof c === "object" && "text" in c
        ? String((c as { text: unknown }).text)
        : "",
    )
    .join("");
}

async function collect(prompt: string): Promise<string> {
  let out = "";
  for await (const msg of runMicah({ prompt })) out += extractText(msg);
  return out.trim();
}

webhooks.on("issue_comment.created", async ({ payload }) => {
  const body = payload.comment.body ?? "";
  if (!MENTION.test(body) || payload.comment.user?.type === "Bot") return;
  const installationId = payload.installation?.id;
  if (!installationId) return;
  const octokit = octokitFor(installationId);
  const prompt = buildGitHubPrompt({
    repo: payload.repository.full_name,
    kind: "issue_comment",
    number: payload.issue.number,
    author: payload.comment.user?.login,
    url: payload.comment.html_url,
    title: payload.issue.title,
    body,
    issueBody: payload.issue.body ?? undefined,
  });
  const reply = await collect(prompt);
  await octokit.issues.createComment({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body: reply || "_(empty response)_",
  });
});

webhooks.on("pull_request_review_comment.created", async ({ payload }) => {
  const body = payload.comment.body ?? "";
  if (!MENTION.test(body) || payload.comment.user?.type === "Bot") return;
  const installationId = payload.installation?.id;
  if (!installationId) return;
  const octokit = octokitFor(installationId);
  const prompt = buildGitHubPrompt({
    repo: payload.repository.full_name,
    kind: "pr_review_comment",
    number: payload.pull_request.number,
    author: payload.comment.user?.login,
    url: payload.comment.html_url,
    filePath: payload.comment.path,
    diffHunk: payload.comment.diff_hunk,
    body,
  });
  const reply = await collect(prompt);
  await octokit.pulls.createReplyForReviewComment({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    pull_number: payload.pull_request.number,
    comment_id: payload.comment.id,
    body: reply || "_(empty response)_",
  });
});

webhooks.on("issues.assigned", async ({ payload }) => {
  if (payload.assignee?.login !== "micah") return;
  const installationId = payload.installation?.id;
  if (!installationId) return;
  const octokit = octokitFor(installationId);
  const prompt = buildGitHubPrompt({
    repo: payload.repository.full_name,
    kind: "issue_assigned",
    number: payload.issue.number,
    url: payload.issue.html_url,
    title: payload.issue.title,
    issueBody: payload.issue.body ?? undefined,
    followup:
      "You've been assigned this issue. Post a brief plan as the first comment, then wait for go-ahead before doing the work.",
  });
  const reply = await collect(prompt);
  await octokit.issues.createComment({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body: reply || "_(empty response)_",
  });
});

webhooks.onError((error) => {
  console.error("[micah:github] webhook error", error);
});

const port = Number(process.env.GITHUB_PORT ?? 8787);
const server = createServer(
  createNodeMiddleware(webhooks, { path: "/webhook" }),
);
server.listen(port, () => {
  console.log(`[micah:github] listening on :${port}/webhook`);
});
