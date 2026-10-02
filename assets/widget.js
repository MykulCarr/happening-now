// Standalone widgets: /widget?w=weather | headlines | markets | watchlist
// (headlines also takes &scope=world). Add a new one by adding to WIDGETS below.
// Reuses common.js for saved settings + theme and common-weather.js for the
// location lookup, so a widget shows exactly what the main site would.
(function () {
  const App = window.App;
  const root = document.getElementById("widget");
  const esc = App.escapeHtml;
  const cfg = App.cfg;

  const say = (msg) => { root.innerHTML = `<div class="wMsg">${msg}</div>`; };

  // ---- weather ------------------------------------------------------------
  async function weather() {
    const loc = await App.resolvePreferredLocation({ cfg, autoDetect: false });
    if (!loc || !Number.isFinite(+loc.lat) || !Number.isFinite(+loc.lon)) {
      say(`No location set. <a href="/settings#weather" target="_top">Set one in Settings</a>.`);
      return;
    }
    const tempUnit = cfg.weatherTempUnit || "fahrenheit";
    const windUnit = cfg.weatherWindUnit || "mph";
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${+loc.lat}&longitude=${+loc.lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&hourly=temperature_2m,weather_code,precipitation_probability` +
      `&daily=temperature_2m_max,temperature_2m_min` +
      `&forecast_days=2&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`;
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

    root.innerHTML = `
      <div class="wHead">
        <span class="wTitle">${esc(loc.city || loc.label || "Weather")}</span>
        <span class="wMeta">Updated ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
      </div>
      <div class="wNow">
        <div class="wIcon">${App.getWeatherIcon(c.weather_code)}</div>
        <div>
          <div class="wTemp">${deg(c.temperature_2m)}</div>
          <div class="wDesc">${esc(App.wmoDesc(c.weather_code))}</div>
          <div class="wSub">Feels ${deg(c.apparent_temperature)} · H ${deg(d.daily?.temperature_2m_max?.[0])} L ${deg(d.daily?.temperature_2m_min?.[0])}</div>
        </div>
      </div>
      <div class="wHours">${hours}</div>
      <a class="wMeta" href="/weather" target="_top">Full forecast →</a>`;
  }

  // ---- shared bits for the list-style widgets ------------------------------
  const clock = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const shell = (title, body, moreHref, moreText) => {
    root.innerHTML = `
      <div class="wHead"><span class="wTitle">${title}</span><span class="wMeta">Updated ${clock()}</span></div>
      ${body}
      <a class="wMeta" href="${moreHref}" target="_top">${moreText} →</a>`;
  };

  // ---- headlines ----------------------------------------------------------
  // Same curated outlet feeds the site's top ticker uses (news.js), so they
  // are known to work through the Worker. &scope=world swaps in international.
  const HEADLINE_FEEDS = {
    national: ["https://feeds.npr.org/1001/rss.xml", "https://feeds.feedburner.com/reuters/topNews"],
    world: ["https://feeds.bbci.co.uk/news/world/rss.xml", "https://www.theguardian.com/world/rss"],
  };
  async function headlines() {
    const scope = new URLSearchParams(location.search).get("scope") === "world" ? "world" : "national";
    const lists = await Promise.all(HEADLINE_FEEDS[scope].map((u) => App.fetchNewsItems(u, 8).catch(() => [])));
    // Interleave the feeds so one outlet doesn't fill the whole list.
    const seen = new Set(), items = [];
    for (let i = 0; i < 8; i++) for (const l of lists) {
      const it = l?.[i];
      if (it?.title && it.url && !seen.has(it.title)) { seen.add(it.title); items.push(it); }
    }
    if (!items.length) { say("No headlines right now."); return; }
    const rows = items.slice(0, 10).map((it) =>
      `<a class="wRow wHeadline" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a>`).join("");
    shell(scope === "world" ? "World headlines" : "Top headlines", `<div class="wList">${rows}</div>`, "/", "More news");
  }

  // ---- stock tiles (markets board + watchlist share one row layout) -------
  const row = (name, price, pct) => {
    const flat = Math.abs(pct) < 0.005, up = pct > 0;
    const cls = flat ? "flat" : up ? "up" : "down";
    const sign = flat ? "" : up ? "▲ " : "▼ ";
    const dec = Math.abs(price) >= 1 ? 2 : 4;
    return `<div class="wRow wQuote"><span class="wQName">${esc(name)}</span>
      <span class="wQPrice">${price.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}</span>
      <span class="wQMove ${cls}">${sign}${Math.abs(pct).toFixed(2)}%</span></div>`;
  };

  // The board: the tiles you've switched on in Settings, in your order,
  // read from the same cached snapshot the Stocks page uses.
  async function markets() {
    const res = await fetch(App.MARKETS_SNAPSHOT_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("snapshot " + res.status);
    const byKey = new Map(((await res.json()).items || []).map((i) => [i.key, i]));
    const names = new Map(App.MARKET_INDEX_DEFS.map((d) => [d.key, d.name]));
    let keys = (cfg.marketIndices || []).filter((e) => e && e.visible !== false).map((e) => e.key);
    keys = keys.filter((k) => byKey.has(k)).slice(0, 8);
    const rows = keys.map((k) => {
      const q = byKey.get(k);
      return Number.isFinite(+q.price) ? row(q.name || names.get(k) || k, +q.price, +q.changePercent || 0) : "";
    }).join("");
    if (!rows) { say(`Nothing to show. <a href="/settings#stocks" target="_top">Pick market tiles in Settings</a>.`); return; }
    shell("Markets", `<div class="wList">${rows}</div>`, "/stocks", "Full board");
  }

  // The watchlist: one request for all symbols, via the Worker's per-symbol cache.
  async function watchlist() {
    const stocks = (cfg.stocks || []).slice(0, 10);
    if (!stocks.length) { say(`No stocks yet. <a href="/stocks" target="_top">Add some on the Stocks page</a>.`); return; }
    const sym = (s) => String(s.symbol || s).split(":").pop().toUpperCase();
    const url = `${App.STOCKS_PROXY_BASE}/quotes?symbols=${encodeURIComponent(stocks.map(sym).join(","))}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("quotes " + res.status);
    const quotes = (await res.json()).quotes || {};
    const rows = stocks.map((s) => {
      const q = quotes[sym(s)];
      return q && Number.isFinite(+q.price) ? row(sym(s), +q.price, +q.changePercent || 0) : "";
    }).join("");
    if (!rows) throw new Error("no quotes");
    shell("Watchlist", `<div class="wList">${rows}</div>`, "/stocks", "Full stocks page");
  }

  // ---- boot ---------------------------------------------------------------
  const WIDGETS = { weather, headlines, markets, watchlist };
  const name = new URLSearchParams(location.search).get("w") || "weather";
  const render = WIDGETS[name];

  async function run() {
    try { await render(); }
    catch (e) { console.warn("[widget]", e); say("Couldn't load. Will retry shortly."); }
  }

  if (!render) {
    say(`Unknown widget “${esc(name)}”. Try <a href="?w=weather">?w=weather</a>.`);
  } else {
    run();
    setInterval(run, Math.max(2, +cfg.weatherRefreshMinutes || 10) * 60_000);
  }
})();
