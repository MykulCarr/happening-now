// Standalone widgets: /widget?w=all | weather | headlines | markets | watchlist
// `all` is the "Today" view: weather, headlines for a chosen news category,
// and the markets board plus watchlist, stacked as cards.
// Reuses common.js for saved settings + theme, common-weather.js for the
// location lookup and top-feeds.js for each category's outlets, so a widget
// shows exactly what the main site would.
//
// Each part returns { title, body, href, more } and never touches the page
// itself, so the same part renders alone or as one card among several.
(function () {
  const App = window.App;
  const root = document.getElementById("widget");
  const esc = App.escapeHtml;
  const params = new URLSearchParams(location.search);

  // Thrown for "nothing to show, here's how to fix it". Its message is our own
  // HTML (it can carry a Settings link); any other error gets a generic retry line.
  class Notice extends Error {}
  const messageFor = (e) => (e instanceof Notice ? e.message : "Couldn't load. Will retry shortly.");

  const clock = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const ago = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) return "";
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${Math.max(1, m)}m`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
  };

  // One location lookup per load, shared by the weather card and local news.
  let locationPromise = null;
  const location_ = () => (locationPromise ||= App.resolvePreferredLocation({ cfg: App.cfg, autoDetect: false }).catch(() => null));
  const getGeo = async () => {
    const loc = await location_();
    return loc?.city ? { city: loc.city, state: loc.state || "" } : null;
  };

  // ---- weather ------------------------------------------------------------
  // Compact: place on the left, icon + temperature + today's forecast on the
  // right, the next eight hours underneath. The summary row links to /weather.
  async function weather() {
    const loc = await location_();
    if (!loc || !Number.isFinite(+loc.lat) || !Number.isFinite(+loc.lon)) {
      throw new Notice(`No location set. <a href="/settings#weather" target="_top">Set one in Settings</a>.`);
    }
    const cfg = App.cfg;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${+loc.lat}&longitude=${+loc.lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code` +
      `&hourly=temperature_2m,weather_code,precipitation_probability` +
      `&daily=temperature_2m_max,temperature_2m_min` +
      `&forecast_days=2&temperature_unit=${cfg.weatherTempUnit || "fahrenheit"}&timezone=auto`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("weather " + res.status);
    const d = await res.json();

    const deg = (n) => (Number.isFinite(n) ? Math.round(n) + "°" : "--");
    const c = d.current || {};
    const h = d.hourly || {};

    // Next 8 hours, starting from the current hour. The API returns local-time
    // strings without an offset, and `current.time` is in the same frame.
    const start = Math.max(0, (h.time || []).findIndex((t) => t >= (c.time || "").slice(0, 13)));
    const hours = (h.time || []).slice(start, start + 8).map((t, i) => {
      const k = start + i;
      const hr = new Date(t).toLocaleTimeString("en-US", { hour: "numeric" });
      const rain = h.precipitation_probability?.[k];
      return `<div class="wHour">
        <div>${i === 0 ? "Now" : hr}</div>
        <div class="wHIcon">${App.getWeatherIcon(h.weather_code?.[k])}</div>
        <div>${deg(h.temperature_2m?.[k])}</div>
        <div class="wHRain">${rain >= 10 ? rain + "%" : ""}</div>
      </div>`;
    }).join("");

    return {
      body: `
        <a class="wWx" href="/weather" target="_top">
          <span class="wWxSide">
            <span class="wTitle">${esc(loc.city || loc.label || "Weather")}</span>
            <span class="wSub">Feels ${deg(c.apparent_temperature)}</span>
          </span>
          <span class="wWxSide wWxNow">
            <span class="wWxTemp"><span class="wIcon">${App.getWeatherIcon(c.weather_code)}</span>${deg(c.temperature_2m)}</span>
            <span class="wSub">${esc(App.wmoDesc(c.weather_code))} · H ${deg(d.daily?.temperature_2m_max?.[0])} L ${deg(d.daily?.temperature_2m_min?.[0])}</span>
          </span>
        </a>
        <div class="wHours">${hours}</div>`,
      href: "/weather",
      more: "Full forecast",
    };
  }

  // ---- headlines ----------------------------------------------------------
  // The categories are the news page's own tabs (top-feeds.js).
  const categories = () => App.getNewsCategories();

  // The category shown is the news page's remembered one (cfg.newsScope), and
  // picking one here saves it there, so "More news" opens the site on the
  // same tab — and the next visit to either page starts where you left off.
  const savedScope = () => App.cfg.newsScope || App.cfg.newsTickerScope || "national";

  async function headlines(count, scope, withChips) {
    const cats = await categories();
    if (!cats.some((c) => c.id === scope)) scope = "national";
    const feeds = await App.getTopFeedsForScope(scope, getGeo);
    const lists = await Promise.all(feeds.map((f) => App.fetchNewsItems(f.rss, count).catch(() => [])));

    // Newest first across the outlets. Not interleaved: some feeds (the
    // Guardian's world feed) aren't in date order, and taking turns
    // surfaced week-old stories.
    const seen = new Set(), items = [];
    lists.forEach((l, f) => (l || []).forEach((it) => {
      if (it?.title && it.url && !seen.has(it.title)) {
        seen.add(it.title);
        const source = feeds[f].name || new URL(feeds[f].rss).hostname.replace(/^www\./, "");
        items.push({ ...it, source, t: Date.parse(it.pubDate) || 0 });
      }
    }));
    items.sort((a, b) => b.t - a.t);

    const chips = withChips
      ? `<div class="wChips" role="tablist">${cats.map((c) =>
          `<button type="button" class="wChip${c.id === scope ? " active" : ""}" role="tab" aria-selected="${c.id === scope}" data-scope="${esc(c.id)}">${esc(c.label)}</button>`).join("")}</div>`
      : "";
    const rows = items.slice(0, count).map((it) => {
      const age = it.t ? ago(Date.now() - it.t) : "";
      return `<a class="wRow wHeadline" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">
        <span class="wSrc"><b>${esc(it.source)}</b>${age ? ` · ${age}` : ""}</span>
        <span class="wHTitle">${esc(it.title)}</span></a>`;
    }).join("");
    const label = cats.find((c) => c.id === scope).label;

    if (!rows && !withChips) throw new Notice("No headlines right now.");
    return {
      title: "Headlines",
      body: chips + (rows ? `<div class="wList">${rows}</div>` : `<div class="wEmpty">No headlines right now.</div>`),
      href: "/",
      more: `More ${label.toLowerCase()} news`,
    };
  }

  // ---- stock rows (markets board + watchlist share one row layout) --------
  const quoteRow = (name, price, pct) => {
    const flat = Math.abs(pct) < 0.005, up = pct > 0;
    const cls = flat ? "flat" : up ? "up" : "down";
    const sign = flat ? "" : up ? "▲ " : "▼ ";
    const dec = Math.abs(price) >= 1 ? 2 : 4;
    return `<div class="wRow wQuote"><span class="wQName">${esc(name)}</span>
      <span class="wQPrice">${price.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}</span>
      <span class="wQMove ${cls}">${sign}${Math.abs(pct).toFixed(2)}%</span></div>`;
  };

  // The board rows: the tiles you've switched on in Settings, in your order,
  // read from the same cached snapshot the Stocks page uses.
  async function boardRows(count) {
    const res = await fetch(App.MARKETS_SNAPSHOT_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("snapshot " + res.status);
    const byKey = new Map(((await res.json()).items || []).map((i) => [i.key, i]));
    const names = new Map(App.MARKET_INDEX_DEFS.map((d) => [d.key, d.name]));
    return (App.cfg.marketIndices || [])
      .filter((e) => e && e.visible !== false && byKey.has(e.key))
      .slice(0, count)
      .map((e) => {
        const q = byKey.get(e.key);
        return Number.isFinite(+q.price) ? quoteRow(q.name || names.get(e.key) || e.key, +q.price, +q.changePercent || 0) : "";
      }).join("");
  }

  // The watchlist rows: one request for all symbols, via the Worker's per-symbol cache.
  async function watchlistRows(count) {
    const stocks = (App.cfg.stocks || []).slice(0, count);
    if (!stocks.length) return "";
    const sym = (s) => String(s.symbol || s).split(":").pop().toUpperCase();
    const url = `${App.STOCKS_PROXY_BASE}/quotes?symbols=${encodeURIComponent(stocks.map(sym).join(","))}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("quotes " + res.status);
    const quotes = (await res.json()).quotes || {};
    return stocks.map((s) => {
      const q = quotes[sym(s)];
      return q && Number.isFinite(+q.price) ? quoteRow(sym(s), +q.price, +q.changePercent || 0) : "";
    }).join("");
  }

  async function markets(count) {
    const rows = await boardRows(count);
    if (!rows) throw new Notice(`Nothing to show. <a href="/settings#stocks" target="_top">Pick market tiles in Settings</a>.`);
    return { title: "Markets", body: `<div class="wList">${rows}</div>`, href: "/stocks", more: "Full board" };
  }

  async function watchlist(count) {
    if (!(App.cfg.stocks || []).length) throw new Notice(`No stocks yet. <a href="/stocks" target="_top">Add some on the Stocks page</a>.`);
    const rows = await watchlistRows(count);
    if (!rows) throw new Error("no quotes");
    return { title: "Watchlist", body: `<div class="wList">${rows}</div>`, href: "/stocks", more: "Full stocks page" };
  }

  // The Today view's stocks card: the board, then the watchlist, each under
  // its own label. Either half failing still shows the other.
  async function stocks() {
    const [board, watch] = await Promise.allSettled([boardRows(6), watchlistRows(10)]);
    if (!board.value && !watch.value) {
      if (board.status === "rejected") throw board.reason;
      throw new Notice(`Nothing to show. <a href="/settings#stocks" target="_top">Pick market tiles in Settings</a>.`);
    }
    const block = (label, r) => `<div class="wSubhead">${label}</div><div class="wList">${r.value || `<div class="wEmpty">${
      r.status === "rejected" ? "Couldn't load." : label === "Watchlist" ? `None yet. <a href="/stocks" target="_top">Add stocks</a>.` : "None picked."}</div>`}</div>`;
    return { title: "Stocks", body: block("Markets", board) + block("Watchlist", watch), href: "/stocks", more: "Stocks page" };
  }

  // ---- rendering ----------------------------------------------------------
  const cardInner = (p, meta) => `
    ${p.title ? `<header class="wHead"><span class="wTitle">${p.title}</span>${meta ? `<span class="wMeta">${meta}</span>` : ""}</header>` : ""}
    ${p.body}
    <a class="wMore" href="${p.href}" target="_top">${p.more} →</a>`;
  const noticeCard = (e) => `<section class="wCard wMsg">${messageFor(e)}</section>`;

  // Today: lay the three cards down at once, then let each fill as its data
  // arrives, so a slow feed never holds up the weather.
  const PARTS = {
    weather: () => weather(),
    news: () => headlines(6, savedScope(), true),
    stocks: () => stocks(),
  };
  const generation = {};

  async function fill(key) {
    const el = root.querySelector(`[data-part="${key}"]`);
    const gen = (generation[key] = (generation[key] || 0) + 1);
    let html, failed = false;
    try { html = cardInner(await PARTS[key]()); }
    catch (e) { console.warn("[widget]", key, e); html = messageFor(e); failed = true; }
    if (gen !== generation[key]) return; // a newer fill (e.g. another chip tap) won
    el.innerHTML = html;
    el.classList.toggle("wMsg", failed);
    el.classList.remove("wBusy");
    if (key === "news") {
      centerActiveChip(el);
      preloadNeighbours();
      if (slideFrom) el.querySelector(".wList")?.classList.add(slideFrom);
      slideFrom = "";
    }
  }

  // Fetch the categories either side into the 5-minute feed cache, so the
  // next swipe or tap shows its headlines without a wait. Skipped when the
  // reader has asked the browser to save data.
  async function preloadNeighbours() {
    if (navigator.connection?.saveData) return;
    try {
      const cats = await categories();
      const at = cats.findIndex((c) => c.id === savedScope());
      if (at < 0 || cats.length < 2) return;
      for (const step of [1, -1]) {
        const feeds = await App.getTopFeedsForScope(cats[(at + step + cats.length) % cats.length].id, getGeo);
        await Promise.all(feeds.map((f) => App.fetchNewsItems(f.rss, 6).catch(() => {}))); // 6: the count headlines() asks for
      }
    } catch { /* a nicety; the card works without it */ }
  }

  // Keep the chosen chip in view, even when it's far along the row.
  function centerActiveChip(card) {
    const row = card.querySelector(".wChips"), chip = row?.querySelector(".active");
    if (chip) row.scrollLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
  }

  // ---- hand settings to the Android widget app ----------------------------
  // The widget app opens this page with ?send=... to pair (widget-link.js
  // does the pairing and builds the link). Only then is there a button here;
  // afterwards the site's "Update phone widget" bar takes over.
  const showSend = params.has("send") && Boolean(App.widgetLink?.paired());

  const sendCard = () => `
    <section class="wCard">
      <a class="wSend" aria-disabled="true">Preparing your settings…</a>
      <span class="wSub">Hands your location, news categories and watchlist to the widget app on this phone. Nothing is sent to a server.</span>
    </section>`;

  async function renderAll() {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    if (!root.querySelector("[data-part]")) {
      root.innerHTML = `
        <header class="wTop"><span class="wTopTitle">Today</span><span class="wMeta"></span></header>
        ${showSend ? sendCard() : ""}
        ${Object.keys(PARTS).map((k) => `<section class="wCard" data-part="${k}"><div class="wEmpty">Loading…</div></section>`).join("")}`;
      if (showSend) App.widgetLink.build().then((built) => {
        const a = root.querySelector(".wSend");
        App.widgetLink.attach(a, built);
        a.removeAttribute("aria-disabled");
        a.textContent = "Send to phone widget";
      }).catch((e) => { console.warn("[widget] send", e); root.querySelector(".wSend").textContent = "Couldn't prepare settings. Reload to retry."; });
    }
    root.querySelector(".wTop .wMeta").textContent = `${today} · Updated ${clock()}`;
    await Promise.all(Object.keys(PARTS).map(fill));
  }

  // Category chips: save the choice where the news page reads it, then
  // refill only the news card.
  root.addEventListener("click", (e) => {
    const chip = e.target.closest(".wChip");
    if (!chip || chip.classList.contains("active")) return;
    const scope = chip.dataset.scope;
    App.saveConfig({ ...App.cfg, newsScope: scope, newsTickerScope: scope });
    chip.parentElement.querySelectorAll(".wChip").forEach((b) => {
      b.classList.toggle("active", b === chip);
      b.setAttribute("aria-selected", String(b === chip));
    });
    chip.closest(".wCard").classList.add("wBusy");
    centerActiveChip(chip.closest(".wCard"));
    fill("news");
  });

  // Swipe sideways on the news card to move between categories, wrapping
  // round at either end — same feel and thresholds as the news page
  // (news-swipe.js). A swipe just clicks the next chip, so saving and
  // reloading stay in the one click handler above.
  let swipe = null, slideFrom = "";
  root.addEventListener("touchstart", (e) => {
    swipe = null;
    if (e.touches.length !== 1 || !e.target.closest('[data-part="news"]')) return;
    if (e.target.closest(".wChips")) return; // the chip row scrolls sideways itself
    const t = e.touches[0];
    if (t.clientX < 24 || t.clientX > innerWidth - 24) return; // leave the edges to the phone's back gesture
    swipe = { x: t.clientX, y: t.clientY, time: Date.now() };
  }, { passive: true });
  root.addEventListener("touchcancel", () => { swipe = null; }, { passive: true });
  root.addEventListener("touchend", (e) => {
    if (!swipe || e.touches.length) return;
    const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    const quick = Date.now() - swipe.time <= 700;
    swipe = null;
    // Clearly sideways (twice as far across as down), so scrolling never switches.
    if (!quick || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const chips = [...root.querySelectorAll(".wChip")];
    const at = chips.findIndex((c) => c.classList.contains("active"));
    if (chips.length < 2 || at < 0) return;
    const step = dx < 0 ? 1 : -1; // finger moves left → next category, like turning a page
    slideFrom = step > 0 ? "wFromRight" : "wFromLeft";
    chips[(at + step + chips.length) % chips.length].click();
  }, { passive: true });

  const SINGLE = {
    weather: () => weather(),
    headlines: () => headlines(10, params.get("scope") === "world" ? "international" : params.get("scope") || "national", false),
    markets: () => markets(8),
    watchlist: () => watchlist(10),
  };

  async function run() {
    if (name === "all") return renderAll();
    try {
      const p = await SINGLE[name]();
      root.innerHTML = `<section class="wCard">${cardInner(p, `Updated ${clock()}`)}</section>`;
    } catch (e) { console.warn("[widget]", e); root.innerHTML = noticeCard(e); }
  }

  // ---- boot ---------------------------------------------------------------
  const name = params.get("w") || "weather";
  if (name !== "all" && !SINGLE[name]) {
    root.innerHTML = noticeCard(new Notice(`Unknown widget “${esc(name)}”. Try <a href="?w=all">?w=all</a>.`));
    return;
  }
  // Cards fade in on first paint only; the 10-minute refresh swaps silently.
  run().finally(() => setTimeout(() => root.classList.add("wSettled"), 400));
  setInterval(run, Math.max(2, +App.cfg.weatherRefreshMinutes || 10) * 60_000);
})();
