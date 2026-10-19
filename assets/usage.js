/* Anonymous usage counters.
 *
 * Counts which pages, tabs and controls get used, how people move between
 * them, which source a clicked headline came from (its website, never the
 * article), and roughly how long a page stays on screen (a range like
 * "1-3m", measured per look, never tied to a visit). Events are batched and sent to /v1/usage when the page is hidden;
 * the Worker only adds 1 to a daily total for each (see
 * cloudflare-sync-worker/src/usage.mjs). Nothing here identifies a reader:
 * no ID, no cookie, no stored history.
 *
 * The one thing kept between pages is `hn_usage_place` in sessionStorage:
 * the page/tab this browser tab was last on, so the next page can say where
 * it came from. It lives only as long as the tab and is never sent by itself.
 *
 * Off entirely when the browser sends Global Privacy Control or Do Not Track,
 * for automated browsers, and on localhost (local pages call the production
 * Worker, so dev clicks would land in the real numbers).
 */
(function () {
  "use strict";
  const host = location.hostname;
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || navigator.webdriver) return;
  if (host === "localhost" || host === "127.0.0.1" || !window.App || !navigator.sendBeacon) return;

  const PAGES = { "/": "news", "/index": "news", "/weather": "weather", "/stocks": "stocks", "/settings": "settings",
    "/sources": "sources", "/privacy": "privacy", "/terms": "terms", "/feedback": "feedback" };
  const path = location.pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/";
  const page = PAGES[path] || "other";

  // Mirrors the Worker's checks, so nothing is sent that it would drop.
  const TAB = /^[a-z][a-z0-9-]{0,23}$/;
  const HOST = /^(?=.{1,100}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

  const queue = [];
  function flush() {
    if (!queue.length) return;
    const body = JSON.stringify({ e: queue.splice(0, 40) });
    try { navigator.sendBeacon(`${window.App.API_ORIGIN}/v1/usage`, body); } catch {}
    if (queue.length) flush();
  }
  function add(kind, a, b) {
    queue.push([kind, a, b]);
    if (queue.length >= 40) flush();
  }

  // ── time on page ──
  // Only time the page is actually on screen, sent as a range each time it
  // leaves the screen (tab switch, app switch, navigation). Coming back starts
  // a new look. Ranges must match TIME_BUCKETS in usage.mjs.
  const BUCKETS = [[10, "0-10s"], [30, "10-30s"], [60, "30-60s"], [180, "1-3m"], [600, "3-10m"], [Infinity, "10m+"]];
  let shownAt = document.visibilityState === "visible" ? performance.now() : null;
  function endLook() {
    if (shownAt == null) return;
    const secs = (performance.now() - shownAt) / 1000;
    shownAt = null;
    add("time", page, BUCKETS.find(([max]) => secs < max)[1]);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { endLook(); flush(); }
    else shownAt = performance.now();
  });
  window.addEventListener("pagehide", () => { endLook(); flush(); });

  // ── movement ──
  const PLACE_KEY = "hn_usage_place";
  const pageOf = (p) => p.split(":")[0];
  let place = page;
  const save = () => { try { sessionStorage.setItem(PLACE_KEY, place); } catch {} };

  let from = "start";
  const cameFromUs = (() => { try { return new URL(document.referrer).origin === location.origin; } catch { return false; } })();
  if (cameFromUs) { try { from = sessionStorage.getItem(PLACE_KEY) || "start"; } catch {} }
  // A reload, or arriving back on the same page, isn't a move.
  if (from !== "start" && pageOf(from) === page) place = from;
  else add("nav", from, page);
  save();

  function moveTo(tab) {
    if (!TAB.test(tab || "")) return;
    const to = `${page}:${tab}`;
    if (to === place) return;
    add("nav", place, to);
    place = to;
    save();
  }

  // Tabs inside a page, as [page, selector, which dataset field names the tab].
  const TABS = [
    ["news", ".tickerScopeBtn[data-scope]", "scope"],
    ["stocks", "[data-market-group]", "marketGroup"],
    ["settings", ".settingsTab[data-tab]", "tab"],
  ];

  // Controls, as [page, selector, name]. Names must match TAPS in usage.mjs.
  const TAPS = [
    ["news", "#manageSourcesBtn", "sources"],
    ["news", "#refreshBtn", "refresh"],
    ["weather", "[data-forecast-days]", (el) => `days-${el.dataset.forecastDays}`],
    ["weather", "#alertsTabs [data-scope]", (el) => `alerts-${el.dataset.scope}`],
    ["weather", "#weatherMapLoadBtn", "radar-load"],
    ["weather", "#radarOpenBtn", "radar-open"],
    ["weather", "#mapRecenterBtn", "recenter"],
    ["weather", "#mapRingsBtn", "rings"],
    ["weather", "#mapLegendBtn", "legend"],
    ["weather", "#weatherRefreshBtn", "refresh"],
    ["weather", "#weatherNewsMoreBtn", "news-more"],
    ["stocks", "[data-news-mode]", (el) => `news-${el.dataset.newsMode}`],
    ["stocks", "#stocksRefreshBtn", "refresh"],
  ];
  const SELECTS = [
    ["weather", "#mapTypeSelect", (v) => `layer-${v}`],
    ["stocks", "#stocksSort", (v) => `sort-${v}`],
  ];

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t?.closest) return;
    for (const [p, sel, field] of TABS) {
      const el = p === page && t.closest(sel);
      if (el) return moveTo(el.dataset[field]);
    }
    for (const [p, sel, name] of TAPS) {
      const el = p === page && t.closest(sel);
      if (el) return add("tap", page, typeof name === "function" ? name(el) : name);
    }
    // Headline clicks: count the source's website only, never the article.
    const link = (page === "news" || page === "weather" || page === "stocks") && t.closest("a[href][target=_blank]");
    if (link) {
      let site = "";
      try { site = new URL(link.href).hostname.replace(/^www\./, ""); } catch {}
      if (site && site !== host && HOST.test(site)) add("source", site, place);
    }
  }, true);

  document.addEventListener("change", (e) => {
    for (const [p, sel, name] of SELECTS) {
      if (p === page && e.target?.matches?.(sel)) add("tap", page, name(e.target.value));
    }
  }, true);

  // Watchlist edits happen in Settings and save straight away; the count
  // going up or down is the whole signal. The symbol is never sent.
  if (page === "settings") {
    let stocks = (window.App.loadConfig?.().stocks || []).length;
    window.addEventListener("hn:config-saved", (e) => {
      const now = (e.detail?.stocks || []).length;
      if (now > stocks) add("tap", "settings", "watchlist-add");
      else if (now < stocks) add("tap", "settings", "watchlist-remove");
      stocks = now;
    });
  }
})();
