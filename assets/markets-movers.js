// Markets page: the Gainers, Losers and Trending cards. Split out of
// stocks.js on 2026-11-17; loaded just before it.
//
// The small chart beside each stock is its real closing price over the past
// month, from Yahoo's spark endpoint (up to 20 symbols per call, through our
// own /v1/rss/raw). Until 2026-11-18 it was drawn from random numbers, and an
// Economic Calendar card showed five made-up events; both were removed.
// Rule: a chart or number on this site is real or it is not there.
(() => {
  "use strict";
  const S = (window.App.marketsPage ||= {});
  const { escapeHtml, fetchStockGainers, fetchStockLosers, fetchStockMovers, RSS_PROXY_BASE } = window.App;
  // From the main script, looked up when called (it loads after this file).
  const parseMoverResult = (...args) => S.parseMoverResult(...args);

  // ---- real price history for the small charts ----
  // Yahoo answers 400 above 20 symbols per spark call (see markets.js).
  const SPARK_BATCH = 20;
  const SPARK_URL = "https://query1.finance.yahoo.com/v7/finance/spark?range=1mo&interval=1d&symbols=";
  const historyCache = new Map(); // symbol -> Promise<number[] | null>, for this page view

  const baseSymbol = (symbol) => String(symbol || "").split(":").pop().toUpperCase();

  async function fetchSparkBatch(symbols) {
    const out = new Map();
    try {
      const target = SPARK_URL + symbols.map(encodeURIComponent).join(",");
      const res = await fetch(RSS_PROXY_BASE + encodeURIComponent(target), { cache: "no-store" });
      if (!res.ok) return out;
      for (const r of (await res.json())?.spark?.result || []) {
        const closes = r?.response?.[0]?.indicators?.quote?.[0]?.close || [];
        const points = closes.map(Number).filter((v) => Number.isFinite(v) && v > 0);
        if (points.length >= 2) out.set(String(r.symbol).toUpperCase(), points);
      }
    } catch (err) {
      console.warn("[movers] price history failed:", err?.message || err);
    }
    return out;
  }

  // One request per 20 symbols not already asked for. The three cards load
  // at about the same time, so each card's symbols usually ride in their own
  // call; a symbol on two cards is fetched once.
  function priceHistory(symbols) {
    const missing = [...new Set(symbols.map(baseSymbol))].filter((s) => s && !historyCache.has(s));
    for (let i = 0; i < missing.length; i += SPARK_BATCH) {
      const batch = missing.slice(i, i + SPARK_BATCH);
      const done = fetchSparkBatch(batch);
      for (const s of batch) historyCache.set(s, done.then((m) => m.get(s) || null));
    }
    return Promise.all(symbols.map((s) => historyCache.get(baseSymbol(s))));
  }

  function sparklineSVG(data, width = 80, height = 24) {
    if (!data || data.length < 2) return "";
    const min = Math.min(...data);
    const range = Math.max(...data) - min || 1;
    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const color = data[data.length - 1] >= data[0] ? "#10b981" : "#ef4444";
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline" role="img" aria-label="Closing price, past month">
      <title>Closing price, past month</title>
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  // ---- the three cards ----
  function sourceLabel(source){
    if(source === "yahoo") return "Source: Yahoo Movers";
    if(source === "preset-list") return "Source: Preset List";
    return "Source: Unknown";
  }

  function setMoverSourceTag(id, source){
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = sourceLabel(source);
    el.classList.toggle("isFallback", source === "preset-list");
  }

  const CARDS = [
    { section: "gainers", container: "topGainers", tag: "gainersSourceTag", fetch: () => fetchStockGainers(), noun: "top gainers" },
    { section: "losers", container: "topLosers", tag: "losersSourceTag", fetch: () => fetchStockLosers(), noun: "top losers" },
    { section: "trending", container: "trendingStocks", tag: "moversSourceTag", fetch: () => fetchStockMovers(), noun: "trending stocks" },
  ];

  function renderMovers() {
    // Skip rendering and the API fan-out for sections the user has hidden.
    for (const card of CARDS) {
      if (!window.App?.isSectionHidden?.("stocks", card.section)) loadCard(card);
    }
  }

  function stockRow(stock) {
    const isPositive = stock.changePercent >= 0;
    const sign = isPositive ? "+" : "";
    return `
      <div class="stockItem" data-symbol="${escapeHtml(stock.symbol)}" data-label="${escapeHtml(stock.name)}">
        <div class="stockItemLeft">
          <div class="stockItemInfo">
            <div class="stockItemSymbol">${escapeHtml(stock.symbol)}</div>
            <div class="stockItemName">${escapeHtml(stock.name)}</div>
            <div class="stockItemStats">
              <span class="statLabel">Change:</span>
              <span class="statChange">${sign}${stock.changePercent.toFixed(2)}%</span>
            </div>
          </div>
          <div class="stockSparkline"></div>
        </div>
        <div class="stockItemRight">
          <div class="stockItemPrice">
            <div class="stockPrice">$${stock.price.toFixed(2)}</div>
            <div class="stockChange ${isPositive ? "positive" : "negative"}">${isPositive ? "▲" : "▼"} ${sign}${stock.changePercent.toFixed(2)}%</div>
          </div>
        </div>
      </div>`;
  }

  async function loadCard(card) {
    const container = document.getElementById(card.container);
    if (!container) return;
    setMoverSourceTag(card.tag, "unknown");
    container.innerHTML = `<div class="hint">Loading ${card.noun}...</div>`;

    let stocks;
    try {
      const { items, source } = parseMoverResult(await card.fetch());
      setMoverSourceTag(card.tag, source);
      stocks = items || [];
      if (!stocks.length) {
        container.innerHTML = `<div class="hint">No ${card.noun} data available</div>`;
        return;
      }
      container.innerHTML = stocks.map(stockRow).join("");
      container.querySelectorAll(".stockItem").forEach((item) => {
        item.addEventListener("click", () => {
          window.open(`https://finance.yahoo.com/quote/${item.dataset.symbol}`, "_blank", "noopener,noreferrer");
        });
      });
    } catch (error) {
      console.error(`Error rendering ${card.noun}:`, error);
      setMoverSourceTag(card.tag, "unknown");
      container.innerHTML = `<div class="hint">Error loading ${card.noun}</div>`;
      return;
    }

    // Charts arrive after the rows, so a slow history call never holds up
    // the prices. No history means no chart, never a stand-in.
    const histories = await priceHistory(stocks.map((s) => s.symbol));
    const slots = container.querySelectorAll(".stockSparkline");
    histories.forEach((h, i) => { if (slots[i]) slots[i].innerHTML = sparklineSVG(h); });
  }

  Object.assign(S, { renderMovers, sourceLabel });
})();
