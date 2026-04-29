import { createServer } from "node:http";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { runMicah } from "@micah/core";

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
  const reply = await collect(
    `GitHub issue comment in ${payload.repository.full_name}#${payload.issue.number} from @${payload.comment.user.login}:\n\n${body}\n\nIssue title: ${payload.issue.title}\nIssue body:\n${payload.issue.body ?? ""}`,
  );
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
  const reply = await collect(
    `GitHub PR review comment in ${payload.repository.full_name}#${payload.pull_request.number}:\n\nFile: ${payload.comment.path}\nDiff hunk:\n${payload.comment.diff_hunk}\n\nComment:\n${body}`,
  );
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
  const reply = await collect(
    `You've been assigned a GitHub issue in ${payload.repository.full_name}#${payload.issue.number}.\n\nTitle: ${payload.issue.title}\n\nBody:\n${payload.issue.body ?? ""}\n\nPost a brief plan as the first comment, then wait for go-ahead before doing the work.`,
  );
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
