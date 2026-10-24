import { test } from "node:test";
import assert from "node:assert/strict";
import { missing, send } from "../lib/send.mjs";
import { fakeHttp } from "./helpers.mjs";

const m = { title: "AC-12 asks you something", body: "AC-12 · Release notes", url: "http://mac:4317/#/chat/t1", priority: "high", tag: "question" };
const sec = (o) => (k) => o[k] ?? null;

test("ntfy: JSON to the server root, topic, priority, click link, bearer token when set", async () => {
  const { http, calls } = fakeHttp();
  await send(http, "ntfy", { ntfyServer: "https://ntfy.example.com/", ntfyTopic: "ac-x7f" }, sec({ ntfyToken: "tk_abcdefghijklmnop" }), m);
  assert.equal(calls[0].url, "https://ntfy.example.com");
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual([body.topic, body.title, body.priority, body.click], ["ac-x7f", m.title, 4, m.url]);
  assert.equal(calls[0].init.headers.authorization, "Bearer tk_abcdefghijklmnop");
  const plain = fakeHttp();
  await send(plain.http, "ntfy", { ntfyTopic: "t" }, sec({}), { ...m, priority: "normal", url: undefined });
  assert.equal(plain.calls[0].url, "https://ntfy.sh");
  assert.equal(plain.calls[0].init.headers.authorization, undefined);
  assert.equal(JSON.parse(plain.calls[0].init.body).click, undefined);
});

test("Pushover: form with token, user, link and priority 1 for urgent", async () => {
  const { http, calls } = fakeHttp();
  await send(http, "pushover", {}, sec({ pushoverAppToken: "a".repeat(30), pushoverUserKey: "u".repeat(30) }), m);
  const f = new URLSearchParams(calls[0].init.body);
  assert.equal(calls[0].url, "https://api.pushover.net/1/messages.json");
  assert.deepEqual([f.get("token"), f.get("user"), f.get("priority"), f.get("url")], ["a".repeat(30), "u".repeat(30), "1", m.url]);
});

test("Telegram: sendMessage to the chat, text with title, body and link", async () => {
  const { http, calls } = fakeHttp();
  await send(http, "telegram", { telegramChatId: "12345" }, sec({ telegramBotToken: "123:ABCdefGHIjkl" }), m);
  assert.equal(calls[0].url, "https://api.telegram.org/bot123:ABCdefGHIjkl/sendMessage");
  const b = JSON.parse(calls[0].init.body);
  assert.equal(b.chat_id, "12345");
  assert.equal(b.text, `${m.title}\n${m.body}\n${m.url}`);
});

test("an error names the service and status but never the address (the Telegram token is in it)", async () => {
  const { http } = fakeHttp(401, { description: "Unauthorized" });
  await assert.rejects(send(http, "telegram", { telegramChatId: "1" }, sec({ telegramBotToken: "123:SECRETtoken" }), m), (e) => {
    assert.match(e.message, /Telegram answered 401: Unauthorized/);
    assert.doesNotMatch(e.message, /SECRET/);
    return true;
  });
  const down = async () => { throw new TypeError("fetch failed https://api.telegram.org/bot123:SECRETtoken"); };
  await assert.rejects(send(down, "telegram", { telegramChatId: "1" }, sec({ telegramBotToken: "123:SECRETtoken" }), m), (e) => !/SECRET/.test(e.message));
});

test("missing tells what each service still needs", () => {
  assert.deepEqual(missing("ntfy", {}, sec({})), ["ntfy topic"]);
  assert.deepEqual(missing("pushover", {}, sec({ pushoverUserKey: "x" })), ["Pushover application token"]);
  assert.deepEqual(missing("telegram", { telegramChatId: "1" }, sec({ telegramBotToken: "t" })), []);
  assert.deepEqual(missing(undefined, {}, sec({})), ["a service (Send through)"]);
});
