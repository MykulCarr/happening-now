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
    MARKET_INDEX_DEFS,
    MARKETS_SNAPSHOT_URL
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
  // Publisher-direct RSS feeds for "major" market headlines. Used to be a
  // single news.google.com/rss/search?q=... URL, but Google News rate-limits
  // Cloudflare Worker egress IPs (503s with no edge-cache populated), so
  // the major-news widget would silently render zero items. These three
  // feeds are reachable through the worker proxy and refresh hourly.
  const MAJOR_NEWS_FEED_URLS = [
    "https://feeds.content.dowjones.io/public/rss/mw_topstories",                                  // MarketWatch top stories
    "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069",         // CNBC Markets
    "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114"         // CNBC Top News
  ];
  // Built from App.RSS_PROXY_BASE rather than a literal path so it carries the
  // API_ORIGIN prefix. Hardcoding "/v1/..." made this probe 404 against a local
  // dev server and report the proxy "unreachable" while it was working fine.
  const RSS_PROXY_PROBE_URL =
    window.App.RSS_PROXY_BASE + encodeURIComponent("https://feeds.npr.org/1001/rss.xml");
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
      return watchlist.map((stock) => stocksNewsRssQueryForSymbol(stock.symbol, stock.label));
    }
    return MAJOR_NEWS_FEED_URLS.slice();
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
    ethereum: "Ethereum market news",
    // Everything else falls back to "<NAME> market news", which reads fine for
    // the likes of PLATINUM or NIFTY 50. These are the ones where the tile name
    // alone would fetch the wrong thing.
    vxn: "CBOE VXN Nasdaq volatility index news",
    sti: "Straits Times Index news",
    setindex: "Thailand SET Index news",
    ta125: "Tel Aviv 125 index news",
    gasoline: "RBOB gasoline futures news",
    oats: "oat futures market news",
    us3m: "US 3-month Treasury bill yield news",
    us5y: "US 5-year Treasury yield news",
    us30y: "US 30-year Treasury yield news",
    gbpusd: "GBP USD forex news",
    audusd: "AUD USD forex news",
    usdjpy: "USD JPY forex news",
    usdchf: "USD CHF forex news",
    usdcad: "USD CAD forex news",
    usdcny: "USD CNY forex news",
    bnb: "BNB Binance Coin news",
    tron: "TRON TRX crypto news"
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

  // Per-key entries above cover the original two dozen tiles; the rest of the
  // catalog lands here by group. Before this existed a key with no entry fell
  // through to Google News while the badge still read "Direct Source" — with a
  // hundred tiles that would have been the common case rather than the corner.
  const GROUP_DIRECT_SOURCES = {
    "us-indices": ["https://www.reuters.com/markets/us/", "Reuters"],
    "global-indices": ["https://www.reuters.com/markets/global-market-report/", "Reuters"],
    commodities: ["https://www.bloomberg.com/markets/commodities", "Bloomberg"],
    rates: ["https://www.reuters.com/markets/rates-bonds/", "Reuters"],
    crypto: ["https://www.coindesk.com/markets/", "CoinDesk"],
    currencies: ["https://www.reuters.com/markets/currencies/", "Reuters"]
  };

  const marketIndexCatalog = Array.isArray(MARKET_INDEX_DEFS) && MARKET_INDEX_DEFS.length
    ? MARKET_INDEX_DEFS
    : [
      { key: "dow", name: "DOW", value: 37892.45, change: 145.23, changePercent: 0.38 },
      { key: "sp500", name: "S&P 500", value: 4783.21, change: -12.34, changePercent: -0.26 },
      { key: "nasdaq", name: "NASDAQ", value: 14912.67, change: 67.89, changePercent: 0.46 }
    ];


  // Only where convention beats magnitude: yields are quoted to three places
  // and FX majors to four, whatever their size.
  const INDEX_VALUE_DECIMALS = {
    us3m: 3,
    us5y: 3,
    us10y: 3,
    us30y: 3,
    natgas: 3,
    eurusd: 4,
    gbpusd: 4,
    audusd: 4,
    usdchf: 4
  };
  
  let pins = loadPins();
  let sortMode = cfg.stockSortMode || "pinned";
  let newsMode = cfg.stocksNewsMode || localStorage.getItem(NEWS_MODE_KEY) || "watchlist";
  // Which market group the board is filtered to, or "all". Read from the
  // config so Settings > Stocks and the board's own tab row are one setting
  // rather than a default racing a separate per-browser key.
  let activeMarketGroup = cfg.marketGroup || "us-indices";
  let lastUpdateTime = null;
  // The board used to be a drag-scrollable ticker, which carried its own
  // pointer/RAF machinery and owned the click-to-open-news behaviour. The grid
  // needs neither, but the tiles are still links — this is that behaviour, kept.
  document.addEventListener("click", (event) => {
    const tile = event.target?.closest?.(".indexItem[data-news-url]");
    if(!tile) return;
    const url = tile.dataset.newsUrl;
    if(!url) return;
    const target = cfg.marketNewsOpenMode === "same-tab" ? "_self" : "_blank";
    window.open(url, target, target === "_blank" ? "noopener,noreferrer" : "");
  });

  document.addEventListener("keydown", (event) => {
    if(event.key !== "Enter" && event.key !== " ") return;
    const tile = event.target?.closest?.(".indexItem[data-news-url]");
    if(!tile) return;
    event.preventDefault();
    tile.click();
  });

  document.addEventListener("click", (event) => {
    const btn = event.target?.closest?.("[data-market-group]");
    if(!btn) return;
    const next = btn.dataset.marketGroup;
    // Guarded on change: clicking the already-active tab shouldn't churn the
    // config, since every save fires hn:config-saved and settings-sync writes
    // the file on it.
    if(next === activeMarketGroup) return;
    activeMarketGroup = next;
    cfg.marketGroup = activeMarketGroup;
    window.App.saveConfig(cfg);
    applyMarketGroupFilter();
  });

  // Every group is rendered up front, so switching tabs is pure DOM — no
  // refetch, and the snapshot promise stays memoised either way.
  function applyMarketGroupFilter(){
    const container = document.getElementById("marketIndices");
    if(!container) return;
    container.dataset.activeGroup = activeMarketGroup;
    container.querySelectorAll(".marketGroup").forEach((sec) => {
      sec.hidden = activeMarketGroup !== "all" && sec.dataset.group !== activeMarketGroup;
    });
    container.querySelectorAll("[data-market-group]").forEach((btn) => {
      const on = btn.dataset.marketGroup === activeMarketGroup;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    });
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

    // Catalog entries the saved selection has never heard of. If the user has
    // made any choice at all, a key they've never seen stays off — the catalog
    // grew to a hundred instruments, and defaulting the unknown ones to visible
    // would bury a six-tile board under ninety-five uninvited ones.
    const fallbackVisible = marketIndexCatalog.filter((idx) => {
      if(seenKeys.has(idx.key)) return false;
      if(isLegacySelection) return false;
      return visibleByKey.size === 0;
    });

    return [...orderedVisible, ...fallbackVisible];
  }

  // One cached bundle from the Worker rather than a quote call per tile. The
  // free provider tiers cannot survive per-visitor fan-out (TwelveData allows
  // 8 credits a minute and charges one per symbol even in a batch), so the
  // board is fetched once server-side and shared — see
  // cloudflare-sync-worker/src/markets.js.
  let marketSnapshotPromise = null;
  function fetchMarketSnapshot(){
    if(!marketSnapshotPromise){
      marketSnapshotPromise = fetch(MARKETS_SNAPSHOT_URL, { cache: "no-store" })
        .then(res => res.ok ? res.json() : null)
        .catch(() => null);
    }
    return marketSnapshotPromise;
  }

  async function hydrateIndicesWithLiveQuotes(indices){
    const snapshot = await fetchMarketSnapshot();
    const byKey = new Map((snapshot?.items || []).map(item => [item.key, item]));

    return indices.map((idx) => {
      const hit = byKey.get(idx.key);
      const price = Number(hit?.price);
      if(!Number.isFinite(price)) return idx;
      return {
        ...idx,
        value: price,
        change: Number.isFinite(Number(hit.change)) ? Number(hit.change) : 0,
        changePercent: Number.isFinite(Number(hit.changePercent)) ? Number(hit.changePercent) : 0
      };
    });
  }

  // Two decimals suits an index level or a dollar price, but it renders Shiba
  // Inu as "0.00" and the Kuwaiti dinar as "0.31". Small numbers get the extra
  // places they need to say anything at all.
  function indexDecimals(index){
    if(Number.isFinite(INDEX_VALUE_DECIMALS[index.key])) return INDEX_VALUE_DECIMALS[index.key];
    const value = Math.abs(Number(index.value));
    if(value >= 1) return 2;
    if(value >= 0.01) return 4;
    if(value >= 0.0001) return 6;
    return 8;
  }

  function formatIndexValue(index){
    const decimals = indexDecimals(index);
    return Number(index.value).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  // Board layout. Order here is the order the groups appear on the page.
  // [key, heading, tab label]. The short label keeps the tab row from
  // overflowing a phone; the heading still reads in full above the grid.
  const MARKET_GROUPS = [
    ["us-indices", "US Indices", "US"],
    ["global-indices", "Global Indices", "Global"],
    ["commodities", "Commodities", "Commodities"],
    ["rates", "Rates & FX", "Rates & FX"],
    ["crypto", "Crypto", "Crypto"],
    ["currencies", "World Currencies", "Currencies"],
  ];

  function indexTileHtml(idx, now){
    const hasData = Number.isFinite(idx.value) && idx.value > 0;
    // A move that rounds away to nothing is flat, not down. Currencies pegged
    // to the dollar drift by a fraction of a basis point, and signing that as
    // "▼ -0.00%" reads like a fall rather than a peg holding.
    const isFlat = Number.isFinite(idx.changePercent) && Math.abs(idx.changePercent) < 0.005;
    const isPositive = hasData ? idx.change >= 0 : true;
    const cls = isFlat ? "" : isPositive ? "positive" : "negative";
    const sign = isPositive ? "+" : "";
    const session = getMarketSessionStatus(idx, now);
    const newsUrl = getIndexNewsUrl(idx);

    const valueHtml = hasData ? formatIndexValue(idx) : `<span class="indexUnavailable">—</span>`;

    // The muted branch is for a quote that arrived without a previous close, so
    // there is no move to state. Showing a flat 0.00% would read as "the market
    // didn't move" rather than "this isn't measured here".
    let changeHtml;
    if(!hasData){
      changeHtml = `<span class="indexUnavailable">Unavailable</span>`;
    } else if(idx.changePercent == null || idx.change == null){
      changeHtml = `<span class="indexChangeMuted">${escapeHtml(idx.label || "no change data")}</span>`;
    } else if(isFlat){
      changeHtml = `<span class="indexChangeMuted">0.00%</span>`;
    } else {
      const arrow = isPositive ? "▲" : "▼";
      changeHtml = `${arrow} ${sign}${idx.changePercent.toFixed(2)}%`;
    }

    const changeCls = hasData && idx.changePercent != null ? cls : "";
    // The session badge became a dot to buy back a line; its text moves to
    // the label/tooltip so the state is still announced and hoverable.
    const dotHtml = session
      ? `<span class="indexDot ${session.tone}" role="img" aria-label="${escapeHtml(session.label)}" title="${escapeHtml(session.label)}"></span>`
      : "";

    // A currency tile reads "USD/SEK"; its friendly name used to sit where the
    // change figure now goes, so it moves into the title and the label a screen
    // reader announces rather than being dropped.
    const fullName = idx.label ? `${idx.name} — ${idx.label}` : idx.name;

    return `
      <div class="indexItem indexItemLink" data-news-url="${escapeHtml(newsUrl)}" title="${escapeHtml(fullName)}" tabindex="0" role="link" aria-label="Open ${escapeHtml(fullName)} news">
        <div class="indexTopRow">
          <div class="indexName">${escapeHtml(idx.name)}</div>
          ${dotHtml}
        </div>
        <div class="indexBottomRow">
          <div class="indexValue">${valueHtml}</div>
          <div class="indexChange ${changeCls}">${changeHtml}</div>
        </div>
      </div>
    `;
  }

  // World currencies ride along in the same snapshot, so showing them costs no
  // extra request. cfg.currencies picks which of the four dozen appear.
  //
  // They used to arrive from a once-a-day rate feed and were pinned to a null
  // change on purpose. They're live FX quotes now, so the real move comes
  // through like any other tile — the null coalescing below is just the guard
  // for a symbol the upstream answered without a previous close.
  function getCurrencyTiles(snapshot){
    const wanted = Array.isArray(cfg.currencies) ? cfg.currencies : [];
    if(!wanted.length) return [];
    const byKey = new Map((snapshot?.items || []).map(item => [item.key, item]));
    return wanted
      .map(code => byKey.get(`fx-${String(code).toLowerCase()}`))
      .filter(Boolean)
      .map(item => ({
        key: item.key,
        name: item.name,
        label: item.label,
        group: "currencies",
        region: "Global",
        value: Number(item.price),
        change: Number.isFinite(Number(item.change)) ? Number(item.change) : null,
        changePercent: Number.isFinite(Number(item.changePercent)) ? Number(item.changePercent) : null,
      }));
  }

  async function renderIndices() {
    const container = document.getElementById("marketIndices");
    if (!container) {
      console.warn("marketIndices container not found");
      return;
    }

    try {
      const configured = getConfiguredIndices().filter(Boolean);
      const [indices, snapshot] = await Promise.all([
        hydrateIndicesWithLiveQuotes(configured),
        fetchMarketSnapshot(),
      ]);
      const tiles = [...indices, ...getCurrencyTiles(snapshot)];

      if(tiles.length === 0){
        container.innerHTML = `<h2 class="marketIndicesLabel">Markets</h2><div class="hint">No markets selected. Enable items in <a href="settings.html">Settings</a>.</div>`;
        return;
      }

      const now = new Date();
      const present = MARKET_GROUPS
        .map(([group, label, tabLabel]) => ({
          group,
          label,
          tabLabel,
          items: tiles.filter(t => (t.group || "us-indices") === group),
        }))
        .filter(g => g.items.length);

      // A remembered group disappears if its last item is switched off in
      // Settings. Fall back to All rather than rendering an empty board.
      if(activeMarketGroup !== "all" && !present.some(g => g.group === activeMarketGroup)){
        activeMarketGroup = "all";
      }

      // One group needs no filter control.
      const tabsHtml = present.length > 1
        ? `<div class="tabsRow marketTabs">${
            [["all", "All"], ...present.map(g => [g.group, g.tabLabel])]
              .map(([key, tabLabel]) => {
                const on = key === activeMarketGroup;
                return `<button class="tabPill${on ? " active" : ""}" type="button" data-market-group="${escapeHtml(key)}" aria-pressed="${on}">${escapeHtml(tabLabel)}</button>`;
              })
              .join("")
          }</div>`
        : "";

      const sections = present.map(g => `
          <section class="marketGroup" data-group="${escapeHtml(g.group)}"${activeMarketGroup === "all" || activeMarketGroup === g.group ? "" : " hidden"}>
            <h3 class="marketGroupLabel">${escapeHtml(g.label)}</h3>
            <div class="marketGrid">${g.items.map(t => indexTileHtml(t, now)).join("")}</div>
          </section>
        `).join("");

      container.dataset.activeGroup = activeMarketGroup;
      container.innerHTML = `<h2 class="marketIndicesLabel">Markets</h2>${tabsHtml}${sections}`;
    } catch (error) {
      console.error("Error rendering indices:", error);
      container.innerHTML = `<h2 class="marketIndicesLabel">Markets</h2><div class="hint">Error loading markets</div>`;
    }
  }

  function getIndexNewsUrl(indexDef){
    const key = String(indexDef?.key || "").toLowerCase();
    const group = String(indexDef?.group || "us-indices");
    const sourceMode = cfg.marketNewsSourceMode === "direct" ? "direct" : "google";

    if(sourceMode === "direct"){
      const directUrl = INDEX_DIRECT_SOURCE_URLS[key] || GROUP_DIRECT_SOURCES[group]?.[0];
      if(directUrl) return directUrl;
    }

    const fallbackName = String(indexDef?.name || "market");
    // A currency tile is named "USD/SEK"; searching that finds a rate table,
    // not news. Its friendly label ("Swedish Krona") reads far better.
    const query = INDEX_NEWS_QUERY_OVERRIDES[key]
      || (group === "currencies" && indexDef?.label ? `${indexDef.label} exchange rate news` : null)
      || `${fallbackName} market news`;
    return `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  }

  function getIndexSourceLabel(indexDef){
    const key = String(indexDef?.key || "").toLowerCase();
    const group = String(indexDef?.group || "us-indices");
    const sourceMode = cfg.marketNewsSourceMode === "direct" ? "direct" : "google";
    if(sourceMode === "direct"){
      return INDEX_DIRECT_SOURCE_LABELS[key] || GROUP_DIRECT_SOURCES[group]?.[1] || "Direct Source";
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

  // Trading hours per catalog region, in that exchange's own local time.
  // `lunch` is the midday break some Asian exchanges take; `weekend` is only
  // set where it isn't Saturday/Sunday — Tel Aviv and Cairo trade Sunday to
  // Thursday, so assuming Sat/Sun would show them open on their day off and
  // closed on a normal trading Sunday.
  //
  // Keys are the `region` values in MARKET_INDEX_DEFS (assets/common.js). A
  // region with no row here reads CLOSED around the clock, which is the visible
  // symptom of adding an index without adding its exchange.
  const EXCHANGE_HOURS = {
    "United Kingdom": { tz: "Europe/London", open: "08:00", close: "16:30" },
    "Germany": { tz: "Europe/Berlin", open: "09:00", close: "17:30" },
    "France": { tz: "Europe/Paris", open: "09:00", close: "17:30" },
    "Spain": { tz: "Europe/Madrid", open: "09:00", close: "17:30" },
    "Italy": { tz: "Europe/Rome", open: "09:00", close: "17:30" },
    "Switzerland": { tz: "Europe/Zurich", open: "09:00", close: "17:30" },
    "Netherlands": { tz: "Europe/Amsterdam", open: "09:00", close: "17:30" },
    "Belgium": { tz: "Europe/Brussels", open: "09:00", close: "17:30" },
    "Sweden": { tz: "Europe/Stockholm", open: "09:00", close: "17:30" },
    "Euro Area": { tz: "Europe/Paris", open: "09:00", close: "17:30" },
    "Canada": { tz: "America/Toronto", open: "09:30", close: "16:00" },
    "Australia": { tz: "Australia/Sydney", open: "10:00", close: "16:00" },
    "New Zealand": { tz: "Pacific/Auckland", open: "10:00", close: "16:45" },
    "Japan": { tz: "Asia/Tokyo", open: "09:00", close: "15:30", lunch: ["11:30", "12:30"] },
    "Hong Kong": { tz: "Asia/Hong_Kong", open: "09:30", close: "16:00", lunch: ["12:00", "13:00"] },
    "South Korea": { tz: "Asia/Seoul", open: "09:00", close: "15:30" },
    "China": { tz: "Asia/Shanghai", open: "09:30", close: "15:00", lunch: ["11:30", "13:00"] },
    "Taiwan": { tz: "Asia/Taipei", open: "09:00", close: "13:30" },
    "Singapore": { tz: "Asia/Singapore", open: "09:00", close: "17:00", lunch: ["12:00", "13:00"] },
    "Indonesia": { tz: "Asia/Jakarta", open: "09:00", close: "15:50", lunch: ["11:30", "13:30"] },
    "Malaysia": { tz: "Asia/Kuala_Lumpur", open: "09:00", close: "17:00", lunch: ["12:30", "14:30"] },
    "Thailand": { tz: "Asia/Bangkok", open: "10:00", close: "16:30", lunch: ["12:30", "14:30"] },
    "India": { tz: "Asia/Kolkata", open: "09:15", close: "15:30" },
    "Brazil": { tz: "America/Sao_Paulo", open: "10:00", close: "17:55" },
    "Mexico": { tz: "America/Mexico_City", open: "08:30", close: "15:00" },
    "Argentina": { tz: "America/Argentina/Buenos_Aires", open: "11:00", close: "17:00" },
    "Israel": { tz: "Asia/Jerusalem", open: "10:00", close: "17:15", weekend: ["Fri", "Sat"] },
    "Egypt": { tz: "Africa/Cairo", open: "10:00", close: "14:30", weekend: ["Fri", "Sat"] },
    "South Africa": { tz: "Africa/Johannesburg", open: "09:00", close: "17:00" }
  };

  function hm(text){
    const [hours, minutes] = String(text).split(":");
    return Number(hours) * 60 + Number(minutes);
  }

  function getExchangeSession(region, now){
    const hours = EXCHANGE_HOURS[region];
    if(!hours) return { tone: "closed", label: "CLOSED" };

    const local = getClockParts(hours.tz, now);
    const weekend = hours.weekend || ["Sat", "Sun"];
    if(weekend.includes(local.day)) return { tone: "closed", label: "CLOSED" };
    if(local.minutes < hm(hours.open) || local.minutes >= hm(hours.close)){
      return { tone: "closed", label: "CLOSED" };
    }
    if(hours.lunch && local.minutes >= hm(hours.lunch[0]) && local.minutes < hm(hours.lunch[1])){
      return { tone: "paused", label: "LUNCH" };
    }
    return { tone: "open", label: "OPEN" };
  }

  // Group first, then region: the group says what kind of clock an instrument
  // runs on, and only listed equities need a specific exchange. That keeps the
  // US Treasury tiles on the 24/5 futures clock rather than NYSE hours, even
  // though the catalog files them under the United States.
  function getMarketSessionStatus(index, now = new Date()){
    const group = String(index?.group || "us-indices");
    if(group === "crypto") return { tone: "open", label: "24/7" };
    if(group === "us-indices") return getUsEquitySession(now);
    if(group === "global-indices") return getExchangeSession(index?.region, now);
    // Commodities, rates and FX — including the currency tiles, which trade
    // round the clock on weekdays now that they carry a live quote.
    return getTwentyFourFiveSession(now);
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
          // Mutual-fund tickers (e.g. FNIPX, VSMPX, TLYIX) rarely have meaningful
          // per-symbol news on Yahoo Finance, so skip them to keep the console
          // clean. Same heuristic as common-stocks.js's shouldSkipFinnhubSymbol:
          // ≥5 chars ending in X.
          if(isFundLikeSymbol(stock.symbol)){
            return [];
          }
          const query = stocksNewsRssQueryForSymbol(stock.symbol, stock.label);
          if(!query) return [];
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
            const query = stocksNewsRssQueryForSymbol(stock.symbol, stock.label);
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
        // Major headlines — fan out to MAJOR_NEWS_FEED_URLS and merge.
        const perFeedLimit = Math.max(6, Math.ceil(18 / MAJOR_NEWS_FEED_URLS.length));
        const settled = await Promise.allSettled(
          MAJOR_NEWS_FEED_URLS.map((feedUrl) => withTimeout(
            fetchRssItems(feedUrl, perFeedLimit, true),
            NEWS_FETCH_TIMEOUT_MS,
            `Major headlines fetch (${feedUrl})`
          ))
        );
        settled.forEach((result, idx) => {
          if(result.status !== "fulfilled" || !Array.isArray(result.value)) {
            if(result.status === "rejected"){
              console.warn(`Failed to fetch ${MAJOR_NEWS_FEED_URLS[idx]}:`, result.reason);
            }
            return;
          }
          if(!fallbackLabel){
            fallbackLabel = result.value.find((item) => item?._newsFallback && item?._newsSourceLabel)?._newsSourceLabel || fallbackLabel;
          }
          articles.push(...result.value);
        });

        if(typeof getRssCooldownStatus === "function"){
          MAJOR_NEWS_FEED_URLS.forEach((feedUrl) => {
            const status = getRssCooldownStatus(feedUrl);
            if(status?.retryInSec > cooldownRetrySec) cooldownRetrySec = status.retryInSec;
          });
        }
        if(typeof getRssLastSuccessAgeMs === "function"){
          MAJOR_NEWS_FEED_URLS.forEach((feedUrl) => {
            const ageMs = getRssLastSuccessAgeMs(feedUrl);
            if(ageMs != null && (lastSuccessAgeMs == null || ageMs < lastSuccessAgeMs)){
              lastSuccessAgeMs = ageMs;
            }
          });
        }

        // Dedupe by URL+title since CNBC top news + CNBC markets overlap.
        const seen = new Set();
        articles = articles.filter((a) => {
          const key = `${String(a?.url || "").trim()}::${String(a?.title || "").trim().toLowerCase()}`;
          if(!a?.title || !a?.url || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
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

  // Yahoo Finance per-symbol headline RSS. Strips an "EXCHANGE:" prefix
  // ("NASDAQ:CLOV" → "CLOV") since Yahoo expects a bare ticker. Returns
  // an empty string for inputs we can't sensibly query so the caller can
  // skip the fetch.
  function stocksNewsRssQueryForSymbol(symbol/*, label*/) {
    const raw = String(symbol || "").trim();
    if(!raw) return "";
    const bare = raw.includes(":") ? raw.split(":").pop() : raw;
    if(!bare) return "";
    return `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(bare)}&region=US&lang=en-US`;
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
      // Shared helper, not a hand-written URL: it routes through our own
      // /v1/favicon so Google never sees the reader (see common.js).
      const favicon = window.App.faviconUrl(article.url, 32);
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
    // Skip rendering and the API fan-out for sections the user has hidden.
    if(!window.App?.isSectionHidden?.("stocks","gainers")){
      renderGainers();
      loadAndRenderGainers();
    }
    if(!window.App?.isSectionHidden?.("stocks","losers")){
      renderLosers();
      loadAndRenderLosers();
    }
    if(!window.App?.isSectionHidden?.("stocks","trending")){
      renderTrending();
      loadAndRenderTrending();
    }
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
  // Section visibility lets the user hide cards via Settings; we also skip
  // the data fetches for hidden sections to save round-trips and CPU.
  // `indices` and `watchlist` are vital and always rendered (nothing to skip).
  async function refresh() {
    const hidden = (key) => window.App?.isSectionHidden?.("stocks", key) === true;

    // Skipping a section's render is not the same as hiding it: the markup
    // ships with placeholder text ("Loading…", "Backend: checking…") that
    // simply never gets replaced, so a skipped section sat on the page looking
    // stuck. This never showed while every stocks section defaulted visible.
    document.querySelectorAll("[data-section]").forEach((el) => {
      el.style.display = hidden(el.dataset.section) ? "none" : "";
    });

    if(!hidden("indices")){
      await renderIndices();
    }
    if(!hidden("watchlist")){
      await renderWatchlist();
    }
    renderMovers();          // already gates gainers/losers/trending internally
    if(!hidden("calendar")){
      renderCalendar();
    }
    if(!hidden("news")){
      await renderNews();
    }
    if(!hidden("diagnostic")){
      await updateStocksDiagnostics();
    }
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
