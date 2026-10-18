/* /feedback: the one-tap "is it useful?" answer and the email composer.
 *
 * The answer goes to /v1/pulse as fixed words only (see
 * cloudflare-sync-worker/src/reports.mjs). Anything a reader writes goes by
 * email from their own mail app, so free text never reaches our servers.
 */
(function () {
  "use strict";

  const PULSE_KEY = "hn_pulse_v1";          // { at, useful } — outside the config, like hn_reported_v1
  const PULSE_EVERY_MS = 30 * 86400e3;
  // Already public on Terms, Privacy and security.txt, so no point hiding it here.
  const ADDRESS = "hn-station@protonmail.com";
  const $ = (id) => document.getElementById(id);

  // ── "Is it useful?" ──
  const send = $("fbPulseSend"), status = $("fbPulseStatus");
  let useful = "";
  const uses = new Set();

  function lastAnswer() {
    try { return JSON.parse(localStorage.getItem(PULSE_KEY) || "null"); } catch { return null; }
  }
  function lockAnswered(at) {
    document.querySelectorAll("#fbPulse .fbChoice").forEach((b) => { b.disabled = true; });
    send.disabled = true;
    status.textContent = `Thanks, you answered on ${new Date(at).toLocaleDateString()}. You can answer again after 30 days.`;
  }

  const prior = lastAnswer();
  if (prior?.at && Date.now() - prior.at < PULSE_EVERY_MS) lockAnswered(prior.at);

  document.querySelectorAll("#fbPulse [data-useful]").forEach((b) => b.addEventListener("click", () => {
    useful = b.dataset.useful;
    document.querySelectorAll("#fbPulse [data-useful]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    send.disabled = false;
  }));
  document.querySelectorAll("#fbPulse [data-use]").forEach((b) => b.addEventListener("click", () => {
    const on = !uses.has(b.dataset.use);
    on ? uses.add(b.dataset.use) : uses.delete(b.dataset.use);
    b.setAttribute("aria-pressed", String(on));
  }));

  send.addEventListener("click", async () => {
    if (!useful) return;
    send.disabled = true;
    status.textContent = "Sending…";
    try {
      // text/plain keeps it a "simple" request: no CORS preflight.
      const res = await fetch(`${window.App.API_ORIGIN}/v1/pulse`, {
        method: "POST",
        body: JSON.stringify({ useful, uses: [...uses] }),
        credentials: "omit",
      });
      if (!res.ok) throw new Error(String(res.status));
      const at = Date.now();
      try { localStorage.setItem(PULSE_KEY, JSON.stringify({ at, useful })); } catch {}
      lockAnswered(at);
    } catch {
      status.textContent = "Couldn't send right now. Try again later.";
      send.disabled = false;
    }
  });

  // ── "Tell us more" ──
  // Pre-select the part of the site the reader came from.
  const AREA_BY_PATH = { "/": "News", "/weather": "Weather", "/stocks": "Stocks", "/settings": "Settings" };
  try {
    const ref = new URL(document.referrer);
    if (ref.origin === location.origin && AREA_BY_PATH[ref.pathname]) $("fbArea").value = AREA_BY_PATH[ref.pathname];
  } catch {}
  if (window.matchMedia?.("(display-mode: standalone)").matches) $("fbArea").value = "Installed app";

  const email = $("fbEmail");
  function updateMailto() {
    const kind = $("fbKind").value, area = $("fbArea").value;
    const subject = `HAPPENING NOW: ${kind} (${area})`;
    const body = kind === "Suggest a source"
      ? `Source name:\nWebsite or RSS link:\nWhy it's worth adding:\n`
      : `What happened, or your idea:\n\n\nPhone or computer, and which browser (helps with bugs):\n`;
    email.href = `mailto:${ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  $("fbKind").addEventListener("change", updateMailto);
  $("fbArea").addEventListener("change", updateMailto);
  updateMailto();

  $("fbAddress").textContent = ADDRESS;
  $("fbCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(ADDRESS);
      $("fbCopyStatus").textContent = "Copied.";
    } catch {
      $("fbCopyStatus").textContent = "Copy failed; select the address above.";
    }
  });
})();
