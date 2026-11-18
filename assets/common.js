(() => {
  "use strict";

  const LS_KEY = "jas_cfg_v3";
  const GEO_PREF_KEY = "jas_geo_pref_v1";

  // Empty in production so /v1 stays same-origin; absolute when the page is
  // served from a local dev server, which has no /v1 routes of its own. This is
  // what makes feed, stock and market data all come from the production Worker
  // during local development, and is why localhost is listed in the Worker's
  // ALLOWED_ORIGINS — on port 8080, the `python -m http.server 8080` in
  // CLAUDE.md. Serve on another port and the Worker will refuse the origin.
  const API_ORIGIN =
    (location.hostname === "localhost" || location.hostname === "127.0.0.1")
      ? "https://happening-now.net"
      : "";

  // First-party RSS proxy route served by cloudflare-sync-worker. Without the
  // API_ORIGIN prefix this 404s on a local dev server and every feed fails.
  const RSS_PROXY_BASE = `${API_ORIGIN}/v1/rss/raw?url=`;

  // One route, deliberately. This used to fall through to api.codetabs.com,
  // which was never a reliable safety net: it was down (522) for all of
  // 2026-09-12 while every feed that reached it paid a 9s timeout before
  // giving up, and it could not cover the outage that would matter most —
  // this Worker being unavailable — because these pages are served by Workers
  // too. It also handed a third party each reader's IP and the feeds they read.
  //
  // Resilience lives in the Worker instead: /v1/rss/raw keeps the last good
  // copy of every feed and serves that when a publisher is down or blocking
  // Cloudflare IPs. See cloudflare-sync-worker/src/rss-cache.mjs. Adding
  // another public proxy here would trade a real fallback for a slower one.

  // RSS Aggregator endpoints - RSSHub is a robust alternative for hard-to-reach feeds
  const RSS_AGGREGATORS = {
    rsshub: "https://rsshub.app",           // Primary: RSSHub (open-source, reliable)
    rsshubBackup: "https://rss.shab.fun",   // Backup RSSHub instance
    feedbin: "https://feedbin.com",         // Feedly alternative (requires account)
  };

  // First-party stock routes served by cloudflare-sync-worker. Finnhub and
  // TwelveData are reached only through these; their keys live as Worker secrets
  // (FINNHUB_KEY, TWELVEDATA_KEY) and must never be written into this file.
  // Everything here ships to the browser as readable text, so a key added below
  // is a published key — that is exactly how two live keys leaked before.
  const STOCKS_PROXY_BASE = `${API_ORIGIN}/v1/stocks`;

  // The whole index/commodity/currency board in one cached bundle. Replaces a
  // quote call per tile — see cloudflare-sync-worker/src/markets.js.
  const MARKETS_SNAPSHOT_URL = `${API_ORIGIN}/v1/markets/snapshot`;

  // Source icons, proxied so Google never sees a reader's IP — see
  // cloudflare-sync-worker/src/favicon.js. Like every first-party route this is
  // built from API_ORIGIN; a bare "/v1/favicon" works in production and 404s
  // every icon on the local dev server.
  const FAVICON_BASE = `${API_ORIGIN}/v1/favicon`;

  // US State name to abbreviation mapping
  const STATE_ABBREVIATIONS = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
    "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC"
  };

  function abbreviateState(stateName) {
    if (!stateName) return "";
    const raw = String(stateName).trim();
    // ISO 3166-2 form ("US-MI") shows up in cached overrides + some geocoder
    // responses. Strip the country prefix so downstream matchers see "MI".
    const stripped = raw.replace(/^US[-_]/i, "");
    // Check direct match first (case-insensitive)
    const abbr = STATE_ABBREVIATIONS[stripped];
    if (abbr) return abbr;
    // If it's already 2 characters, assume it's an abbreviation
    if (stripped.length === 2) return stripped.toUpperCase();
    // Return the full name if no abbreviation found
    return stripped;
  }

  // Reverse lookup: "NY" -> "New York". Falls back to the input if it's
  // already a full name or doesn't match any known abbreviation.
  function expandStateName(stateAbbrOrName) {
    if (!stateAbbrOrName) return "";
    // Through abbreviateState first, so the geocoder's "US-MI" form expands
    // too — it used to fall through and the heading read "US-MI News".
    const upper = abbreviateState(stateAbbrOrName).toUpperCase();
    if (upper.length === 2) {
      for (const [name, abbr] of Object.entries(STATE_ABBREVIATIONS)) {
        if (abbr === upper) return name;
      }
    }
    return stateAbbrOrName;
  }

  // Shared market-strip catalog used by Stocks and Settings.
  // value/change/changePercent are populated at runtime from live quotes; no defaults here
  // so that failed fetches render "—" rather than convincing-looking stale numbers.
  // Shown on a first visit. The other hundred stay one tick away in Settings —
  // this is about what a new visitor meets, not what is available. All 23 were
  // visible by default, and each tile then cost its own quote lookup: a cold
  // stocks page fired 39 of them, well past Finnhub's 60/min free tier, so the
  // page was rate-limiting itself before anyone touched it. Tiles are free now
  // (one cached snapshot covers the lot), but a readable board still isn't.
  const DEFAULT_VISIBLE_INDICES = new Set([
    "dow", "sp500", "nasdaq", "russell2000", "gold", "bitcoin",
  ]);

  // Which group the markets board opens on; "all" shows every group at once.
  // Display order and labels live in assets/stocks.js (MARKET_GROUPS) — this
  // list is only what a saved or imported config is allowed to hold.
  const MARKET_GROUP_VALUES = [
    "all", "us-indices", "global-indices", "commodities", "rates", "crypto", "currencies",
  ];

  // `group` drives how the markets board arranges its tiles, and matches the
  // group each item carries in /v1/markets/snapshot. `type` and `region` are
  // what Settings sorts the picker by, and `region` is also how stocks.js finds
  // the exchange hours behind each tile's session dot — so an entry with a new
  // region needs a matching row in EXCHANGE_HOURS there, or it reads "CLOSED".
  //
  // Keys and names must stay in step with INSTRUMENTS in the Worker's
  // markets.js; a key here with no counterpart there is a permanently empty tile.
  const MARKET_INDEX_DEFS = [
    { key: "dow", name: "DOW", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "sp500", name: "S&P 500", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "nasdaq", name: "NASDAQ", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "nasdaq100", name: "NASDAQ 100", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "sp100", name: "S&P 100", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "nyse", name: "NYSE COMPOSITE", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "wilshire5000", name: "WILSHIRE 5000", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "russell1000", name: "RUSSELL 1000", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "russell2000", name: "RUSSELL 2000", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "russell3000", name: "RUSSELL 3000", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "sp400", name: "S&P MIDCAP 400", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "sp600", name: "S&P SMALLCAP 600", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "microcap", name: "MICROCAP", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "djtransport", name: "DOW TRANSPORTS", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "djutility", name: "DOW UTILITIES", group: "us-indices", type: "US Equity", region: "United States" },
    { key: "vix", name: "VIX", group: "us-indices", type: "Volatility", region: "United States" },
    { key: "vxn", name: "VXN", group: "us-indices", type: "Volatility", region: "United States" },

    { key: "ftse100", name: "FTSE 100", group: "global-indices", type: "Global Equity", region: "United Kingdom" },
    { key: "dax", name: "DAX", group: "global-indices", type: "Global Equity", region: "Germany" },
    { key: "cac40", name: "CAC 40", group: "global-indices", type: "Global Equity", region: "France" },
    { key: "ibex35", name: "IBEX 35", group: "global-indices", type: "Global Equity", region: "Spain" },
    { key: "ftsemib", name: "FTSE MIB", group: "global-indices", type: "Global Equity", region: "Italy" },
    { key: "smi", name: "SWISS SMI", group: "global-indices", type: "Global Equity", region: "Switzerland" },
    { key: "aex", name: "AEX", group: "global-indices", type: "Global Equity", region: "Netherlands" },
    { key: "bel20", name: "BEL 20", group: "global-indices", type: "Global Equity", region: "Belgium" },
    { key: "omx30", name: "OMX STOCKHOLM 30", group: "global-indices", type: "Global Equity", region: "Sweden" },
    { key: "estoxx50", name: "EURO STOXX 50", group: "global-indices", type: "Global Equity", region: "Euro Area" },
    { key: "stoxx600", name: "STOXX EUROPE 600", group: "global-indices", type: "Global Equity", region: "Euro Area" },
    { key: "euronext100", name: "EURONEXT 100", group: "global-indices", type: "Global Equity", region: "Euro Area" },
    { key: "tsx", name: "S&P/TSX", group: "global-indices", type: "Global Equity", region: "Canada" },
    { key: "asx200", name: "ASX 200", group: "global-indices", type: "Global Equity", region: "Australia" },
    { key: "nzx50", name: "NZX 50", group: "global-indices", type: "Global Equity", region: "New Zealand" },
    { key: "nikkei225", name: "NIKKEI 225", group: "global-indices", type: "Global Equity", region: "Japan" },
    { key: "hangseng", name: "HANG SENG", group: "global-indices", type: "Global Equity", region: "Hong Kong" },
    { key: "kospi", name: "KOSPI", group: "global-indices", type: "Global Equity", region: "South Korea" },
    { key: "shanghai", name: "SHANGHAI COMP", group: "global-indices", type: "Global Equity", region: "China" },
    { key: "shenzhen", name: "SHENZHEN COMP", group: "global-indices", type: "Global Equity", region: "China" },
    { key: "taiex", name: "TAIEX", group: "global-indices", type: "Global Equity", region: "Taiwan" },
    { key: "sti", name: "STRAITS TIMES", group: "global-indices", type: "Global Equity", region: "Singapore" },
    { key: "jakarta", name: "JAKARTA COMP", group: "global-indices", type: "Global Equity", region: "Indonesia" },
    { key: "klci", name: "MALAYSIA KLCI", group: "global-indices", type: "Global Equity", region: "Malaysia" },
    { key: "setindex", name: "SET THAILAND", group: "global-indices", type: "Global Equity", region: "Thailand" },
    { key: "sensex", name: "BSE SENSEX", group: "global-indices", type: "Global Equity", region: "India" },
    { key: "nifty50", name: "NIFTY 50", group: "global-indices", type: "Global Equity", region: "India" },
    { key: "bovespa", name: "BOVESPA", group: "global-indices", type: "Global Equity", region: "Brazil" },
    { key: "ipcmexico", name: "IPC MEXICO", group: "global-indices", type: "Global Equity", region: "Mexico" },
    { key: "merval", name: "MERVAL", group: "global-indices", type: "Global Equity", region: "Argentina" },
    { key: "ta125", name: "TA-125", group: "global-indices", type: "Global Equity", region: "Israel" },
    { key: "egx30", name: "EGX 30", group: "global-indices", type: "Global Equity", region: "Egypt" },
    { key: "jsetop40", name: "JSE TOP 40", group: "global-indices", type: "Global Equity", region: "South Africa" },

    { key: "gold", name: "GOLD", group: "commodities", type: "Metals", region: "Global" },
    { key: "silver", name: "SILVER", group: "commodities", type: "Metals", region: "Global" },
    { key: "platinum", name: "PLATINUM", group: "commodities", type: "Metals", region: "Global" },
    { key: "palladium", name: "PALLADIUM", group: "commodities", type: "Metals", region: "Global" },
    { key: "copper", name: "COPPER", group: "commodities", type: "Metals", region: "Global" },
    { key: "aluminium", name: "ALUMINIUM", group: "commodities", type: "Metals", region: "Global" },
    { key: "crudeoil", name: "CRUDE OIL", group: "commodities", type: "Energy", region: "Global" },
    { key: "brent", name: "BRENT", group: "commodities", type: "Energy", region: "Global" },
    { key: "natgas", name: "NAT GAS", group: "commodities", type: "Energy", region: "Global" },
    { key: "heatingoil", name: "HEATING OIL", group: "commodities", type: "Energy", region: "Global" },
    { key: "gasoline", name: "GASOLINE", group: "commodities", type: "Energy", region: "Global" },
    { key: "corn", name: "CORN", group: "commodities", type: "Agriculture", region: "Global" },
    { key: "wheat", name: "WHEAT", group: "commodities", type: "Agriculture", region: "Global" },
    { key: "soybeans", name: "SOYBEANS", group: "commodities", type: "Agriculture", region: "Global" },
    { key: "oats", name: "OATS", group: "commodities", type: "Agriculture", region: "Global" },
    { key: "coffee", name: "COFFEE", group: "commodities", type: "Agriculture", region: "Global" },
    { key: "sugar", name: "SUGAR", group: "commodities", type: "Agriculture", region: "Global" },
    { key: "cocoa", name: "COCOA", group: "commodities", type: "Agriculture", region: "Global" },
    { key: "cotton", name: "COTTON", group: "commodities", type: "Agriculture", region: "Global" },
    { key: "orangejuice", name: "ORANGE JUICE", group: "commodities", type: "Agriculture", region: "Global" },
    { key: "lumber", name: "LUMBER", group: "commodities", type: "Agriculture", region: "Global" },
    { key: "livecattle", name: "LIVE CATTLE", group: "commodities", type: "Livestock", region: "Global" },
    { key: "leanhogs", name: "LEAN HOGS", group: "commodities", type: "Livestock", region: "Global" },
    { key: "gsci", name: "S&P GSCI", group: "commodities", type: "Commodities", region: "Global" },

    { key: "us3m", name: "US 3M", group: "rates", type: "Rates", region: "United States" },
    { key: "us5y", name: "US 5Y", group: "rates", type: "Rates", region: "United States" },
    { key: "us10y", name: "US 10Y", group: "rates", type: "Rates", region: "United States" },
    { key: "us30y", name: "US 30Y", group: "rates", type: "Rates", region: "United States" },
    { key: "dxy", name: "DXY", group: "rates", type: "FX", region: "United States" },
    { key: "eurusd", name: "EUR/USD", group: "rates", type: "FX", region: "Global" },
    { key: "gbpusd", name: "GBP/USD", group: "rates", type: "FX", region: "Global" },
    { key: "audusd", name: "AUD/USD", group: "rates", type: "FX", region: "Global" },
    { key: "usdjpy", name: "USD/JPY", group: "rates", type: "FX", region: "Global" },
    { key: "usdchf", name: "USD/CHF", group: "rates", type: "FX", region: "Global" },
    { key: "usdcad", name: "USD/CAD", group: "rates", type: "FX", region: "Global" },
    { key: "usdcny", name: "USD/CNY", group: "rates", type: "FX", region: "Global" },

    { key: "bitcoin", name: "BITCOIN", group: "crypto", type: "Crypto", region: "Global" },
    { key: "ethereum", name: "ETHEREUM", group: "crypto", type: "Crypto", region: "Global" },
    { key: "bnb", name: "BNB", group: "crypto", type: "Crypto", region: "Global" },
    { key: "solana", name: "SOLANA", group: "crypto", type: "Crypto", region: "Global" },
    { key: "xrp", name: "XRP", group: "crypto", type: "Crypto", region: "Global" },
    { key: "cardano", name: "CARDANO", group: "crypto", type: "Crypto", region: "Global" },
    { key: "dogecoin", name: "DOGECOIN", group: "crypto", type: "Crypto", region: "Global" },
    { key: "tron", name: "TRON", group: "crypto", type: "Crypto", region: "Global" },
    { key: "chainlink", name: "CHAINLINK", group: "crypto", type: "Crypto", region: "Global" },
    { key: "avalanche", name: "AVALANCHE", group: "crypto", type: "Crypto", region: "Global" },
    { key: "litecoin", name: "LITECOIN", group: "crypto", type: "Crypto", region: "Global" },
    { key: "bitcoincash", name: "BITCOIN CASH", group: "crypto", type: "Crypto", region: "Global" },
    { key: "stellar", name: "STELLAR", group: "crypto", type: "Crypto", region: "Global" },
    { key: "polkadot", name: "POLKADOT", group: "crypto", type: "Crypto", region: "Global" },
    { key: "shiba", name: "SHIBA INU", group: "crypto", type: "Crypto", region: "Global" }
  ];

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

  const DEFAULTS = {
    theme: "dark",
    density: "compact",
    renderMode: "smooth",
    startupPage: "news",
    zipCode: "",
    weatherRefreshMinutes: 10,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",

    // Page visibility
    pageVisibility: { news: true, weather: true, stocks: true },

    // Weather preferences
    weatherAlertScope: "local",
    forecastLength: 7,
    weatherDefaultMapLayer: "radar",
    weatherTempUnit: "fahrenheit",
    weatherWindUnit: "mph",
    weatherPrecipUnit: "inch",
    weatherShowMap: true,
    weatherMapRings: true,   // distance rings over the radar map
    weatherStaleWarnMinutes: 30,

    // Stock preferences
    stockSortMode: "pinned",
    stocksNewsMode: "watchlist",
    marketNewsSourceMode: "google",
    marketNewsOpenMode: "new-tab",
    // First visit opens on US Indices; "all" and the other groups are a tap
    // away on the board's tab row, and this is settable in Settings > Stocks.
    marketGroup: "us-indices",
    marketIndices: MARKET_INDEX_DEFS.map((item) => ({
      key: item.key,
      visible: DEFAULT_VISIBLE_INDICES.has(item.key),
    })),

    // World currencies shown on the markets board, by ISO code. The snapshot
    // carries four dozen; this is the starting set so the board stays scannable.
    currencies: ["EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "MXN"],

    // News preferences
    newsLayout: "text-only",
    newsTickerScope: "national",

    // User-curated local/regional news sources. Populated by the picker
    // modal (news.js) on first scope click; empty arrays mean "user hasn't
    // chosen yet" and the picker will open. localSourcesSkipped/regionalSourcesSkipped
    // remember a user's choice to fall back to auto-search instead.
    localSources: [],
    regionalSources: [],
    // Topic tabs the user has turned on (ids from data/topic-sources.json).
    // These render as buttons in the scope bar and only fetch when one is
    // clicked, so the list costs nothing on first paint — it is chosen for a
    // useful spread, not to keep the page light. Tab order comes from
    // topic-sources.json, not from this array, so keep it grouped for reading.
    // Deliberately excludes "conspiracies" — opt-in only, never shown unasked.
    topics: [
      // everyday
      "health", "tech", "business", "entertainment", "science",
      // lighter reading
      "humaninterest", "music", "sports", "food", "oddnews"
    ],
    localSourcesSkipped: false,
    regionalSourcesSkipped: false,

    // Per-page section visibility. Each key maps a section to true/false.
    // Missing keys are treated as `true` (visible) by readers, so adding a
    // new section in the future doesn't surprise existing users.
    sectionVisibility: {
      weather: {
        topAlertsTicker: true,
        current: true,   // recommended
        hourly: true,
        forecast: true,   // recommended
        radar: true,
        alerts: true,
        news: true
      },
      stocks: {
        indices: true,  // recommended
        watchlist: true,  // recommended
        news: true,
        gainers: true,
        losers: true,
        trending: true,
        // A new key, not the old "calendar": that one was saved as false in
        // most configs, and the made-up card it hid is gone.
        econCalendar: true,
        // Off for a new visitor: the diagnostic dock is a debugging aid.
        // It switches on in Settings.
        diagnostic: false
      }
    },

    // Content arrays
    widgets: [
      // All working RSS feeds - verified and tested.
      // `scopes` controls which scope tab(s) on the news page show this widget.
      // Widgets without a `scopes` field are treated as ["national","international"]
      // by getWidgetsForScope so older saved configs still render.
      // The six-per-scope starter set. Every entry must also be marked
      // `default: true` in data/news-sources.json (the picker's catalog) —
      // this copy exists because a first visit can't wait on that fetch.
      // Chosen for: free to read, posts many times a day, and broad — between
      // them politics, breaking news, business, science and people stories.
      { name: "NPR", rss: "https://feeds.npr.org/1001/rss.xml", site: "https://www.npr.org", headlinesCount: 5, scopes: ["national"] },
      { name: "CBS News", rss: "https://www.cbsnews.com/latest/rss/main", site: "https://www.cbsnews.com", headlinesCount: 5, scopes: ["national"] },
      { name: "Axios", rss: "https://api.axios.com/feed/", site: "https://www.axios.com", headlinesCount: 5, scopes: ["national"] },
      { name: "The Hill", rss: "https://thehill.com/feed/", site: "https://thehill.com", headlinesCount: 5, scopes: ["national"] },
      { name: "Fox News", rss: "https://moxie.foxnews.com/google-publisher/latest.xml", site: "https://www.foxnews.com", headlinesCount: 5, scopes: ["national"] },
      { name: "NBC News", rss: "https://feeds.nbcnews.com/nbcnews/public/news", site: "https://www.nbcnews.com", headlinesCount: 5, scopes: ["national"] },
      { name: "Al Jazeera", rss: "https://www.aljazeera.com/xml/rss/all.xml", site: "https://www.aljazeera.com", headlinesCount: 5, scopes: ["international"] },
      { name: "The Guardian (World)", rss: "https://www.theguardian.com/world/rss", site: "https://www.theguardian.com/world", headlinesCount: 5, scopes: ["international"] },
      { name: "DW", rss: "https://rss.dw.com/rdf/rss-en-all", site: "https://www.dw.com", headlinesCount: 5, scopes: ["international"] },
      { name: "France 24", rss: "https://www.france24.com/en/rss", site: "https://www.france24.com/en", headlinesCount: 5, scopes: ["international"] },
      { name: "CNA", rss: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml", site: "https://www.channelnewsasia.com", headlinesCount: 5, scopes: ["international"] },
      { name: "Africanews", rss: "https://www.africanews.com/feed/rss", site: "https://www.africanews.com", headlinesCount: 5, scopes: ["international"] }
    ],

    // Four household names a first-time visitor will recognise. The previous
    // default was a personal portfolio — a small-cap plus four retirement
    // funds — which read as someone else's account rather than a starting
    // point. It also fetched badly: symbols ending in X are mutual funds,
    // which shouldSkipFinnhubSymbol skips, so four of the five could never
    // use the primary quote provider at all.
    stocks: [
      { symbol: "NASDAQ:NVDA", label: "NVIDIA" },
      { symbol: "NASDAQ:AAPL", label: "Apple" },
      { symbol: "NASDAQ:MSFT", label: "Microsoft" },
      { symbol: "NASDAQ:TSLA", label: "Tesla" }
    ]
  };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // Migrate old RSS feeds to working alternatives
  function migrateWidgets(widgets) {
    if (!Array.isArray(widgets)) return clone(DEFAULTS.widgets);
    // The Atlantic went behind a paywall; drop it from configs saved before the swap.
    return widgets.filter(w => !/theatlantic\.com/.test(w && w.rss || ""));
  }

  function normalizeConfig(cfg) {
    const out = { ...clone(DEFAULTS), ...(cfg || {}) };

    out.theme = ["light", "middle"].includes(out.theme) ? out.theme : "dark";
    out.density = ["compact", "cozy", "comfortable"].includes(out.density) ? out.density : "comfortable";
    out.renderMode = ["smooth", "stable"].includes(String(out.renderMode || "").toLowerCase())
      ? String(out.renderMode).toLowerCase()
      : DEFAULTS.renderMode;
    out.startupPage = ["news", "weather", "stocks"].includes(out.startupPage) ? out.startupPage : DEFAULTS.startupPage;
    out.stocksNewsMode = ["watchlist", "major"].includes(out.stocksNewsMode) ? out.stocksNewsMode : DEFAULTS.stocksNewsMode;
    out.marketGroup = MARKET_GROUP_VALUES.includes(out.marketGroup) ? out.marketGroup : DEFAULTS.marketGroup;

    out.zipCode = String(out.zipCode || "").trim();
    if (!/^\d{5}$/.test(out.zipCode)) out.zipCode = DEFAULTS.zipCode;

    out.useDeviceLocation = out.useDeviceLocation === true;
    out.deviceLat = Number(out.deviceLat);
    out.deviceLon = Number(out.deviceLon);
    if (!Number.isFinite(out.deviceLat) || !Number.isFinite(out.deviceLon)) {
      out.useDeviceLocation = false;
      out.deviceLat = null;
      out.deviceLon = null;
    }
    out.deviceLocationLabel = String(out.deviceLocationLabel || "").trim().slice(0, 120);

    out.weatherRefreshMinutes = Number(out.weatherRefreshMinutes || DEFAULTS.weatherRefreshMinutes);
    if (!Number.isFinite(out.weatherRefreshMinutes) || out.weatherRefreshMinutes < 2) out.weatherRefreshMinutes = 10;

    out.timezone = String(out.timezone || DEFAULTS.timezone).trim();
    // Validate timezone exists in our list or is a valid IANA timezone
    if (!TIMEZONES.find(t => t.value === out.timezone)) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: out.timezone });
      } catch {
        out.timezone = DEFAULTS.timezone;
      }
    }

    if (!Array.isArray(out.widgets)) out.widgets = clone(DEFAULTS.widgets);
    // Migrate old feeds to NewsAPI
    out.widgets = migrateWidgets(out.widgets);
    // Lookup table for restoring `scopes` on legacy saved configs whose
    // widgets predate the field. Built from DEFAULTS.widgets so the 9
    // canonical sources keep their intended scope after a config reload.
    // Old default feeds that were international, so a saved config from
    // before 2026-10-18 that lacks `scopes` still files them correctly.
    const defaultScopesByRss = {
      "https://feeds.bbci.co.uk/news/rss.xml": ["international"],
      "https://www.nature.com/nature.rss": ["international"],
      "https://theconversation.com/global/articles.atom": ["international"]
    };
    for (const dw of DEFAULTS.widgets || []) {
      if (dw?.rss && Array.isArray(dw?.scopes) && dw.scopes.length) {
        defaultScopesByRss[dw.rss] = clone(dw.scopes);
      }
    }
    // Heal saved configs whose RSS URLs have gone stale. Two flavors:
    //
    // RSS_URL_FIXUPS — pure URL swap (publisher and editorial intent
    //   unchanged, just the canonical URL moved). e.g. Bridge Michigan.
    //
    // WIDGET_ENTRY_MIGRATIONS — full publisher swap (URL points at a
    //   different outlet, so the displayed name + site link also have to
    //   change or the widget header lies about its content). e.g. PBS
    //   NewsHour replaced with ProPublica after PBS started returning
    //   202 + empty body to every Cloudflare Worker IP. Name/site only
    //   overwrite if the user's saved values still match the prior
    //   defaults (preserves any custom rename).
    const RSS_URL_FIXUPS = {
      "https://www.bridgemi.com/rss.xml": "https://bridgemi.com/feed/?partner-feed=latest-articles",
      "https://bridgemi.com/rss.xml": "https://bridgemi.com/feed/?partner-feed=latest-articles",
      "https://www.pbs.org/newshour/feeds/rss/headlines": "https://www.propublica.org/feeds/propublica/main"
    };
    const WIDGET_ENTRY_MIGRATIONS = {
      "https://www.pbs.org/newshour/feeds/rss/headlines": {
        name: "ProPublica",
        site: "https://www.propublica.org",
        oldName: "PBS NewsHour",
        oldSite: "https://www.pbs.org/newshour"
      }
    };

    out.widgets = out.widgets.map(w => {
      const rawRss = String(w?.rss || "").trim();
      const rawName = String(w?.name || "").trim();
      const rawSite = String(w?.site || "").trim();

      const rss = RSS_URL_FIXUPS[rawRss] || rawRss;
      const entryMig = WIDGET_ENTRY_MIGRATIONS[rawRss];
      const name = (entryMig && rawName === entryMig.oldName) ? entryMig.name : (rawName || "Source");
      const site = (entryMig && rawSite === entryMig.oldSite) ? entryMig.site : rawSite;

      // Preserve incoming scopes; otherwise fall back to the canonical
      // tag for known default RSS URLs; otherwise default to ["national"]
      // (single scope) so an unrecognized custom widget doesn't pollute
      // every scope tab the way ["national","international"] would.
      let scopes;
      if (Array.isArray(w?.scopes) && w.scopes.length) {
        scopes = w.scopes.filter(s => typeof s === "string");
      } else if (defaultScopesByRss[rss]) {
        scopes = clone(defaultScopesByRss[rss]);
      } else {
        scopes = ["national"];
      }
      return {
        name,
        rss,
        site,
        headlinesCount: Math.max(1, Math.min(20, Number(w?.headlinesCount || 6))),
        scopes
      };
    }).filter(w => w.rss);
    // Dedupe by rss URL — keep first occurrence. Heals saved configs that
    // accumulated duplicate entries (e.g. an Atlantic widget seeded twice).
    {
      const seenRss = new Set();
      out.widgets = out.widgets.filter(w => {
        if (seenRss.has(w.rss)) return false;
        seenRss.add(w.rss);
        return true;
      });
    }
    out.widgets = out.widgets.slice(0, 15); // Max 15 sources

    // Normalize user-curated local/regional source lists. Each entry mirrors
    // a widget shape so the news.js render path can use them directly.
    // RSS_URL_FIXUPS is the hoisted map declared above for widgets; both
    // call sites share it so a stale URL only needs to be listed once.
    function normalizeSourceList(list) {
      if (!Array.isArray(list)) return [];
      return list.map(s => {
        const rawRss = String(s?.rss || "").trim();
        const rss = RSS_URL_FIXUPS[rawRss] || rawRss;
        return {
          name: String(s?.name || "").trim() || "Source",
          rss,
          site: String(s?.site || "").trim(),
          headlinesCount: Math.max(1, Math.min(20, Number(s?.headlinesCount || 8)))
        };
      // Reddit ended its RSS feeds on 2026-11-13, so a saved r/ feed is a
      // permanently empty slot; drop it rather than keep showing nothing.
      }).filter(s => s.rss && !/^https?:\/\/(www\.|old\.)?reddit\.com\//i.test(s.rss)).slice(0, 8);
    }
    out.localSources = normalizeSourceList(out.localSources);
    out.regionalSources = normalizeSourceList(out.regionalSources);
    // Ids only — anything else in saved config is discarded rather than
    // trusted, since these become tab names and scope keys.
    // ISO 4217 codes only; a malformed saved value falls back to the default
    // set rather than reaching the board or the Settings picker.
    out.currencies = Array.isArray(out.currencies)
      ? out.currencies.filter(code => typeof code === "string" && /^[A-Z]{3}$/.test(code))
      : clone(DEFAULTS.currencies);

    out.topics = Array.isArray(out.topics)
      ? out.topics.filter(id => typeof id === "string" && /^[a-z0-9-]+$/.test(id))
      : [];
    out.localSourcesSkipped = out.localSourcesSkipped === true;
    out.regionalSourcesSkipped = out.regionalSourcesSkipped === true;

    if (!Array.isArray(out.stocks)) out.stocks = clone(DEFAULTS.stocks);
    out.stocks = out.stocks.map(s => ({
      symbol: String(s?.symbol || "").trim(),
      label: String(s?.label || "").trim() || String(s?.symbol || "").trim(),
      market: String(s?.market || "").trim()
    })).filter(s => s.symbol);

    // Normalize new preference fields
    if (typeof out.pageVisibility !== "object" || !out.pageVisibility) {
      out.pageVisibility = clone(DEFAULTS.pageVisibility);
    } else {
      out.pageVisibility = {
        news: out.pageVisibility.news !== false,
        weather: out.pageVisibility.weather !== false,
        stocks: out.pageVisibility.stocks !== false
      };
    }

    out.weatherAlertScope = ["local", "national", "both"].includes(out.weatherAlertScope) ? out.weatherAlertScope : "local";
    out.forecastLength = [3, 7, 14].includes(out.forecastLength) ? out.forecastLength : 7;
    out.weatherDefaultMapLayer = ["radar", "wind", "temp", "clouds", "air"].includes(out.weatherDefaultMapLayer) ? out.weatherDefaultMapLayer : "radar";
    out.weatherTempUnit = ["fahrenheit", "celsius"].includes(out.weatherTempUnit) ? out.weatherTempUnit : "fahrenheit";
    out.weatherWindUnit = ["mph", "kmh", "ms"].includes(out.weatherWindUnit) ? out.weatherWindUnit : "mph";
    out.weatherPrecipUnit = ["inch", "mm"].includes(out.weatherPrecipUnit) ? out.weatherPrecipUnit : "inch";
    out.weatherShowMap = out.weatherShowMap !== false;
    out.weatherMapRings = out.weatherMapRings !== false;
    out.weatherStaleWarnMinutes = Number(out.weatherStaleWarnMinutes ?? DEFAULTS.weatherStaleWarnMinutes);
    if (!Number.isFinite(out.weatherStaleWarnMinutes)) out.weatherStaleWarnMinutes = DEFAULTS.weatherStaleWarnMinutes;
    out.weatherStaleWarnMinutes = Math.max(5, Math.min(180, Math.round(out.weatherStaleWarnMinutes)));
    out.stockSortMode = ["pinned", "az", "symbol"].includes(out.stockSortMode) ? out.stockSortMode : "pinned";
    out.marketNewsSourceMode = ["google", "direct"].includes(out.marketNewsSourceMode) ? out.marketNewsSourceMode : "google";
    out.marketNewsOpenMode = ["new-tab", "same-tab"].includes(out.marketNewsOpenMode) ? out.marketNewsOpenMode : "new-tab";
    out.newsTickerScope = ["local", "regional", "national", "international"].includes(out.newsTickerScope) ? out.newsTickerScope : "national";

    if (!Array.isArray(out.marketIndices)) out.marketIndices = clone(DEFAULTS.marketIndices);
    const validKeys = new Set(MARKET_INDEX_DEFS.map(item => item.key));

    // Migrate older string-based arrays (stored as market names) to key+visible objects.
    const isLegacyMarketArray = out.marketIndices.every(item => typeof item === "string");
    if (isLegacyMarketArray) {
      const selectedOrdered = [];
      const selectedSeen = new Set();

      out.marketIndices.forEach((name) => {
        const key = LEGACY_MARKET_INDEX_NAME_TO_KEY[name] || String(name || "").trim().toLowerCase();
        if (!validKeys.has(key) || selectedSeen.has(key)) return;
        selectedSeen.add(key);
        selectedOrdered.push(key);
      });

      out.marketIndices = selectedOrdered.length > 0
        ? [
          ...selectedOrdered.map((key) => ({ key, visible: true })),
          ...MARKET_INDEX_DEFS
            .filter((item) => !selectedSeen.has(item.key))
            .map((item) => ({ key: item.key, visible: false }))
        ]
        : clone(DEFAULTS.marketIndices);
    } else {
      const explicitVisibility = new Map();
      const explicitOrder = [];
      const seenKeys = new Set();

      out.marketIndices.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const key = String(entry.key || "").trim().toLowerCase();
        if (!validKeys.has(key) || seenKeys.has(key)) return;
        seenKeys.add(key);
        explicitOrder.push(key);
        explicitVisibility.set(key, entry.visible !== false);
      });

      out.marketIndices = [
        ...explicitOrder.map((key) => ({
          key,
          visible: explicitVisibility.has(key) ? explicitVisibility.get(key) : true
        })),
        // Keys the catalog has gained since this config was saved. They default
        // to hidden, not visible: the catalog grew from 23 instruments to 101,
        // and inheriting `true` here would have turned every existing board
        // into a wall of ninety-odd tiles without anyone asking for them.
        ...MARKET_INDEX_DEFS
          .filter((item) => !seenKeys.has(item.key))
          .map((item) => ({ key: item.key, visible: DEFAULT_VISIBLE_INDICES.has(item.key) }))
      ];
    }
    return out;
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return normalizeConfig(clone(DEFAULTS));

      const stored = JSON.parse(raw);
      const normalized = normalizeConfig(stored);

      // Check if migration occurred by comparing widgets
      const needsSave = JSON.stringify(stored.widgets) !== JSON.stringify(normalized.widgets);

      if (needsSave) {
        console.log("Config migrated to reliable RSS feeds, clearing cache and saving...");
        localStorage.setItem(LS_KEY, JSON.stringify(normalized));
        // Clear localStorage news cache
        try { localStorage.removeItem("jas_cache_news_v1"); } catch { }
      }

      return normalized;
    } catch {
      return normalizeConfig(clone(DEFAULTS));
    }
  }

  function saveConfig(cfg) {
    const clean = normalizeConfig(cfg);
    localStorage.setItem(LS_KEY, JSON.stringify(clean));
    if (window.App) window.App.cfg = clean;  // keep global in sync
    // Announce every write, including the ones made from inside this file, so
    // optional extras (settings-sync.js) can react without each save site
    // having to know about them.
    try { window.dispatchEvent(new CustomEvent("hn:config-saved", { detail: clean })); } catch { }
    return clean;
  }

  function hasValidDeviceCoords(config) {
    return Number.isFinite(Number(config?.deviceLat)) && Number.isFinite(Number(config?.deviceLon));
  }

  function loadGeoPref() {
    try {
      const raw = localStorage.getItem(GEO_PREF_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveGeoPref(pref) {
    try {
      localStorage.setItem(GEO_PREF_KEY, JSON.stringify(pref || {}));
    } catch { }
  }

  function shouldAutoDetectLocation(config) {
    if (typeof navigator === "undefined" || !navigator.geolocation) return false;
    if (typeof window !== "undefined" && window.isSecureContext === false) return false;
    if (hasValidDeviceCoords(config) && config?.useDeviceLocation) return false;

    // Only silently re-use geolocation if the user has previously explicitly granted it.
    // Never trigger the browser permission prompt without a direct user gesture.
    const pref = loadGeoPref();
    return pref?.granted === true;
  }

  function getCurrentPositionAsync(options = {}) {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("Geolocation unavailable"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: Number(options.timeoutMs) || 10000,
        maximumAge: Number(options.maximumAgeMs) || (5 * 60 * 1000)
      });
    });
  }

  async function reverseGeocodeCoords(lat, lon) {
    try {
      // Try Nominatim first (more reliable for city names)
      try {
        const nominatimUrl =
          `https://nominatim.openstreetmap.org/reverse` +
          `?lat=${encodeURIComponent(lat)}` +
          `&lon=${encodeURIComponent(lon)}` +
          `&format=json&language=en&zoom=10&addressdetails=1`;

        const res = await fetch(nominatimUrl, {
          cache: "no-store",
          headers: { "User-Agent": "HAPPENING-NOW/1.0" }
        });

        if (res.ok) {
          const j = await res.json();
          const address = j?.address || {};

          // Try to extract city/town from Nominatim response (in priority order)
          const city = String(
            address.city ||
            address.town ||
            address.village ||
            address.hamlet ||
            address.county ||
            address.municipality ||
            address.district ||
            ""
          ).trim();

          const state = String(address.state || address.province || "").trim();
          const abbrevState = abbreviateState(state);
          const zip = String(address.postcode || "").trim();
          const label = [city, abbrevState].filter(Boolean).join(", ");

          if (city) {
            console.log("[geocode] Nominatim found:", { city, state });
            return {
              city,
              state,
              zipCode: /^\d{5}$/.test(zip) ? zip : "",
              label: label || city
            };
          }
        }
      } catch (nomErr) {
        console.log("[geocode] Nominatim error:", nomErr.message);
      }

      // Fallback: try open-meteo reverse geocoding
      try {
        const openMeteoUrl =
          `https://geocoding-api.open-meteo.com/v1/reverse` +
          `?latitude=${encodeURIComponent(lat)}` +
          `&longitude=${encodeURIComponent(lon)}` +
          `&language=en&format=json`;

        const res = await fetch(openMeteoUrl, { cache: "no-store" });
        if (res.ok) {
          const j = await res.json();
          const row = Array.isArray(j?.results) ? j.results[0] : null;

          if (row && String(row.name || "").trim()) {
            const city = String(row.name || "").trim();
            const state = String(row.admin1 || "").trim();
            const abbrevState = abbreviateState(state);
            const zip = String(row.postcode || "").trim();
            const label = [city, abbrevState].filter(Boolean).join(", ");

            console.log("[geocode] OpenMeteo found:", { city, state });
            return {
              city,
              state,
              zipCode: /^\d{5}$/.test(zip) ? zip : "",
              label: label || city
            };
          }
        }
      } catch (omErr) {
        console.log("[geocode] OpenMeteo error:", omErr.message);
      }

      // Return null if both services failed
      console.log("[geocode] No city found for", { lat, lon });
      return null;
    } catch (e) {
      console.error("[geocode] reverseGeocodeCoords error:", e);
      return null;
    }
  }

  function startTopClock(getCfg) {
    const timeEl = document.getElementById("topClockTime");
    const dateEl = document.getElementById("topClockDate");
    const tzEl = document.getElementById("topClockTz");
    if (!timeEl || !dateEl || !tzEl) return;

    if (window.__jasTopClockTimer) clearInterval(window.__jasTopClockTimer);

    const tick = () => {
      const cfgNow = (typeof getCfg === "function" ? getCfg() : null) || loadConfig();
      const tz = cfgNow.timezone || DEFAULTS.timezone;
      const now = new Date();
      timeEl.textContent = formatTime(now, tz);
      dateEl.textContent = formatDate(now, tz);
      tzEl.textContent = getTimezoneAbbrev(tz);
      tzEl.title = getTimezoneLabel(tz);
    };

    tick();
    window.__jasTopClockTimer = setInterval(tick, 1000);
  }

  function applyThemeDensity(cfg) {
    document.documentElement.setAttribute("data-theme", cfg.theme);
    // Light and middle share the light-surface rules (styles.css: data-tone).
    document.documentElement.setAttribute("data-tone", cfg.theme === "dark" ? "dark" : "light");
    document.documentElement.setAttribute("data-density", cfg.density);
    document.documentElement.setAttribute("data-render-mode", cfg.renderMode || "smooth");
    document.documentElement.setAttribute("data-font-size", "normal");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function stripTags(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<\/?[^>]+(>|$)/g, "")
      // Some feeds (Fox News) double-encode, so `&apos;` survives XML parsing
      // and printed literally. Decode the harmless entities; never < or >,
      // which could turn text back into markup for a caller using innerHTML.
      .replace(/&(apos|#39|#x27);/gi, "'")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (m, n) => (n === "60" || n === "62") ? m : String.fromCodePoint(Number(n)))
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Accepts a full URL (news cards pass the configured `site`) or a bare
  // hostname (the stocks list passes extractDomain output). Returns "" for
  // anything that isn't a hostname, which leaves img.src empty and lets the
  // call sites' onerror handlers hide the icon.
  function faviconUrl(site, size = 64) {
    let host;
    try {
      host = new URL(site).hostname;
    } catch {
      host = String(site || "").trim();
    }
    host = host.toLowerCase();
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host)) return "";
    return `${FAVICON_BASE}?domain=${encodeURIComponent(host)}&sz=${size}`;
  }

  function normalizeOutboundLink(url) {
    try {
      if (!url) return url;
      const u = new URL(url);

      // Google News RSS often wraps outbound links
      if (u.hostname.includes("news.google.com")) {
        const real = u.searchParams.get("url") || u.searchParams.get("u");
        if (real) return decodeURIComponent(real);
      }
      if (u.hostname.includes("google.com") && u.pathname === "/url") {
        const q = u.searchParams.get("q");
        if (q) return q;
      }
      return url;
    } catch {
      return url;
    }
  }

  // Simple cache for API calls (5 minute TTL)
  const cache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const RSS_STALE_CACHE_MAX_AGE_MS = 30 * 60 * 1000; // serve stale for up to 30 minutes on failures

  // Persist successful RSS fetches across page navigations so a refresh
  // doesn't have to re-fetch every feed from scratch (and so transient
  // upstream errors don't leave the user staring at empty cards).
  const RSS_LS_KEY = "hn_rss_cache_v1";
  const RSS_LS_MAX_ENTRIES = 60;
  let rssLsSaveTimer = null;

  function hydrateRssCacheFromStorage() {
    try {
      const raw = localStorage.getItem(RSS_LS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return;
      const now = Date.now();
      const maxAge = CACHE_TTL + RSS_STALE_CACHE_MAX_AGE_MS;
      for (const [k, v] of Object.entries(obj)) {
        if (!v || typeof v.timestamp !== "number") continue;
        if ((now - v.timestamp) > maxAge) continue;
        cache.set(k, v);
      }
    } catch { }
  }

  function persistRssCacheToStorage() {
    if (rssLsSaveTimer) return;
    // Coalesce bursts of setCached calls (e.g. 5 widgets settling on
    // load) into a single localStorage write a tick later.
    rssLsSaveTimer = setTimeout(() => {
      rssLsSaveTimer = null;
      try {
        const entries = [];
        for (const [k, v] of cache.entries()) {
          if (typeof k === "string" && k.startsWith("rss:") && v?.timestamp) {
            entries.push([k, v]);
          }
        }
        // Keep only the freshest N entries to bound localStorage usage.
        entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        const trimmed = Object.fromEntries(entries.slice(0, RSS_LS_MAX_ENTRIES));
        localStorage.setItem(RSS_LS_KEY, JSON.stringify(trimmed));
      } catch { }
    }, 250);
  }

  // Restore previously-fetched RSS into the in-memory cache before any
  // fetch fires, so the first render can fall back to fresh-but-stored
  // results when proxies are slow / 5xx'ing.
  hydrateRssCacheFromStorage();

  function timeoutSignal(timeoutMs) {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      return AbortSignal.timeout(timeoutMs);
    }
    return null;
  }

  function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  }

  function setCached(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
    // Persist RSS results so a later page load can show content
    // immediately even if the upstream fetch is failing.
    if (typeof key === "string" && key.startsWith("rss:")) {
      persistRssCacheToStorage();
    }
  }

  // Drop every cached entry whose key passes the test (common-feeds.js's
  // clearRssCache uses it; the cache is shared with the stock quotes).
  function forgetCached(test) {
    for (const key of [...cache.keys()]) if (typeof key === "string" && test(key)) cache.delete(key);
  }

  function getCachedStale(key, maxStaleAgeMs = RSS_STALE_CACHE_MAX_AGE_MS) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL + maxStaleAgeMs) {
      return null;
    }
    return entry.data;
  }

  // Error handling utility
  function handleError(error, context = "Operation") {
    console.error(`[${context}]`, error);
    return {
      error: true,
      message: error.message || `${context} failed. Please try again.`,
      context
    };
  }

  // Show user-friendly error message
  function showError(message, element) {
    if (!element) return;
    const errorEl = document.createElement("div");
    errorEl.className = "errorMessage";
    errorEl.setAttribute("role", "alert");
    errorEl.setAttribute("aria-live", "polite");
    errorEl.textContent = message;
    element.innerHTML = "";
    element.appendChild(errorEl);
  }

  // The real implementation is in common-weather.js, which has
  // fetchCurrentWeather. This copy used to duplicate it and call both helpers
  // by bare name, so it threw and silently left the clock on the default zone.
  async function syncTimezoneFromZip(cfg) {
    const sync = window.App?.syncTimezoneFromZip;
    return typeof sync === "function" && sync !== syncTimezoneFromZip ? sync(cfg) : cfg;
  }

  function renderTopbar(cfg) {
    const key = (p) => String(p || "").toLowerCase();
    const path = key(location.pathname.split("/").pop());
    const active = (name) => {
      if (name === "news" && (path === "" || path === "index.html" || path === "index")) return true;
      return path === `${name}.html` || path === name;
    };

    const topbar = document.getElementById("topbar");
    if (!topbar) return;

    topbar.innerHTML = `
      <div class="topbarInner">
        <a href="/" class="brand" aria-label="Home">
          <div class="dot" aria-hidden="true"></div>
          <div>
            <div class="brandTitle">Happening Now!</div>
            <div class="brandSub">News • Weather • Stocks</div>
          </div>
        </a>

        <div class="navCenter">
          <form class="searchForm" action="https://duckduckgo.com/" method="GET" target="_blank" rel="noopener noreferrer">
            <span class="ddgLogo" aria-hidden="true">🦆</span>
            <input type="text" name="q" class="searchBar" placeholder="Search DuckDuckGo..." aria-label="Search">
          </form>
          
          <nav class="nav" role="navigation" aria-label="Main navigation">
            <div class="navMain">
              ${active("news")
        ? `<span class="btn btnMain btnActive btnDisabled" aria-current="page">News</span>`
        : `<a class="btn btnMain" href="/">News</a>`}

              ${active("weather")
        ? `<span class="btn btnMain btnActive btnDisabled" aria-current="page">Weather</span>`
        : `<a class="btn btnMain" href="/weather">Weather</a>`}

              ${active("markets")
        ? `<span class="btn btnMain btnActive btnDisabled" aria-current="page">Markets</span>`
        : `<a class="btn btnMain" href="/markets">Markets</a>`}
            </div>

            <div class="navSettings">
              ${active("settings")
        ? `<span class="btn btnSettings btnActive btnDisabled" aria-current="page">Settings</span>`
        : `<a class="btn btnSettings" href="/settings">Settings</a>`}
            </div>
          </nav>
        </div>

        <div class="topRight">
          <a class="topClockLink" href="/settings" aria-label="Open settings">
            <div class="topClock" aria-label="Local time and date">
              <div class="topClockDate" id="topClockDate">—</div>
              <div class="topClockTime" id="topClockTime">--:--:--</div>
              <div class="topClockTz" id="topClockTz">--</div>
            </div>
          </a>
        </div>
      </div>
    `;
    // start/refresh the clock after topbar markup exists
    syncTimezoneFromZip(cfg).then(() => {
      startTopClock(() => window.App?.cfg || cfg);
    });
  }

  async function fetchAndDisplayWeather(_cfg) {
    try {
      // Always read the latest cfg so stale references after saveConfig don't break this
      const cfg = window.App?.cfg || loadConfig();
      console.log("[topbar] fetchAndDisplayWeather start", cfg);
      const loc = await resolvePreferredLocation({
        cfg,
        autoDetect: false
      });
      if (!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lon))) {
        console.warn("[topbar] fetchAndDisplayWeather: unable to resolve location");
        const weatherEl = document.getElementById("topWeather");
        if (weatherEl) {
          weatherEl.innerHTML = `
            <a href="settings.html#weather" class="topWeatherSetLoc" aria-label="Set location for weather">
              <span class="topWeatherSetLocIcon">📍</span>
              <span class="topWeatherSetLocText">Set location</span>
            </a>
          `;
        }
        return;
      }

      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${Number(loc.lat)}&longitude=${Number(loc.lon)}` +
        `&current=temperature_2m,weather_code,temperature_2m_min,temperature_2m_max` +
        `&daily=temperature_2m_max,temperature_2m_min` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;

      const data = await res.json();
      const current = data.current || {};
      const daily = (data.daily?.temperature_2m_max || [])[0];
      const dailyMin = (data.daily?.temperature_2m_min || [])[0];

      const weatherEl = document.getElementById("topWeather");
      if (!weatherEl) return;

      const temp = current.temperature_2m;
      const code = current.weather_code;
      const icon = getWeatherIcon(code);
      const hi = daily;
      const lo = dailyMin;

      const tempTxt = Number.isFinite(temp) ? `${Math.round(temp)}°` : "--";
      const hiTxt = Number.isFinite(hi) ? `${Math.round(hi)}` : "--";
      const loTxt = Number.isFinite(lo) ? `${Math.round(lo)}` : "--";

      weatherEl.innerHTML = `
        <div class="weatherIcon">${icon}</div>
        <div class="weatherInfo">
          <div class="weatherTemp">${tempTxt}</div>
          <div class="weatherRange">L: ${loTxt} H: ${hiTxt}</div>
          <div class="weatherLoc">${escapeHtml(loc.city || loc.label || "Current")}</div>
        </div>
      `;
    } catch {/* best-effort only */ }
  }

  // Reusable component: News Card Header
  function createCardHeader({ name, site, onOpen }) {
    const head = document.createElement("div");
    head.className = "cardHead";

    const left = document.createElement("div");
    left.className = "cardHeadLeft";

    const fav = document.createElement("div");
    fav.className = "faviconContainer";
    fav.setAttribute("aria-hidden", "true");

    const img = document.createElement("img");
    img.alt = `${name} favicon`;
    img.src = faviconUrl(site);
    img.className = "favicon";
    img.loading = "lazy";
    img.onerror = () => { fav.style.display = "none"; };
    fav.appendChild(img);

    const title = document.createElement("div");
    title.className = "cardHeadTitle";
    title.innerHTML = `
      <div class="cardHeadName">${escapeHtml(name)}</div>
      <div class="cardHeadSite">${escapeHtml(site || "")}</div>
    `;

    left.appendChild(fav);
    left.appendChild(title);

    const open = document.createElement("button");
    open.className = "iconBtn";
    open.type = "button";
    open.setAttribute("aria-label", `Open ${name} website`);
    open.title = `Open ${name}`;
    open.textContent = "↗";
    if (onOpen) {
      open.addEventListener("click", () => onOpen(site));
    }

    head.appendChild(left);
    head.appendChild(open);

    return head;
  }

  // Reusable component: Page Header
  function createPageHeader({ title, subtitle, actions = [] }) {
    const header = document.createElement("section");
    header.className = "pageHead";

    const titleSection = document.createElement("div");
    const h1 = document.createElement("h1");
    h1.textContent = title;
    const sub = document.createElement("div");
    sub.className = "sub";
    if (subtitle) sub.textContent = subtitle;
    titleSection.appendChild(h1);
    titleSection.appendChild(sub);

    const actionsSection = document.createElement("div");
    actionsSection.className = "pageHeadActions";
    actions.forEach(action => actionsSection.appendChild(action));

    header.appendChild(titleSection);
    header.appendChild(actionsSection);

    return { header, subtitleEl: sub };
  }

  // Timezone utilities
  const TIMEZONES = [
    { value: "America/New_York", label: "Eastern (ET)", offset: -5 },
    { value: "America/Chicago", label: "Central (CT)", offset: -6 },
    { value: "America/Denver", label: "Mountain (MT)", offset: -7 },
    { value: "America/Los_Angeles", label: "Pacific (PT)", offset: -8 },
    { value: "America/Anchorage", label: "Alaska (AKT)", offset: -9 },
    { value: "Pacific/Honolulu", label: "Hawaii (HST)", offset: -10 },
    { value: "Europe/London", label: "London (GMT)", offset: 0 },
    { value: "Europe/Paris", label: "Paris (CET)", offset: 1 },
    { value: "Asia/Tokyo", label: "Tokyo (JST)", offset: 9 },
    { value: "Asia/Shanghai", label: "Shanghai (CST)", offset: 8 },
    { value: "Australia/Sydney", label: "Sydney (AEDT)", offset: 11 },
    { value: "UTC", label: "UTC", offset: 0 }
  ];

  function formatTime(date, timezone) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }).format(date);
    } catch {
      return date.toLocaleTimeString();
    }
  }

  function formatDate(date, timezone) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric"
      }).format(date);
    } catch {
      return date.toLocaleDateString();
    }
  }

  function getTimezoneLabel(timezone) {
    const tz = TIMEZONES.find(t => t.value === timezone);
    return tz ? tz.label : timezone.split("/").pop();
  }

  function getTimezoneAbbrev(timezone) {
    const full = getTimezoneLabel(timezone);       // e.g. "Eastern (ET)"
    const m = /\(([^)]+)\)/.exec(full);
    return m ? m[1] : full;                         // => "ET"
  }

  function maybeRenderLegacyTopbar(cfg) {
    const topbar = document.getElementById("topbar");
    if (!topbar) return;
    if (topbar.classList.contains("hn-topbar")) return;
    renderTopbar(cfg);
  }

  // Global App API
  const cfg = loadConfig();
  applyThemeDensity(cfg);

  // Redirect to startup page if on index and not news, but only for external access
  if (window.location.pathname === "/" && cfg.startupPage && cfg.startupPage !== "news") {
    const referrer = document.referrer;
    const currentOrigin = window.location.origin;
    if (!referrer || !referrer.startsWith(currentOrigin)) {
      // The setting still says "stocks" (saved configs hold it); the page is /markets.
      window.location.replace(cfg.startupPage === "stocks" ? "/markets" : "/" + cfg.startupPage);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => maybeRenderLegacyTopbar(cfg), { once: true });
  } else {
    maybeRenderLegacyTopbar(cfg);
  }

  function cacheSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { }
  }

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function parseDateOnlyLocal(value) {
    if (typeof value !== "string") return null;
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

    return new Date(year, month - 1, day);
  }

  function parseTimeValue(value) {
    if (typeof value === "number") return value;
    if (typeof value !== "string") return NaN;

    const localDate = parseDateOnlyLocal(value);
    if (localDate) return localDate.getTime();

    return Date.parse(value);
  }

  function cacheAgeMs(savedAt) {
    const t = parseTimeValue(savedAt);
    return Number.isFinite(t) ? (Date.now() - t) : Infinity;
  }

  function formatAge(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h`;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Local/Regional source picker
  // ──────────────────────────────────────────────────────────────────────
  // Both news.js and settings.js call openSourcePicker(scope, onSaved) to
  // launch the same modal.

  // ZIP -> { city, state, lat, lon } via zippopotam. Moved here from
  // common-weather.js (2026-10-18): this file called it by bare name in three
  // places — the location picker's ZIP tab, the local-news picker's saved-ZIP
  // fallback and syncTimezoneFromZip — and every one threw ReferenceError.
  async function geocodeZip(zip){
    const cacheKey = `geo:${zip}`;
    const cached = getCached(cacheKey);
    if(cached) return cached;

    try{
      const url = `https://api.zippopotam.us/us/${zip}`;
      const res = await fetch(url, { cache:"no-store" });
      if(!res.ok) throw new Error("Bad ZIP");
      const j = await res.json();
      const place = j.places?.[0];
      if(!place) throw new Error("No place");
      const result = {
        city: place["place name"],
        state: place["state abbreviation"],
        lat: Number(place.latitude),
        lon: Number(place.longitude)
      };
      setCached(cacheKey, result);
      return result;
    }catch(error){
      handleError(error, "Geocoding");
      throw error;
    }
  }

  // Lightweight city-name geocoding via Open-Meteo (no API key needed).
  // Powers the location picker's "City Name" tab.
  async function geocodeCityName(query) {
    const q = String(query || "").trim();
    if (!q) return null;
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      const row = Array.isArray(j?.results) ? j.results[0] : null;
      if (!row) return null;
      const city = String(row.name || "").trim();
      const state = String(row.admin1 || "").trim();
      const label = [city, abbreviateState(state)].filter(Boolean).join(", ") || city;
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { city, state, lat, lon, label, zipCode: "" };
    } catch (err) {
      console.warn("[geocodeCity] failed:", err?.message || err);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Active location override (session-scoped)
  // ──────────────────────────────────────────────────────────────────────
  // Lets the user temporarily browse a different city for news + weather
  // without changing their saved "home" location in cfg. Lives in
  // sessionStorage so it survives page navigations but vanishes when the
  // browser tab closes — natural escape hatch back to home.
  //
  // Shape: { city, state, zip?, lat, lon, label }. All fields optional;
  // resolvePreferredLocation handles partial overrides gracefully.
  const ACTIVE_LOC_KEY = "hn_active_location_v1";

  function getActiveLocationOverride() {
    try {
      const raw = sessionStorage.getItem(ACTIVE_LOC_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      // Must have at least coords or a ZIP to be useful.
      const hasCoords = Number.isFinite(Number(obj?.lat)) && Number.isFinite(Number(obj?.lon));
      const hasZip = typeof obj?.zip === "string" && /^\d{5}$/.test(obj.zip);
      if (!hasCoords && !hasZip) return null;
      return obj;
    } catch { return null; }
  }

  function setActiveLocationOverride(loc) {
    if (!loc) return;
    try {
      sessionStorage.setItem(ACTIVE_LOC_KEY, JSON.stringify(loc));
      window.dispatchEvent(new CustomEvent("hn:locationchange", { detail: { override: loc, cleared: false } }));
    } catch (err) {
      console.warn("[active-loc] failed to set:", err?.message || err);
    }
  }

  function clearActiveLocationOverride() {
    try {
      sessionStorage.removeItem(ACTIVE_LOC_KEY);
      window.dispatchEvent(new CustomEvent("hn:locationchange", { detail: { override: null, cleared: true } }));
    } catch { }
  }

  // Renders / updates a thin banner across the top of every page whenever a
  // session location override is active. Shows the override label and a
  // "Reset to home" link. Hidden (and CSS var cleared) when at home.
  function renderLocationOverrideBanner() {
    if (typeof document === "undefined") return;
    const override = getActiveLocationOverride();
    let bar = document.getElementById("locationOverrideBar");
    if (!override) {
      if (bar) bar.remove();
      document.documentElement.style.removeProperty("--hn-override-height");
      document.documentElement.removeAttribute("data-override-active");
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "locationOverrideBar";
      bar.className = "locationOverrideBar";
      document.body.appendChild(bar);
    }
    const label = override.label
      || `${override.city || ""}${override.state ? ", " + override.state : ""}`.trim()
      || override.zip
      || "Custom location";
    bar.innerHTML = `
      <span class="locationOverrideLabel">📍 Viewing <b>${escapeHtml(label)}</b> · session only</span>
      <button type="button" class="locationOverrideReset" id="locationOverrideResetBtn" aria-label="Reset to home location">← Reset to home</button>
    `;
    bar.querySelector("#locationOverrideResetBtn")?.addEventListener("click", () => {
      clearActiveLocationOverride();
    });
    // Reserve room for the bar above the fixed topbar; CSS reads --hn-override-height.
    document.documentElement.style.setProperty("--hn-override-height", "32px");
    document.documentElement.setAttribute("data-override-active", "1");
  }

  // Render on DOM ready and on every change.
  function initLocationOverrideBanner() {
    if (typeof document === "undefined") return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", renderLocationOverrideBanner, { once: true });
    } else {
      renderLocationOverrideBanner();
    }
    window.addEventListener("hn:locationchange", renderLocationOverrideBanner);
  }
  initLocationOverrideBanner();

  // ──────────────────────────────────────────────────────────────────────
  // Shared location picker modal
  // ──────────────────────────────────────────────────────────────────────
  // Used by Weather page (was inline), News page change-location button,
  // and topbar weather widget. Apply has two paths:
  //   - "Save as my default" checked  -> updates cfg.zipCode/deviceLat,Lon
  //     (the saved home). Clears any active session override.
  //   - unchecked  -> writes to active session override only (sessionStorage).
  //
  // The modal fires "hn:locationchange" via setActiveLocationOverride /
  // clearActiveLocationOverride so pages can re-render. Optional onApply
  // callback fires the chosen geo for callers that want immediate action.
  function openLocationPicker(options = {}) {
    if (document.getElementById("locationPickerModal")) return;
    const onApply = typeof options?.onApply === "function" ? options.onApply : null;

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "locationPickerModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Change Location");
    modal.innerHTML = `
      <div class="modalContent">
        <div class="modalHead">
          <h3 style="margin:0;font-size:16px;">Change Location</h3>
          <button class="modalClose" id="locationPickerClose" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="modalBody">
          <div class="tabsRow locationPickerTabs" role="tablist">
            <button class="tabPill active" data-lp-mode="zip" type="button" role="tab" aria-selected="true">ZIP Code</button>
            <button class="tabPill" data-lp-mode="city" type="button" role="tab" aria-selected="false">City Name</button>
            <button class="tabPill" data-lp-mode="gps" type="button" role="tab" aria-selected="false">GPS</button>
          </div>
          <div class="locationPickerPanel" data-lp-panel="zip">
            <div class="locationPickerRow">
              <input class="input" id="locationZipInput" type="text" inputmode="numeric"
                placeholder="e.g. 49201" maxlength="5" autocomplete="postal-code" aria-label="ZIP code">
              <button class="btn" id="locationZipLookupBtn" type="button">Find</button>
            </div>
            <div class="locationPickerStatus" id="locationZipStatus"></div>
          </div>
          <div class="locationPickerPanel" data-lp-panel="city" hidden>
            <div class="locationPickerRow">
              <input class="input" id="locationCityInput" type="text"
                placeholder="e.g. Lansing, MI" autocomplete="address-level2" aria-label="City name">
              <button class="btn" id="locationCityLookupBtn" type="button">Find</button>
            </div>
            <div class="locationPickerStatus" id="locationCityStatus"></div>
          </div>
          <div class="locationPickerPanel" data-lp-panel="gps" hidden>
            <button class="btn locationGpsBtn" id="locationGpsBtn" type="button">&#128205; Use My GPS</button>
            <div class="locationPickerStatus" id="locationGpsStatus"></div>
          </div>
          <div class="locationPickerConfirmBox" id="locationPickerConfirmBox" hidden>
            <div class="locationPickerFound" id="locationPickerFound"></div>
            <label class="locationPickerSaveLabel">
              <input type="checkbox" id="locationPickerSaveCheck">
              Save as my home location
            </label>
            <div class="locationPickerActions">
              <button class="btn primary" id="locationPickerApplyBtn" type="button">Apply</button>
              <button class="btn" id="locationPickerCancelBtn" type="button">Cancel</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    let pendingGeo = null;
    const closeModal = () => modal.remove();

    function showStatus(id, msg, type = "") {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = msg;
      el.className = "locationPickerStatus" + (type ? " " + type : "");
    }
    function showConfirm(geo, label) {
      pendingGeo = geo;
      const box = document.getElementById("locationPickerConfirmBox");
      const found = document.getElementById("locationPickerFound");
      if (box && found) { found.textContent = "Found: " + label; box.hidden = false; }
    }
    function hideConfirm() {
      const box = document.getElementById("locationPickerConfirmBox");
      if (box) box.hidden = true;
      pendingGeo = null;
    }

    modal.querySelectorAll("button[data-lp-mode]").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.lpMode;
        modal.querySelectorAll("button[data-lp-mode]").forEach(b => {
          b.classList.toggle("active", b.dataset.lpMode === mode);
          b.setAttribute("aria-selected", String(b.dataset.lpMode === mode));
        });
        modal.querySelectorAll(".locationPickerPanel").forEach(p => {
          p.hidden = p.dataset.lpPanel !== mode;
        });
        hideConfirm();
        ["locationZipStatus", "locationCityStatus", "locationGpsStatus"].forEach(id => showStatus(id, ""));
      });
    });

    async function doZipLookup() {
      const val = (document.getElementById("locationZipInput")?.value || "").trim();
      if (!/^\d{5}$/.test(val)) { showStatus("locationZipStatus", "Enter a 5-digit ZIP code.", "isError"); return; }
      showStatus("locationZipStatus", "Looking up…"); hideConfirm();
      try {
        const geo = await geocodeZip(val);
        if (geo?.lat && geo?.lon) {
          const label = geo.city && geo.state ? `${geo.city}, ${abbreviateState(geo.state)}` : val;
          showStatus("locationZipStatus", "");
          showConfirm({ ...geo, label, source: "manual-zip", _zip: val }, label);
        } else {
          showStatus("locationZipStatus", "No location found for that ZIP.", "isError");
        }
      } catch (err) {
        showStatus("locationZipStatus", "Lookup failed. Try again.", "isError");
        console.error("[locationPicker] ZIP error:", err);
      }
    }
    document.getElementById("locationZipLookupBtn")?.addEventListener("click", doZipLookup);
    document.getElementById("locationZipInput")?.addEventListener("keydown", e => { if (e.key === "Enter") doZipLookup(); });

    async function doCityLookup() {
      const val = (document.getElementById("locationCityInput")?.value || "").trim();
      if (!val) { showStatus("locationCityStatus", "Enter a city name.", "isError"); return; }
      showStatus("locationCityStatus", "Looking up…"); hideConfirm();
      try {
        const geo = await geocodeCityName(val);
        if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lon)) {
          const label = geo.label || val;
          showStatus("locationCityStatus", "");
          showConfirm({ ...geo, source: "manual-city" }, label);
        } else {
          showStatus("locationCityStatus", "City not found. Try 'City, ST' format.", "isError");
        }
      } catch (err) {
        showStatus("locationCityStatus", "Lookup failed. Try again.", "isError");
        console.error("[locationPicker] City error:", err);
      }
    }
    document.getElementById("locationCityLookupBtn")?.addEventListener("click", doCityLookup);
    document.getElementById("locationCityInput")?.addEventListener("keydown", e => { if (e.key === "Enter") doCityLookup(); });

    document.getElementById("locationGpsBtn")?.addEventListener("click", async () => {
      if (!("geolocation" in navigator)) { showStatus("locationGpsStatus", "GPS is not available in this browser.", "isError"); return; }
      showStatus("locationGpsStatus", "Requesting location…"); hideConfirm();
      try {
        const gp = window.App?.getCurrentPositionAsync;
        const rg = window.App?.reverseGeocodeCoords;
        const pos = typeof gp === "function" ? await gp()
          : await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }));
        const lat = Number(pos?.coords?.latitude);
        const lon = Number(pos?.coords?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) { showStatus("locationGpsStatus", "Could not read GPS coordinates.", "isError"); return; }
        showStatus("locationGpsStatus", "Resolving address…");
        const rev = typeof rg === "function" ? await rg(lat, lon) : null;
        const label = rev?.label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        showStatus("locationGpsStatus", "");
        showConfirm({ lat, lon, city: rev?.city || "", state: rev?.state || "", label, source: "gps", zipCode: rev?.zipCode || "" }, label);
      } catch (err) {
        const denied = err?.code === 1 || /denied/i.test(err?.message || "");
        showStatus("locationGpsStatus",
          denied ? "Location permission denied. Allow access in your browser settings." : "GPS lookup failed. Try again.",
          "isError");
        console.error("[locationPicker] GPS error:", err);
      }
    });

    document.getElementById("locationPickerApplyBtn")?.addEventListener("click", () => {
      if (!pendingGeo) return;
      const saveAsHome = document.getElementById("locationPickerSaveCheck")?.checked;
      const geo = pendingGeo;

      if (saveAsHome) {
        // Update cfg's saved home location and clear any active override.
        const liveCfg = window.App?.cfg || cfg;
        const next = { ...liveCfg };
        if (geo.source === "manual-zip" && geo._zip) {
          next.zipCode = geo._zip;
          next.useDeviceLocation = false;
        } else {
          next.useDeviceLocation = true;
          next.deviceLat = Number(geo.lat);
          next.deviceLon = Number(geo.lon);
          next.deviceLocationLabel = geo.label;
        }
        if (geo.zipCode && /^\d{5}$/.test(geo.zipCode)) next.zipCode = geo.zipCode;
        saveConfig(next);
        clearActiveLocationOverride();
      } else {
        // Session override only — home stays put.
        setActiveLocationOverride({
          zip: (geo._zip || geo.zipCode || "") + "",
          lat: Number(geo.lat),
          lon: Number(geo.lon),
          city: geo.city || "",
          state: geo.state || "",
          label: geo.label || ""
        });
      }
      closeModal();
      try { onApply?.(geo, saveAsHome); } catch { }
    });

    document.getElementById("locationPickerCancelBtn")?.addEventListener("click", hideConfirm);
    document.getElementById("locationPickerClose")?.addEventListener("click", closeModal);
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    modal.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Local TV-station / paper RSS catalog (data/local-stations.json)
  // ──────────────────────────────────────────────────────────────────────
  // Readers want their actual TV station / newspaper. We bundle a curated
  // catalog and the picker surfaces it for whichever city the user is in.
  // State-level entries (`_state`) are also returned
  // for the regional scope.
  let localStationsCache = null;
  let localStationsPromise = null;

  async function loadLocalStations() {
    if (localStationsCache) return localStationsCache;
    if (localStationsPromise) return localStationsPromise;
    localStationsPromise = (async () => {
      try {
        const res = await fetch("/data/local-stations.json", { cache: "default" });
        if (!res.ok) throw new Error(`stations fetch failed: ${res.status}`);
        const data = await res.json();
        localStationsCache = (data && typeof data === "object") ? data : { states: {} };
      } catch (err) {
        console.warn("[stations] failed to load:", err?.message || err);
        localStationsCache = { states: {} };
      } finally {
        localStationsPromise = null;
      }
      return localStationsCache;
    })();
    return localStationsPromise;
  }

  // ── Topic sources ───────────────────────────────────────────────────────
  // data/topic-sources.json is the topical counterpart to local-stations.json:
  // where that one answers "what's near me", this answers "what's about
  // science". Users choose which topics appear as tabs, so nothing here shows
  // up until they opt in.
  let topicSourcesCache = null;
  let topicSourcesPromise = null;

  async function loadTopicSources() {
    if (topicSourcesCache) return topicSourcesCache;
    if (topicSourcesPromise) return topicSourcesPromise;
    topicSourcesPromise = (async () => {
      try {
        const res = await fetch("/data/topic-sources.json", { cache: "default" });
        if (!res.ok) throw new Error(`topics fetch failed: ${res.status}`);
        const data = await res.json();
        topicSourcesCache = (data && typeof data === "object") ? data : { topics: {} };
      } catch (err) {
        console.warn("[topics] failed to load:", err?.message || err);
        topicSourcesCache = { topics: {} };
      } finally {
        topicSourcesPromise = null;
      }
      return topicSourcesCache;
    })();
    return topicSourcesPromise;
  }

  // Every topic the repo ships, in file order, as { id, label, title, emoji, group }.
  // Settings renders the chooser from this, so adding a topic to the JSON is
  // all it takes for it to become selectable.
  async function getAllTopics() {
    const data = await loadTopicSources();
    return Object.entries(data?.topics || {}).map(([id, t]) => ({
      id,
      label: t.label || id.toUpperCase(),
      title: t.title || t.label || id,
      emoji: t.emoji || "",
      group: t.group || "",
      count: (t.entries || []).length,
    }));
  }

  // The topics this user turned on, in the order they saved them (Settings lets
  // them reorder; newly ticked topics append to the end). Unknown ids in saved
  // config are dropped, which keeps an old config working after a topic is
  // renamed or removed.
  async function getEnabledTopics() {
    const chosen = window.App?.cfg?.topics;
    if (!Array.isArray(chosen) || !chosen.length) return [];
    const byId = new Map((await getAllTopics()).map(t => [t.id, t]));
    return chosen.map(id => byId.get(id)).filter(Boolean);
  }

  async function getTopicEntries(id) {
    const data = await loadTopicSources();
    return data?.topics?.[id]?.entries || [];
  }

  // True when `scope` names a topic rather than one of the four geographic
  // scopes. Callers use this to branch instead of hardcoding topic ids.
  async function isTopicScope(scope) {
    const data = await loadTopicSources();
    return Boolean(scope && data?.topics?.[scope]);
  }

  // True when the JSON has a city-level block for this geo with at least one
  // entry. Different from `getStationsForGeo(...).length > 0` because that
  // mixes in statewide entries; we want to know specifically whether we have
  // *hyperlocal* coverage, since statewide-only doesn't satisfy "near me".
  async function hasCitySources(geo) {
    if (!geo?.state || !geo?.city) return false;
    const data = await loadLocalStations();
    // abbreviateState normalizes "Michigan"/"US-MI"/"mi" → "MI" so we can
    // look up the JSON's two-letter keys regardless of how geo was stored.
    const state = data?.states?.[abbreviateState(geo.state).toUpperCase()];
    if (!state) return false;
    const cityBlock = state[String(geo.city).toLowerCase()];
    return entriesFromBlock(cityBlock).length > 0;
  }

  // Pulls the entry list out of a city/state block. The repo migrated from
  // plain arrays to { coords, entries: [...] }; both shapes are tolerated so a
  // contributor who omits coords doesn't break the picker (they just miss out
  // on the nearest-city fallback).
  function entriesFromBlock(block) {
    if (Array.isArray(block)) return block;
    if (block && Array.isArray(block.entries)) return block.entries;
    return [];
  }

  // Returns [{ name, rss, site, type }] suitable for direct rendering as
  // suggestion checkboxes in the picker. Lookup is case-insensitive on city.
  // For local scope, returns the city's entries plus the state's `_state`
  // entries (so a hyperlocal user still sees the statewide paper). For
  // regional, returns only the `_state` entries.
  async function getStationsForGeo(geo, scope) {
    if (!geo?.state) return [];
    const data = await loadLocalStations();
    // Normalize "Michigan"/"US-MI"/"mi" → "MI" so the JSON's two-letter
    // keys resolve regardless of how the caller stored the state.
    const stateKey = abbreviateState(geo.state).toUpperCase();
    const state = data?.states?.[stateKey];
    if (!state) return [];
    const out = [];
    if (scope === "local") {
      const cityKey = String(geo.city || "").toLowerCase();
      out.push(...entriesFromBlock(state[cityKey]));
    }
    out.push(...entriesFromBlock(state._state));
    // Dedupe by RSS URL in case a city entry duplicates a statewide one.
    const seen = new Set();
    return out.filter(s => {
      const k = String(s?.rss || "").toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // Great-circle distance in miles between two lat/lon points.
  function haversineMiles(lat1, lon1, lat2, lon2) {
    const toRad = d => d * Math.PI / 180;
    const R = 3958.7613; // mean Earth radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // Returns the `limit` cities in the repo geographically closest to (lat, lon),
  // each as { state, city, displayCity, lat, lon, distanceMi }. Only cities with
  // coords participate; the synthetic `_state` block is excluded since picking
  // "the whole state of Texas" isn't a useful local fallback. Used by the
  // source picker to offer a fallback when the user's exact city isn't covered.
  async function getNearestCities(lat, lon, limit = 3) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const data = await loadLocalStations();
    const states = data?.states;
    if (!states) return [];
    const candidates = [];
    for (const stateKey of Object.keys(states)) {
      const stateBlock = states[stateKey];
      if (!stateBlock || typeof stateBlock !== "object") continue;
      for (const innerKey of Object.keys(stateBlock)) {
        if (innerKey === "_state") continue;
        const block = stateBlock[innerKey];
        const coords = block && typeof block === "object" ? block.coords : null;
        if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) continue;
        const entries = entriesFromBlock(block);
        if (!entries.length) continue;
        const distanceMi = haversineMiles(lat, lon, coords.lat, coords.lon);
        candidates.push({
          state: stateKey,
          city: innerKey,
          displayCity: innerKey.replace(/\b\w/g, c => c.toUpperCase()),
          lat: coords.lat,
          lon: coords.lon,
          distanceMi
        });
      }
    }
    candidates.sort((a, b) => a.distanceMi - b.distanceMi);
    return candidates.slice(0, Math.max(0, limit));
  }

  // Same idea as getNearestCities but ranges over statewide blocks. Used by
  // the regional picker fallback when the user's state isn't in the repo —
  // e.g., someone in Idaho gets offered Oregon / Washington / Utah.
  async function getNearestStates(lat, lon, limit = 3) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const data = await loadLocalStations();
    const states = data?.states;
    if (!states) return [];
    const candidates = [];
    for (const stateKey of Object.keys(states)) {
      const stateBlock = states[stateKey];
      const stateNode = stateBlock?._state;
      const coords = stateNode && typeof stateNode === "object" ? stateNode.coords : null;
      if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) continue;
      const entries = entriesFromBlock(stateNode);
      if (!entries.length) continue;
      candidates.push({
        state: stateKey,
        displayState: expandStateName ? (expandStateName(stateKey) || stateKey) : stateKey,
        lat: coords.lat,
        lon: coords.lon,
        distanceMi: haversineMiles(lat, lon, coords.lat, coords.lon)
      });
    }
    candidates.sort((a, b) => a.distanceMi - b.distanceMi);
    return candidates.slice(0, Math.max(0, limit));
  }

  // Where the Local / State picker looks. It also offered Reddit communities
  // for the place until Reddit ended its RSS feeds on 2026-11-13.
  async function resolvePickerGeo() {
    const liveCfg = window.App?.cfg || cfg;
    // Honors GPS, saved device coords, OR ZIP — same resolver weather.js uses.
    let geo = null;
    try {
      if (typeof window.App?.resolvePreferredLocation === "function") {
        const loc = await window.App.resolvePreferredLocation({ cfg: liveCfg, autoDetect: false });
        if (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon))) {
          geo = { lat: Number(loc.lat), lon: Number(loc.lon), city: loc.city || "", state: loc.state || "" };
        }
      }
    } catch { }
    if (!geo) {
      const zip = liveCfg?.zipCode;
      if (zip && /^\d{5}$/.test(zip)) {
        try { geo = await geocodeZip(zip); } catch { }
      }
    }
    if (!geo) return null;
    // Normalize "Michigan"/"US-MI"/"mi" -> "MI" to match the JSON's keys.
    const stateAbbr = abbreviateState(geo.state).toUpperCase();
    return { ...geo, state: stateAbbr, fullState: expandStateName(stateAbbr) || stateAbbr };
  }

  // Local / State source picker. Replaced 2026-10-18: the old 500-line modal
  // here (checkbox lists, a Save button that replaced the whole list) became
  // the shared picker in assets/news-picker.js, which every scope now uses.
  // This keeps the old entry point, so news.js and settings.js are
  // unchanged, and owns the cfg side: one-tap add/remove that saves at once.
  //
  // `onSaved` runs on close if anything changed. Closing with nothing saved
  // counts as "use automatic picks" (the old Skip), so the news page doesn't
  // reopen the picker on every visit.
  const SCOPED_SOURCE_LIMIT = 8; // news.js shows the first 8 per scope
  function openSourcePicker(scope, onSaved) {
    if (scope !== "local" && scope !== "regional") return;
    if (!window.NewsPicker) return;
    const key = scope === "local" ? "localSources" : "regionalSources";
    const skipKey = scope === "local" ? "localSourcesSkipped" : "regionalSourcesSkipped";
    // Same feed arrives as .../feed and .../feed/ from different catalogues.
    const feedKey = (u) => String(u || "").trim().replace(/\/+$/, "").toLowerCase();
    const list = () => (Array.isArray(window.App.cfg?.[key]) ? window.App.cfg[key] : []);
    const write = (next, extra = {}) => saveConfig({ ...window.App.cfg, [key]: next, ...extra });
    let changed = false;

    function add(entry) {
      const cur = list();
      if (cur.some((s) => feedKey(s.rss) === feedKey(entry.rss))) return "";
      if (cur.length >= SCOPED_SOURCE_LIMIT) return `Up to ${SCOPED_SOURCE_LIMIT} sources show on the page. Remove one in Settings first.`;
      write([...cur, { name: entry.name, rss: entry.rss, site: entry.site || "", headlinesCount: 8 }], { [skipKey]: false });
      changed = true;
      return "";
    }

    window.NewsPicker.open({
      scope,
      isAdded: (rss) => list().some((s) => feedKey(s.rss) === feedKey(rss)),
      add,
      addMany: (entries) => entries.reduce((n, e) => n + (add(e) === "" && list().some((s) => feedKey(s.rss) === feedKey(e.rss)) ? 1 : 0), 0),
      remove: (rss) => { write(list().filter((s) => feedKey(s.rss) !== feedKey(rss))); changed = true; },
      addCustom: async (rss) => {
        let name = "Custom feed";
        try { name = new URL(rss).hostname.replace(/^www\./, ""); } catch {}
        return add({ name, rss, site: "" });
      },
      skip: () => { write(list(), { [skipKey]: true }); changed = true; },
      onClose: () => {
        if (!list().length && !window.App.cfg?.[skipKey]) { write([], { [skipKey]: true }); changed = true; }
        if (changed) { try { onSaved?.(); } catch { } }
      },
    });
  }

  window.App = {
    LS_KEY,
    API_ORIGIN,
    RSS_PROXY_BASE,
    RSS_AGGREGATORS,
    STOCKS_PROXY_BASE,
    MARKETS_SNAPSHOT_URL,
    MARKET_INDEX_DEFS: clone(MARKET_INDEX_DEFS),
    DEFAULTS: clone(DEFAULTS),
    cfg,
    loadConfig,
    saveConfig,
    normalizeConfig,
    applyThemeDensity,
    renderTopbar,
    escapeHtml,
    stripTags,
    faviconUrl,
    normalizeOutboundLink,
    handleError,
    showError,
    createCardHeader,
    createPageHeader,
    getCached,
    setCached,
    getCachedStale,
    forgetCached,
    timeoutSignal,
    cacheGet,
    cacheSet,
    parseDateOnlyLocal,
    cacheAgeMs,
    formatAge,
    TIMEZONES,
    formatTime,
    formatDate,
    getTimezoneLabel,
    abbreviateState,
    expandStateName,
    isSectionHidden,
    openSourcePicker,
    resolvePickerGeo,
    loadLocalStations,
    loadTopicSources,
    getAllTopics,
    getEnabledTopics,
    getTopicEntries,
    isTopicScope,
    getStationsForGeo,
    getNearestCities,
    getNearestStates,
    hasCitySources,
    getActiveLocationOverride,
    setActiveLocationOverride,
    clearActiveLocationOverride,
    geocodeCityName,
    geocodeZip,
    openLocationPicker
  };

  // Returns true when the user has disabled the given section in Settings.
  // Missing keys (not yet configured / older saved cfg) count as visible (false).
  function isSectionHidden(page, key) {
    try {
      const v = window.App?.cfg?.sectionVisibility?.[page];
      if (!v) return false;
      return v[key] === false;
    } catch { return false; }
  }

  // Register service worker for PWA functionality
  const canRegisterServiceWorker =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    window.isSecureContext === true &&
    /^https?:$/.test(window.location.protocol);

  if (canRegisterServiceWorker) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('[SW] Service Worker registered:', registration.scope);

          // Proactively check for updates on each load.
          registration.update().catch(() => { });

          // If an update is found, ask it to install immediately.
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                worker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });
        })
        .catch(error => {
          console.warn('[SW] Service Worker registration failed:', error);
        });

      // Don't force a reload when a new SW takes over — that caused a visible
      // freeze/blink on every deploy and Lighthouse measured it as a 4-5s
      // "redirect" to the same URL, tanking the LCP score. The new SW will
      // serve fresh assets on the user's next natural navigation.
    });
  }
})();
