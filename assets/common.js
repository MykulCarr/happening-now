(() => {
  "use strict";

  const LS_KEY = "jas_cfg_v3";
  const GEO_PREF_KEY = "jas_geo_pref_v1";

  // First-party RSS proxy route served by cloudflare-sync-worker.
  const RSS_PROXY_BASE = "/v1/rss/raw?url=";
  const RSS_PROXY_FALLBACKS = [
    RSS_PROXY_BASE,
    "https://api.codetabs.com/v1/proxy?quest="
  ];

  // RSS Aggregator endpoints - RSSHub is a robust alternative for hard-to-reach feeds
  const RSS_AGGREGATORS = {
    rsshub: "https://rsshub.app",           // Primary: RSSHub (open-source, reliable)
    rsshubBackup: "https://rss.shab.fun",   // Backup RSSHub instance
    feedbin: "https://feedbin.com",         // Feedly alternative (requires account)
  };

  // Stock API keys — Finnhub and TwelveData are proxied through /v1/stocks/* on the
  // Cloudflare Worker. Set FINNHUB_KEY and TWELVEDATA_KEY as Worker secrets in the
  // Cloudflare dashboard (Workers → your worker → Settings → Variables & Secrets).
  // Alpha Vantage and IEX can be added here directly if desired (optional fallbacks).
  const STOCK_API_KEYS = {
    finnhub: "d6fn95hr01qqnmbpagjgd6fn95hr01qqnmbpagk0",
    alphaVantage: "",
    iex: "",
    twelvedata: "0e445cbc4f8447bca852199162995caf"
  };

  // NewsAPI and GNews keys — cleared; the site relies on RSS feeds which work without keys.
  // To re-enable, add keys here and set matching Worker secrets (NEWSAPI_KEY, GNEWS_KEY).
  const NEWS_API_KEY = "";

  const GNEWS_API_KEY = "";

  // MediaStack API (free tier: 1000 requests/month, ~33/day)
  // Sign up at https://mediastack.com to get your API key
  const MEDIASTACK_API_KEY = ""; // Add your MediaStack API key here for fallback

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
    const upper = String(stateAbbrOrName).toUpperCase();
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
  const MARKET_INDEX_DEFS = [
    { key: "dow", name: "DOW" },
    { key: "sp500", name: "S&P 500" },
    { key: "nasdaq", name: "NASDAQ" },
    { key: "russell2000", name: "RUSSELL 2000" },
    { key: "sp400", name: "S&P MIDCAP 400" },
    { key: "sp600", name: "S&P SMALLCAP 600" },
    { key: "microcap", name: "MICROCAP" },
    { key: "vix", name: "VIX" },
    { key: "ftse100", name: "FTSE 100" },
    { key: "dax", name: "DAX" },
    { key: "nikkei225", name: "NIKKEI 225" },
    { key: "hangseng", name: "HANG SENG" },
    { key: "gold", name: "GOLD" },
    { key: "silver", name: "SILVER" },
    { key: "copper", name: "COPPER" },
    { key: "crudeoil", name: "CRUDE OIL" },
    { key: "brent", name: "BRENT" },
    { key: "natgas", name: "NAT GAS" },
    { key: "us10y", name: "US 10Y" },
    { key: "dxy", name: "DXY" },
    { key: "eurusd", name: "EUR/USD" },
    { key: "bitcoin", name: "BITCOIN" },
    { key: "ethereum", name: "ETHEREUM" }
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
    weatherStaleWarnMinutes: 30,

    // Stock preferences
    stockSortMode: "pinned",
    stocksNewsMode: "watchlist",
    marketNewsSourceMode: "google",
    marketNewsOpenMode: "new-tab",
    marketIndices: MARKET_INDEX_DEFS.map((item) => ({ key: item.key, visible: true })),

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
    // Empty by default: the four geographic tabs are the shipped experience,
    // and topics only appear once someone opts in from Settings.
    topics: [],
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
        calendar: true,
        diagnostic: true
      }
    },

    // Content arrays
    widgets: [
      // All working RSS feeds - verified and tested.
      // `scopes` controls which scope tab(s) on the news page show this widget.
      // Widgets without a `scopes` field are treated as ["national","international"]
      // by getWidgetsForScope so older saved configs still render.
      { name: "NPR", rss: "https://feeds.npr.org/1001/rss.xml", site: "https://www.npr.org", headlinesCount: 5, scopes: ["national"] },
      { name: "BBC", rss: "https://feeds.bbci.co.uk/news/rss.xml", site: "https://www.bbc.com/news", headlinesCount: 5, scopes: ["international"] },
      { name: "The Guardian (US)", rss: "https://www.theguardian.com/us-news/rss", site: "https://www.theguardian.com/us-news", headlinesCount: 5, scopes: ["national"] },
      { name: "The Guardian (World)", rss: "https://www.theguardian.com/world/rss", site: "https://www.theguardian.com/world", headlinesCount: 5, scopes: ["international"] },
      { name: "The Atlantic", rss: "https://www.theatlantic.com/feed/all/", site: "https://www.theatlantic.com", headlinesCount: 5, scopes: ["national"] },
      { name: "ArsTechnica", rss: "https://feeds.arstechnica.com/arstechnica/index", site: "https://arstechnica.com", headlinesCount: 5, scopes: ["national"] },
      { name: "ProPublica", rss: "https://www.propublica.org/feeds/propublica/main", site: "https://www.propublica.org", headlinesCount: 5, scopes: ["national"] },
      { name: "Al Jazeera", rss: "https://www.aljazeera.com/xml/rss/all.xml", site: "https://www.aljazeera.com", headlinesCount: 5, scopes: ["international"] },
      { name: "Hacker News", rss: "https://news.ycombinator.com/rss", site: "https://news.ycombinator.com", headlinesCount: 5, scopes: ["national"] },
      { name: "Deutsche Welle", rss: "https://rss.dw.com/rdf/rss-en-all", site: "https://www.dw.com", headlinesCount: 5, scopes: ["international"] },
      { name: "Nature", rss: "https://www.nature.com/nature.rss", site: "https://www.nature.com", headlinesCount: 5, scopes: ["international"] },
      { name: "The Conversation (Global)", rss: "https://theconversation.com/global/articles.atom", site: "https://theconversation.com/global", headlinesCount: 5, scopes: ["international"] }
    ],

    stocks: [
      { symbol: "NASDAQ:CLOV", label: "Clover Health Investments Corp" },
      { symbol: "NASDAQ:FNIPX", label: "Fidelity Freedom Index 2035 Fund Premier Class" },
      { symbol: "NASDAQ:TLYIX", label: "Nuveen Lifecycle Index 2035 Fund R6" },
      { symbol: "NASDAQ:VIIIX", label: "Vanguard Institutional Index Fund Institutional Plus" },
      { symbol: "NASDAQ:VSMPX", label: "Vanguard Total Stock Market Index Fund Institutional Plus" },
    ]
  };

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // Migrate old RSS feeds to working alternatives
  function migrateWidgets(widgets) {
    if (!Array.isArray(widgets)) return clone(DEFAULTS.widgets);
    return widgets;
  }

  function normalizeConfig(cfg) {
    const out = { ...clone(DEFAULTS), ...(cfg || {}) };

    out.theme = out.theme === "light" ? "light" : "dark";
    out.density = ["compact", "cozy", "comfortable"].includes(out.density) ? out.density : "comfortable";
    out.renderMode = ["smooth", "stable"].includes(String(out.renderMode || "").toLowerCase())
      ? String(out.renderMode).toLowerCase()
      : DEFAULTS.renderMode;
    out.startupPage = ["news", "weather", "stocks"].includes(out.startupPage) ? out.startupPage : DEFAULTS.startupPage;
    out.stocksNewsMode = ["watchlist", "major"].includes(out.stocksNewsMode) ? out.stocksNewsMode : DEFAULTS.stocksNewsMode;

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
    const defaultScopesByRss = {};
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
          site: String(s?.site || "").trim() || "https://www.reddit.com",
          headlinesCount: Math.max(1, Math.min(20, Number(s?.headlinesCount || 8)))
        };
      }).filter(s => s.rss).slice(0, 8);
    }
    out.localSources = normalizeSourceList(out.localSources);
    out.regionalSources = normalizeSourceList(out.regionalSources);
    // Ids only — anything else in saved config is discarded rather than
    // trusted, since these become tab names and scope keys.
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
        ...MARKET_INDEX_DEFS
          .filter((item) => !seenKeys.has(item.key))
          .map((item) => ({ key: item.key, visible: true }))
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
      .replace(/\s+/g, " ")
      .trim();
  }

  function faviconUrl(site) {
    try {
      const u = new URL(site);
      // Google's favicon service: 32x32 PNG, cached/optimized, gracefully
      // returns a generic globe icon for sites without a favicon. Avoids
      // 404s and the 5-22 KB per-source /favicon.ico downloads PSI flags.
      return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
    } catch {
      return "";
    }
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
  const RSS_REQUEST_TIMEOUT_MS = 9000;
  // Google News goes through one extra hop (our CF worker -> Google), and
  // Google itself rate-limits / 503's intermittently. 4500ms was too tight:
  // any worker cold start or upstream slowdown blew past the timeout. 8s
  // covers the realistic worst-case while still failing fast enough that
  // we move on to the fallback proxy.
  const RSS_REQUEST_TIMEOUT_FAST_MS = 8000;
  const RSS_STALE_CACHE_MAX_AGE_MS = 30 * 60 * 1000; // serve stale for up to 30 minutes on failures
  const RSS_ROUTE_COOLDOWN_BASE_MS = 8000;
  const RSS_ROUTE_COOLDOWN_MAX_MS = 60000;
  const rssInFlight = new Map();
  const rssRouteCooldowns = new Map();
  const rssLastSuccessAt = new Map();

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

  function getCachedStale(key, maxStaleAgeMs = RSS_STALE_CACHE_MAX_AGE_MS) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL + maxStaleAgeMs) {
      return null;
    }
    return entry.data;
  }

  function getRssRouteKey(feedUrl, proxyBase) {
    return `${proxyBase}|${feedUrl}`;
  }

  function getRssFeedVariants(rssUrl) {
    const feeds = [rssUrl];
    if (rssUrl.includes("rsshub.app")) {
      feeds.push(rssUrl.replace("rsshub.app", "rss.shab.fun"));
    }
    return feeds;
  }

  function isGoogleNewsRssUrl(rssUrl) {
    try {
      const url = new URL(rssUrl);
      return url.hostname.includes("news.google.com") && url.pathname.includes("/rss/");
    } catch {
      return false;
    }
  }

  function getRssProxyFallbacksForFeed(feedUrl) {
    // Google News feeds are generally reachable through the primary worker and one fallback.
    // Keeping this list short avoids long serial timeouts that block widget rendering.
    if (isGoogleNewsRssUrl(feedUrl)) {
      return RSS_PROXY_FALLBACKS.slice(0, 2);
    }
    return RSS_PROXY_FALLBACKS;
  }

  function getRssRequestTimeoutMs(feedUrl) {
    return isGoogleNewsRssUrl(feedUrl) ? RSS_REQUEST_TIMEOUT_FAST_MS : RSS_REQUEST_TIMEOUT_MS;
  }

  function getRssRouteCooldownMs(routeKey) {
    const cooldown = rssRouteCooldowns.get(routeKey);
    if (!cooldown) return 0;
    const remaining = cooldown.until - Date.now();
    if (remaining <= 0) {
      rssRouteCooldowns.delete(routeKey);
      return 0;
    }
    return remaining;
  }

  function getRssCooldownStatus(rssUrl) {
    const feedUrls = getRssFeedVariants(rssUrl);
    let totalRoutes = 0;
    let routesOnCooldown = 0;
    let minRetryMs = Infinity;

    for (const feedUrl of feedUrls) {
      const proxiesToTry = getRssProxyFallbacksForFeed(feedUrl);
      for (const proxyBase of proxiesToTry) {
        totalRoutes += 1;
        const routeKey = getRssRouteKey(feedUrl, proxyBase);
        const cooldownMs = getRssRouteCooldownMs(routeKey);
        if (cooldownMs > 0) {
          routesOnCooldown += 1;
          minRetryMs = Math.min(minRetryMs, cooldownMs);
        }
      }
    }

    const retryInMs = (totalRoutes > 0 && routesOnCooldown === totalRoutes && Number.isFinite(minRetryMs))
      ? minRetryMs
      : 0;

    return {
      retryInMs,
      retryInSec: retryInMs > 0 ? Math.ceil(retryInMs / 1000) : 0,
      routesOnCooldown,
      totalRoutes
    };
  }

  function noteRssFeedSuccess(rssUrl) {
    if (!rssUrl) return;
    rssLastSuccessAt.set(rssUrl, Date.now());
  }

  function getRssLastSuccessAgeMs(rssUrl) {
    if (!rssUrl) return null;
    const ts = rssLastSuccessAt.get(rssUrl);
    if (!ts) return null;
    return Math.max(0, Date.now() - ts);
  }

  function noteRssRouteFailure(routeKey, error) {
    const msg = String(error?.message || "");
    const shouldBackoff = /503|timeout|timed out|network|failed to fetch/i.test(msg);
    if (!shouldBackoff) return;

    const prev = rssRouteCooldowns.get(routeKey);
    const failCount = Math.min((prev?.failCount || 0) + 1, 5);
    const waitMs = Math.min(RSS_ROUTE_COOLDOWN_BASE_MS * (2 ** (failCount - 1)), RSS_ROUTE_COOLDOWN_MAX_MS);
    rssRouteCooldowns.set(routeKey, { failCount, until: Date.now() + waitMs });
  }

  function noteRssRouteSuccess(routeKey) {
    rssRouteCooldowns.delete(routeKey);
  }

  function clearRssCache() {
    // Clear all RSS cache entries
    for (let key of cache.keys()) {
      if (key.startsWith("rss:") || key.startsWith("newsapi:")) {
        cache.delete(key);
      }
    }
    rssInFlight.clear();
    rssRouteCooldowns.clear();
    rssLastSuccessAt.clear();
  }

  // Rate-limit tracking for API calls
  function getRateLimits() {
    try {
      const raw = localStorage.getItem("jas_rate_limits_v1");
      return raw ? JSON.parse(raw) : {
        newsapi: { remaining: 100, limit: 100, resetTime: Date.now() + 86400000 },
        gnews: { remaining: 100, limit: 100, resetTime: Date.now() + 86400000 },
        mediastack: { remaining: 999, limit: 1000, resetTime: Date.now() + 2592000000 } // 30 days
      };
    } catch {
      return {};
    }
  }

  function updateRateLimit(apiName, remainingHeader, limitHeader) {
    try {
      const limits = getRateLimits();
      if (!limits[apiName]) limits[apiName] = { remaining: 999, limit: 1000, resetTime: Date.now() + 86400000 };

      if (remainingHeader) limits[apiName].remaining = parseInt(remainingHeader) || limits[apiName].remaining;
      if (limitHeader) limits[apiName].limit = parseInt(limitHeader) || limits[apiName].limit;

      localStorage.setItem("jas_rate_limits_v1", JSON.stringify(limits));
      console.log(`[${apiName}] Rate limit: ${limits[apiName].remaining}/${limits[apiName].limit}`);
      return limits[apiName];
    } catch {
      return null;
    }
  }

  function getAvailableNewsApis() {
    const limits = getRateLimits();
    return [
      { name: "newsapi", remaining: limits.newsapi?.remaining || 0, key: NEWS_API_KEY },
      { name: "gnews", remaining: limits.gnews?.remaining || 0, key: GNEWS_API_KEY },
      { name: "mediastack", remaining: limits.mediastack?.remaining || 0, key: MEDIASTACK_API_KEY }
    ]
      .filter(api => api.key && api.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining); // Sort by most remaining first
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

  async function fetchNewsApiItems(domain, limit = 10, useCache = true) {
    if (!NEWS_API_KEY) {
      console.warn("NewsAPI key not configured");
      return [];
    }

    const cacheKey = `newsapi:${domain}:${limit}`;

    if (useCache) {
      const cached = getCached(cacheKey);
      if (cached) return cached;
    }

    try {
      // Try using the /v2/everything endpoint with proper headers
      const url = `https://newsapi.org/v2/everything?domains=${domain}&pageSize=${limit}&sortBy=publishedAt&language=en`;
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        headers: {
          'X-Api-Key': NEWS_API_KEY
        }
      });

      // Track rate limits from response headers
      updateRateLimit("newsapi", res.headers.get("X-RateLimit-Remaining"), res.headers.get("X-RateLimit-Limit"));

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`NewsAPI error (${res.status}):`, errorText);
        throw new Error(`NewsAPI request failed: ${res.status}`);
      }

      const data = await res.json();

      if (data.status !== "ok") {
        throw new Error(data.message || "NewsAPI error");
      }

      const result = (data.articles || []).slice(0, limit).map(article => ({
        title: article.title || "Untitled",
        url: article.url || "",
        pubDate: article.publishedAt || "",
        desc: article.description || "",
        image: article.urlToImage || ""
      }));

      if (useCache && result.length > 0) {
        setCached(cacheKey, result);
      }

      return result;
    } catch (error) {
      handleError(error, "NewsAPI Fetch");
      return [];
    }
  }

  async function fetchGNewsItems(query, limit = 10, useCache = true) {
    if (!GNEWS_API_KEY) {
      return [];
    }

    const cacheKey = `gnews:${query}:${limit}`;

    if (useCache) {
      const cached = getCached(cacheKey);
      if (cached) return cached;
    }

    try {
      const gNewsUrl = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&max=${limit}&sortby=publishedAt&token=${GNEWS_API_KEY}`;
      const url = `https://corsproxy.io/?${encodeURIComponent(gNewsUrl)}`;
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000)
      });

      updateRateLimit("gnews", res.headers.get("X-RateLimit-Remaining"), res.headers.get("X-RateLimit-Limit"));

      if (!res.ok) throw new Error(`GNews error: ${res.status}`);

      const data = await res.json();

      const result = (data.articles || []).slice(0, limit).map(article => ({
        title: article.title || "Untitled",
        url: article.url || "",
        pubDate: article.publishedAt || "",
        desc: article.description || "",
        image: article.image || ""
      }));

      if (useCache && result.length > 0) {
        setCached(cacheKey, result);
      }

      return result;
    } catch (error) {
      handleError(error, "GNews Fetch");
      return [];
    }
  }

  async function fetchMediaStackItems(keywords, limit = 10, useCache = true) {
    if (!MEDIASTACK_API_KEY) {
      return [];
    }

    const cacheKey = `mediastack:${keywords}:${limit}`;

    if (useCache) {
      const cached = getCached(cacheKey);
      if (cached) return cached;
    }

    try {
      const url = `https://api.mediastack.com/v1/news?keywords=${encodeURIComponent(keywords)}&limit=${limit}&sort=published_desc&access_key=${MEDIASTACK_API_KEY}`;
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000)
      });

      updateRateLimit("mediastack", res.headers.get("X-RateLimit-Remaining"), res.headers.get("X-RateLimit-Limit"));

      if (!res.ok) throw new Error(`MediaStack error: ${res.status}`);

      const data = await res.json();

      const result = (data.data || []).slice(0, limit).map(article => ({
        title: article.title || "Untitled",
        url: article.url || "",
        pubDate: article.published_at || "",
        desc: article.description || "",
        image: article.image || ""
      }));

      if (useCache && result.length > 0) {
        setCached(cacheKey, result);
      }

      return result;
    } catch (error) {
      handleError(error, "MediaStack Fetch");
      return [];
    }
  }

  function annotateNewsItems(items, sourceLabel, isFallback) {
    return (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      _newsSourceLabel: sourceLabel,
      _newsFallback: isFallback === true
    }));
  }

  // Inject missing xmlns declarations for namespace prefixes that show up in
  // element names but are never declared on the <rss>/<feed> root. Defensive
  // patch for malformed publisher RSS — e.g. Bridge Michigan's WordPress
  // plugin emits <media:content> elements without xmlns:media on root, which
  // causes browser DOMParser to reject the whole document. Common prefixes
  // and their canonical URIs are listed below; if a feed introduces a new
  // prefix not in the table, the parse can still fail and we surface it.
  function repairFeedNamespaces(xmlText) {
    const KNOWN_NAMESPACES = {
      media: "http://search.yahoo.com/mrss/",
      content: "http://purl.org/rss/1.0/modules/content/",
      dc: "http://purl.org/dc/elements/1.1/",
      atom: "http://www.w3.org/2005/Atom",
      sy: "http://purl.org/rss/1.0/modules/syndication/",
      slash: "http://purl.org/rss/1.0/modules/slash/",
      wfw: "http://wellformedweb.org/CommentAPI/",
      itunes: "http://www.itunes.com/dtds/podcast-1.0.dtd",
      georss: "http://www.georss.org/georss"
    };
    // Find the root <rss> or <feed> opening tag.
    const rootMatch = xmlText.match(/<(rss|feed)(\s[^>]*)?>/i);
    if (!rootMatch) return xmlText;
    const rootTag = rootMatch[0];
    const rootName = rootMatch[1];
    // Collect prefixes the root already declares.
    const declared = new Set();
    const declRe = /xmlns:([A-Za-z_][\w.-]*)\s*=\s*['"][^'"]+['"]/g;
    for (let m; (m = declRe.exec(rootTag));) declared.add(m[1]);
    // Find every prefix actually used as an element-name prefix in the body.
    const used = new Set();
    const usageRe = /<\/?([A-Za-z_][\w.-]*):[A-Za-z_]/g;
    for (let m; (m = usageRe.exec(xmlText));) used.add(m[1]);
    // Anything used + known + not-already-declared = needs injection.
    const missing = [...used].filter(p => KNOWN_NAMESPACES[p] && !declared.has(p));
    if (missing.length === 0) return xmlText;
    const additions = missing.map(p => ` xmlns:${p}="${KNOWN_NAMESPACES[p]}"`).join("");
    // Append the declarations inside the opening root tag (before its `>`).
    const fixedRoot = rootTag.replace(/(\s*)>$/, additions + "$1>");
    return xmlText.replace(rootTag, fixedRoot);
  }

  function getGoogleNewsSearchQuery(rssUrl) {
    try {
      const url = new URL(rssUrl);
      if (!url.hostname.includes("news.google.com") || !url.pathname.includes("/rss/search")) {
        return "";
      }
      return String(url.searchParams.get("q") || "").trim();
    } catch {
      return "";
    }
  }

  async function fetchGoogleNewsFallbackItems(rssUrl, limit = 10, useCache = true) {
    const rawQuery = getGoogleNewsSearchQuery(rssUrl);
    if (!rawQuery) return [];

    const query = decodeURIComponent(rawQuery).replace(/\+/g, " ").trim();
    if (!query) return [];

    // API fallbacks are stricter than RSS query syntax; normalize symbol-heavy search text.
    const apiQuery = query
      .replace(/\b[A-Z]{1,8}:[A-Z0-9._-]+\b/g, " ")
      .replace(/["'`]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

    const fallbackQuery = apiQuery || query;

    let items = await fetchGNewsItems(fallbackQuery, limit, useCache);
    if (items.length > 0) return annotateNewsItems(items, "Fallback news source in use", true);

    items = await fetchMediaStackItems(fallbackQuery, limit, useCache);
    return annotateNewsItems(items, "Fallback news source in use", true);
  }

  async function fetchRssItems(rssUrl, limit = 10, useCache = true) {
    const cacheKey = `rss:${rssUrl}:${limit}`;

    if (useCache) {
      const cached = getCached(cacheKey);
      if (cached) return cached;
    }

    const inFlightKey = `${cacheKey}:${useCache ? "cache" : "nocache"}`;
    if (rssInFlight.has(inFlightKey)) {
      return rssInFlight.get(inFlightKey);
    }

    const request = (async () => {

      // Try primary feed, then fallback to backup RSSHub if using RSSHub
      const feedsToTry = getRssFeedVariants(rssUrl);

      // Hosts whose CDN/origin redirects to auth or 4xx/5xx when an unknown
      // query param is present. For these feeds we skip the cache-buster
      // and rely on the proxy's own cache semantics. Past offenders: Bridge
      // Michigan (303 to canonical feed only when query is empty), Nature
      // (303 to idp.nature.com when an unrecognized param is set), and
      // Google News RSS (503 when its search URL carries an unknown param,
      // which broke both the stocks "market news" and weather news widgets).
      const NO_CACHE_BUST_HOSTS = new Set([
        "www.nature.com", "nature.com",
        "news.google.com"
      ]);
      const skipCacheBust = (url) => {
        try { return NO_CACHE_BUST_HOSTS.has(new URL(url).host); }
        catch { return false; }
      };

      for (let feedUrl of feedsToTry) {
        const bustUrl = skipCacheBust(feedUrl)
          ? feedUrl
          : (feedUrl.includes("?") ? feedUrl + "&t=" + Date.now() : feedUrl + "?t=" + Date.now());
        const proxiesToTry = getRssProxyFallbacksForFeed(feedUrl);
        const requestTimeoutMs = getRssRequestTimeoutMs(feedUrl);

        for (let proxyBase of proxiesToTry) {
          const routeKey = getRssRouteKey(feedUrl, proxyBase);
          const cooldownMs = getRssRouteCooldownMs(routeKey);
          if (cooldownMs > 0) {
            continue;
          }

          try {
            const proxied = proxyBase + encodeURIComponent(bustUrl);
            const res = await fetch(proxied, { cache: "no-store", signal: timeoutSignal(requestTimeoutMs) });

            if (!res.ok) {
              throw new Error(`Failed to fetch RSS feed: ${res.status} ${res.statusText}`);
            }

            const xmlText = await res.text();
            // Repair common feed bugs before parsing. Some publisher plugins
            // (WordPress Media RSS plugin, e.g. Bridge Michigan) emit
            // <media:content> / <media:thumbnail> elements without ever
            // declaring xmlns:media on the <rss> root — that's malformed XML
            // and browser DOMParser rejects the whole document, returning
            // zero items. Inject the standard namespace if it's missing.
            const repairedXmlText = repairFeedNamespaces(xmlText);
            const xml = new DOMParser().parseFromString(repairedXmlText, "text/xml");

            const parseError = xml.querySelector("parsererror");
            if (parseError) {
              throw new Error("Invalid RSS feed format");
            }

            // Use getElementsByTagName instead of querySelectorAll: in strict
            // XML mode CSS selectors only match elements in the null namespace,
            // so feeds with a default xmlns (RSS 1.0/RDF like Nature & DW, or
            // Atom feeds) return zero items via querySelectorAll. getElementsByTagName
            // matches by qualified name regardless of namespace.
            let items = Array.from(xml.getElementsByTagName("item"));
            if (items.length === 0) items = Array.from(xml.getElementsByTagName("entry"));

            const firstText = (parent, ...tags) => {
              for (const t of tags) {
                const el = parent.getElementsByTagName(t)?.[0];
                if (el && el.textContent) return el.textContent;
              }
              return "";
            };

            const result = annotateNewsItems(items.slice(0, limit).map(it => {
              const title = (firstText(it, "title", "dc:title") || "Untitled").trim();
              const linkNode = it.getElementsByTagName("link")?.[0];
              const link = (linkNode?.getAttribute("href") || linkNode?.textContent || "").trim();
              const pubDate = firstText(it, "pubDate", "updated", "published", "dc:date").trim();

              const descRaw = firstText(it, "description", "content:encoded", "content", "summary").trim();

              const desc = stripTags(descRaw).slice(0, 240);

              let image = null;
              const mediaContentNode = it.getElementsByTagName("media:content")?.[0];
              const mediaThumbNode = it.getElementsByTagName("media:thumbnail")?.[0];
              const mediaContent = it.querySelector("media\\:content");
              if (mediaContent || mediaContentNode) {
                const node = mediaContent || mediaContentNode;
                const mediaUrl = node.getAttribute("url") || "";
                const mediaType = String(node.getAttribute("type") || "").toLowerCase();
                const mediaMedium = String(node.getAttribute("medium") || "").toLowerCase();
                if (mediaUrl && (mediaType.includes("image") || mediaMedium === "image" || (!mediaType && !mediaMedium))) {
                  image = mediaUrl;
                }
              } else {
                const mediaThumb = it.querySelector("media\\:thumbnail") || mediaThumbNode;
                if (mediaThumb) image = mediaThumb.getAttribute("url");
              }
              if (!image) {
                const enclosure = it.querySelector("enclosure");
                if (enclosure && enclosure.getAttribute("type")?.includes("image")) {
                  image = enclosure.getAttribute("url");
                }
              }
              if (!image) {
                const imageTag = it.querySelector("image");
                if (imageTag) image = imageTag.textContent?.trim();
              }
              if (!image && descRaw) {
                const imgMatch = descRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
                if (imgMatch && imgMatch[1]) {
                  image = imgMatch[1].trim();
                }
                if (!image) {
                  const decodedDesc = descRaw
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&amp;/g, "&");
                  const decodedMatch = decodedDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
                  if (decodedMatch && decodedMatch[1]) {
                    image = decodedMatch[1].trim();
                  }
                }
              }
              if (image && image.startsWith("//")) {
                image = `https:${image}`;
              }

              return { title, url: normalizeOutboundLink(link), pubDate, desc, image };
            }), proxyBase === RSS_PROXY_BASE ? "" : "Fallback news source in use", proxyBase !== RSS_PROXY_BASE);

            if (useCache && result.length > 0) {
              setCached(cacheKey, result);
            }

            if (result.length > 0) {
              noteRssFeedSuccess(rssUrl);
            }

            noteRssRouteSuccess(routeKey);
            return result;
          } catch (error) {
            noteRssRouteFailure(routeKey, error);
            console.warn(`RSS fetch failed for ${feedUrl} via ${proxyBase}:`, error.message);
          }
        }
      }

      const fallbackItems = await fetchGoogleNewsFallbackItems(rssUrl, limit, useCache);
      if (useCache && fallbackItems.length > 0) {
        setCached(cacheKey, fallbackItems);
      }
      if (fallbackItems.length > 0) {
        noteRssFeedSuccess(rssUrl);
        return fallbackItems;
      }

      if (useCache) {
        const staleCached = getCachedStale(cacheKey);
        if (staleCached && staleCached.length > 0) {
          return annotateNewsItems(staleCached, "Showing cached news (stale)", true);
        }
      }

      // Empty result is the documented fallback (callers handle [] gracefully and
      // render "no news"). Use console.debug so it stays accessible at Verbose level
      // without polluting the default console — most "all attempts failed" cases are
      // expected (no news for obscure tickers), not failures worth surfacing.
      console.debug(`[RSS Fetch] No items for ${rssUrl} after all proxy fallbacks`);
      return [];
    })();

    rssInFlight.set(inFlightKey, request);
    try {
      return await request;
    } finally {
      rssInFlight.delete(inFlightKey);
    }
  }

  // Unified news fetch - automatically uses NewsAPI or RSS based on URL format
  async function fetchNewsItems(source, limit = 10, useCache = true) {
    // Handle GNews queries (legacy support, auto-converts to RSS)
    if (source.startsWith("gnews:")) {
      // Already handled by migration - shouldn't reach here
      return fetchRssItems(source, limit, useCache);
    }

    // Handle NewsAPI queries (legacy support, auto-converts to RSS)
    if (source.startsWith("newsapi:")) {
      // Already handled by migration - shouldn't reach here
      return fetchRssItems(source, limit, useCache);
    }

    // Otherwise use RSS (all sources are now RSS)
    return fetchRssItems(source, limit, useCache);
  }

  async function syncTimezoneFromZip(cfg) {
    try {
      const zip = String(cfg?.zipCode || "").trim();
      if (!/^\d{5}$/.test(zip)) return cfg;

      if (cfg?._zipTz === zip && cfg.timezone) return cfg;

      const loc = await geocodeZip(zip);
      const wx = await fetchCurrentWeather(loc.lat, loc.lon);
      const tz = wx?.timezone;

      if (tz && tz !== cfg.timezone) {
        return saveConfig({ ...cfg, timezone: tz, _zipTz: zip });
      }
      if (tz && tz === cfg.timezone && cfg?._zipTz !== zip) {
        return saveConfig({ ...cfg, _zipTz: zip });
      }
      if (!cfg.timezone) return saveConfig({ ...cfg, timezone: DEFAULTS.timezone });
      return cfg;
    } catch {
      return cfg;
    }
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
        <a href="index.html" class="brand" aria-label="Home">
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
        : `<a class="btn btnMain" href="index.html">News</a>`}
            
              ${active("weather")
        ? `<span class="btn btnMain btnActive btnDisabled" aria-current="page">Weather</span>`
        : `<a class="btn btnMain" href="weather.html">Weather</a>`}
            
              ${active("stocks")
        ? `<span class="btn btnMain btnActive btnDisabled" aria-current="page">Stocks</span>`
        : `<a class="btn btnMain" href="stocks.html">Stocks</a>`}
            </div>

            <div class="navSettings">
              ${active("settings")
        ? `<span class="btn btnSettings btnActive btnDisabled" aria-current="page">Settings</span>`
        : `<a class="btn btnSettings" href="settings.html">Settings</a>`}
            </div>
          </nav>
        </div>

        <div class="topRight">
          <a class="topClockLink" href="settings.html" aria-label="Open settings">
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
      window.location.replace(cfg.startupPage + ".html");
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

  // Stock price fetching - uses multiple free APIs with fallback
  async function fetchStockPrice(symbol) {
    const cacheKey = `stock:${symbol}`;
    const cached = getCached(cacheKey);
    if (cached && Number.isFinite(Number(cached.price)) && Number(cached.price) > 0) return cached;

    try {
      // Normalize symbol: remove exchange prefix like NASDAQ:, BITSTAMP:, etc.
      const baseSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;

      // Try Finnhub first (if API key is configured)
      if (STOCK_API_KEYS.finnhub) {
        const result = await fetchStockPriceFromFinnhub(baseSymbol);
        if (result) {
          setCached(cacheKey, result);
          return result;
        }
      }

      // Try Alpha Vantage (if API key is configured)
      if (STOCK_API_KEYS.alphaVantage) {
        const result = await fetchStockPriceFromAlphaVantage(baseSymbol);
        if (result) {
          setCached(cacheKey, result);
          return result;
        }
      }

      // Try IEX Cloud (if API key is configured)
      if (STOCK_API_KEYS.iex) {
        const result = await fetchStockPriceFromIex(baseSymbol);
        if (result) {
          setCached(cacheKey, result);
          return result;
        }
      }

      // Try Twelve Data free endpoint as last resort
      const result = await fetchStockPriceFromTwelveData(baseSymbol);
      if (result) {
        setCached(cacheKey, result);
        return result;
      }

      // Fallback: Yahoo chart endpoint (works for many mutual funds, incl. FNIPX)
      const yahooResult = await fetchStockPriceFromYahooChart(baseSymbol);
      if (yahooResult) {
        setCached(cacheKey, yahooResult);
        return yahooResult;
      }

      // Final fallback (no API key): Stooq end-of-day quote via CORS-friendly relay
      const stooqResult = await fetchStockPriceFromStooq(baseSymbol);
      if (stooqResult) {
        setCached(cacheKey, stooqResult);
        return stooqResult;
      }

      return null;
    } catch (error) {
      handleError(error, "Stock Price Fetch");
      return null;
    }
  }

  async function fetchStockCandles(symbol, options = {}) {
    const resolution = String(options.resolution || "30");
    const days = Number.isFinite(options.days) ? options.days : 5;

    const baseSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;
    const now = Math.floor(Date.now() / 1000);
    const bucket = Math.max(1, Number(resolution)) * 60;
    const to = Math.floor(now / bucket) * bucket;
    const from = to - Math.max(1, days) * 24 * 60 * 60;
    const cacheKey = `candles:${baseSymbol}:${resolution}:${from}:${to}`;
    const cached = getCached(cacheKey);
    if (cached) return { data: cached, error: null, source: "cache" };

    let finnhubError = "";
    if (STOCK_API_KEYS.finnhub) {
      const res = await fetchStockCandlesFromFinnhub(baseSymbol, resolution, from, to);
      if (res.data) {
        setCached(cacheKey, res.data);
        return { data: res.data, error: null, source: "finnhub" };
      }
      finnhubError = res.error || "Finnhub: no data";
    } else {
      finnhubError = "Finnhub key not configured";
    }

    const tdRes = await fetchStockCandlesFromTwelveData(baseSymbol, resolution, days);
    if (tdRes.data) {
      setCached(cacheKey, tdRes.data);
      return { data: tdRes.data, error: null, source: "twelvedata" };
    }

    const yahooRes = await fetchStockCandlesFromYahooChart(baseSymbol, days);
    if (yahooRes.data) {
      setCached(cacheKey, yahooRes.data);
      return { data: yahooRes.data, error: null, source: "yahoo" };
    }

    const stooqRes = await fetchStockCandlesFromStooq(baseSymbol, days);
    if (stooqRes.data) {
      setCached(cacheKey, stooqRes.data);
      return { data: stooqRes.data, error: null, source: "stooq" };
    }

    const twelveError = tdRes.error || "Twelve Data: no data";
    const yahooError = yahooRes.error || "Yahoo: no data";
    const stooqError = stooqRes.error || "Stooq: no data";
    return { data: null, error: `${finnhubError}; ${twelveError}; ${yahooError}; ${stooqError}`, source: null };
  }

  async function fetchStockPriceFromYahooChart(symbol) {
    try {
      const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
      const proxyUrl = `${RSS_PROXY_BASE}${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl, { cache: "no-store" });
      if (!res.ok) return null;

      const payload = await res.json();
      const result = payload?.chart?.result?.[0];
      if (!result) return null;

      const closes = result?.indicators?.quote?.[0]?.close;
      if (!Array.isArray(closes)) return null;

      const finiteCloses = closes.filter(v => Number.isFinite(Number(v))).map(v => Number(v));
      if (finiteCloses.length === 0) return null;

      const last = finiteCloses[finiteCloses.length - 1];
      const prev = finiteCloses.length >= 2 ? finiteCloses[finiteCloses.length - 2] : null;
      const change = Number.isFinite(prev) ? (last - prev) : 0;
      const changePercent = (Number.isFinite(prev) && prev !== 0) ? (change / prev) * 100 : 0;

      const meta = result.meta || {};
      const hi = Number(meta.regularMarketDayHigh);
      const lo = Number(meta.regularMarketDayLow);
      const regular = Number(meta.regularMarketPrice);

      return {
        symbol,
        price: Number.isFinite(regular) && regular > 0 ? regular : last,
        change,
        changePercent,
        previousClose: Number.isFinite(prev) ? prev : null,
        high: Number.isFinite(hi) ? hi : null,
        low: Number.isFinite(lo) ? lo : null,
        timestamp: new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  async function fetchStockCandlesFromYahooChart(symbol, days) {
    try {
      const range = Math.max(1, Number(days) || 5) <= 5 ? "1mo" : "3mo";
      const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
      const proxyUrl = `${RSS_PROXY_BASE}${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl, { cache: "no-store" });
      if (!res.ok) return { data: null, error: `Yahoo error (${res.status})` };

      const payload = await res.json();
      const closes = payload?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if (!Array.isArray(closes)) return { data: null, error: "Yahoo: no data" };

      const points = closes.filter(v => Number.isFinite(Number(v))).map(v => Number(v));
      if (points.length < 2) return { data: null, error: "Yahoo: invalid data" };

      const desired = Math.max(5, Math.min(60, Math.round((Number(days) || 5) * 2)));
      return { data: points.slice(-desired), error: null };
    } catch (err) {
      return { data: null, error: `Yahoo fetch error (${err?.message || "unknown"})` };
    }
  }

  function normalizeSymbolForStooq(symbol) {
    const base = String(symbol || "").trim().toUpperCase();
    if (!base) return "";
    const cleaned = base.replace(/\./g, "-");
    return `${cleaned}.US`;
  }

  function shouldSkipFinnhubSymbol(symbol) {
    const normalized = String(symbol || "").trim().toUpperCase();
    if (!normalized) return true;

    const base = normalized.includes(":") ? normalized.split(":").pop() : normalized;

    // Finnhub free plans commonly reject many index/futures/forex synthetic symbols.
    if (base.startsWith("^") || base.includes("=") || base.includes("/")) {
      return true;
    }

    // Mutual funds and similar instruments commonly end in X and usually 403 on Finnhub.
    return base.length >= 5 && base.endsWith("X");
  }

  async function fetchStockPriceFromStooq(symbol) {
    try {
      const stooqSymbol = normalizeSymbolForStooq(symbol);
      if (!stooqSymbol) return null;

      const targetUrl = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
      const proxyUrl = `${RSS_PROXY_BASE}${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl, { cache: "no-store" });
      if (!res.ok) return null;

      const csv = (await res.text()).trim();
      const rows = csv.split(/\r?\n/);
      if (rows.length < 2) return null;

      const [sym, , , open, high, low, close] = rows[1].split(",").map(v => String(v || "").replace(/^"|"$/g, "").trim());
      const price = Number(close);
      if (!Number.isFinite(price) || price <= 0) return null;

      const openNum = Number(open);
      const highNum = Number(high);
      const lowNum = Number(low);
      const change = Number.isFinite(openNum) ? (price - openNum) : 0;
      const changePercent = (Number.isFinite(openNum) && openNum !== 0) ? (change / openNum) * 100 : 0;

      return {
        symbol: sym || symbol,
        price,
        change,
        changePercent,
        previousClose: Number.isFinite(openNum) ? openNum : null,
        open: Number.isFinite(openNum) ? openNum : null,
        high: Number.isFinite(highNum) ? highNum : null,
        low: Number.isFinite(lowNum) ? lowNum : null,
        timestamp: new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  async function fetchStockCandlesFromStooq(symbol, days) {
    try {
      const stooqSymbol = normalizeSymbolForStooq(symbol);
      if (!stooqSymbol) return { data: null, error: "Stooq symbol invalid" };

      const targetUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
      const proxyUrl = `${RSS_PROXY_BASE}${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl, { cache: "no-store" });
      if (!res.ok) return { data: null, error: `Stooq error (${res.status})` };

      const csv = (await res.text()).trim();
      const rows = csv.split(/\r?\n/);
      if (rows.length < 3) return { data: null, error: "Stooq: no data" };

      const closes = rows
        .slice(1)
        .map(line => line.split(",")[4])
        .map(v => Number(String(v || "").replace(/^"|"$/g, "").trim()))
        .filter(v => Number.isFinite(v));

      if (closes.length < 2) return { data: null, error: "Stooq: invalid data" };

      const desired = Math.max(5, Math.min(60, Math.round((Number(days) || 5) * 2)));
      const sliced = closes.slice(-desired);
      return { data: sliced, error: null };
    } catch (err) {
      return { data: null, error: `Stooq fetch error (${err?.message || "unknown"})` };
    }
  }

  async function fetchStockCandlesFromFinnhub(symbol, resolution, from, to) {
    if (shouldSkipFinnhubSymbol(symbol)) {
      return { data: null, error: "Finnhub skipped for unsupported fund symbol" };
    }
    try {
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${STOCK_API_KEYS.finnhub}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) return { data: null, error: "Finnhub unauthorized (401)" };
        if (res.status === 403) return { data: null, error: "Finnhub forbidden (403)" };
        if (res.status === 429) return { data: null, error: "Finnhub rate limit (429)" };
        return { data: null, error: `Finnhub error (${res.status})` };
      }

      const data = await res.json();
      if (data.s !== "ok" || !Array.isArray(data.c) || data.c.length < 2) {
        return { data: null, error: `Finnhub ${data.s || "no_data"}` };
      }

      const maxPoints = 60;
      const step = Math.max(1, Math.floor(data.c.length / maxPoints));
      const compact = data.c.filter((_, i) => i % step === 0);
      return { data: compact, error: null };
    } catch (err) {
      return { data: null, error: `Finnhub fetch error (${err?.message || "unknown"})` };
    }
  }

  async function fetchStockCandlesFromTwelveData(symbol, resolution, days) {
    try {
      const apiKey = STOCK_API_KEYS.twelvedata || "";
      if (!apiKey) return { data: null, error: "Twelve Data key not configured" };

      const interval = Number(resolution) >= 60 ? `${Math.round(Number(resolution) / 60)}h` : `${resolution}min`;
      const outputSize = Math.max(24, Math.min(240, Math.round(days * 24 * 60 / Math.max(1, Number(resolution)))));
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputSize}&apikey=${apiKey}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        return { data: null, error: `Twelve Data error (${res.status})` };
      }

      const data = await res.json();
      if (data?.status === "error") {
        return { data: null, error: `Twelve Data: ${data?.message || "error"}` };
      }

      if (!Array.isArray(data?.values) || data.values.length < 2) {
        return { data: null, error: "Twelve Data: no data" };
      }

      const closes = data.values
        .map(v => Number(v?.close))
        .filter(v => Number.isFinite(v))
        .reverse();

      if (closes.length < 2) return { data: null, error: "Twelve Data: invalid data" };

      const maxPoints = 60;
      const step = Math.max(1, Math.floor(closes.length / maxPoints));
      const compact = closes.filter((_, i) => i % step === 0);
      return { data: compact, error: null };
    } catch (err) {
      return { data: null, error: `Twelve Data fetch error (${err?.message || "unknown"})` };
    }
  }

  // Finnhub API
  async function fetchStockPriceFromFinnhub(symbol) {
    if (shouldSkipFinnhubSymbol(symbol)) {
      return null;
    }
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${STOCK_API_KEYS.finnhub}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        // 403 Forbidden = symbol not supported by Finnhub (e.g. mutual funds)
        // 401 Unauthorized = invalid API key
        // 429 Too Many Requests = rate limit hit
        if (res.status === 403) {
          console.info(`Finnhub: ${symbol} not supported on this plan; trying fallback providers.`);
        } else {
          console.warn(`Finnhub error for ${symbol}: ${res.status}`);
        }
        return null;
      }

      const data = await res.json();
      if (data.error) {
        console.warn(`Finnhub API error for ${symbol}:`, data.error);
        return null;
      }

      const price = Number(data.c);
      if (Number.isFinite(price) && price > 0) {
        const prevClose = Number(data.pc);
        const safePrevClose = Number.isFinite(prevClose) && prevClose > 0 ? prevClose : null;
        const rawChange = Number(data.d);
        const rawChangePercent = Number(data.dp);
        const computedChange = safePrevClose != null ? (price - safePrevClose) : 0;
        const computedPercent = safePrevClose != null ? ((computedChange / safePrevClose) * 100) : 0;

        return {
          symbol,
          price,
          change: Number.isFinite(rawChange) ? rawChange : computedChange,
          changePercent: Number.isFinite(rawChangePercent) ? rawChangePercent : computedPercent,
          previousClose: safePrevClose,
          open: data.o,
          high: data.h,
          low: data.l,
          timestamp: new Date().toISOString()
        };
      }
      return null;
    } catch (err) {
      console.warn(`Finnhub fetch error for ${symbol}:`, err.message);
      return null;
    }
  }

  // Alpha Vantage API
  async function fetchStockPriceFromAlphaVantage(symbol) {
    try {
      const res = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${STOCK_API_KEYS.alphaVantage}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        const quote = data["Global Quote"];
        if (quote && quote["05. price"]) {
          return {
            symbol,
            price: parseFloat(quote["05. price"]),
            change: parseFloat(quote["09. change"]) || 0,
            changePercent: parseFloat(quote["10. change percent"]?.replace('%', '')) || 0,
            previousClose: parseFloat(quote["08. previous close"]),
            timestamp: new Date().toISOString()
          };
        }
      }
    } catch { }
    return null;
  }

  // Try IEX Cloud free tier
  async function fetchStockPriceFromIex(symbol) {
    try {
      if (!STOCK_API_KEYS.iex) {
        return null; // API key not configured
      }
      const res = await fetch(
        `https://cloud.iexapis.com/stable/quote/${encodeURIComponent(symbol)}?token=${STOCK_API_KEYS.iex}&displayPercent=true`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.latestPrice) {
          return {
            symbol,
            price: data.latestPrice,
            change: data.change || 0,
            changePercent: data.changePercent || 0,
            previousClose: data.previousClose,
            open: data.open,
            high: data.high,
            low: data.low,
            timestamp: new Date(data.latestUpdate).toISOString()
          };
        }
      }
    } catch { }
    return null;
  }

  // Try Twelve Data free endpoint
  async function fetchStockPriceFromTwelveData(symbol) {
    try {
      const apiKey = STOCK_API_KEYS.twelvedata || "demo";
      const res = await fetch(
        `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      if (data?.status === "error") {
        return null;
      }
      const price = Number(data.price ?? data.close);
      if (Number.isFinite(price) && price > 0) {
        const rawChange = Number(data.change);
        const change = Number.isFinite(rawChange)
          ? rawChange
          : (Number.isFinite(Number(data.previous_close)) ? (price - Number(data.previous_close)) : 0);
        const rawPct = Number(data.percent_change);
        const changePercent = Number.isFinite(rawPct)
          ? rawPct
          : ((Number.isFinite(Number(data.previous_close)) && Number(data.previous_close) !== 0)
            ? (change / Number(data.previous_close)) * 100
            : 0);

        return {
          symbol,
          price,
          change,
          changePercent,
          previousClose: Number.isFinite(Number(data.previous_close)) ? Number(data.previous_close) : null,
          high: Number.isFinite(Number(data.high)) ? Number(data.high) : null,
          low: Number.isFinite(Number(data.low)) ? Number(data.low) : null,
          timestamp: data.timestamp || new Date().toISOString()
        };
      }
    } catch { }
    return null;
  }

  // Popular stocks for building dynamic gainers/losers/movers
  const POPULAR_STOCKS = [
    { symbol: "NVDA", name: "NVIDIA Corp" },
    { symbol: "TSLA", name: "Tesla Inc" },
    { symbol: "META", name: "Meta Platforms" },
    { symbol: "NFLX", name: "Netflix Inc" },
    { symbol: "AMD", name: "Advanced Micro Devices" },
    { symbol: "AAPL", name: "Apple Inc" },
    { symbol: "MSFT", name: "Microsoft Corp" },
    { symbol: "GOOGL", name: "Alphabet Inc" },
    { symbol: "AMZN", name: "Amazon.com Inc" },
    { symbol: "V", name: "Visa Inc" }
  ];

  // Market movers fallback provider (works without a paid key using demo limits).
  const FMP_API_KEY = "demo";

  function parsePercentLike(value) {
    if (value === null || value === undefined) return 0;
    const cleaned = String(value).replace(/[()%+]/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeFmpMover(item) {
    const symbol = String(item?.symbol || "").trim();
    if (!symbol) return null;

    const price = Number(item?.price);
    const change = Number(item?.change);
    const changePercent = parsePercentLike(item?.changesPercentage ?? item?.changePercentage ?? item?.change_percent);

    return {
      symbol,
      name: String(item?.name || symbol).trim() || symbol,
      price: Number.isFinite(price) ? price : 0,
      change: Number.isFinite(change) ? change : 0,
      changePercent: Number.isFinite(changePercent) ? changePercent : 0
    };
  }

  async function fetchFmpMovers(kind, limit) {
    try {
      const route = String(kind || "").trim().toLowerCase();
      if (!["gainers", "losers", "actives"].includes(route)) return null;

      const url = `https://financialmodelingprep.com/api/v3/stock_market/${route}?apikey=${encodeURIComponent(FMP_API_KEY)}`;
      const proxied = `${RSS_PROXY_BASE}${encodeURIComponent(url)}`;
      const res = await fetch(proxied, { cache: "no-store" });
      if (!res.ok) return null;

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;

      const normalized = data
        .map(normalizeFmpMover)
        .filter(Boolean)
        .filter(item => Number.isFinite(item.price) && item.price > 0)
        .slice(0, Math.max(1, Number(limit) || 5));

      return normalized.length > 0 ? normalized : null;
    } catch (err) {
      console.warn(`FMP ${kind} fetch failed:`, err?.message || err);
      return null;
    }
  }

  async function fetchYahooMovers(scrId, limit) {
    try {
      const allowed = new Set(["day_gainers", "day_losers", "most_actives"]);
      const key = String(scrId || "").trim().toLowerCase();
      if (!allowed.has(key)) return null;

      const count = Math.max(1, Math.min(25, Number(limit) || 5));
      const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=${count}&scrIds=${encodeURIComponent(key)}`;
      const proxied = `${RSS_PROXY_BASE}${encodeURIComponent(url)}`;
      const res = await fetch(proxied, { cache: "no-store" });
      if (!res.ok) return null;

      const data = await res.json();
      const quotes = data?.finance?.result?.[0]?.quotes;
      if (!Array.isArray(quotes) || quotes.length === 0) return null;

      const normalized = quotes.map((q) => {
        const symbol = String(q?.symbol || "").trim();
        const price = Number(q?.regularMarketPrice);
        const change = Number(q?.regularMarketChange);
        const changePercent = Number(q?.regularMarketChangePercent);
        if (!symbol || !Number.isFinite(price)) return null;
        return {
          symbol,
          name: String(q?.shortName || q?.longName || symbol).trim() || symbol,
          price,
          change: Number.isFinite(change) ? change : 0,
          changePercent: Number.isFinite(changePercent) ? changePercent : 0
        };
      }).filter(Boolean);

      return normalized.length > 0 ? normalized.slice(0, count) : null;
    } catch (err) {
      console.warn(`Yahoo ${scrId} fetch failed:`, err?.message || err);
      return null;
    }
  }

  function withMoverSource(items, source) {
    return {
      items: Array.isArray(items) ? items : [],
      source: String(source || "unknown")
    };
  }

  // Fetch real market data from Alpha Vantage (TOP_GAINERS endpoint)
  async function fetchStockGainers() {
    const cacheKey = "market:gainers";
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      // Try Alpha Vantage first for real market gainers
      if (STOCK_API_KEYS.alphaVantage) {
        const url = `https://www.alphavantage.co/query?function=TOP_GAINERS&apikey=${STOCK_API_KEYS.alphaVantage}`;
        const res = await fetch(url, { cache: "no-store" });

        if (res.ok) {
          const data = await res.json();
          if (data.top_gainers && Array.isArray(data.top_gainers)) {
            const result = data.top_gainers.slice(0, 5).map(stock => ({
              symbol: stock.ticker,
              name: stock.symbol || stock.ticker,
              price: parseFloat(stock.price) || 0,
              change: parseFloat(stock.change_amount) || 0,
              changePercent: parseFloat(stock.change_percentage?.replace('%', '')) || 0
            }));
            const payload = withMoverSource(result, "alpha-vantage");
            setCached(cacheKey, payload);
            return payload;
          }
        }
      }

      const yahooGainers = await fetchYahooMovers("day_gainers", 5);
      if (yahooGainers && yahooGainers.length > 0) {
        const payload = withMoverSource(yahooGainers, "yahoo");
        setCached(cacheKey, payload);
        return payload;
      }

      // Secondary dynamic source: FMP market gainers list via proxy.
      const fmpGainers = await fetchFmpMovers("gainers", 5);
      if (fmpGainers && fmpGainers.length > 0) {
        const payload = withMoverSource(fmpGainers, "fmp");
        setCached(cacheKey, payload);
        return payload;
      }

      // Fallback to fixed list with real prices
      const pricePromises = POPULAR_STOCKS.map(stock => fetchStockPrice(stock.symbol));
      const prices = await Promise.all(pricePromises);

      const gainers = POPULAR_STOCKS
        .map((stock, i) => ({ ...stock, ...prices[i] }))
        .filter(s => s.price && s.changePercent !== undefined)
        .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))
        .slice(0, 5);

      if (gainers.length > 0) {
        const payload = withMoverSource(gainers, "preset-list");
        setCached(cacheKey, payload);
        return payload;
      }
      return null;
    } catch (err) {
      console.error("Finnhub gainers fetch error:", err.message);
      return null;
    }
  }

  async function fetchStockLosers() {
    const cacheKey = "market:losers";
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      // Try Alpha Vantage first for real market losers
      if (STOCK_API_KEYS.alphaVantage) {
        const url = `https://www.alphavantage.co/query?function=TOP_LOSERS&apikey=${STOCK_API_KEYS.alphaVantage}`;
        const res = await fetch(url, { cache: "no-store" });

        if (res.ok) {
          const data = await res.json();
          if (data.top_losers && Array.isArray(data.top_losers)) {
            const result = data.top_losers.slice(0, 5).map(stock => ({
              symbol: stock.ticker,
              name: stock.symbol || stock.ticker,
              price: parseFloat(stock.price) || 0,
              change: parseFloat(stock.change_amount) || 0,
              changePercent: parseFloat(stock.change_percentage?.replace('%', '')) || 0
            }));
            const payload = withMoverSource(result, "alpha-vantage");
            setCached(cacheKey, payload);
            return payload;
          }
        }
      }

      const yahooLosers = await fetchYahooMovers("day_losers", 5);
      if (yahooLosers && yahooLosers.length > 0) {
        const payload = withMoverSource(yahooLosers, "yahoo");
        setCached(cacheKey, payload);
        return payload;
      }

      // Secondary dynamic source: FMP market losers list via proxy.
      const fmpLosers = await fetchFmpMovers("losers", 5);
      if (fmpLosers && fmpLosers.length > 0) {
        const payload = withMoverSource(fmpLosers, "fmp");
        setCached(cacheKey, payload);
        return payload;
      }

      // Fallback to fixed list with real prices
      const pricePromises = POPULAR_STOCKS.map(stock => fetchStockPrice(stock.symbol));
      const prices = await Promise.all(pricePromises);

      const losers = POPULAR_STOCKS
        .map((stock, i) => ({ ...stock, ...prices[i] }))
        .filter(s => s.price && s.changePercent !== undefined)
        .sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0))
        .slice(0, 5);

      if (losers.length > 0) {
        const payload = withMoverSource(losers, "preset-list");
        setCached(cacheKey, payload);
        return payload;
      }
      return null;
    } catch (err) {
      console.error("Finnhub losers fetch error:", err.message);
      return null;
    }
  }

  async function fetchStockMovers() {
    const cacheKey = "market:movers";
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      // Combine both gainers and losers data to get most active/volatile stocks
      let allStocks = [];

      if (STOCK_API_KEYS.alphaVantage) {
        try {
          const gainerUrl = `https://www.alphavantage.co/query?function=TOP_GAINERS&apikey=${STOCK_API_KEYS.alphaVantage}`;
          const gainerRes = await fetch(gainerUrl, { cache: "no-store" });
          if (gainerRes.ok) {
            const gainerData = await gainerRes.json();
            if (gainerData.top_gainers) {
              allStocks = allStocks.concat(gainerData.top_gainers.slice(0, 3));
            }
          }

          const loserUrl = `https://www.alphavantage.co/query?function=TOP_LOSERS&apikey=${STOCK_API_KEYS.alphaVantage}`;
          const loserRes = await fetch(loserUrl, { cache: "no-store" });
          if (loserRes.ok) {
            const loserData = await loserRes.json();
            if (loserData.top_losers) {
              allStocks = allStocks.concat(loserData.top_losers.slice(0, 3));
            }
          }

          if (allStocks.length > 0) {
            const result = allStocks.slice(0, 6).map(stock => ({
              symbol: stock.ticker,
              name: stock.symbol || stock.ticker,
              price: parseFloat(stock.price) || 0,
              change: parseFloat(stock.change_amount) || 0,
              changePercent: parseFloat(stock.change_percentage?.replace('%', '')) || 0
            }));
            const payload = withMoverSource(result, "alpha-vantage");
            setCached(cacheKey, payload);
            return payload;
          }
        } catch (err) {
          console.warn("Alpha Vantage movers failed, falling back:", err.message);
        }
      }

      const yahooActives = await fetchYahooMovers("most_actives", 6);
      if (yahooActives && yahooActives.length > 0) {
        const payload = withMoverSource(yahooActives, "yahoo");
        setCached(cacheKey, payload);
        return payload;
      }

      // Secondary dynamic source: FMP most-active list.
      const fmpActives = await fetchFmpMovers("actives", 6);
      if (fmpActives && fmpActives.length > 0) {
        const payload = withMoverSource(fmpActives, "fmp");
        setCached(cacheKey, payload);
        return payload;
      }

      // Fallback to fixed list with real prices, sorted by volatility
      const pricePromises = POPULAR_STOCKS.map(stock => fetchStockPrice(stock.symbol));
      const prices = await Promise.all(pricePromises);

      const movers = POPULAR_STOCKS
        .map((stock, i) => ({ ...stock, ...prices[i] }))
        .filter(s => s.price && s.changePercent !== undefined)
        .sort((a, b) => Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0))
        .slice(0, 6);

      if (movers.length > 0) {
        const payload = withMoverSource(movers, "preset-list");
        setCached(cacheKey, payload);
        return payload;
      }
      return null;
    } catch (err) {
      console.error("Finnhub movers fetch error:", err.message);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Local/Regional source discovery (Reddit subreddit search) + picker modal
  // ──────────────────────────────────────────────────────────────────────
  // Both news.js and settings.js call openSourcePicker(scope, onSaved) to
  // launch the same modal. Reddit's subreddits/search.json reliably surfaces
  // city-named subs (r/JacksonMI), state subs (r/Michigan), and topical subs
  // for any US city — much better than guessing Google News query templates.

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
  // Reddit alone doesn't deliver real local journalism; many users want
  // their actual TV station / newspaper. We bundle a curated catalog and
  // let the picker surface it alongside Reddit suggestions for whichever
  // city the user is in. State-level entries (`_state`) are also returned
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

  // Every topic the repo ships, in file order, as { id, label, title, emoji }.
  // Settings renders the chooser from this, so adding a topic to the JSON is
  // all it takes for it to become selectable.
  async function getAllTopics() {
    const data = await loadTopicSources();
    return Object.entries(data?.topics || {}).map(([id, t]) => ({
      id,
      label: t.label || id.toUpperCase(),
      title: t.title || t.label || id,
      emoji: t.emoji || "",
      count: (t.entries || []).length,
    }));
  }

  // The topics this user turned on, in the repo's order so the tab bar doesn't
  // reshuffle when they toggle one. Unknown ids in saved config are dropped,
  // which keeps an old config working after a topic is renamed or removed.
  async function getEnabledTopics() {
    const chosen = window.App?.cfg?.topics;
    if (!Array.isArray(chosen) || !chosen.length) return [];
    const wanted = new Set(chosen);
    return (await getAllTopics()).filter(t => wanted.has(t.id));
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

  // ── Web-search feed builders ────────────────────────────────────────────
  // Disabled. Google News, Bing News, and Yahoo News all block traffic
  // from Cloudflare Worker IP ranges (either hard 503 or 200-OK with an
  // HTML anti-bot challenge instead of RSS). Returning [] keeps the
  // picker's web-search section hidden; if a viable query-based news RSS
  // ever surfaces, swap this body to build feeds again and the rest of
  // the picker wiring will pick it up.
  function getWebSearchFeeds(/* geo, scope */) {
    return [];
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

  async function discoverSourcesForScope(scope) {
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
    if (!geo) return { results: [], geo: null };
    // Normalize "Michigan"/"US-MI"/"mi" → "MI" so we can look up the
    // bundled subreddit list with the JSON's two-letter keys.
    const stateAbbr = abbreviateState(geo.state).toUpperCase();
    geo = { ...geo, state: stateAbbr };
    const fullState = expandStateName(stateAbbr) || stateAbbr;

    // Reddit's free /subreddits/search.json API now returns 403 to
    // anonymous and worker-origin requests — discovery is dead. Replaced
    // with a hand-curated, news-relevant subreddit list bundled in
    // data/local-stations.json. For LOCAL, read the city's subreddits[]
    // (+ the statewide ones as supplemental coverage). For REGIONAL, the
    // statewide subreddits[] only.
    const data = await loadLocalStations();
    const stateBlock = data?.states?.[stateAbbr];
    const stateSubs = stateBlock?._state?.subreddits || [];
    const citySubs = scope === "local" && geo.city
      ? (stateBlock?.[String(geo.city).toLowerCase()]?.subreddits || [])
      : [];

    const seen = new Set();
    const merged = [];
    const addSub = (name) => {
      const key = String(name || "").trim();
      if (!key || seen.has(key.toLowerCase())) return;
      seen.add(key.toLowerCase());
      merged.push({
        displayName: key,
        subscribers: 0,  // unknown without the API; picker shows "—"
        description: "",
        rss: `https://www.reddit.com/r/${key}/.rss`,
        score: 0
      });
    };
    // City subs first (more locally relevant), statewide second.
    for (const s of citySubs) addSub(s);
    for (const s of stateSubs) addSub(s);

    return { results: merged.slice(0, 10), geo: { ...geo, fullState } };
  }

  function defaultPickedSubs(results, geo) {
    const picks = new Set();
    const cityL = (geo?.city || "").toLowerCase();
    const fullL = (geo?.fullState || "").toLowerCase();
    for (const r of results) {
      const n = r.displayName.toLowerCase();
      if (cityL && n.includes(cityL)) picks.add(r.displayName);
      if (fullL && n === fullL.replace(/\s/g, "")) picks.add(r.displayName);
    }
    if (picks.size === 0) {
      for (const r of results.slice(0, 2)) picks.add(r.displayName);
    }
    return picks;
  }

  // Modal that lets the user curate which Reddit subs (and any custom RSS
  // URLs) feed the local/regional scopes. Calls `onSaved` after the user
  // saves or skips so the caller can re-render its UI.
  async function openSourcePicker(scope, onSaved) {
    if (scope !== "local" && scope !== "regional") return; // not supported (yet)
    if (document.getElementById("hnSourcePicker")) return; // block reentry

    const overlay = document.createElement("div");
    overlay.id = "hnSourcePicker";
    overlay.className = "hnPickerOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "hnPickerTitle");
    overlay.innerHTML = `
      <div class="hnPickerSheet">
        <div class="hnPickerHead">
          <h2 id="hnPickerTitle" class="hnPickerTitle">${scope === "local" ? "News Sources Near You" : "State & Regional Sources"}</h2>
          <button type="button" class="hnPickerClose" aria-label="Close">×</button>
        </div>
        <div class="hnPickerBody">
          <p class="hnPickerLead" id="hnPickerLead">Loading sources for your area…</p>
          <div class="hnPickerSection" id="hnPickerFallbackSection" hidden>
            <div class="hnPickerSectionLabel" id="hnPickerFallbackLabel">📍 ${scope === "local" ? "Nearest cities we cover" : "Nearest states we cover"}</div>
            <div class="hnPickerList" id="hnPickerFallbackList" role="list"></div>
          </div>
          <div class="hnPickerSection" id="hnPickerStationsSection" hidden>
            <div class="hnPickerSectionLabel">📺 Local TV &amp; papers</div>
            <div class="hnPickerList" id="hnPickerStations" role="list"></div>
          </div>
          <div class="hnPickerSection" id="hnPickerWebSection" hidden>
            <div class="hnPickerSectionLabel">🌐 News searches (Bing)</div>
            <div class="hnPickerList" id="hnPickerWebList" role="list"></div>
          </div>
          <div class="hnPickerSection">
            <div class="hnPickerSectionLabel">💬 Reddit communities</div>
            <div class="hnPickerList" id="hnPickerList" role="list"></div>
          </div>
          <div class="hnPickerCustom">
            <label for="hnPickerCustomInput" class="hnPickerCustomLabel">Add a custom RSS URL:</label>
            <div class="hnPickerCustomRow">
              <input id="hnPickerCustomInput" type="url" class="input" placeholder="https://example.com/feed.rss" />
              <button id="hnPickerCustomAdd" type="button" class="btn">Add</button>
            </div>
            <div id="hnPickerCustomList" class="hnPickerCustomItems"></div>
          </div>
        </div>
        <div class="hnPickerActions">
          <button id="hnPickerSave" type="button" class="btn primary">Save selection</button>
          <button id="hnPickerSkip" type="button" class="btn">Skip — use auto search</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector(".hnPickerClose");
    const listEl = overlay.querySelector("#hnPickerList");
    const stationsSection = overlay.querySelector("#hnPickerStationsSection");
    const stationsListEl = overlay.querySelector("#hnPickerStations");
    const fallbackSection = overlay.querySelector("#hnPickerFallbackSection");
    const fallbackListEl = overlay.querySelector("#hnPickerFallbackList");
    const webSection = overlay.querySelector("#hnPickerWebSection");
    const webListEl = overlay.querySelector("#hnPickerWebList");
    const leadEl = overlay.querySelector("#hnPickerLead");
    const customIn = overlay.querySelector("#hnPickerCustomInput");
    const customAdd = overlay.querySelector("#hnPickerCustomAdd");
    const customLi = overlay.querySelector("#hnPickerCustomList");
    const saveBtn = overlay.querySelector("#hnPickerSave");
    const skipBtn = overlay.querySelector("#hnPickerSkip");

    const customSources = [];
    let suggestions = [];
    let stations = [];
    let webFeeds = [];
    let preChecked = new Set();

    function close() { overlay.remove(); }
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    function renderCustomList() {
      customLi.innerHTML = "";
      customSources.forEach((src, idx) => {
        const row = document.createElement("div");
        row.className = "hnPickerCustomItem";
        row.innerHTML = `<span class="hnPickerCustomName">${escapeHtml(src.name)}</span> <button type="button" class="hnPickerCustomRm" data-idx="${idx}" aria-label="Remove">×</button>`;
        customLi.appendChild(row);
      });
      customLi.querySelectorAll(".hnPickerCustomRm").forEach(btn => {
        btn.addEventListener("click", () => {
          const i = Number(btn.dataset.idx);
          customSources.splice(i, 1);
          renderCustomList();
        });
      });
    }

    customAdd.addEventListener("click", () => {
      const url = customIn.value.trim();
      if (!url) return;
      try { new URL(url); } catch { leadEl.textContent = "That doesn't look like a valid URL."; return; }
      const name = url.replace(/^https?:\/\//, "").split("/")[0] || "Custom feed";
      customSources.push({ name, rss: url });
      customIn.value = "";
      renderCustomList();
    });
    customIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); customAdd.click(); } });

    skipBtn.addEventListener("click", () => {
      const next = { ...window.App.cfg };
      if (scope === "local") next.localSourcesSkipped = true;
      else next.regionalSourcesSkipped = true;
      saveConfig(next);
      close();
      try { onSaved?.(); } catch { }
    });

    saveBtn.addEventListener("click", () => {
      const checkedStations = Array.from(stationsListEl.querySelectorAll('input[type="checkbox"]:checked')).map(cb => {
        const idx = Number(cb.dataset.idx);
        return stations[idx];
      }).filter(Boolean);
      const checkedWeb = Array.from(webListEl.querySelectorAll('input[type="checkbox"]:checked')).map(cb => {
        const idx = Number(cb.dataset.idx);
        return webFeeds[idx];
      }).filter(Boolean);
      const checkedSubs = Array.from(listEl.querySelectorAll('input[type="checkbox"]:checked')).map(cb => {
        const idx = Number(cb.dataset.idx);
        return suggestions[idx];
      }).filter(Boolean);
      // Order matters: news.js trims to the first 8 saved sources. Put
      // curated TV/papers first (most trustworthy), then web searches
      // (broad coverage), then Reddit (color/community), then customs.
      const sources = [
        ...checkedStations.map(s => ({ name: s.name, rss: s.rss, site: s.site || "", headlinesCount: 8 })),
        ...checkedWeb.map(w => ({ name: w.name, rss: w.rss, site: w.site || "", headlinesCount: 8 })),
        ...checkedSubs.map(s => ({ name: `r/${s.displayName}`, rss: s.rss, site: "https://www.reddit.com", headlinesCount: 8 })),
        ...customSources.map(s => ({ name: s.name, rss: s.rss, site: "", headlinesCount: 8 }))
      ];
      if (sources.length === 0) {
        leadEl.textContent = "Pick at least one source, or click Skip to use auto search.";
        return;
      }
      const next = { ...window.App.cfg };
      if (scope === "local") { next.localSources = sources; next.localSourcesSkipped = false; }
      else { next.regionalSources = sources; next.regionalSourcesSkipped = false; }
      saveConfig(next);
      close();
      try { onSaved?.(); } catch { }
    });

    // Run station catalog lookup and Reddit discovery in parallel.
    const [stationsRes, discoverRes] = await Promise.all([
      (async () => {
        try {
          // Need geo before we can look up stations — discoverSourcesForScope
          // resolves and returns it. We reuse here rather than calling
          // resolvePreferredLocation twice.
          return null; // placeholder, replaced below after we have geo
        } catch { return []; }
      })(),
      discoverSourcesForScope(scope)
    ]);
    const { results, geo } = discoverRes;
    if (!geo) {
      // Don't dead-end the user. Replace the lead with a clear CTA that
      // opens the location picker inline. After they Apply, we re-run the
      // discovery in place so the source picker populates without them
      // having to close and reopen it.
      leadEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span>${scope === "local" ? "We need to know your area to find local sources." : "We need to know your state."}</span>
          <button type="button" class="btn primary" id="hnPickerSetLocationBtn">📍 Set Location</button>
        </div>
      `;
      // Hide the suggestion sections until we have a location.
      stationsSection.hidden = true;
      listEl.innerHTML = "";
      overlay.querySelector("#hnPickerSetLocationBtn")?.addEventListener("click", () => {
        if (typeof window.App?.openLocationPicker !== "function") return;
        window.App.openLocationPicker({
          onApply: async () => {
            // Re-run discovery now that location is set. Reuses the same
            // modal instance so the user stays in flow.
            leadEl.textContent = "Loading sources for your area…";
            const fresh = await discoverSourcesForScope(scope);
            const newGeo = fresh.geo;
            const newResults = fresh.results;
            if (!newGeo) {
              leadEl.textContent = "Couldn't resolve that location. Try again or add a custom RSS URL below.";
              return;
            }
            try { stations = await getStationsForGeo(newGeo, scope); } catch { stations = []; }
            try { webFeeds = getWebSearchFeeds(newGeo, scope); } catch { webFeeds = []; }
            let newCityCovered = false;
            try { newCityCovered = await hasCitySources(newGeo); } catch { }
            suggestions = newResults;
            preChecked = defaultPickedSubs(newResults, newGeo);
            renderPickerSuggestions(newGeo, newResults, newCityCovered);
          }
        });
      });
      return;
    }

    // Now load stations for this geo (we have geo from the discover step).
    try {
      stations = await getStationsForGeo(geo, scope);
    } catch { stations = []; }
    try { webFeeds = getWebSearchFeeds(geo, scope); } catch { webFeeds = []; }

    let cityCovered = false;
    try { cityCovered = await hasCitySources(geo); } catch { cityCovered = false; }

    suggestions = results;
    preChecked = defaultPickedSubs(results, geo);

    renderPickerSuggestions(geo, results, cityCovered);

    // ── nested helper so the inline "Set Location" path can re-render
    // after the user picks a location without reopening the modal ───────
    function renderPickerSuggestions(g, subs, hasHyperlocalCoverage) {
      const hasStations = stations.length > 0;
      const hasSubs = (subs || []).length > 0;
      const hasLatLon = Number.isFinite(g?.lat) && Number.isFinite(g?.lon);
      // Fire fallback:
      //   local    → no city-level coverage (statewide entries don't count;
      //              the user wants "near me", not "across the state").
      //   regional → no statewide entries for the user's state at all.
      const canOfferFallback = hasLatLon && (
        (scope === "local" && !hasHyperlocalCoverage)
        || (scope === "regional" && !hasStations)
      );

      if (canOfferFallback) {
        if (scope === "local") {
          leadEl.textContent = `No local sources for ${g.city}, ${g.state} yet — try the nearest city we cover.`;
        } else {
          const fullState = expandStateName(g.state) || g.state;
          leadEl.textContent = `No regional sources for ${fullState} yet — try the nearest state we cover.`;
        }
        renderFallbackList(g);
      } else {
        fallbackSection.hidden = true;
        fallbackListEl.innerHTML = "";
        if (!hasStations && !hasSubs) {
          leadEl.textContent = `No suggestions for ${g.city}, ${g.state} yet. Add a custom RSS URL below.`;
        } else {
          leadEl.textContent = `Suggestions for ${g.city}, ${g.state} — pick what you want, then Save.`;
        }
      }
      if (hasStations) {
        stationsSection.hidden = false;
        stationsListEl.innerHTML = "";
        stations.forEach((s, idx) => {
          const row = document.createElement("label");
          row.className = "hnPickerRow";
          row.setAttribute("role", "listitem");
          const typeBadge = s.type === "tv" ? "📺" : s.type === "paper" ? "📰" : "📡";
          row.innerHTML = `
            <input type="checkbox" data-idx="${idx}" checked />
            <div class="hnPickerRowMain">
              <div class="hnPickerRowName">${typeBadge} ${escapeHtml(s.name)}</div>
              ${s.site ? `<div class="hnPickerRowDesc">${escapeHtml(String(s.site).replace(/^https?:\/\//, ""))}</div>` : ""}
            </div>
          `;
          stationsListEl.appendChild(row);
        });
      } else {
        stationsSection.hidden = true;
      }

      renderWebFeedRows();

      listEl.innerHTML = "";
      (subs || []).forEach((r, idx) => {
        const row = document.createElement("label");
        row.className = "hnPickerRow";
        row.setAttribute("role", "listitem");
        const checked = preChecked.has(r.displayName) ? "checked" : "";
        // Subscriber counts only show when known (Reddit's discovery API used
        // to populate this; the curated-list path can't, so we hide the chip
        // rather than print "0 subs" which looks broken).
        const subsLabel = r.subscribers >= 1000
          ? `${(r.subscribers / 1000).toFixed(1)}K subs`
          : (r.subscribers > 0 ? `${r.subscribers} subs` : "");
        row.innerHTML = `
          <input type="checkbox" data-idx="${idx}" ${checked} />
          <div class="hnPickerRowMain">
            <div class="hnPickerRowName">💬 r/${escapeHtml(r.displayName)}${subsLabel ? ` <span class="hnPickerRowSubs">${subsLabel}</span>` : ""}</div>
            ${r.description ? `<div class="hnPickerRowDesc">${escapeHtml(r.description)}</div>` : ""}
          </div>
        `;
        listEl.appendChild(row);
      });
    }

    // Renders the web-search section. Reads from the `webFeeds` closure
    // variable so the fallback-click path can update webFeeds and call this
    // without going through the full renderPickerSuggestions flow (which
    // would re-fire the fallback detection).
    function renderWebFeedRows() {
      if (!webFeeds.length) {
        webSection.hidden = true;
        webListEl.innerHTML = "";
        return;
      }
      webSection.hidden = false;
      webListEl.innerHTML = "";
      webFeeds.forEach((w, idx) => {
        const row = document.createElement("label");
        row.className = "hnPickerRow";
        row.setAttribute("role", "listitem");
        const providerBadge = w.provider === "bing" ? "🅱️" : "🔎";
        const checked = w.defaultChecked ? "checked" : "";
        row.innerHTML = `
          <input type="checkbox" data-idx="${idx}" ${checked} />
          <div class="hnPickerRowMain">
            <div class="hnPickerRowName">${providerBadge} ${escapeHtml(w.name)}</div>
          </div>
        `;
        webListEl.appendChild(row);
      });
    }

    // Renders the "Nearest [cities|states] we cover" panel. Clicking a row
    // loads that location's stations into the regular stations section so the
    // user can check/uncheck and save like any other pick. The user's actual
    // geo stays intact (Reddit suggestions, future location-aware features
    // still see their real location); only the station list is borrowed.
    async function renderFallbackList(g) {
      fallbackSection.hidden = false;
      const loadingLabel = scope === "local" ? "Loading nearby cities…" : "Loading nearby states…";
      fallbackListEl.innerHTML = `<div class="hnPickerLeadMuted">${loadingLabel}</div>`;
      let nearest = [];
      try {
        nearest = scope === "local"
          ? await getNearestCities(g.lat, g.lon, 3)
          : await getNearestStates(g.lat, g.lon, 3);
      } catch { nearest = []; }
      if (!nearest.length) {
        const emptyLabel = scope === "local"
          ? "No nearby cities in our repo yet. Add a custom RSS URL below."
          : "No nearby states in our repo yet. Add a custom RSS URL below.";
        fallbackListEl.innerHTML = `<div class="hnPickerLeadMuted">${emptyLabel}</div>`;
        return;
      }
      fallbackListEl.innerHTML = "";
      nearest.forEach((n) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "hnPickerRow hnPickerRowBtn";
        row.setAttribute("role", "listitem");
        const miles = Math.round(n.distanceMi);
        const label = scope === "local"
          ? `${escapeHtml(n.displayCity)}, ${escapeHtml(n.state)}`
          : `${escapeHtml(n.displayState)}`;
        const action = scope === "local"
          ? "tap to load this city's sources"
          : "tap to load this state's sources";
        row.innerHTML = `
          <div class="hnPickerRowMain">
            <div class="hnPickerRowName">📍 ${label}</div>
            <div class="hnPickerRowDesc">${miles} mi away · ${action}</div>
          </div>
        `;
        row.addEventListener("click", async () => {
          const syntheticGeo = scope === "local"
            ? { state: n.state, city: n.city, lat: n.lat, lon: n.lon }
            : { state: n.state, city: g.city, lat: n.lat, lon: n.lon };
          try { stations = await getStationsForGeo(syntheticGeo, scope); }
          catch { stations = []; }
          try { webFeeds = getWebSearchFeeds(syntheticGeo, scope); }
          catch { webFeeds = []; }
          fallbackSection.hidden = true;
          if (scope === "local") {
            leadEl.textContent = `Showing local sources for ${n.displayCity}, ${n.state} (${miles} mi from ${g.city}, ${g.state}).`;
          } else {
            const fromState = expandStateName(g.state) || g.state;
            leadEl.textContent = `Showing regional sources for ${n.displayState} (${miles} mi from ${fromState}).`;
          }
          // Re-render stations section without re-running the fallback check.
          stationsSection.hidden = false;
          stationsListEl.innerHTML = "";
          stations.forEach((s, idx) => {
            const stRow = document.createElement("label");
            stRow.className = "hnPickerRow";
            stRow.setAttribute("role", "listitem");
            const typeBadge = s.type === "tv" ? "📺" : s.type === "paper" ? "📰" : "📡";
            stRow.innerHTML = `
              <input type="checkbox" data-idx="${idx}" checked />
              <div class="hnPickerRowMain">
                <div class="hnPickerRowName">${typeBadge} ${escapeHtml(s.name)}</div>
                ${s.site ? `<div class="hnPickerRowDesc">${escapeHtml(String(s.site).replace(/^https?:\/\//, ""))}</div>` : ""}
              </div>
            `;
            stationsListEl.appendChild(stRow);
          });
          renderWebFeedRows();
        });
        fallbackListEl.appendChild(row);
      });
    }
  }

  window.App = {
    LS_KEY,
    RSS_PROXY_BASE,
    RSS_AGGREGATORS,
    NEWS_API_KEY,
    STOCK_API_KEYS,
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
    fetchRssItems,
    fetchNewsApiItems,
    fetchGNewsItems,
    fetchMediaStackItems,
    fetchNewsItems,
    getRateLimits,
    updateRateLimit,
    getAvailableNewsApis,
    handleError,
    showError,
    createCardHeader,
    createPageHeader,
    getCached,
    setCached,
    clearRssCache,
    getRssCooldownStatus,
    getRssLastSuccessAgeMs,
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
    getWebSearchFeeds,
    getActiveLocationOverride,
    setActiveLocationOverride,
    clearActiveLocationOverride,
    geocodeCityName,
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
