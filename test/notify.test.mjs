import { test } from "node:test";
import assert from "node:assert/strict";
import { createNotify } from "../index.mjs";
import { forEvent, reminders, withDefaults } from "../lib/messages.mjs";
import { fakeCtx, fakeHttp } from "./helpers.mjs";

const task = { id: "t1", code: "AC-12", title: "Release notes", status: "awaiting_input" };
const ntfy = { service: "ntfy", ntfyTopic: "ac-test" };
const question = { kind: "input.requested", summary: "Question: Which client is this for?", data: { inputId: "in-1", kind: "question" }, taskId: "t1", runId: "r1", task, href: "#/chat/t1" };

test("a question becomes one push with the task and a link; the same question never sends twice", async () => {
  const { ctx, db } = fakeCtx({ settings: ntfy });
  const { http, calls } = fakeHttp();
  const n = createNotify(ctx, http);
  await n.onEvent(question, { workspaceId: "ws-1" });
  await n.onEvent(question, { workspaceId: "ws-1" });
  assert.equal(calls.length, 1);
  const b = JSON.parse(calls[0].init.body);
  assert.equal(b.title, "AC-12 asks you something");
  assert.equal(b.message, "AC-12 · Release notes");
  assert.equal(b.click, "http://localhost:4317/#/chat/t1");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sent").get().n, 1);
});

test("without details the question text stays out of the push; with details it is in", () => {
  const off = forEvent(question, withDefaults({}));
  assert.doesNotMatch(off.body, /client/);
  const on = forEvent(question, withDefaults({ details: true }));
  assert.equal(on.body, "Which client is this for?");
  assert.equal(forEvent({ ...question, data: { inputId: "in-2", kind: "approval" } }, withDefaults({})).title, "AC-12 needs your approval");
});

test("each kind of event can be turned off; finished tasks are off by default", () => {
  const d = withDefaults({});
  assert.equal(forEvent(question, withDefaults({ questions: false })), null);
  assert.equal(forEvent({ kind: "outbox.proposed", summary: "s", data: { outboxId: "o1", code: "O-3", channel: "linkedin" }, task: null, href: "#/queue" }, d).title, "Draft O-3 waits for approval");
  assert.equal(forEvent({ kind: "run.blocked", summary: "Stuck: no network", runId: "r1", task, href: "#/chat/t1" }, d).title, "AC-12 is stuck");
  assert.equal(forEvent({ kind: "task.status", data: { to: "done" }, taskId: "t1", task, href: "#/chat/t1" }, d), null);
  assert.equal(forEvent({ kind: "task.status", data: { to: "done" }, taskId: "t1", task, href: "#/chat/t1" }, withDefaults({ done: true })).title, "AC-12 is done");
  assert.equal(forEvent({ kind: "task.status", data: { to: "failed" }, taskId: "t1", task, href: "#/chat/t1" }, d).title, "AC-12 failed");
  assert.equal(forEvent({ kind: "task.status", data: { to: "running" }, taskId: "t1", task, href: "#/" }, withDefaults({ done: true })), null);
});

test("one reminder per item once it waited long enough; 0 turns reminders off", async () => {
  const now = Date.parse("2026-10-24T10:00:00Z");
  const items = [
    { id: "in-1", type: "question", summary: "Ship it?", since: "2026-10-24T09:45:00Z", href: "#/chat/t1", task },
    { id: "in-2", type: "approval", summary: "rm", since: "2026-10-24T09:58:00Z", href: "#/chat/t1", task },
  ];
  assert.deepEqual(reminders(items, withDefaults({}), now).map((r) => [r.key, r.title]), [["remind:in-1", "Still waiting on you (15 min)"]]);
  assert.deepEqual(reminders(items, withDefaults({ remindAfterMin: 0 }), now), []);
  const { ctx } = fakeCtx({ settings: ntfy, waiting: items });
  const { http, calls } = fakeHttp();
  const n = createNotify(ctx, http, () => now);
  await n.remind(); await n.remind();
  assert.equal(calls.length, 1);
});

test("not set up: nothing is sent and the status says what is missing", async () => {
  const { ctx } = fakeCtx({ settings: { service: "pushover" }, secrets: { pushoverUserKey: "u".repeat(30) } });
  const { http, calls } = fakeHttp();
  const n = createNotify(ctx, http);
  await n.onEvent(question, { workspaceId: "ws-1" });
  assert.equal(calls.length, 0);
  assert.deepEqual(n.status("ws-1").missing, ["Pushover application token"]);
  assert.deepEqual(await n.test("ws-1"), { sent: false, reason: "not set up" });
});

test("a failed push is recorded with its error and logged; the test push always goes out", async () => {
  const { ctx, logs } = fakeCtx({ settings: ntfy });
  const bad = fakeHttp(403, { error: "forbidden" });
  const n = createNotify(ctx, bad.http);
  await n.onEvent(question, { workspaceId: "ws-1" });
  const s = n.status("ws-1");
  assert.equal(s.recent[0].ok, false);
  assert.match(s.recent[0].error, /ntfy answered 403: forbidden/);
  assert.match(logs.join("\n"), /push failed/);
  const good = fakeHttp();
  const n2 = createNotify(ctx, good.http);
  assert.deepEqual(await n2.test("ws-1"), { sent: true });
  assert.deepEqual(await n2.test("ws-1"), { sent: true });
  assert.equal(good.calls.length, 2);
});

test("at most 10 pushes a minute per workspace", async () => {
  const { ctx, logs } = fakeCtx({ settings: ntfy });
  const { http, calls } = fakeHttp();
  const n = createNotify(ctx, http);
  for (let i = 0; i < 14; i++) await n.onEvent({ ...question, data: { inputId: `in-${i}`, kind: "question" } }, { workspaceId: "ws-1" });
  assert.equal(calls.length, 10);
  assert.match(logs.join("\n"), /more than 10 pushes in a minute/);
});

test("a dashboard address in the settings replaces localhost in links", async () => {
  const { ctx } = fakeCtx({ settings: { ...ntfy, dashboardUrl: "https://mac.tail1234.ts.net/" } });
  const { http, calls } = fakeHttp();
  await createNotify(ctx, http).onEvent(question, { workspaceId: "ws-1" });
  assert.equal(JSON.parse(calls[0].init.body).click, "https://mac.tail1234.ts.net/#/chat/t1");
});
