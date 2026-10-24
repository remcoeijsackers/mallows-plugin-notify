// Notify for Agent Control: a push when something waits on you or goes wrong, and one reminder when it keeps waiting.
// Settings are per workspace (where to send, what to send); keys are in the OS key store. Every push is recorded in
// the plugin's own table, which also keeps a question, draft or reminder from being sent twice.
import { forEvent, reminders, withDefaults } from "./lib/messages.mjs";
import { missing, send, SERVICES } from "./lib/send.mjs";

/** At most this many pushes per workspace per minute; the rest is logged, not sent. */
const PER_MINUTE = 10;

export function createNotify(ctx, http = (...a) => fetch(...a), now = () => Date.now()) {
  const settings = (ws) => withDefaults(ctx.settings.get(ws));
  const secret = (k) => ctx.secrets.get(k);
  const link = (s, href) => s.dashboardUrl ? `${String(s.dashboardUrl).replace(/\/+$/, "")}/${href || "#/"}` : ctx.app.url(href);
  const sentRecently = (ws) => ctx.db.get(`SELECT COUNT(*) AS n FROM {{sent}} WHERE workspace_id = ? AND at > ? AND ok = 1`, ws, new Date(now() - 60_000).toISOString()).n;

  /** Sends one push unless it was sent before (same key) or the workspace is not set up; records the outcome. */
  async function push(ws, m, { force = false } = {}) {
    const s = settings(ws);
    if (!SERVICES.includes(s.service) || missing(s.service, s, secret).length) return { sent: false, reason: "not set up" };
    if (!force && ctx.db.get(`SELECT 1 AS x FROM {{sent}} WHERE workspace_id = ? AND key = ?`, ws, m.key)) return { sent: false, reason: "already sent" };
    if (!force && sentRecently(ws) >= PER_MINUTE) { ctx.log.warn(`more than ${PER_MINUTE} pushes in a minute; skipped: ${m.title}`); return { sent: false, reason: "rate limit" }; }
    let error = null;
    try { await send(http, s.service, s, secret, { ...m, url: m.href ? link(s, m.href) : undefined }); }
    catch (e) { error = String(e?.message ?? e).slice(0, 300); ctx.log.warn(`push failed: ${error}`); }
    ctx.db.run(`INSERT INTO {{sent}} (workspace_id, key, kind, title, ok, error, at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, key) DO UPDATE SET ok = excluded.ok, error = excluded.error, at = excluded.at`, ws, m.key, m.kind, m.title, error ? 0 : 1, error, new Date(now()).toISOString());
    return error ? { sent: false, reason: error } : { sent: true };
  }

  async function onEvent(e, { workspaceId }) {
    const m = forEvent(e, settings(workspaceId));
    if (m) await push(workspaceId, m);
  }

  async function remind() {
    for (const ws of ctx.workspaces()) {
      for (const m of reminders(ctx.waiting.list(ws), settings(ws), now())) await push(ws, m);
    }
  }

  function status(ws) {
    const s = settings(ws);
    const recent = ctx.db.all(`SELECT kind, title, ok, error, at FROM {{sent}} WHERE workspace_id = ? ORDER BY at DESC LIMIT 20`, ws);
    return {
      service: s.service ?? null, missing: missing(s.service, s, secret),
      sends: { questions: s.questions, drafts: s.drafts, problems: s.problems, done: s.done, remindAfterMin: Number(s.remindAfterMin) || 0, details: s.details },
      dashboard: link(s, "#/"), waiting: ctx.waiting.list(ws).length, recent: recent.map((r) => ({ ...r, ok: Boolean(r.ok) })),
    };
  }

  const test = (ws) => push(ws, { key: `test:${now()}`, kind: "test", priority: "normal", tag: "tada", title: "Agent Control can reach you", body: "This is a test push from the Notify plugin.", href: "#/plugin/notify/notify" }, { force: true });

  return { push, onEvent, remind, status, test };
}

export default {
  onLoad(ctx) {
    const n = createNotify(ctx);
    for (const k of ["input.requested", "outbox.proposed", "outbox.failed", "run.blocked", "task.status"]) ctx.events.on(k, n.onEvent);
    ctx.schedule.every(60_000, n.remind);
    ctx.routes.handle("GET", "/status", ({ workspaceId }) => n.status(workspaceId));
    ctx.routes.handle("POST", "/test", async ({ workspaceId }) => {
      const r = await n.test(workspaceId);
      if (!r.sent) throw new Error(r.reason === "not set up" ? `Not set up yet: ${n.status(workspaceId).missing.join(", ")}` : r.reason);
      return { ok: true };
    });
  },
};
