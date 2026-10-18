/* "Report a problem" on a headline.
 *
 * Adds a small ⚑ button beside each headline. Tapping it offers a fixed list
 * of reasons; picking one sends { feed, article, reason } to /v1/report, which
 * lands in the feed digest email. That is all it sends — no free text, no ID,
 * nothing about the reader (see cloudflare-sync-worker/src/reports.mjs).
 *
 * The button is a sibling of the headline link, not inside it: a button
 * nested in an <a> is invalid HTML and steals the link's tap on some phones.
 *
 * Each browser reports an article once. Which articles it has reported lives
 * in `hn_reported_v1` in localStorage, outside the config on purpose, like
 * hn_map_consent_v1: it must not travel in a settings export.
 */
(function () {
  "use strict";

  // Must match REASONS in cloudflare-sync-worker/src/reports.mjs.
  const REASONS = [
    ["paywall", "Hit a paywall"],
    ["broken", "Link broken or won't load"],
    ["stale", "Old news"],
    ["notnews", "Not news (ads, spam)"],
    ["unreadable", "Hard to read on my device"],
  ];
  const STORE_KEY = "hn_reported_v1";
  const STORE_MAX = 300;

  function reported() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}; } catch { return {}; }
  }
  function remember(article, reason) {
    const all = reported();
    all[article] = reason;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - STORE_MAX))) delete all[k];
    try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch {}
  }

  function markDone(btn) {
    btn.classList.add("isReported");
    btn.textContent = "✓";
    btn.title = "Reported, thank you";
    btn.setAttribute("aria-label", "Problem reported for this story");
  }

  async function send(feed, article, reason) {
    // text/plain keeps this a "simple" request: no CORS preflight.
    const res = await fetch(`${window.App.API_ORIGIN}/v1/report`, {
      method: "POST",
      body: JSON.stringify({ feed, article, reason }),
      credentials: "omit",
      keepalive: true,
    });
    if (!res.ok) throw new Error(`report ${res.status}`);
  }

  function openSheet(btn, feed, item) {
    if (document.getElementById("rpSheet")) return;
    const overlay = document.createElement("div");
    overlay.id = "rpSheet";
    overlay.className = "rpOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "rpTitle");
    const esc = window.App.escapeHtml;
    overlay.innerHTML = `
      <div class="rpSheet">
        <h2 id="rpTitle" class="rpTitle">What's wrong with this story?</h2>
        <p class="rpStory">${esc(item.title || item.url)}</p>
        <div class="rpReasons">${REASONS.map(([k, label]) =>
          `<button type="button" class="btn rpReason" data-reason="${k}">${esc(label)}</button>`).join("")}</div>
        <p class="rpStatus" aria-live="polite"></p>
        <p class="rpPrivacy">Sends only the feed, the article link and your reason. Nothing about you.
          <a href="/privacy" target="_blank" rel="noopener">Privacy</a></p>
        <button type="button" class="btn rpCancel">Cancel</button>
      </div>`;
    document.body.appendChild(overlay);
    const status = overlay.querySelector(".rpStatus");
    const close = () => { overlay.remove(); btn.focus(); };
    overlay.querySelector(".rpCancel").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    overlay.querySelectorAll(".rpReason").forEach((b) => b.addEventListener("click", async () => {
      overlay.querySelectorAll(".rpReason").forEach((x) => { x.disabled = true; });
      status.textContent = "Sending…";
      try {
        await send(feed, item.url, b.dataset.reason);
        remember(item.url, b.dataset.reason);
        markDone(btn);
        status.textContent = "Thanks. This helps keep the sources honest.";
        setTimeout(close, 1200);
      } catch {
        status.textContent = "Couldn't send right now. Try again later.";
        overlay.querySelectorAll(".rpReason").forEach((x) => { x.disabled = false; });
      }
    }));
    overlay.querySelector(".rpReason").focus();
  }

  // Wraps a headline link with its report button. `feed` is the RSS URL the
  // item came from.
  function wrap(linkEl, item, feed) {
    if (!item?.url || !feed) return linkEl;
    const box = document.createElement("div");
    box.className = "rssItemWrap";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rpBtn";
    btn.textContent = "⚑";
    btn.title = "Report a problem with this story";
    btn.setAttribute("aria-label", "Report a problem with this story");
    if (reported()[item.url]) markDone(btn);
    btn.addEventListener("click", () => { if (!btn.classList.contains("isReported")) openSheet(btn, feed, item); });
    box.appendChild(linkEl);
    box.appendChild(btn);
    return box;
  }

  window.HNReport = { wrap };
})();
