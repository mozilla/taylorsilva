# Micah deployment runbook

How to provision the GitHub App, Slack App, and Matrix bot account that
Micah needs at runtime. Independent of the Claude Code session that's
building him.

Until you flip `MICAH_WRITE_ENABLED=1`, every external write Micah would
make is dry-run; you can deploy these with confidence and watch the
audit log first.

---

## 1. Anthropic credentials

Two ways:

- **Personal dev / CLI**: log in via `claude` CLI (Option 2 — Anthropic
  Console). Micah's CLI inherits the SSO token. No env var needed.
- **Headless adapter**: order Claude Code through the Mozilla Service Desk
  Catalog (`Supported Mozilla Application List` → Approved Enterprise LLM
  Tools), then issue an API key from the resulting Console workspace and
  set `ANTHROPIC_API_KEY=...` in the adapter's environment.

Don't keep a personal-plan key — Mozilla's enterprise license is the one
that has the privacy/security/legal protections.

---

## 2. GitHub App

Use a GitHub App (not a PAT). PATs leak more easily and don't scope.

1. **Create the app** at
   `https://github.com/organizations/Firefox-AI/settings/apps/new`
   (or wherever your org owner says to). Suggested name: `Micah`.
   Public: no. Webhook URL: where you'll run `npm run github`
   (e.g. `https://micah.example.org/webhook`). Webhook secret: generate
   a random 32-byte hex string and stash it.
2. **Permissions**:
   - Repository → `Contents`: Read & write
   - Repository → `Issues`: Read & write
   - Repository → `Pull requests`: Read & write
   - Repository → `Metadata`: Read
   - (Optional) `Checks`: Read & write — only if you want Micah to mark
     checks
3. **Subscribe to events**:
   - `issue_comment`
   - `pull_request_review_comment`
   - `issues`
4. **Generate a private key** and download it (`.pem`). Treat it like an
   SSH key.
5. **Install the app** on:
   - The `Firefox-AI` org (org-wide install, or specific repos)
   - `mozilla/dataservices-infra`
   - `mozilla/global-platform-admin`
   - `mozilla/jira-bugzilla-integration`
   - Whatever `mozilla/*` repos you want Micah to be reachable in
6. **Capture the install ID(s)** from the install URL after installing,
   or via the App's installation list.

Then in `micah/.env` for the github adapter:

```
GITHUB_APP_ID=12345
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
GITHUB_WEBHOOK_SECRET=<the random hex>
GITHUB_PORT=8787
```

Note `\n`-escape the private key newlines; the adapter unescapes them.

To trigger Micah from a comment: write `@micah` anywhere in an issue or
PR-review comment, or assign an issue to the App's user.

---

## 3. Slack App

Mozilla's eng AI chat lives on the enterprise Slack workspace
(`mozilla.enterprise.slack.com`).

1. **Create the app** at `https://api.slack.com/apps` → **From scratch**.
   Name: `Micah`. Workspace: Mozilla.
2. **Socket Mode**: Enable. Generate an **App-Level Token** with
   `connections:write` scope. That's `SLACK_APP_TOKEN` (`xapp-...`).
3. **OAuth & Permissions** → Bot Token Scopes:
   - `app_mentions:read`
   - `channels:history`, `groups:history` (so Micah can read threads
     he's mentioned in)
   - `chat:write`
   - `im:history`, `im:read`, `im:write`
   - `users:read` (for resolving `<@user>` mentions)
4. **Event Subscriptions**: Enable. Subscribe to bot events:
   - `app_mention`
   - `message.im`
5. **Install** the app to the workspace. After install, the
   **Bot User OAuth Token** is `SLACK_BOT_TOKEN` (`xoxb-...`).
6. **Signing Secret** (Settings → Basic Information → App Credentials)
   is `SLACK_SIGNING_SECRET`.

Then in `micah/.env`:

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
```

Where to invite Micah:
- `#ai4dev`
- `#smart-window-bugs`
- `#fx_ai_platform`
- DMs from anyone on the team

---

## 4. Matrix bot (chat.mozilla.org)

Optional but useful for cross-community work in `#firefox` and similar.

1. **Create a bot account** on `chat.mozilla.org`. Mozilla's homeserver
   is currently `chat.mozilla.org`. The bot account should be a real
   account (so it can be invited to rooms, has presence, etc.).
2. **Issue an access token**: log in once (Element web), then go to
   `Settings → Help & About → Advanced → Access Token`. Long string.
   That's `MATRIX_ACCESS_TOKEN`.
3. **Persistent storage**: the bot writes encryption state to disk under
   `MATRIX_DATA_DIR` (default `./matrix-data`). Make sure this dir
   survives restarts. Don't commit it.
4. **Auto-join**: the adapter uses the autojoin mixin, so just invite
   the bot to a room and it'll accept.

Then in `micah/.env`:

```
MATRIX_HOMESERVER_URL=https://chat.mozilla.org
MATRIX_ACCESS_TOKEN=...
MATRIX_DATA_DIR=./matrix-data
MATRIX_MENTION=@micah
```

Trigger Micah by mentioning `@micah` (or whatever you set
`MATRIX_MENTION` to) in a room.

---

## 5. Operating environment

Where to run the adapters: anywhere persistent.

- For **dev/personal**: just run `npm run slack` / `npm run github` /
  `npm run matrix` from your laptop. Slack and Matrix work over outbound
  connections; the GitHub adapter needs an inbound webhook URL — use
  ngrok / cloudflared for dev.
- For **production**: containerize and ship to wherever FAAMT runs
  internal tooling. The Dockerfile takes `--build-arg ADAPTER=slack |
  github | matrix`. The compose file has slack + github wired; add
  matrix the same way if you want it bundled.

Persistent state across restarts:
- `MICAH_SESSIONS_PATH` (default `./logs/sessions.json`) — Slack thread
  / GitHub issue / Matrix room → SDK session id mapping.
- `MICAH_AUDIT_PATH` / `MICAH_AUDIT_DIR` (default `./logs/<id>.jsonl`) —
  redacted JSONL audit log.

Both belong on a volume that survives container restarts.

---

## 6. Flipping write mode

When you've watched dry-runs in `./logs/` for long enough that Micah's
behavior is predictable, set in the adapter's environment:

```
MICAH_WRITE_ENABLED=1
```

Restart the adapter. The dry-run gate in `core/safety.ts` will stop
intercepting `moz-phab submit`, `mach try`, `git push`, MCP write tools,
etc. The credential-reading hook still applies — that's a separate
guardrail that stays on regardless.

There's no kill switch finer-grained than this flag yet. If you need
one (e.g. enable writes for Slack but not GitHub), it's a small change
to thread `writeEnabled` per-adapter into `core` — file an issue.

---

## 7. Inspecting what Micah's been doing

```bash
# Recent activity, all sessions
npm run cli -- audit show --last=50

# Just dry-run write attempts
npm run cli -- audit show --kind=dry_run

# A specific thread/session
npm run cli -- audit show --session=<session-id>

# Or point at a specific file
npm run cli -- audit show --path=./logs/some-session.jsonl
```

The output is one line per event with timestamp, kind, short session id,
and the redacted payload.
