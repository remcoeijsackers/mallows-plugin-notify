// A fake Agent Control ctx for tests: a real SQLite database for the plugin's table (node:sqlite), settings, secrets and
// waiting items in memory, and an http() that records every request instead of sending it.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function fakeCtx({ settings = {}, secrets = {}, waiting = [], workspaces = ["ws-1"] } = {}) {
  const db = new DatabaseSync(":memory:");
  const x = (sql) => sql.replace(/\{\{\s*sent\s*\}\}/g, "sent");
  db.exec(x(readFileSync(new URL("../migrations/001_sent.sql", import.meta.url), "utf8")));
  const logs = [];
  const ctx = {
    settings: { get: (ws) => settings[ws] ?? settings },
    secrets: { get: (k) => secrets[k] ?? null },
    db: { run: (s, ...a) => db.prepare(x(s)).run(...a), all: (s, ...a) => db.prepare(x(s)).all(...a), get: (s, ...a) => db.prepare(x(s)).get(...a) },
    waiting: { list: () => waiting },
    workspaces: () => workspaces,
    app: { url: (href = "#/") => `http://localhost:4317/${href}` },
    log: { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) },
  };
  return { ctx, logs, db };
}

export function fakeHttp(status = 200, body = {}) {
  const calls = [];
  const http = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); };
  return { http, calls };
}
