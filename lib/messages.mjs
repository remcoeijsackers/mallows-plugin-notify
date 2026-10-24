// What a push says. Without `details` it names only the task (code and title), not the question, the reason or the
// draft: a push goes through someone else's server and sits on a lock screen.

export const DEFAULTS = { questions: true, drafts: true, problems: true, done: false, remindAfterMin: 10, details: false };

/** Settings of one workspace with the defaults filled in (a checkbox never touched counts as its default). */
export const withDefaults = (s = {}) => Object.fromEntries(Object.entries({ ...DEFAULTS, ...s }).map(([k, v]) => [k, v === "" || v === null || v === undefined ? DEFAULTS[k] : v]));

const who = (task) => task ? `${task.code} · ${task.title}` : "Agent Control";
const cut = (s, n = 300) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const strip = (s) => String(s ?? "").replace(/^(Approval|Question|Stuck|Task status):\s*/i, "");

/**
 * The push for an event, or null when this workspace does not want one. Returns a dedupe key too, so the same question
 * or draft never sends twice (events can repeat after a restart).
 */
export function forEvent(e, s) {
  const task = e.task, details = s.details;
  switch (e.kind) {
    case "input.requested": {
      if (!s.questions) return null;
      const approval = e.data?.kind ? e.data.kind === "approval" : /^approval:/i.test(e.summary);
      return { key: `event:${e.kind}:${e.data?.inputId ?? `${e.taskId}:${e.summary}`}`, kind: approval ? "approval" : "question", priority: "high", tag: approval ? "warning" : "question",
        title: task ? `${task.code} ${approval ? "needs your approval" : "asks you something"}` : approval ? "An approval waits for you" : "A question waits for you",
        body: details ? cut(strip(e.summary)) : who(task), href: e.href };
    }
    case "outbox.proposed":
      if (!s.drafts) return null;
      return { key: `event:${e.kind}:${e.data?.outboxId}`, kind: "draft", priority: "normal", tag: "envelope",
        title: `Draft ${e.data?.code ?? ""} waits for approval`.replace("  ", " "), body: details ? cut(e.summary) : `${e.data?.channel ?? "message"}${task ? ` · ${who(task)}` : ""}`, href: e.href };
    case "outbox.failed":
      if (!s.problems) return null;
      return { key: `event:${e.kind}:${e.data?.outboxId}:${e.summary}`, kind: "problem", priority: "high", tag: "x",
        title: `${e.data?.code ?? "A message"} did not go out`, body: details ? cut(e.summary) : who(task), href: e.href };
    case "run.blocked":
      if (!s.problems) return null;
      return { key: `event:${e.kind}:${e.runId}:${e.summary}`, kind: "problem", priority: "high", tag: "rotating_light",
        title: `${task?.code ?? "A run"} is stuck`, body: details ? cut(strip(e.summary)) : who(task), href: e.href };
    case "task.status": {
      const to = e.data?.to;
      if (to === "done" && s.done) return { key: `event:${e.kind}:${e.taskId}:done`, kind: "done", priority: "normal", tag: "white_check_mark", title: `${task?.code ?? "A task"} is done`, body: who(task), href: e.href };
      if (to === "failed" && s.problems) return { key: `event:${e.kind}:${e.taskId}:failed`, kind: "problem", priority: "high", tag: "x", title: `${task?.code ?? "A task"} failed`, body: who(task), href: e.href };
      return null;
    }
    default: return null;
  }
}

/** One reminder per waiting item once it waited longer than `remindAfterMin`. */
export function reminders(items, s, now = Date.now()) {
  const after = Number(s.remindAfterMin) || 0;
  if (after <= 0) return [];
  return items.filter((i) => (i.type === "draft" ? s.drafts : s.questions) && now - Date.parse(i.since) >= after * 60_000).map((i) => {
    const min = Math.round((now - Date.parse(i.since)) / 60_000);
    const what = i.type === "draft" ? "A draft" : i.type === "approval" ? "An approval" : "A question";
    return { key: `remind:${i.id}`, kind: "reminder", priority: "high", tag: "hourglass",
      title: `Still waiting on you (${min} min)`, body: s.details ? cut(`${what}: ${i.summary}`) : `${what}${i.task ? ` · ${who(i.task)}` : ""}`, href: i.href };
  });
}
