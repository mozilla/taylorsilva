import {
  MatrixClient,
  SimpleFsStorageProvider,
  AutojoinRoomsMixin,
  RustSdkCryptoStorageProvider,
} from "matrix-bot-sdk";
import { runMicah, matrixKey } from "@micah/core";
import { resolve } from "node:path";

const homeserver = process.env.MATRIX_HOMESERVER_URL ?? "https://chat.mozilla.org";
const accessToken = process.env.MATRIX_ACCESS_TOKEN;
const dataDir = process.env.MATRIX_DATA_DIR ?? resolve(process.cwd(), "matrix-data");
const mention = (process.env.MATRIX_MENTION ?? "@micah").toLowerCase();

if (!accessToken) {
  console.error("[micah:matrix] MATRIX_ACCESS_TOKEN is required");
  process.exit(2);
}

const storage = new SimpleFsStorageProvider(resolve(dataDir, "bot.json"));
let crypto: RustSdkCryptoStorageProvider | undefined;
try {
  crypto = new RustSdkCryptoStorageProvider(resolve(dataDir, "crypto"));
} catch {
  crypto = undefined;
}

const client = new MatrixClient(homeserver, accessToken, storage, crypto);
AutojoinRoomsMixin.setupOnClient(client);

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

async function handle(
  roomId: string,
  prompt: string,
  threadId: string | undefined,
  reply: (text: string) => Promise<void>,
) {
  let buffer = "";
  let last = Date.now();
  for await (const msg of runMicah({
    prompt,
    sessionKey: matrixKey(roomId, threadId),
  })) {
    const text = extractText(msg);
    if (!text) continue;
    buffer += text;
    if (Date.now() - last > 1500) {
      await reply(buffer);
      last = Date.now();
    }
  }
  if (buffer) await reply(buffer);
}

let myUserId = "";

client.on("room.message", async (roomId: string, event: any) => {
  if (!event?.content || event.sender === myUserId) return;
  if (event.content.msgtype !== "m.text") return;
  const body: string = event.content.body ?? "";
  const isMentioned =
    body.toLowerCase().includes(mention) ||
    (event.content["m.mentions"]?.user_ids ?? []).includes(myUserId);
  if (!isMentioned) return;

  const threadId =
    event.content["m.relates_to"]?.["rel_type"] === "m.thread"
      ? (event.content["m.relates_to"]["event_id"] as string)
      : undefined;
  const prompt = body.replace(new RegExp(mention, "ig"), "").trim();

  let lastEventId: string | null = null;

  await handle(roomId, prompt, threadId, async (text) => {
    if (!lastEventId) {
      lastEventId = await client.sendMessage(roomId, {
        msgtype: "m.text",
        body: text,
        ...(threadId
          ? { "m.relates_to": { rel_type: "m.thread", event_id: threadId } }
          : {}),
      });
      return;
    }
    await client.sendMessage(roomId, {
      msgtype: "m.text",
      body: text,
      "m.new_content": { msgtype: "m.text", body: text },
      "m.relates_to": {
        rel_type: "m.replace",
        event_id: lastEventId,
        ...(threadId
          ? { "m.in_reply_to": { event_id: threadId }, is_falling_back: true }
          : {}),
      },
    });
  });
});

(async () => {
  myUserId = await client.getUserId();
  console.log(`[micah:matrix] starting as ${myUserId} on ${homeserver}`);
  await client.start();
  console.log("[micah:matrix] connected, listening for mentions");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
