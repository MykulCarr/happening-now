// The quote pop-up: tap a watchlist row or a board tile and see the price,
// 1D / 1W / 1M / 1Y charts and the day's details. Shared by the Markets page
// (full pop-up) and the Today view (compact: all four ranges at once).
//
// Every number comes from Yahoo's v8 chart data, fetched through /v1/rss/raw
// like the rest of the Markets page. Nothing is filled in when a field is
// missing: the line is left out instead (real data or nothing).
//
//   App.quotePopup.open({
//     symbol: "NVDA",          // Yahoo symbol
//     title: "NVDA",           // what the header says
//     money: true,             // format prices as currency (stocks); false for index points etc.
//     unit: "",                // shown under the price when money is false
//     newsUrl: "",             // optional "Headlines" link (board tiles)
//     pin: { pinned, toggle }, // optional "Pin to top" (watchlist)
//     compact: false           // Today view layout
//   })
(() => {
  "use strict";
  const App = window.App;
  if (!App || !App.RSS_PROXY_BASE) return;
  const esc = App.escapeHtml || ((s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));

  const RANGES = [
    { id: "d1", label: "1D", word: "today", q: "range=1d&interval=5m" },
    { id: "w1", label: "1W", word: "past week", q: "range=5d&interval=30m" },
    { id: "m1", label: "1M", word: "past month", q: "range=1mo&interval=1d" },
    { id: "y1", label: "1Y", word: "past year", q: "range=1y&interval=1wk" },
  ];
  const DEFAULT_RANGE = "m1"; // the month tells the bigger story; approved in the mock-up
  const FRESH_MS = 2 * 60 * 1000;
  const cache = new Map(); // "SYMBOL|range" -> { at, promise }

  function loadRange(symbol, range) {
    const key = `${symbol}|${range.id}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) return hit.promise;
    const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${range.q}`;
    const promise = fetch(App.RSS_PROXY_BASE + encodeURIComponent(target), { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json) => {
        const result = json?.chart?.result?.[0];
        if (!result?.meta) throw new Error("no data");
        const times = result.timestamp || [];
        const closes = result.indicators?.quote?.[0]?.close || [];
        const pts = [];
        times.forEach((t, i) => {
          const v = closes[i];
          if (v != null && Number.isFinite(+v)) pts.push([t, +v]);
        });
        return { meta: result.meta, pts };
      });
    promise.catch(() => cache.delete(key)); // a failure is not worth remembering
    cache.set(key, { at: Date.now(), promise });
    return promise;
  }

  // ---- formatting -----------------------------------------------------------
  const num = (v) => (v != null && Number.isFinite(+v) ? +v : null);
  const decimalsFor = (v) => { const a = Math.abs(v); return a >= 1 ? 2 : a >= 0.01 ? 4 : a >= 0.0001 ? 6 : 8; };
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const MINUS = "−";

  // One formatter per pop-up, so every figure in it has the same decimals and currency.
  function makeFormat(meta, opts) {
    const d = decimalsFor(num(meta.regularMarketPrice) ?? 1);
    const code = String(meta.currency || "");
    // Yahoo quotes London stocks in pence as "GBp"; only a real ISO code becomes a symbol.
    const money = opts.money !== false && /^[A-Z]{3}$/.test(code);
    const nf = money
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: d, maximumFractionDigits: d })
      : new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    return {
      price: (v) => nf.format(v),
      move: (diff, base, word) => {
        const down = diff < 0, sign = down ? MINUS : "+";
        const pct = base ? Math.abs(diff / base) * 100 : 0;
        return `${down ? "▼" : "▲"} ${sign}${nf.format(Math.abs(diff))} (${sign}${pct.toFixed(2)}%) ${word}`;
      },
      // A stock in pence says so; a board tile shows the unit it was given
      // (never Yahoo's "USD" under an index level, which is points).
      unit: money ? "" : opts.unit || (opts.money !== false ? code : ""),
    };
  }

  function timeLabel(sec, tz, parts) {
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: tz || undefined, ...parts }).format(new Date(sec * 1000));
    } catch {
      return new Intl.DateTimeFormat("en-US", parts).format(new Date(sec * 1000));
    }
  }

  const sameDay = (a, b, tz) => timeLabel(a, tz, { dateStyle: "short" }) === timeLabel(b, tz, { dateStyle: "short" });

  // "Market open · as of 1:07 PM EST", from Yahoo's own trading period and quote time.
  function statusLine(meta) {
    const tz = meta.exchangeTimezoneName;
    const now = Date.now() / 1000;
    const reg = meta.currentTradingPeriod?.regular;
    const open = reg && now >= reg.start && now < reg.end;
    const at = num(meta.regularMarketTime);
    let asOf = "";
    if (at) {
      const time = timeLabel(at, tz, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
      asOf = sameDay(at, now, tz) ? time : `${timeLabel(at, tz, { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
    }
    return { open: !!open, text: [reg ? (open ? "Market open" : "Market closed") : "", asOf && `as of ${asOf}`, "quotes may be delayed"].filter(Boolean).join(" · ") };
  }

  function changeWord(meta) {
    const at = num(meta.regularMarketTime);
    const tz = meta.exchangeTimezoneName;
    if (!at || sameDay(at, Date.now() / 1000, tz)) return "today";
    return `on ${timeLabel(at, tz, { weekday: "long" })}`;
  }

  // ---- charts ---------------------------------------------------------------
  const FROM_TO = {
    d1: { hour: "numeric", minute: "2-digit" },
    w1: { weekday: "short", month: "short", day: "numeric" },
    m1: { month: "short", day: "numeric" },
    y1: { month: "short", year: "numeric" },
  };

  // Paths in a fixed viewBox; the SVG stretches to its box and the stroke stays
  // the same width (vector-effect), so one drawing fits phone and desktop.
  function chartData(series, range, prevClose, fmt, title) {
    const pts = series.pts;
    if (pts.length < 2) return null;
    const W = 1000, H = 300, pad = 12;
    const vals = pts.map((p) => p[1]);
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const t0 = pts[0][0];
    // Evenly spaced by bar, not by clock time, so nights and weekends don't
    // draw as long flat lines (how stock charts usually skip closed hours).
    const xy = pts.map(([, v], i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${(pad + (1 - (v - lo) / span) * (H - 2 * pad)).toFixed(1)}`);
    const line = `M${xy.join(" L")}`;
    // 1D measures from yesterday's close, like the headline move; longer
    // ranges from the first point on the chart.
    const start = range.id === "d1" && prevClose != null ? prevClose : vals[0];
    const end = vals[vals.length - 1];
    const tz = series.meta.exchangeTimezoneName;
    const toParts = range.id === "d1" ? { ...FROM_TO.d1, timeZoneName: "short" } : FROM_TO[range.id];
    return {
      line, area: `${line} L${W},${H} L0,${H} Z`, W, H,
      down: end < start,
      change: fmt.move(end - start, start, range.word),
      pct: `${end < start ? MINUS : "+"}${(Math.abs(end - start) / start * 100).toFixed(2)}%`,
      hi: fmt.price(hi), lo: fmt.price(lo),
      from: timeLabel(t0, tz, FROM_TO[range.id]), to: timeLabel(pts[pts.length - 1][0], tz, toParts),
      aria: `${title}, ${range.word}, from ${fmt.price(start)} to ${fmt.price(end)}`,
    };
  }

  const svgHtml = (c, cls) => `
    <svg class="${cls}" viewBox="0 0 ${c.W} ${c.H}" preserveAspectRatio="none" role="img" aria-label="${esc(c.aria)}">
      <path d="${c.area}" class="qpArea"></path>
      <path d="${c.line}" class="qpLine" vector-effect="non-scaling-stroke"></path>
    </svg>`;

  // ---- the dialog -----------------------------------------------------------
  let dialog = null;
  let current = null; // { opts, range, token, fmt, prevClose }
  let token = 0;

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "quotePopup";
    document.body.appendChild(dialog);
    // A tap on the dimmed backdrop lands on the dialog element itself.
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
      const close = e.target.closest("[data-qp-close]");
      if (close) dialog.close();
      const tab = e.target.closest("[data-qp-range]");
      if (tab) showRange(tab.dataset.qpRange);
      const pin = e.target.closest("[data-qp-pin]");
      if (pin && current?.opts.pin) {
        const pinned = current.opts.pin.toggle();
        pin.textContent = pinned ? "Unpin" : "Pin to top";
        pin.setAttribute("aria-pressed", String(pinned));
      }
    });
    dialog.addEventListener("close", () => {
      document.documentElement.classList.remove("qpOpen");
      token++; // late answers for a closed pop-up are dropped
      if (history.state?.hnQuotePopup) history.back();
    });
    // On a phone the back button should close the sheet, not leave the page.
    window.addEventListener("popstate", () => { if (dialog.open) dialog.close(); });
    return dialog;
  }

  function headHtml(opts, meta, fmt) {
    const name = meta ? [meta.longName || meta.shortName, meta.fullExchangeName, opts.money !== false ? meta.currency : ""].filter(Boolean).join(" · ") : "";
    return `
      <div class="qpHead">
        <div class="qpTitleWrap">
          <h2 class="qpTitle">${esc(opts.title)}</h2>
          ${name ? `<div class="qpSub">${esc(name)}</div>` : ""}
        </div>
        <button type="button" class="qpClose" data-qp-close aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>`;
  }

  function priceHtml(meta, fmt, prevClose) {
    const price = num(meta.regularMarketPrice);
    const status = statusLine(meta);
    const move = prevClose != null ? price - prevClose : null;
    return `
      <div class="qpPriceBlock">
        <div class="qpPriceRow">
          <span class="qpPrice">${esc(fmt.price(price))}</span>
          ${move != null ? `<span class="qpMove ${move < 0 ? "qpDown" : "qpUp"}">${esc(fmt.move(move, prevClose, changeWord(meta)))}</span>` : ""}
        </div>
        ${fmt.unit ? `<div class="qpUnit">${esc(fmt.unit)}</div>` : ""}
        <div class="qpStatus"><span class="qpDot${status.open ? " isOpen" : ""}" aria-hidden="true"></span><span>${esc(status.text)}</span></div>
      </div>`;
  }

  function detailsHtml(meta, fmt, prevClose) {
    const price = num(meta.regularMarketPrice);
    const dayLo = num(meta.regularMarketDayLow), dayHi = num(meta.regularMarketDayHigh);
    const yLo = num(meta.fiftyTwoWeekLow), yHi = num(meta.fiftyTwoWeekHigh);
    const vol = num(meta.regularMarketVolume);
    const shares = /^(EQUITY|ETF)$/.test(meta.instrumentType || "");
    const cell = (label, value, extra = "") => `<div class="qpCell"><div class="qpCellLabel">${label}</div><div class="qpCellValue">${esc(value)}</div>${extra}</div>`;
    const cells = [];
    if (prevClose != null) cells.push(cell("Previous close", fmt.price(prevClose)));
    if (vol) cells.push(cell("Volume today", `${compact.format(vol)}${shares ? " shares" : ""}`));
    if (dayLo != null && dayHi != null) cells.push(cell("Day range", `${fmt.price(dayLo)} – ${fmt.price(dayHi)}`));
    if (yLo != null && yHi != null && yHi > yLo) {
      const at = Math.max(0, Math.min(100, ((price - yLo) / (yHi - yLo)) * 100));
      cells.push(cell("52-week range", `${fmt.price(yLo)} – ${fmt.price(yHi)}`,
        `<div class="qpBar" role="img" aria-label="Price is ${Math.round(at)}% of the way from the 52-week low to the high"><span style="left:${at.toFixed(1)}%"></span></div>`));
    }
    return cells.length ? `<div class="qpDetails">${cells.join("")}</div>` : "";
  }

  function actionsHtml(opts, meta) {
    const yahoo = `https://finance.yahoo.com/quote/${encodeURIComponent(opts.symbol)}`;
    const btns = [];
    if (opts.compact) btns.push(`<a class="qpBtn" href="/markets" target="_top">Open in Markets</a>`);
    if (opts.pin) btns.push(`<button type="button" class="qpBtn" data-qp-pin data-analytics="quote-pin" aria-pressed="${opts.pin.pinned}">${opts.pin.pinned ? "Unpin" : "Pin to top"}</button>`);
    if (opts.newsUrl && !opts.compact) btns.push(`<a class="qpBtn" href="${esc(opts.newsUrl)}" target="_blank" rel="noopener noreferrer">Headlines</a>`);
    if (!opts.compact) btns.push(`<a class="qpBtn" href="${esc(yahoo)}" target="_blank" rel="noopener noreferrer">More on Yahoo Finance</a>`);
    return `<div class="qpActions">${btns.join("")}</div>
      <div class="qpCredit">Prices from Yahoo Finance, through happening-now.net</div>`;
  }

  // The full pop-up's chart column: range tabs, the move, the chart.
  function chartColumnHtml() {
    return `
      <div class="qpChartCol">
        <div class="qpTabs" role="tablist" aria-label="Chart range">
          ${RANGES.map((r) => `<button type="button" role="tab" class="qpTab" data-qp-range="${r.id}" data-analytics="quote-${r.id}" aria-selected="false">${r.label}</button>`).join("")}
        </div>
        <div class="qpChart" aria-live="polite"><div class="qpNote">Loading chart…</div></div>
      </div>`;
  }

  async function showRange(id) {
    if (!current || current.opts.compact) return;
    const range = RANGES.find((r) => r.id === id) || RANGES[2];
    current.range = range.id;
    dialog.querySelectorAll("[data-qp-range]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.qpRange === range.id)));
    const box = dialog.querySelector(".qpChart");
    if (!box) return;
    const my = current.token;
    box.innerHTML = `<div class="qpNote">Loading chart…</div>`;
    let c = null;
    try {
      c = chartData(await loadRange(current.opts.symbol, range), range, current.prevClose, current.fmt, current.opts.title);
    } catch {}
    if (my !== token || current.range !== range.id) return; // closed or switched meanwhile
    box.innerHTML = c ? `
      <div class="qpChange ${c.down ? "qpDown" : "qpUp"}">${esc(c.change)}</div>
      <div class="qpPlot ${c.down ? "qpDown" : "qpUp"}">
        ${svgHtml(c, "qpSvg")}
        <span class="qpHi">High ${esc(c.hi)}</span><span class="qpLo">Low ${esc(c.lo)}</span>
      </div>
      <div class="qpFromTo"><span>${esc(c.from)}</span><span>${esc(c.to)}</span></div>`
      : `<div class="qpNote">No ${esc(range.label)} chart available right now.</div>`;
  }

  // The Today view: all four ranges as small charts, no tabs to tap.
  async function compactChartsHtml(opts, fmt, prevClose) {
    const all = await Promise.all(RANGES.map((r) => loadRange(opts.symbol, r).then((s) => chartData(s, r, prevClose, fmt, opts.title)).catch(() => null)));
    return `<div class="qpMinis">${RANGES.map((r, i) => {
      const c = all[i];
      return `<div class="qpMini ${c ? (c.down ? "qpDown" : "qpUp") : ""}">
        <div class="qpMiniHead"><span>${r.label}</span><span class="qpMiniPct">${c ? esc(c.pct) : "—"}</span></div>
        ${c ? svgHtml(c, "qpMiniSvg") : `<div class="qpNote">No chart</div>`}
      </div>`;
    }).join("")}</div>`;
  }

  async function open(opts) {
    if (!opts?.symbol) return;
    const d = ensureDialog();
    const my = ++token;
    current = { opts, range: DEFAULT_RANGE, token: my, fmt: null, prevClose: null };
    d.classList.toggle("isCompact", !!opts.compact);
    d.setAttribute("aria-label", `${opts.title} details`);
    d.innerHTML = `<div class="qpBody">${headHtml(opts)}<div class="qpNote">Loading prices…</div></div>`;
    if (!d.open) {
      d.showModal();
      document.documentElement.classList.add("qpOpen");
      if (window === window.top && !history.state?.hnQuotePopup) history.pushState({ hnQuotePopup: true }, "");
    }

    let day;
    try {
      day = await loadRange(opts.symbol, RANGES[0]); // the 1D answer carries the day's details
    } catch {
      if (my !== token) return;
      d.querySelector(".qpNote").outerHTML = `<div class="qpNote">Couldn't load prices for ${esc(opts.title)} right now.</div>${actionsHtml(opts)}`;
      return;
    }
    if (my !== token) return;
    const meta = day.meta;
    const fmt = makeFormat(meta, opts);
    const prevClose = num(meta.previousClose) ?? num(meta.chartPreviousClose);
    Object.assign(current, { fmt, prevClose });

    if (opts.compact) {
      const charts = await compactChartsHtml(opts, fmt, prevClose);
      if (my !== token) return;
      const dayLo = num(meta.regularMarketDayLow), dayHi = num(meta.regularMarketDayHigh);
      const facts = [prevClose != null ? `Prev close ${fmt.price(prevClose)}` : "", dayLo != null && dayHi != null ? `Day ${fmt.price(dayLo)} – ${fmt.price(dayHi)}` : ""].filter(Boolean);
      d.innerHTML = `<div class="qpBody">${headHtml(opts, meta, fmt)}${priceHtml(meta, fmt, prevClose)}${charts}
        ${facts.length ? `<div class="qpFacts">${facts.map((f) => `<span>${esc(f)}</span>`).join("")}</div>` : ""}
        ${actionsHtml(opts, meta)}</div>`;
      return;
    }

    d.innerHTML = `<div class="qpBody">${headHtml(opts, meta, fmt)}${priceHtml(meta, fmt, prevClose)}
      <div class="qpMain">${chartColumnHtml()}${detailsHtml(meta, fmt, prevClose)}</div>
      ${actionsHtml(opts, meta)}</div>`;
    showRange(current.range);
  }

  App.quotePopup = { open };
})();
