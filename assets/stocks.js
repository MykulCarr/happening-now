(() => {
  "use strict";

  // Check if window.App exists first
  if (!window.App) {
    console.error("window.App not found - common.js may not have loaded");
    return;
  }

  const {
    cfg,
    fetchRssItems,
    getRssCooldownStatus,
    getRssLastSuccessAgeMs,
    clearRssCache,
    escapeHtml,
    stripTags,
    formatAge,
    cacheAgeMs,
    fetchStockPrice,
    fetchStockCandles,
    fetchStockGainers,
    fetchStockLosers,
    fetchStockMovers,
    fetchYahooBatchQuotes,
    applyThemeDensity,
    MARKET_INDEX_DEFS
  } = window.App;
  
  // Apply theme, density, and font size on page load
  applyThemeDensity(cfg);
  
  // Debug logging
  console.log("Stocks page initializing...", { 
    hasCfg: !!cfg, 
    hasStocks: !!(cfg && cfg.stocks),
    stocksCount: cfg?.stocks?.length || 0,
    configObject: cfg
  });
  
  if (!cfg) {
    console.error("No config found - window.App.cfg is missing");
    return;
  }
  
  if (!cfg.stocks) {
    console.warn("No stocks in config - initializing empty array");
    cfg.stocks = [];
  }

  const PINS_KEY = "jas_stock_pins_v1";
  const NEWS_MODE_KEY = "jas_stock_news_mode_v1";
  const STOCKS_NEWS_CACHE_KEY = "jas_stocks_news_cache_v1";
  const WATCHLIST_CANDLE_RESOLUTION = "30";
  const WATCHLIST_CANDLE_DAYS = 5;
  const NEWS_FETCH_TIMEOUT_MS = 15000;
  const STOCKS_NEWS_CACHE_MAX_AGE_MS = 8 * 60 * 60 * 1000;
  const STOCKS_NEWS_ARTICLE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
  const WATCHLIST_NEWS_SYMBOL_LIMIT = 6;
  const MAJOR_NEWS_QUERY_URL = `https://news.google.com/rss/search?q=${encodeURIComponent("stock market when:2d")}&hl=en-US&gl=US&ceid=US:en`;
  const RSS_PROXY_PROBE_URL = "/v1/rss/raw?url=" + encodeURIComponent("https://feeds.npr.org/1001/rss.xml");
  const stocksDiag = document.getElementById("stocksDiag");

  async function probeEndpoint(url, timeoutMs = 4500){
    try{
      const signal = (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function")
        ? AbortSignal.timeout(timeoutMs)
        : undefined;
      const res = await fetch(url, { cache: "no-store", signal });
      return res.ok;
    }catch{
      return false;
    }
  }

  function getNewsDiagnosticQueries(){
    if(newsMode === "watchlist"){
      const watchlist = Array.isArray(cfg.stocks) ? cfg.stocks.slice(0, WATCHLIST_NEWS_SYMBOL_LIMIT) : [];
      return watchlist.map((stock) => googleNewsRssQueryForSymbol(stock.symbol, stock.label));
    }
    return [MAJOR_NEWS_QUERY_URL];
  }

  async function updateStocksDiagnostics(){
    if(!stocksDiag) return;

    const [backendOk, proxyOk] = await Promise.all([
      probeEndpoint("/v1/health"),
      probeEndpoint(RSS_PROXY_PROBE_URL)
    ]);

    const queries = getNewsDiagnosticQueries();
    let routesOnCooldown = 0;
    let totalRoutes = 0;
    let bestSuccessAgeMs = Infinity;

    if(typeof getRssCooldownStatus === "function"){
      queries.forEach((query) => {
        const status = getRssCooldownStatus(query);
        routesOnCooldown += Number(status?.routesOnCooldown || 0);
        totalRoutes += Number(status?.totalRoutes || 0);
      });
    }

    if(typeof getRssLastSuccessAgeMs === "function"){
      queries.forEach((query) => {
        const ageMs = getRssLastSuccessAgeMs(query);
        if(Number.isFinite(ageMs)) bestSuccessAgeMs = Math.min(bestSuccessAgeMs, ageMs);
      });
    }

    const successLabel = Number.isFinite(bestSuccessAgeMs)
      ? `${formatAge(bestSuccessAgeMs)} ago`
      : "none yet";

    const status = (backendOk && proxyOk)
      ? "healthy"
      : (backendOk || proxyOk)
        ? "partial"
        : "down";
    const proxyLabel = proxyOk ? "reachable" : "unreachable";

    stocksDiag.className = `sub diagLine ${status === "healthy" ? "isHealthy" : status === "partial" ? "isPartial" : "isDown"}`;
    stocksDiag.textContent =
      `Backend ${status} • RSS proxy ${proxyLabel} • last RSS success ${successLabel} • cooldowns ${routesOnCooldown}/${totalRoutes}`;
  }

  const LEGACY_MARKET_INDEX_NAME_TO_KEY = {
    "DOW": "dow",
    "S&P 500": "sp500",
    "NASDAQ": "nasdaq",
    "RUSSELL 2000": "russell2000",
    "GOLD": "gold",
    "SILVER": "silver",
    "CRUDE OIL": "crudeoil",
    "NAT GAS": "natgas",
    "BITCOIN": "bitcoin"
  };

  const INDEX_NEWS_QUERY_OVERRIDES = {
    dow: "Dow Jones Industrial Average breaking news",
    sp500: "S&P 500 market news",
    nasdaq: "NASDAQ Composite market news",
    russell2000: "Russell 2000 market news",
    sp400: "S&P MidCap 400 market news",
    sp600: "S&P SmallCap 600 market news",
    microcap: "US microcap market news",
    vix: "CBOE VIX volatility index news",
    ftse100: "FTSE 100 market news",
    dax: "DAX index market news",
    nikkei225: "Nikkei 225 market news",
    hangseng: "Hang Seng market news",
    gold: "gold market news",
    silver: "silver market news",
    copper: "copper market news",
    crudeoil: "WTI crude oil market news",
    brent: "Brent crude oil market news",
    natgas: "natural gas market news",
    us10y: "US 10-year Treasury yield news",
    dxy: "US Dollar Index DXY news",
    eurusd: "EUR USD forex news",
    bitcoin: "Bitcoin market news",
    ethereum: "Ethereum market news"
  };

  const INDEX_DIRECT_SOURCE_URLS = {
    dow: "https://www.reuters.com/markets/us/",
    sp500: "https://www.reuters.com/markets/us/",
    nasdaq: "https://www.reuters.com/markets/us/",
    russell2000: "https://www.reuters.com/markets/us/",
    sp400: "https://www.reuters.com/markets/us/",
    sp600: "https://www.reuters.com/markets/us/",
    microcap: "https://www.wsj.com/market-data/stocks",
    vix: "https://www.cboe.com/tradable_products/vix/",
    ftse100: "https://www.reuters.com/world/uk/",
    dax: "https://www.reuters.com/world/europe/",
    nikkei225: "https://www.reuters.com/world/asia-pacific/",
    hangseng: "https://www.reuters.com/world/china/",
    gold: "https://www.bloomberg.com/markets/commodities",
    silver: "https://www.bloomberg.com/markets/commodities",
    copper: "https://www.bloomberg.com/markets/commodities",
    crudeoil: "https://www.bloomberg.com/energy",
    brent: "https://www.bloomberg.com/energy",
    natgas: "https://www.bloomberg.com/energy",
    us10y: "https://www.reuters.com/markets/rates-bonds/",
    dxy: "https://www.reuters.com/markets/currencies/",
    eurusd: "https://www.reuters.com/markets/currencies/",
    bitcoin: "https://www.coindesk.com/markets/",
    ethereum: "https://www.coindesk.com/markets/"
  };

  const INDEX_DIRECT_SOURCE_LABELS = {
    dow: "Reuters",
    sp500: "Reuters",
    nasdaq: "Reuters",
    russell2000: "Reuters",
    sp400: "Reuters",
    sp600: "Reuters",
    microcap: "WSJ",
    vix: "CBOE",
    ftse100: "Reuters",
    dax: "Reuters",
    nikkei225: "Reuters",
    hangseng: "Reuters",
    gold: "Bloomberg",
    silver: "Bloomberg",
    copper: "Bloomberg",
    crudeoil: "Bloomberg",
    brent: "Bloomberg",
    natgas: "Bloomberg",
    us10y: "Reuters",
    dxy: "Reuters",
    eurusd: "Reuters",
    bitcoin: "CoinDesk",
    ethereum: "CoinDesk"
  };

  const marketIndexCatalog = Array.isArray(MARKET_INDEX_DEFS) && MARKET_INDEX_DEFS.length
    ? MARKET_INDEX_DEFS
    : [
      { key: "dow", name: "DOW", value: 37892.45, change: 145.23, changePercent: 0.38 },
      { key: "sp500", name: "S&P 500", value: 4783.21, change: -12.34, changePercent: -0.26 },
      { key: "nasdaq", name: "NASDAQ", value: 14912.67, change: 67.89, changePercent: 0.46 }
    ];

  const INDEX_QUOTE_SYMBOLS = {
    dow: "^DJI",
    sp500: "^GSPC",
    nasdaq: "^IXIC",
    russell2000: "^RUT",
    sp400: "MID",
    sp600: "SML",
    microcap: "IWC",
    vix: "^VIX",
    ftse100: "^FTSE",
    dax: "^GDAXI",
    nikkei225: "^N225",
    hangseng: "^HSI",
    gold: "GC=F",
    silver: "SI=F",
    copper: "HG=F",
    crudeoil: "CL=F",
    brent: "BZ=F",
    natgas: "NG=F",
    us10y: "^TNX",
    dxy: "DX-Y.NYB",
    eurusd: "EURUSD=X",
    bitcoin: "BTC-USD",
    ethereum: "ETH-USD"
  };

  const INDEX_VALUE_DECIMALS = {
    us10y: 3,
    eurusd: 4,
    natgas: 3
  };
  
  let pins = loadPins();
  let sortMode = cfg.stockSortMode || "pinned";
  let newsMode = cfg.stocksNewsMode || localStorage.getItem(NEWS_MODE_KEY) || "watchlist";
  let lastUpdateTime = null;
  let marketTickerState = null;

  function destroyMarketTicker(){
    if(!marketTickerState) return;
    if(marketTickerState.resumeTimer){
      window.clearTimeout(marketTickerState.resumeTimer);
    }
    if(marketTickerState.rafId){
      window.cancelAnimationFrame(marketTickerState.rafId);
    }
    if(marketTickerState.abortController){
      marketTickerState.abortController.abort();
    }
    marketTickerState = null;
  }

  function setupMarketTicker(container){
    destroyMarketTicker();

    const viewport = container.querySelector(".marketTickerViewport");
    const track = container.querySelector(".marketTickerTrack");
    const firstGroup = container.querySelector(".marketTickerGroup");
    if(!viewport || !track || !firstGroup) return;

    const abortController = new AbortController();
    const gap = Number.parseFloat(window.getComputedStyle(track).columnGap || window.getComputedStyle(track).gap || "0") || 0;
    const speedPxPerSecond = 20;

    let cycleWidth = 0;
    let paused = false;
    let dragging = false;
    let activePointerId = null;
    let lastPointerX = 0;
    let dragDistancePx = 0;
    let pointerDownLinkUrl = "";
    let offsetPx = 0;
    const hoverPauseGraceMs = 1200;
    let hoverPauseReadyAt = 0;
    let lastFrameTs = 0;
    let lastMeasureTs = 0;
    let rafId = 0;
    let resumeTimer = 0;

    function measure(resetPosition = false){
      cycleWidth = firstGroup.getBoundingClientRect().width + gap;
      container.style.setProperty("--ticker-distance", `${cycleWidth}px`);
      container.style.setProperty("--ticker-duration", `${Math.max(120, cycleWidth / speedPxPerSecond)}s`);
      if(resetPosition && cycleWidth > 0){
        offsetPx = 0;
        applyTrackTransform();
      }
    }

    function applyTrackTransform(){
      track.style.transform = `translate3d(${-offsetPx}px, 0, 0)`;
    }

    function normalizeScroll(){
      if(cycleWidth <= 0) return;
      while(offsetPx >= cycleWidth){
        offsetPx -= cycleWidth;
      }
      while(offsetPx < 0){
        offsetPx += cycleWidth;
      }
    }

    function clearResumeTimer(){
      if(resumeTimer){
        window.clearTimeout(resumeTimer);
        resumeTimer = 0;
      }
    }

    function queueAutoResume(delay = 1100){
      clearResumeTimer();
      resumeTimer = window.setTimeout(() => {
        paused = false;
      }, delay);
    }

    function tick(timestamp){
      if(!lastFrameTs) lastFrameTs = timestamp;
      const deltaSeconds = (timestamp - lastFrameTs) / 1000;
      lastFrameTs = timestamp;
      const hoverPaused = timestamp >= hoverPauseReadyAt && viewport.matches(":hover") && !dragging;

      if(paused && !dragging && !hoverPaused && !resumeTimer){
        paused = false;
      }

      if(cycleWidth <= 0){
        if(!lastMeasureTs || (timestamp - lastMeasureTs) >= 250){
          lastMeasureTs = timestamp;
          measure(false);
          if(cycleWidth > 0){
            normalizeScroll();
            applyTrackTransform();
          }
        }
      } else if(!paused && !dragging && !hoverPaused){
        offsetPx += speedPxPerSecond * deltaSeconds;
        normalizeScroll();
        applyTrackTransform();
      }

      rafId = window.requestAnimationFrame(tick);
      if(marketTickerState){
        marketTickerState.rafId = rafId;
        marketTickerState.resumeTimer = resumeTimer;
      }
    }

    measure(true);
    hoverPauseReadyAt = (window.performance?.now?.() || 0) + hoverPauseGraceMs;
    window.requestAnimationFrame(() => {
      measure(false);
      if(cycleWidth > 0){
        normalizeScroll();
        applyTrackTransform();
      }
    });
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(() => {
        measure(false);
        if(cycleWidth > 0){
          normalizeScroll();
          applyTrackTransform();
        }
      }).catch(() => {});
    }
    viewport.classList.add("isInteractive");

    viewport.addEventListener("pointerdown", (event) => {
      if(event.pointerType === "mouse" && event.button !== 0) return;
      if(activePointerId !== null) return;
      event.preventDefault();
      if(cycleWidth <= 0) measure(false);
      clearResumeTimer();
      dragging = true;
      paused = true;
      activePointerId = event.pointerId;
      lastPointerX = event.clientX;
      dragDistancePx = 0;
      pointerDownLinkUrl = event.target?.closest(".indexItem[data-news-url]")?.dataset?.newsUrl || "";
      viewport.classList.add("isDragging");
      viewport.setPointerCapture(event.pointerId);
    }, { signal: abortController.signal });

    viewport.addEventListener("pointermove", (event) => {
      if(!dragging || event.pointerId !== activePointerId) return;
      event.preventDefault();
      const deltaX = event.clientX - lastPointerX;
      lastPointerX = event.clientX;
      dragDistancePx += Math.abs(deltaX);
      offsetPx -= deltaX;
      normalizeScroll();
      applyTrackTransform();
    }, { signal: abortController.signal });

    function endDrag(event){
      if(!dragging || event.pointerId !== activePointerId) return;
      const shouldOpenLink = event.type === "pointerup" && dragDistancePx < 8 && pointerDownLinkUrl;
      dragging = false;
      activePointerId = null;
      viewport.classList.remove("isDragging");
      if(viewport.hasPointerCapture(event.pointerId)){
        viewport.releasePointerCapture(event.pointerId);
      }
      dragDistancePx = 0;
      if(shouldOpenLink){
        openMarketNewsUrl(pointerDownLinkUrl);
      }
      pointerDownLinkUrl = "";
      queueAutoResume();
      hoverPauseReadyAt = (window.performance?.now?.() || 0) + hoverPauseGraceMs;
    }

    viewport.addEventListener("pointerup", endDrag, { signal: abortController.signal });
    viewport.addEventListener("pointercancel", endDrag, { signal: abortController.signal });
    viewport.addEventListener("lostpointercapture", endDrag, { signal: abortController.signal });
    viewport.addEventListener("dragstart", (event) => {
      event.preventDefault();
    }, { signal: abortController.signal });

    viewport.addEventListener("keydown", (event) => {
      if(event.key !== "Enter" && event.key !== " ") return;
      const item = event.target?.closest(".indexItem[data-news-url]");
      const url = item?.dataset?.newsUrl;
      if(!url) return;
      event.preventDefault();
      openMarketNewsUrl(url);
    }, { signal: abortController.signal });

    viewport.addEventListener("wheel", (event) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if(!delta) return;
      event.preventDefault();
      clearResumeTimer();
      paused = true;
      offsetPx += delta;
      normalizeScroll();
      applyTrackTransform();
      queueAutoResume(1400);
    }, { passive: false, signal: abortController.signal });

    window.addEventListener("resize", () => {
      measure(false);
      if(cycleWidth > 0){
        normalizeScroll();
        applyTrackTransform();
      }
    }, { signal: abortController.signal });

    rafId = window.requestAnimationFrame(tick);
    marketTickerState = {
      abortController,
      rafId,
      resumeTimer
    };
  }

  // ===== MOCK PRICE DATA (Replace with real API in production) =====
  // For demo: generates mock prices with random changes
  function generateMockPrice(symbol) {
    // Extract base symbol (remove exchange prefix like "NASDAQ:" or "BITSTAMP:")
    const baseSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;
    
    const basePrice = {
      "AAPL": 175.43,
      "MSFT": 378.85,
      "GOOGL": 140.23,
      "AMZN": 145.67,
      "NVDA": 495.22,
      "TSLA": 242.84,
      "META": 312.45,
      "NFLX": 445.67,
      "AMD": 138.92,
      "INTC": 42.15,
      "DIS": 95.48,
      "BA": 178.35,
      "JPM": 152.73,
      "V": 245.89,
      "WMT": 158.42,
      "HD": 324.56,
      "MCD": 289.34,
      "NKE": 107.28,
      "SBUX": 98.54,
      "COST": 612.45,
      // User's actual stocks from config
      "CLOV": 3.45,
      "VIIIX": 432.18,
      "VSMPX": 128.76,
      "TILIX": 89.42,
      "FNIPX": 23.67,
      "BTCUSD": 52340.25
    };

    const price = basePrice[baseSymbol] || (Math.random() * 200 + 50);
    const changePercent = (Math.random() - 0.5) * 8; // -4% to +4%
    const change = price * (changePercent / 100);
    
    // Generate 52-week high/low
    const yearHigh = price * (1 + Math.random() * 0.3); // up to 30% higher
    const yearLow = price * (1 - Math.random() * 0.25); // up to 25% lower
    
    // Generate mock sparkline data (7 days)
    const trend = [];
    let val = price - change; // start from yesterday's close
    for (let i = 0; i < 7; i++) {
      const variation = (Math.random() - 0.5) * (price * 0.03);
      val = val + variation;
      trend.push(val);
    }
    
    return {
      symbol,
      price: price + change,
      change: change,
      changePercent: changePercent,
      previousClose: price,
      yearHigh: yearHigh,
      yearLow: yearLow,
      trend: trend
    };
  }

  function generateSparklineSVG(data, width = 80, height = 24) {
    if (!data || data.length < 2) return '';
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    
    const lastValue = data[data.length - 1];
    const firstValue = data[0];
    const trendUp = lastValue >= firstValue;
    const color = trendUp ? '#10b981' : '#ef4444';
    
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  function seedFromSymbol(symbol) {
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
      hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) || 1;
  }

  function generateWatchlistSparklineSVG(data, width = 140, height = 44, symbol = "") {
    if (!data || data.length < 2) return "";

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const inset = 3;
    const innerW = width - inset * 2;
    const innerH = height - inset * 2;

    const points = data.map((val, i) => {
      const x = inset + (i / (data.length - 1)) * innerW;
      const y = inset + innerH - ((val - min) / range) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const lastValue = data[data.length - 1];
    const firstValue = data[0];
    const trendUp = lastValue >= firstValue;
    const lineColor = trendUp ? "#22c55e" : "#f43f5e";
    const gradId = `watchGrad_${seedFromSymbol(symbol)}`;
    const areaPath = `M ${points[0]} L ${points.slice(1).join(" L ")} L ${width - inset},${height - inset} L ${inset},${height - inset} Z`;
    const lastPoint = points[points.length - 1].split(",").map(Number);

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline sparkline--watch" aria-hidden="true">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.35" />
            <stop offset="100%" stop-color="${lineColor}" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#${gradId})" />
        <polyline points="${points.join(" ")}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="2.8" fill="${lineColor}" />
      </svg>
    `;
  }

  // ===== MARKET STATUS + INDICES =====
  function getConfiguredIndices(){
    const rawSelection = Array.isArray(cfg.marketIndices) ? cfg.marketIndices : [];
    const isLegacySelection = rawSelection.length > 0 && typeof rawSelection[0] === "string";

    const visibleByKey = new Map();
    const orderedKeys = [];
    const seenKeys = new Set();
    if(isLegacySelection){
      rawSelection.forEach((name) => {
        const key = LEGACY_MARKET_INDEX_NAME_TO_KEY[name] || String(name || "").trim().toLowerCase();
        if(!key || seenKeys.has(key)) return;
        seenKeys.add(key);
        orderedKeys.push(key);
        visibleByKey.set(key, true);
      });
    } else {
      rawSelection.forEach((entry) => {
        if(!entry || typeof entry !== "object") return;
        const key = String(entry.key || "").trim().toLowerCase();
        if(!key || seenKeys.has(key)) return;
        seenKeys.add(key);
        orderedKeys.push(key);
        visibleByKey.set(key, entry.visible !== false);
      });
    }

    const byKey = new Map(marketIndexCatalog.map((item) => [item.key, item]));
    const orderedVisible = orderedKeys
      .filter((key) => {
        if(isLegacySelection) return visibleByKey.get(key) === true;
        return visibleByKey.size === 0 ? true : visibleByKey.get(key) !== false;
      })
      .map((key) => byKey.get(key))
      .filter(Boolean);

    const fallbackVisible = marketIndexCatalog.filter((idx) => {
      if(seenKeys.has(idx.key)) return false;
      if(isLegacySelection) return false;
      if(visibleByKey.size === 0) return true;
      return visibleByKey.get(idx.key) !== false;
    });

    return [...orderedVisible, ...fallbackVisible];
  }

  async function hydrateIndicesWithLiveQuotes(indices){
    // Batch fetch all index symbols in one Yahoo Finance v7 request (avoids rate limits)
    const yahooSymbols = indices.map(idx => INDEX_QUOTE_SYMBOLS[idx.key]).filter(Boolean);
    const batchQuotes = await fetchYahooBatchQuotes(yahooSymbols).catch(() => null);

    const quotePromises = indices.map(async (idx) => {
      const symbol = INDEX_QUOTE_SYMBOLS[idx.key];
      if(!symbol) return idx;

      // Use batch result when available
      const bq = batchQuotes?.[symbol];
      if(bq && Number.isFinite(bq.price) && bq.price > 0){
        return {
          ...idx,
          value: bq.price,
          change: bq.change,
          changePercent: bq.changePercent
        };
      }

      // Individual fallback for any symbol the batch missed
      try{
        const quote = await fetchStockPrice(symbol);
        if(!quote || !Number.isFinite(Number(quote.price))) return idx;
        return {
          ...idx,
          value: Number(quote.price),
          change: Number.isFinite(Number(quote.change)) ? Number(quote.change) : 0,
          changePercent: Number.isFinite(Number(quote.changePercent)) ? Number(quote.changePercent) : 0
        };
      }catch{
        return idx;
      }
    });

    return Promise.all(quotePromises);
  }

  function formatIndexValue(index){
    const decimals = Number.isFinite(INDEX_VALUE_DECIMALS[index.key]) ? INDEX_VALUE_DECIMALS[index.key] : 2;
    return Number(index.value).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  async function renderIndices() {
    const container = document.getElementById("marketIndices");
    if (!container) {
      console.warn("marketIndices container not found");
      return;
    }

    destroyMarketTicker();

    try {
      const configured = getConfiguredIndices().filter(Boolean);
      const indices = await hydrateIndicesWithLiveQuotes(configured);

      if(indices.length === 0){
        container.innerHTML = `<div class="hint">No markets selected. Enable items in <a href="settings.html">Settings</a>.</div>`;
        return;
      }

      const now = new Date();
      const tickerItems = indices.map(idx => {
        const hasData = Number.isFinite(idx.value) && idx.value > 0;
        const isPositive = hasData ? idx.change >= 0 : true;
        const arrow = isPositive ? "▲" : "▼";
        const cls = isPositive ? "positive" : "negative";
        const sign = isPositive ? "+" : "";
        const session = getMarketSessionStatus(idx.key, now);
        const newsUrl = getIndexNewsUrl(idx);
        const sourceLabel = getIndexSourceLabel(idx);
        const sourceClass = getIndexSourceClass(idx);

        const valueHtml = hasData
          ? formatIndexValue(idx)
          : `<span class="indexUnavailable">—</span>`;
        const changeHtml = hasData
          ? `${arrow} ${sign}${idx.change.toFixed(2)} (${sign}${idx.changePercent.toFixed(2)}%)`
          : `<span class="indexUnavailable">Unavailable</span>`;

        return `
          <div class="indexItem indexItemLink" data-news-url="${escapeHtml(newsUrl)}" tabindex="0" role="link" aria-label="Open ${escapeHtml(idx.name)} news">
            <div class="indexTopRow">
              <div class="indexName">${escapeHtml(idx.name)}</div>
              <span class="indexSession ${session.tone}">${session.label}</span>
            </div>
            <div class="indexValue">${valueHtml}</div>
            <div class="indexChange ${hasData ? cls : ""}">
              ${changeHtml}
            </div>
            <div class="indexSourceTag ${sourceClass}">${escapeHtml(sourceLabel)}</div>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div class="marketTickerViewport" aria-live="polite">
          <div class="marketTickerTrack">
            <div class="marketTickerGroup">${tickerItems}</div>
            <div class="marketTickerGroup" aria-hidden="true">${tickerItems}</div>
            <div class="marketTickerGroup" aria-hidden="true">${tickerItems}</div>
          </div>
        </div>
      `;

      setupMarketTicker(container);
    } catch (error) {
      console.error("Error rendering indices:", error);
      container.innerHTML = `<div class="hint">Error loading market indices</div>`;
      destroyMarketTicker();
    }
  }

  function getIndexNewsUrl(indexDef){
    const key = String(indexDef?.key || "").toLowerCase();
    const sourceMode = cfg.marketNewsSourceMode === "direct" ? "direct" : "google";

    if(sourceMode === "direct"){
      const directUrl = INDEX_DIRECT_SOURCE_URLS[key];
      if(directUrl) return directUrl;
    }

    const fallbackName = String(indexDef?.name || "market");
    const query = INDEX_NEWS_QUERY_OVERRIDES[key] || `${fallbackName} market news`;
    return `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  }

  function getIndexSourceLabel(indexDef){
    const key = String(indexDef?.key || "").toLowerCase();
    const sourceMode = cfg.marketNewsSourceMode === "direct" ? "direct" : "google";
    if(sourceMode === "direct"){
      return INDEX_DIRECT_SOURCE_LABELS[key] || "Direct Source";
    }
    return "Google News";
  }

  function getIndexSourceClass(indexDef){
    const sourceLabel = getIndexSourceLabel(indexDef).toLowerCase();
    if(sourceLabel.includes("google")) return "isGoogle";
    if(sourceLabel.includes("reuters")) return "isReuters";
    if(sourceLabel.includes("bloomberg")) return "isBloomberg";
    if(sourceLabel.includes("coindesk")) return "isCoinDesk";
    if(sourceLabel.includes("cboe")) return "isCboe";
    if(sourceLabel.includes("wsj")) return "isWsj";
    return "isDirect";
  }

  function openMarketNewsUrl(url){
    if(!url) return;
    const openMode = cfg.marketNewsOpenMode === "same-tab" ? "same-tab" : "new-tab";
    if(openMode === "same-tab"){
      window.location.href = url;
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function getClockParts(timeZone, now = new Date()){
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(now);

    const toVal = (type) => parts.find((p) => p.type === type)?.value || "";
    const hour = Number(toVal("hour"));
    const minute = Number(toVal("minute"));
    return {
      day: toVal("weekday"),
      minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0)
    };
  }

  function isWeekendDay(day){
    return day === "Sat" || day === "Sun";
  }

  function getUsEquitySession(now){
    const et = getClockParts("America/New_York", now);
    if(isWeekendDay(et.day)) return { tone: "closed", label: "CLOSED" };
    if(et.minutes >= 240 && et.minutes < 570) return { tone: "premarket", label: "PRE" };
    if(et.minutes >= 570 && et.minutes < 960) return { tone: "open", label: "OPEN" };
    if(et.minutes >= 960 && et.minutes < 1200) return { tone: "afterhours", label: "AFTER" };
    return { tone: "closed", label: "CLOSED" };
  }

  function getTwentyFourFiveSession(now){
    const et = getClockParts("America/New_York", now);
    if(et.day === "Sat") return { tone: "closed", label: "WEEKEND" };
    if(et.day === "Sun" && et.minutes < 1080) return { tone: "closed", label: "WEEKEND" };
    if(et.day === "Fri" && et.minutes >= 1020) return { tone: "closed", label: "WEEKEND" };
    if(et.minutes >= 1020 && et.minutes < 1080) return { tone: "paused", label: "PAUSE" };
    return { tone: "open", label: "OPEN" };
  }

  function getMarketSessionStatus(indexKey, now = new Date()){
    const key = String(indexKey || "").toLowerCase();

    if(["dow", "sp500", "nasdaq", "russell2000", "sp400", "sp600", "microcap", "vix"].includes(key)){
      return getUsEquitySession(now);
    }

    if(key === "ftse100"){
      const uk = getClockParts("Europe/London", now);
      if(isWeekendDay(uk.day)) return { tone: "closed", label: "CLOSED" };
      return (uk.minutes >= 480 && uk.minutes < 990)
        ? { tone: "open", label: "OPEN" }
        : { tone: "closed", label: "CLOSED" };
    }

    if(key === "dax"){
      const eu = getClockParts("Europe/Berlin", now);
      if(isWeekendDay(eu.day)) return { tone: "closed", label: "CLOSED" };
      return (eu.minutes >= 540 && eu.minutes < 1050)
        ? { tone: "open", label: "OPEN" }
        : { tone: "closed", label: "CLOSED" };
    }

    if(key === "nikkei225"){
      const jp = getClockParts("Asia/Tokyo", now);
      if(isWeekendDay(jp.day)) return { tone: "closed", label: "CLOSED" };
      if(jp.minutes >= 540 && jp.minutes < 690) return { tone: "open", label: "OPEN" };
      if(jp.minutes >= 690 && jp.minutes < 750) return { tone: "paused", label: "LUNCH" };
      if(jp.minutes >= 750 && jp.minutes < 900) return { tone: "open", label: "OPEN" };
      return { tone: "closed", label: "CLOSED" };
    }

    if(key === "hangseng"){
      const hk = getClockParts("Asia/Hong_Kong", now);
      if(isWeekendDay(hk.day)) return { tone: "closed", label: "CLOSED" };
      if(hk.minutes >= 570 && hk.minutes < 720) return { tone: "open", label: "OPEN" };
      if(hk.minutes >= 720 && hk.minutes < 780) return { tone: "paused", label: "LUNCH" };
      if(hk.minutes >= 780 && hk.minutes < 960) return { tone: "open", label: "OPEN" };
      return { tone: "closed", label: "CLOSED" };
    }

    if(["gold", "silver", "copper", "crudeoil", "brent", "natgas", "us10y", "dxy", "eurusd"].includes(key)){
      return getTwentyFourFiveSession(now);
    }

    if(["bitcoin", "ethereum"].includes(key)){
      return { tone: "open", label: "24/7" };
    }

    return { tone: "closed", label: "CLOSED" };
  }

  // ===== PIN MANAGEMENT =====
  function loadPins() {
    try {
      return JSON.parse(localStorage.getItem(PINS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function savePins() {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  }

  function togglePin(symbol) {
    if (pins[symbol]) {
      delete pins[symbol];
    } else {
      pins[symbol] = true;
    }
    savePins();
    renderWatchlist(); // async, but we don't need to await
  }

  // ===== SORTING =====
  function sortedStocks(list, pins, mode) {
    const copy = [...list];
    if (mode === "pinned") {
      return copy.sort((a, b) => {
        const aPin = pins[a.symbol] ? 1 : 0;
        const bPin = pins[b.symbol] ? 1 : 0;
        if (aPin !== bPin) return bPin - aPin;
        return a.label.localeCompare(b.label);
      });
    } else if (mode === "az") {
      return copy.sort((a, b) => a.label.localeCompare(b.label));
    } else {
      return copy.sort((a, b) => a.symbol.localeCompare(b.symbol));
    }
  }

  // ===== WATCHLIST RENDERING (using real prices) =====
  async function renderWatchlist() {
    const container = document.getElementById("stocksBody");
    if (!container) {
      console.warn("stocksBody container not found");
      return;
    }

    const sorted = sortedStocks(cfg.stocks || [], pins, sortMode);
    lastUpdateTime = Date.now();
    updateLastUpdated();

    if (sorted.length === 0) {
      container.innerHTML = `<div class="hint">No stocks added yet. Visit <a href="settings.html">Settings</a> to add stocks.</div>`;
      return;
    }

    try {
      // Batch-fetch all watchlist prices in one Yahoo Finance v7 request
      const baseSymbols = sorted.map(s => s.symbol.includes(":") ? s.symbol.split(":")[1] : s.symbol);
      const batchPrices = await fetchYahooBatchQuotes(baseSymbols).catch(() => null);

      const pricePromises = sorted.map(async (stock) => {
        const baseSymbol = stock.symbol.includes(":") ? stock.symbol.split(":")[1] : stock.symbol;
        let price = batchPrices?.[baseSymbol] || null;
        let candles = null;
        let candleError = null;

        if(!price){
          try{
            price = await fetchStockPrice(stock.symbol);
          }catch(err){
            console.warn(`Failed to fetch price for ${stock.symbol}:`, err);
          }
        }

        if(price){
          try{
            const candleResult = await fetchStockCandles(stock.symbol, {
              resolution: WATCHLIST_CANDLE_RESOLUTION,
              days: WATCHLIST_CANDLE_DAYS
            });
            candles = candleResult?.data || null;
            candleError = candleResult?.error || null;
          }catch(err){
            console.warn(`Failed to fetch candles for ${stock.symbol}:`, err);
            candleError = err?.message || "Candle fetch failed";
          }
        }

        return { stock, price, candles, candleError };
      });
      const results = await Promise.all(pricePromises);

      // Now render with prices or fallback
      container.innerHTML = results.map(({ stock, price, candles, candleError }) => {
        const isPinned = !!pins[stock.symbol];
        
        if (!price) {
          // No price data - show basic card
          const helpMsg = "Price data unavailable from current providers for this symbol.";
          
          return `
            <div class="stockItem" data-symbol="${escapeHtml(stock.symbol)}" data-label="${escapeHtml(stock.label)}">
              <div class="stockItemLeft">
                <div class="stockItemInfo">
                  <div class="stockItemSymbol">${escapeHtml(stock.symbol)}</div>
                  <div class="stockItemName">${escapeHtml(stock.label)}</div>
                  <div class="stockItemStats" style="color: var(--muted); font-size: 12px;">
                    ${helpMsg}
                  </div>
                </div>
              </div>
              <div class="stockItemRight">
                <button class="pinBtn ${isPinned ? 'pinned' : ''}" 
                        data-symbol="${escapeHtml(stock.symbol)}" 
                        type="button" 
                        aria-label="${isPinned ? 'Unpin' : 'Pin'} ${escapeHtml(stock.symbol)}">
                  ${isPinned ? '📌' : '📍'}
                </button>
              </div>
            </div>
          `;
        }

        // Has real price data
        const isPositive = price.changePercent >= 0;
        const isNeutral = Math.abs(price.changePercent) < 0.01;
        const arrow = isPositive ? "▲" : "▼";
        const changeCls = isNeutral ? "neutral" : (isPositive ? "positive" : "negative");
        const sign = isPositive ? "+" : "";
        const watchSpark = candles
          ? generateWatchlistSparklineSVG(candles, 140, 44, stock.symbol)
          : "";
        const reasonText = candleError || "No candle data available";
        const sparkMarkup = watchSpark
          ? watchSpark
          : `<div class="sparklineEmpty">No Data: ${escapeHtml(reasonText)}</div>`;

        const candleValues = Array.isArray(candles)
          ? candles.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
          : [];
        const fallbackLow = candleValues.length ? Math.min(...candleValues) : null;
        const fallbackHigh = candleValues.length ? Math.max(...candleValues) : null;
        const rangeLow = Number.isFinite(price.low) && price.low > 0 ? price.low : fallbackLow;
        const rangeHigh = Number.isFinite(price.high) && price.high > 0 ? price.high : fallbackHigh;
        const hasRange = Number.isFinite(rangeLow) && Number.isFinite(rangeHigh);
        const rangeMarkup = hasRange
          ? `<span class="statLow">L $${rangeLow.toFixed(2)}</span><span class="statSep">•</span><span class="statHigh">H $${rangeHigh.toFixed(2)}</span>`
          : `<span class="statMissing">Range unavailable</span>`;

        return `
          <div class="stockItem watchlistItem" data-symbol="${escapeHtml(stock.symbol)}" data-label="${escapeHtml(stock.label)}">
            <div class="stockItemLeft">
              <div class="stockItemInfo">
                <div class="stockItemSymbol">${escapeHtml(stock.symbol)}</div>
                <div class="stockItemName">${escapeHtml(stock.label)}</div>
                <div class="stockItemStats">
                  <span class="statLabel">Range:</span>
                  ${rangeMarkup}
                </div>
              </div>
              <div class="watchSparkline ${watchSpark ? "" : "isEmpty"}">
                ${sparkMarkup}
              </div>
            </div>
            <div class="stockItemRight">
              <div class="stockItemPrice">
                <div class="stockPrice">$${price.price.toFixed(2)}</div>
                <div class="stockChange ${changeCls}">
                  ${arrow} ${sign}${price.changePercent.toFixed(2)}%
                </div>
              </div>
              <button class="pinBtn ${isPinned ? 'pinned' : ''}" 
                      data-symbol="${escapeHtml(stock.symbol)}" 
                      type="button" 
                      aria-label="${isPinned ? 'Unpin' : 'Pin'} ${escapeHtml(stock.symbol)}">
                ${isPinned ? '📌' : '📍'}
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Attach pin listeners
      container.querySelectorAll(".pinBtn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const symbol = btn.dataset.symbol;
          togglePin(symbol);
        });
      });

      // Attach stock item click listeners to open stock page
      container.querySelectorAll(".stockItem").forEach(item => {
        item.addEventListener("click", (e) => {
          if (!e.target.closest(".pinBtn")) {
            const symbol = item.dataset.symbol;
            const label = item.dataset.label;
            
            // Determine the best URL based on symbol format
            let url;
            
            if (symbol.includes('BITSTAMP:') || symbol.includes('COINBASE:')) {
              // Crypto - extract crypto symbol and use CoinMarketCap
              const cryptoPair = symbol.split(':')[1];
              const crypto = cryptoPair.replace('USD', '').toLowerCase();
              url = `https://coinmarketcap.com/currencies/${crypto === 'btc' ? 'bitcoin' : crypto}/`;
            } else {
              // All stocks/funds - use Yahoo Finance
              // Remove exchange prefix if present
              const cleanSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;
              url = `https://finance.yahoo.com/quote/${cleanSymbol}`;
            }
            
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        });
      });
    } catch (error) {
      console.error("Error rendering watchlist:", error);
      container.innerHTML = `<div class="hint" style="color:var(--muted);">Error loading watchlist. Check console.</div>`;
    }
  }

  // ===== LAST UPDATED =====
  function updateLastUpdated() {
    const el = document.getElementById("lastUpdated");
    if (!el || !lastUpdateTime) return;
    
    const age = Date.now() - lastUpdateTime;
    const formatted = formatAge(age);
    el.textContent = `Updated ${formatted} ago`;
  }

  // ===== NEWS RENDERING =====
  async function renderNews() {
    const container = document.getElementById("stocksNews");
    if (!container) return;

    let slowNoticeTimer = null;

    const scheduleSlowNotice = () => {
      slowNoticeTimer = window.setTimeout(() => {
        if(!container || container.querySelector(".newsSlowNotice")) return;
        const notice = document.createElement("div");
        notice.className = "hint newsSlowNotice";
        notice.textContent = "Gathering data from multiple sources. This page carries a lot of live content.";
        container.appendChild(notice);
      }, 1400);
    };

    const clearSlowNotice = () => {
      if(slowNoticeTimer){
        clearTimeout(slowNoticeTimer);
        slowNoticeTimer = null;
      }
      container?.querySelector(".newsSlowNotice")?.remove();
    };

    const withTimeout = (promise, timeoutMs, label) => {
      let timerId = null;
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      return Promise.race([promise, timeoutPromise]).finally(() => {
        if(timerId) clearTimeout(timerId);
      });
    };

    try {
      container.innerHTML = `<div class="hint">Loading news...</div>`;
      scheduleSlowNotice();

      let articles = [];
      let fallbackLabel = "";
      let cooldownRetrySec = 0;
      let lastSuccessAgeMs = null;

      if (newsMode === "watchlist") {
        const watchlist = Array.isArray(cfg.stocks) ? cfg.stocks.slice(0, WATCHLIST_NEWS_SYMBOL_LIMIT) : [];
        const tasks = watchlist.map(async (stock) => {
          // Mutual-fund tickers (e.g. FNIPX, VSMPX, TLYIX) almost never have Google
          // News results. Both proxies just time out, producing console noise with
          // zero user-visible benefit. Same heuristic as common-stocks.js's
          // shouldSkipFinnhubSymbol: ≥5 chars ending in X.
          if(isFundLikeSymbol(stock.symbol)){
            return [];
          }
          const query = googleNewsRssQueryForSymbol(stock.symbol, stock.label);
          const items = await withTimeout(
            fetchRssItems(query, 3, true),
            NEWS_FETCH_TIMEOUT_MS,
            `News fetch for ${stock.symbol}`
          );
          return items.map(item => ({ ...item, stock: stock.symbol, stockLabel: stock.label }));
        });

        const settled = await Promise.allSettled(tasks);
        settled.forEach((result, idx) => {
          if(result.status === "fulfilled"){
            if(!fallbackLabel){
              fallbackLabel = result.value.find((item) => item?._newsFallback && item?._newsSourceLabel)?._newsSourceLabel || fallbackLabel;
            }
            articles.push(...result.value);
            return;
          }
          const symbol = watchlist[idx]?.symbol || "symbol";
          console.warn(`Failed to fetch news for ${symbol}:`, result.reason);
        });

        if(typeof getRssCooldownStatus === "function"){
          watchlist.forEach((stock) => {
            const query = googleNewsRssQueryForSymbol(stock.symbol, stock.label);
            const status = getRssCooldownStatus(query);
            if(status?.retryInSec > cooldownRetrySec) cooldownRetrySec = status.retryInSec;

            if(typeof getRssLastSuccessAgeMs === "function"){
              const ageMs = getRssLastSuccessAgeMs(query);
              if(ageMs != null && (lastSuccessAgeMs == null || ageMs < lastSuccessAgeMs)){
                lastSuccessAgeMs = ageMs;
              }
            }
          });
        }
        
        // Group by stock and limit display
        const seen = new Set();
        articles = articles.filter(a => {
          const key = `${a.title}::${a.url}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        
      } else {
        // Major headlines - top 18 only
        try {
          const googleNewsUrl = MAJOR_NEWS_QUERY_URL;
          const items = await withTimeout(
            fetchRssItems(googleNewsUrl, 18, true),
            NEWS_FETCH_TIMEOUT_MS,
            "Major headlines fetch"
          );
          fallbackLabel = items.find((item) => item?._newsFallback && item?._newsSourceLabel)?._newsSourceLabel || fallbackLabel;
          articles.push(...items);

          if(typeof getRssCooldownStatus === "function"){
            const status = getRssCooldownStatus(googleNewsUrl);
            if(status?.retryInSec > 0) cooldownRetrySec = status.retryInSec;
          }

          if(typeof getRssLastSuccessAgeMs === "function"){
            const ageMs = getRssLastSuccessAgeMs(googleNewsUrl);
            if(ageMs != null) lastSuccessAgeMs = ageMs;
          }
        } catch(err) {
          console.warn("Failed to fetch major headlines:", err);
        }
      }

      if (articles.length > 0) {
        saveCachedStocksNews(newsMode, articles);
      }

      if (articles.length === 0) {
        clearSlowNotice();
        const cached = loadCachedStocksNews(newsMode);
        if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
          const ageMs = Math.max(0, Date.now() - (Number(cached.savedAt) || Date.now()));
          const ageLabel = formatAge(ageMs);
          const cacheLabel = ageLabel
            ? `Live feed unavailable. Showing last loaded headlines (${ageLabel} old).`
            : "Live feed unavailable. Showing last loaded headlines.";
          renderStocksNewsFromItems(cached.items, cacheLabel, cooldownRetrySec, lastSuccessAgeMs);
          return;
        }
        const retryText = cooldownRetrySec > 0 ? ` Retrying in ${cooldownRetrySec}s.` : "";
        const lastSuccessText = cooldownRetrySec > 0
          ? ` ${lastSuccessAgeMs != null ? `Last successful fetch ${escapeHtml(formatAge(lastSuccessAgeMs))} ago.` : "No successful fetch yet."}`
          : "";
        container.innerHTML = `<div class="hint">No news available. (RSS proxy may be temporarily unavailable)${retryText}${lastSuccessText}</div>`;
        return;
      }

      clearSlowNotice();
      renderStocksNewsFromItems(articles, fallbackLabel, cooldownRetrySec, lastSuccessAgeMs);
    } catch(error) {
      clearSlowNotice();
      console.error("Error rendering news:", error);
      const cached = loadCachedStocksNews(newsMode);
      if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
        const ageMs = Math.max(0, Date.now() - (Number(cached.savedAt) || Date.now()));
        const ageLabel = formatAge(ageMs);
        const cacheLabel = ageLabel
          ? `Error loading live news. Showing last loaded headlines (${ageLabel} old).`
          : "Error loading live news. Showing last loaded headlines.";
        renderStocksNewsFromItems(cached.items, cacheLabel);
      } else {
        container.innerHTML = `<div class="hint">Error loading news. RSS proxy may be unavailable.</div>`;
      }
    } finally {
      clearSlowNotice();
    }
  }

  function googleNewsRssQueryForSymbol(symbol, label) {
    const q = encodeURIComponent(`${label} ${symbol} stock when:2d`);
    return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  }

  function isFundLikeSymbol(symbol){
    const normalized = String(symbol || "").trim().toUpperCase();
    if(!normalized) return false;
    const base = normalized.includes(":") ? normalized.split(":").pop() : normalized;
    return base.length >= 5 && base.endsWith("X");
  }

  function extractDomain(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return "source";
    }
  }

  function getTimeAgo(date) {
    if(!(date instanceof Date) || !Number.isFinite(date.getTime())) return "";
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if(!Number.isFinite(seconds) || seconds < 0) return "";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  function getStocksNewsCacheKey(mode) {
    return `${STOCKS_NEWS_CACHE_KEY}:${mode === "major" ? "major" : "watchlist"}`;
  }

  function parseNewsTimestamp(pubDate) {
    const ts = Date.parse(String(pubDate || ""));
    return Number.isFinite(ts) ? ts : null;
  }

  function isFreshNewsItem(item, now = Date.now()) {
    const ts = parseNewsTimestamp(item?.pubDate);
    if(ts == null) return false;
    return (now - ts) <= STOCKS_NEWS_ARTICLE_MAX_AGE_MS;
  }

  function filterFreshNewsItems(items) {
    if(!Array.isArray(items)) return [];
    const now = Date.now();
    return items.filter((item) => isFreshNewsItem(item, now));
  }

  function loadCachedStocksNews(mode) {
    try {
      const raw = localStorage.getItem(getStocksNewsCacheKey(mode));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;

      const savedAt = Number(parsed.savedAt) || Date.now();
      if((Date.now() - savedAt) > STOCKS_NEWS_CACHE_MAX_AGE_MS){
        localStorage.removeItem(getStocksNewsCacheKey(mode));
        return null;
      }

      const freshItems = filterFreshNewsItems(parsed.items).slice(0, 24);
      if(freshItems.length === 0){
        localStorage.removeItem(getStocksNewsCacheKey(mode));
        return null;
      }

      return {
        savedAt,
        items: freshItems.filter((item) => item && item.title && item.url)
      };
    } catch {
      return null;
    }
  }

  function saveCachedStocksNews(mode, items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const freshItems = filterFreshNewsItems(items);
    if(freshItems.length === 0) return;
    const payload = {
      savedAt: Date.now(),
      items: freshItems.slice(0, 24).map((item) => ({
        title: String(item?.title || "").trim(),
        url: String(item?.url || "").trim(),
        pubDate: String(item?.pubDate || "").trim()
      })).filter((item) => item.title && item.url)
    };
    if (payload.items.length === 0) return;
    try {
      localStorage.setItem(getStocksNewsCacheKey(mode), JSON.stringify(payload));
    } catch {}
  }

  function renderStocksNewsFromItems(items, fallbackLabel = "", cooldownRetrySec = 0, lastSuccessAgeMs = null) {
    const container = document.getElementById("stocksNews");
    if (!container) return;

    const renderItems = filterFreshNewsItems(items);
    if(renderItems.length === 0){
      container.innerHTML = `<div class="hint">No recent market news is available right now.</div>`;
      return;
    }

    const fallbackHtml = fallbackLabel
      ? `<div class="dataSourceTag isFallback newsFallbackNote">${escapeHtml(fallbackLabel)}</div>`
      : "";

    const cooldownHtml = cooldownRetrySec > 0
      ? `<div class="dataSourceTag isFallback newsFallbackNote newsCooldownNote">Retrying feed routes in ${cooldownRetrySec}s</div>`
      : "";

    const lastSuccessHtml = cooldownRetrySec > 0
      ? `<div class="hint newsLastSuccessNote">${lastSuccessAgeMs != null ? `Last successful fetch ${escapeHtml(formatAge(lastSuccessAgeMs))} ago` : "No successful fetch yet"}</div>`
      : "";

    container.innerHTML = fallbackHtml + cooldownHtml + lastSuccessHtml + renderItems.map(article => {
      const domain = extractDomain(article.url);
      const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      const timeAgo = article.pubDate ? getTimeAgo(new Date(article.pubDate)) : "";

      return `
        <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer" class="newsArticle">
          <div class="newsContent">
            <div class="newsTitle">${escapeHtml(article.title)}</div>
            <div class="newsMeta">
              <div class="newsSource">
                <img src="${favicon}" alt="" class="sourceFavicon" onerror="this.style.display='none'">
                <span>${escapeHtml(domain)}</span>
              </div>
              ${timeAgo ? `<span class="newsTime">${escapeHtml(timeAgo)}</span>` : ''}
            </div>
          </div>
        </a>
      `;
    }).join('');
  }

  // ===== TOP GAINERS/LOSERS =====
  function parseMoverResult(result){
    if(Array.isArray(result)){
      return { items: result, source: "unknown" };
    }
    const items = Array.isArray(result?.items) ? result.items : [];
    return { items, source: String(result?.source || "unknown") };
  }

  function sourceLabel(source){
    if(source === "alpha-vantage") return "Source: Alpha Vantage";
    if(source === "yahoo") return "Source: Yahoo Movers";
    if(source === "fmp") return "Source: Live Movers";
    if(source === "preset-list") return "Source: Preset List";
    return "Source: Unknown";
  }

  function setMoverSourceTag(id, source){
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = sourceLabel(source);
    el.classList.toggle("isFallback", source === "preset-list");
  }

  function renderMovers() {
    renderGainers();
    renderLosers();
    renderTrending();
    // Load actual data asynchronously
    loadAndRenderGainers();
    loadAndRenderLosers();
    loadAndRenderTrending();
  }

  function renderGainers() {
    const container = document.getElementById("topGainers");
    if (!container) {
      console.warn("topGainers container not found");
      return;
    }

    try {
      setMoverSourceTag("gainersSourceTag", "unknown");
      container.innerHTML = `<div class="hint">Loading top gainers...</div>`;
    } catch (error) {
      console.error("Error setting loading state:", error);
    }
  }

  async function loadAndRenderGainers() {
    const container = document.getElementById("topGainers");
    if (!container) {
      console.warn("topGainers container not found");
      return;
    }

    try {
      // Force fresh data by not using cache (comment out cache check)
      const result = await fetchStockGainers();
      const { items: gainers, source } = parseMoverResult(result);
      setMoverSourceTag("gainersSourceTag", source);
      
      if (!gainers || gainers.length === 0) {
        container.innerHTML = `<div class="hint">No gainers data available</div>`;
        return;
      }

      container.innerHTML = gainers.map(stock => {
        const isPositive = stock.changePercent >= 0;
        const arrow = isPositive ? "▲" : "▼";
        const changeCls = isPositive ? "positive" : "negative";
        const sign = isPositive ? "+" : "";
        
        // Generate mock price data for sparkline and stats (since API doesn't provide 52w data)
        const priceData = generateMockPrice(stock.symbol);
        const sparkline = generateSparklineSVG(priceData.trend);
        
        return `
          <div class="stockItem" data-symbol="${escapeHtml(stock.symbol)}" data-label="${escapeHtml(stock.name)}">
            <div class="stockItemLeft">
              <div class="stockItemInfo">
                <div class="stockItemSymbol">${escapeHtml(stock.symbol)}</div>
                <div class="stockItemName">${escapeHtml(stock.name)}</div>
                <div class="stockItemStats">
                  <span class="statLabel">Change:</span>
                  <span class="statChange">${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%</span>
                </div>
              </div>
              <div class="stockSparkline">
                ${sparkline}
              </div>
            </div>
            <div class="stockItemRight">
              <div class="stockItemPrice">
                <div class="stockPrice">$${stock.price.toFixed(2)}</div>
                <div class="stockChange ${changeCls}">${arrow} ${sign}${stock.changePercent.toFixed(2)}%</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      // Attach click listeners
      container.querySelectorAll(".stockItem").forEach(item => {
        item.addEventListener("click", () => {
          const symbol = item.dataset.symbol;
          window.open(`https://finance.yahoo.com/quote/${symbol}`, '_blank', 'noopener,noreferrer');
        });
      });
    } catch (error) {
      console.error("Error rendering gainers:", error);
      setMoverSourceTag("gainersSourceTag", "unknown");
      container.innerHTML = `<div class="hint">Error loading top gainers</div>`;
    }
  }

  function renderLosers() {
    const container = document.getElementById("topLosers");
    if (!container) {
      console.warn("topLosers container not found");
      return;
    }

    try {
      setMoverSourceTag("losersSourceTag", "unknown");
      container.innerHTML = `<div class="hint">Loading top losers...</div>`;
    } catch (error) {
      console.error("Error setting loading state:", error);
    }
  }

  async function loadAndRenderLosers() {
    const container = document.getElementById("topLosers");
    if (!container) {
      console.warn("topLosers container not found");
      return;
    }

    try {
      const result = await fetchStockLosers();
      const { items: losers, source } = parseMoverResult(result);
      setMoverSourceTag("losersSourceTag", source);
      
      if (!losers || losers.length === 0) {
        container.innerHTML = `<div class="hint">No losers data available</div>`;
        return;
      }

      container.innerHTML = losers.map(stock => {
        const isPositive = stock.changePercent >= 0;
        const arrow = isPositive ? "▲" : "▼";
        const changeCls = isPositive ? "positive" : "negative";
        const sign = isPositive ? "+" : "";
        
        // Generate mock price data for sparkline and stats
        const priceData = generateMockPrice(stock.symbol);
        const sparkline = generateSparklineSVG(priceData.trend);
        
        return `
          <div class="stockItem" data-symbol="${escapeHtml(stock.symbol)}" data-label="${escapeHtml(stock.name)}">
            <div class="stockItemLeft">
              <div class="stockItemInfo">
                <div class="stockItemSymbol">${escapeHtml(stock.symbol)}</div>
                <div class="stockItemName">${escapeHtml(stock.name)}</div>
                <div class="stockItemStats">
                  <span class="statLabel">Change:</span>
                  <span class="statChange">${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%</span>
                </div>
              </div>
              <div class="stockSparkline">
                ${sparkline}
              </div>
            </div>
            <div class="stockItemRight">
              <div class="stockItemPrice">
                <div class="stockPrice">$${stock.price.toFixed(2)}</div>
                <div class="stockChange ${changeCls}">${arrow} ${sign}${stock.changePercent.toFixed(2)}%</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      // Attach click listeners
      container.querySelectorAll(".stockItem").forEach(item => {
        item.addEventListener("click", () => {
          const symbol = item.dataset.symbol;
          window.open(`https://finance.yahoo.com/quote/${symbol}`, '_blank', 'noopener,noreferrer');
        });
      });
    } catch (error) {
      console.error("Error rendering losers:", error);
      setMoverSourceTag("losersSourceTag", "unknown");
      container.innerHTML = `<div class="hint">Error loading top losers</div>`;
    }
  }

  // ===== TRENDING STOCKS =====
  function renderTrending() {
    const container = document.getElementById("trendingStocks");
    if (!container) {
      console.warn("trendingStocks container not found");
      return;
    }

    try {
      setMoverSourceTag("moversSourceTag", "unknown");
      container.innerHTML = `<div class="hint">Loading trending stocks...</div>`;
    } catch (error) {
      console.error("Error setting loading state:", error);
    }
  }

  async function loadAndRenderTrending() {
    const container = document.getElementById("trendingStocks");
    if (!container) {
      console.warn("trendingStocks container not found");
      return;
    }

    try {
      const result = await fetchStockMovers();
      const { items: movers, source } = parseMoverResult(result);
      setMoverSourceTag("moversSourceTag", source);
      
      if (!movers || movers.length === 0) {
        container.innerHTML = `<div class="hint">No trending stocks data available</div>`;
        return;
      }

      container.innerHTML = movers.map(stock => {
        const isPositive = stock.changePercent >= 0;
        const arrow = isPositive ? "▲" : "▼";
        const changeCls = isPositive ? "positive" : "negative";
        const sign = isPositive ? "+" : "";
        
        // Generate mock price data for sparkline and stats
        const priceData = generateMockPrice(stock.symbol);
        const sparkline = generateSparklineSVG(priceData.trend);
        
        return `
          <div class="stockItem" data-symbol="${escapeHtml(stock.symbol)}" data-label="${escapeHtml(stock.name)}">
            <div class="stockItemLeft">
              <div class="stockItemInfo">
                <div class="stockItemSymbol">${escapeHtml(stock.symbol)}</div>
                <div class="stockItemName">${escapeHtml(stock.name)}</div>
                <div class="stockItemStats">
                  <span class="statLabel">Change:</span>
                  <span class="statChange">${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%</span>
                </div>
              </div>
              <div class="stockSparkline">
                ${sparkline}
              </div>
            </div>
            <div class="stockItemRight">
              <div class="stockItemPrice">
                <div class="stockPrice">$${stock.price.toFixed(2)}</div>
                <div class="stockChange ${changeCls}">${arrow} ${sign}${stock.changePercent.toFixed(2)}%</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      // Attach click listeners
      container.querySelectorAll(".stockItem").forEach(item => {
        item.addEventListener("click", () => {
          const symbol = item.dataset.symbol;
          window.open(`https://finance.yahoo.com/quote/${symbol}`, '_blank', 'noopener,noreferrer');
        });
      });
    } catch (error) {
      console.error("Error rendering trending:", error);
      setMoverSourceTag("moversSourceTag", "unknown");
      container.innerHTML = `<div class="hint">Error loading trending stocks</div>`;
    }
  }

  // ===== ECONOMIC CALENDAR =====
  function renderCalendar() {
    const container = document.getElementById("economicCalendar");
    if (!container) {
      console.warn("economicCalendar container not found");
      return;
    }

    try {
      // Mock data - upcoming events
      const events = [
        { 
          time: "8:30 AM", 
          title: "Non-Farm Payrolls", 
          country: "US", 
          impact: "high",
          summary: "Monthly change in employment. Previous: 225K, Forecast: 185K. Major market mover for USD and equity markets.",
          url: "https://tradingeconomics.com/united-states/non-farm-payrolls"
        },
        { 
          time: "10:00 AM", 
          title: "Consumer Sentiment", 
          country: "US", 
          impact: "medium",
          summary: "University of Michigan index measuring consumer confidence. Previous: 79.6, Forecast: 80.2. Signals spending trends.",
          url: "https://tradingeconomics.com/united-states/consumer-confidence"
        },
        { 
          time: "2:00 PM", 
          title: "FOMC Minutes", 
          country: "US", 
          impact: "high",
          summary: "Federal Reserve meeting minutes revealing policy discussions. Key insights on interest rate outlook and economic assessment.",
          url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
        },
        { 
          time: "Tomorrow", 
          title: "Retail Sales", 
          country: "US", 
          impact: "medium",
          summary: "Monthly retail sales growth. Previous: 0.4%, Forecast: 0.3%. Measures consumer spending strength.",
          url: "https://tradingeconomics.com/united-states/retail-sales"
        },
        { 
          time: "Friday", 
          title: "GDP Growth Rate", 
          country: "US", 
          impact: "high",
          summary: "Quarterly GDP expansion. Previous: 2.6%, Forecast: 2.4%. Primary measure of economic health.",
          url: "https://tradingeconomics.com/united-states/gdp-growth"
        }
      ];

      container.innerHTML = events.map(evt => `
      <div class="calendarEvent" data-url="${escapeHtml(evt.url)}">
        <div class="eventTime">${escapeHtml(evt.time)}</div>
        <div class="eventDetails">
          <div class="eventTitle">${escapeHtml(evt.title)}</div>
          <div class="eventSummary">${escapeHtml(evt.summary)}</div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
            <div class="eventCountry">${escapeHtml(evt.country)}</div>
            <div class="eventImpact ${evt.impact}">${evt.impact} impact</div>
          </div>
        </div>
      </div>
    `).join('');
    
      // Attach click listeners
      container.querySelectorAll(".calendarEvent").forEach(item => {
        item.addEventListener("click", () => {
          const url = item.dataset.url;
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        });
      });
    } catch (error) {
      console.error("Error rendering calendar:", error);
      container.innerHTML = `<div class="hint">Error loading economic calendar</div>`;
    }
  }

  // ===== EVENT HANDLERS =====
  function attachEventListeners() {
    // Sort dropdown
    const sortSelect = document.getElementById("stocksSort");
    if (sortSelect) {
      sortSelect.value = sortMode;
      sortSelect.addEventListener("change", (e) => {
        sortMode = e.target.value;
        cfg.stockSortMode = sortMode;
        window.App.saveConfig(cfg);
        renderWatchlist(); // async, but we don't need to await
      });
    }

    // News tabs
    const newsTabs = document.getElementById("newsTabs");
    if (newsTabs) {
      newsTabs.querySelectorAll(".tabPill").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.newsMode === newsMode);
        
        btn.addEventListener("click", async () => {
          newsMode = btn.dataset.newsMode;
          cfg.stocksNewsMode = newsMode;
          localStorage.setItem(NEWS_MODE_KEY, newsMode);
          
          newsTabs.querySelectorAll(".tabPill").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          
          await renderNews();
          await updateStocksDiagnostics();
        });
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById("stocksRefreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        refresh();
      });
    }

    const retryNewsBtn = document.getElementById("stocksNewsRetryBtn");
    if (retryNewsBtn) {
      retryNewsBtn.addEventListener("click", async () => {
        retryNewsBtn.disabled = true;
        const originalLabel = retryNewsBtn.textContent;
        retryNewsBtn.textContent = "Retrying...";
        try {
          if (typeof clearRssCache === "function") clearRssCache();
          await renderNews();
          await updateStocksDiagnostics();
        } finally {
          retryNewsBtn.textContent = originalLabel || "Retry now";
          retryNewsBtn.disabled = false;
        }
      });
    }
  }

  // ===== MAIN REFRESH =====
  async function refresh() {
    console.log("Refresh called - starting render cycle");
    await renderIndices();
    console.log("Indices rendered");
    await renderWatchlist();
    console.log("Watchlist rendered");
    renderMovers();
    console.log("Movers rendered (loading async)");
    renderCalendar();
    console.log("Calendar rendered");
    await renderNews();
    await updateStocksDiagnostics();
    console.log("News rendered - refresh complete");
  }

  // ===== INIT =====
  function init() {
    console.log("Init called");
    console.log("Config stocks:", cfg.stocks);
    
    // Test: Can we find the containers?
    console.log("stocksBody exists:", !!document.getElementById("stocksBody"));
    console.log("topGainers exists:", !!document.getElementById("topGainers"));
    console.log("stocksNews exists:", !!document.getElementById("stocksNews"));
    
    attachEventListeners();
    console.log("Event listeners attached");
    refresh(); // async, but we don't need to await
    console.log("Initial refresh called");
    
    // Auto-refresh main data every 60 seconds
    setInterval(() => {
      renderIndices().catch((err) => {
        console.warn("Auto-refresh indices failed:", err);
      });
      updateLastUpdated();
    }, 60000);
    
    // Auto-refresh movers (gainers/losers/trending) every 5 minutes for live market data
    setInterval(() => {
      console.log("Auto-refreshing movers...");
      renderMovers();
    }, 5 * 60 * 1000);
    
    // Update "last updated" every 10 seconds
    setInterval(updateLastUpdated, 10000);
  }

  console.log("Document ready state:", document.readyState);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
