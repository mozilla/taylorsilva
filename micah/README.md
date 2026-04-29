# Micah

An AI engineer for the Firefox AI Pod.

Three surfaces, one brain:

- **CLI** — `micah "<prompt>"` for local invocation.
- **Slack** — Bolt + Socket Mode bot for `#ai4dev`, `#smart-window-bugs`, etc.
- **GitHub** — webhook server reacting to mentions and review comments on
  Mozilla GitHub repos (mozilla-mobile, mozilla-services, web properties).

All three call into the same `core` agent, which runs on the Claude Agent SDK
and mounts the official **Firefox Development MCP server**
(`https://mcp-dev.moz.tools/mcp`) for Bugzilla, Phabricator, and searchfox access.

## Phase 1: capability complete, writes disabled

Micah knows how to push to Phabricator, push to try, comment on Bugzilla, and
open GitHub PRs. **Until `MICAH_WRITE_ENABLED=1`, all of these are dry-run** —
Micah logs `"would have done X"` instead of running the write. Local file
edits, builds, and read-only queries are always allowed.

This is so you can release Micah once you're happy with how he behaves.

## Layout

```
micah/
├── packages/
│   ├── core/        agent runner, system prompt, safety gate, MCP wiring
│   ├── cli/         `micah <prompt>` for local dev
│   ├── slack/       Bolt + Socket Mode bot
│   └── github/      Octokit webhook server
├── MICAH.md         project memory — loaded on every session
├── prompts/         additional prompt fragments
└── .env.example
```

## Setup

```bash
cd micah
npm install
npm run build
cp .env.example .env
# fill in tokens
```

For Firefox work, point `MICAH_CWD` at your mozilla-central checkout.

### Run the CLI

```bash
npm run cli -- "find a recently filed P1 [aife] bug i could start on"
```

### Run the Slack bot

Create a Slack app with Socket Mode, give it `app_mentions:read`, `chat:write`,
`im:history`, `im:read`, `im:write`, then:

```bash
npm run slack
```

Mention `@micah` in a channel or DM him.

### Run the GitHub webhook server

```bash
npm run github
```

Point a GitHub App's webhook at `https://<host>/webhook` with `issue_comment`,
`pull_request_review_comment`, and `issues` events.

## Enabling writes

When you're ready to let Micah actually push, set:

```bash
MICAH_WRITE_ENABLED=1
```

Until then, Micah behaves like a senior engineer who's been told not to land
anything yet — he'll do all the work and tell you what he would have done.

## Conventions Micah follows

See [`MICAH.md`](./MICAH.md) — that file is loaded into the system prompt and
defines his persona, the Firefox AI Pod processes (`[aife]` / `[aimodels]` /
`[aiplatform]` whiteboard labels, P1/P2, JBI), tool preferences, and
communication norms.

## Not in scope (yet)

- Matrix adapter for `chat.mozilla.org` `#firefox`. Easy to add — Slack-shaped.
- Phabricator inline-comment-reply bot. Once writes are on, this is the next
  natural surface.
- A `/sandbox` mode wrapper for Firefox builds (tracking patch
  [D283228](https://phabricator.services.mozilla.com/D283228)).
