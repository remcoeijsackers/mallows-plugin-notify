// The three ways out: ntfy, Pushover and Telegram. Each takes a message ({ title, body, url, priority }) and the
// configuration, and posts it with `http` (fetch; tests pass a fake). Errors name the service and the HTTP status only,
// never the address: the Telegram token is part of its URL.

export const SERVICES = ["ntfy", "pushover", "telegram"];

/** What a service still needs before it can send, as labels for the page. */
export function missing(service, settings, secret) {
  if (service === "ntfy") return settings.ntfyTopic ? [] : ["ntfy topic"];
  if (service === "pushover") return [!secret("pushoverAppToken") && "Pushover application token", !secret("pushoverUserKey") && "Pushover user key"].filter(Boolean);
  if (service === "telegram") return [!secret("telegramBotToken") && "Telegram bot token", !settings.telegramChatId && "Telegram chat ID"].filter(Boolean);
  return ["a service (Send through)"];
}

async function post(http, what, url, init) {
  let res;
  try { res = await http(url, { ...init, signal: AbortSignal.timeout(15_000) }); }
  catch (e) { throw new Error(`${what} is not reachable (${e?.name === "TimeoutError" ? "timeout" : "network error"})`); }
  if (!res.ok) {
    let why = "";
    try { const j = await res.json(); why = j.description ?? j.error ?? (Array.isArray(j.errors) ? j.errors.join(", ") : ""); } catch { /* no body */ }
    throw new Error(`${what} answered ${res.status}${why ? `: ${String(why).slice(0, 120)}` : ""}`);
  }
}

export async function send(http, service, settings, secret, m) {
  const high = m.priority === "high";
  if (service === "ntfy") {
    const server = String(settings.ntfyServer || "https://ntfy.sh").replace(/\/+$/, "");
    const headers = { "content-type": "application/json" };
    const token = secret("ntfyToken");
    if (token) headers.authorization = `Bearer ${token}`;
    // JSON publishing (to the server root) keeps titles with any character intact.
    return post(http, "ntfy", server, { method: "POST", headers, body: JSON.stringify({
      topic: settings.ntfyTopic, title: m.title, message: m.body, priority: high ? 4 : 3, tags: [m.tag ?? "robot"],
      ...(m.url ? { click: m.url } : {}),
    }) });
  }
  if (service === "pushover") {
    const form = new URLSearchParams({ token: secret("pushoverAppToken") ?? "", user: secret("pushoverUserKey") ?? "", title: m.title, message: m.body, priority: high ? "1" : "0" });
    if (m.url) { form.set("url", m.url); form.set("url_title", "Open in Agent Control"); }
    return post(http, "Pushover", "https://api.pushover.net/1/messages.json", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
  }
  if (service === "telegram") {
    const text = [m.title, m.body, m.url].filter(Boolean).join("\n");
    return post(http, "Telegram", `https://api.telegram.org/bot${secret("telegramBotToken")}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: settings.telegramChatId, text, disable_web_page_preview: true }),
    });
  }
  throw new Error("No service chosen under Send through");
}
