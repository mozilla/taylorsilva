import bolt from "@slack/bolt";
import { runMicah } from "@micah/core";

const { App } = bolt;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
});

function extractText(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const m = msg as Record<string, unknown>;
  if (m.type !== "assistant" || !m.message || typeof m.message !== "object")
    return "";
  const content = (m.message as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c: unknown) => {
      if (c && typeof c === "object" && "text" in c)
        return String((c as { text: unknown }).text);
      return "";
    })
    .join("");
}

async function handle(prompt: string, postUpdate: (text: string) => Promise<void>) {
  let buffer = "";
  let lastFlush = Date.now();
  for await (const msg of runMicah({ prompt })) {
    const text = extractText(msg);
    if (!text) continue;
    buffer += text;
    if (Date.now() - lastFlush > 1500) {
      await postUpdate(buffer);
      lastFlush = Date.now();
    }
  }
  if (buffer) await postUpdate(buffer);
}

app.event("app_mention", async ({ event, client }) => {
  const e = event as { text: string; channel: string; thread_ts?: string; ts: string };
  const prompt = e.text.replace(/<@[^>]+>\s*/g, "").trim();
  const thread_ts = e.thread_ts ?? e.ts;
  const placeholder = await client.chat.postMessage({
    channel: e.channel,
    thread_ts,
    text: "_thinking…_",
  });
  await handle(prompt, async (text) => {
    await client.chat.update({
      channel: e.channel,
      ts: placeholder.ts!,
      text,
    });
  });
});

app.message(async ({ message, client }) => {
  const m = message as {
    channel_type?: string;
    text?: string;
    channel: string;
    user?: string;
    bot_id?: string;
  };
  if (m.channel_type !== "im" || !m.text || m.bot_id) return;
  const placeholder = await client.chat.postMessage({
    channel: m.channel,
    text: "_thinking…_",
  });
  await handle(m.text, async (text) => {
    await client.chat.update({
      channel: m.channel,
      ts: placeholder.ts!,
      text,
    });
  });
});

(async () => {
  await app.start();
  console.log("[micah:slack] connected via Socket Mode");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
