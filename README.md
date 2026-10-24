# Notify for Agent Control

A plugin for [Agent Control](https://github.com/remcoeijsackers/agent-control) that sends a push to your phone through
**ntfy**, **Pushover** or **Telegram**:

- when an agent **asks you something** or **needs an approval**;
- when a **draft waits for approval** (mail, social);
- when a **run gets stuck**, a **task fails** or a **message did not go out**;
- when a task is **done** (off by default);
- and **one reminder** when something keeps waiting longer than you set (default 10 minutes).

Each push has a link straight to the task or the queue.

## Install

In Agent Control: **Plugins → Browse**, find **Notify**, click **Install**. Then:

1. **Plugins → Installed → Notify**: turn it on for the workspaces you want pushes from.
2. Fill in its **settings** for each workspace (where to send, what to send) and its **keys** (they go to the OS key store).
3. Open **Plugins → Notify** and click **Send test push**.

## Setting up a service

**ntfy** (free, nothing to sign up for):

1. Install the ntfy app (iOS or Android) and subscribe to a topic. On `ntfy.sh` anyone who knows a topic's name can read
   it, so make it long and random (for example `ac-7fq2k9xw3m`).
2. In Notify: *Send through* = ntfy, *ntfy topic* = that name.
3. Your own ntfy server or a protected topic: also set *ntfy server* and put an access token under keys.

**Pushover** (paid app, very reliable):

1. On pushover.net, create an application. Copy its **API token**, and your own **user key** from the dashboard.
2. In Notify: *Send through* = Pushover, and put both under keys.

**Telegram**:

1. Talk to **@BotFather**, create a bot and copy its token. Send your new bot any message.
2. Open `https://api.telegram.org/bot<token>/getUpdates` in a browser and copy `message.chat.id`.
3. In Notify: *Send through* = Telegram, *Telegram chat ID* = that number, and the bot token under keys.

## Privacy

A push passes through the service's servers and shows on your lock screen. So by default it only names the task
(`AC-12 · Release notes`), not the question, the stuck reason or the draft. Turn on **details** per workspace if you
want the text in the push.

Links point to `http://localhost:4317` unless you set **Dashboard address**, for example a Tailscale address, so they
also open on your phone.

## What it uses

Permissions: `events` (questions, drafts, stuck runs, task status), `waiting` (what still waits, for the reminder),
`schedule` (checks once a minute), `settings`, `secrets`, `db` (a table with what was sent, so nothing is sent twice)
and `routes` (status and the test push for its page). It never sees the content of drafts or the requests behind a
question; a push to a workspace is capped at 10 per minute.

Needs Agent Control with plugin events `input.requested`, `outbox.proposed`, `outbox.failed` and `run.blocked`, and
`ctx.schedule` / `ctx.waiting`.

## Develop

```bash
npm test
```

The tests use a fake Agent Control `ctx` with a real SQLite table (`node:sqlite`) and a fake `fetch`: nothing is ever
sent. To try it in Agent Control, install this folder under **Plugins → Installed → Install from a repository or a
folder**. Bump `version` in `manifest.json` for every release.

## Licence

MIT
