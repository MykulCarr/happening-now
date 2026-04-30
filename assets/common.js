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

  function abbreviateState(stateName){
    if(!stateName) return "";
    // Check direct match first (case-insensitive)
    const abbr = STATE_ABBREVIATIONS[stateName];
    if(abbr) return abbr;
    // If it's already 2 characters, assume it's an abbreviation
    if(stateName.length === 2) return stateName.toUpperCase();
    // Return the full name if no abbreviation found
    return stateName;
  }

  // Shared market-strip catalog used by Stocks and Settings.
  // value/change/changePercent are populated at runtime from live quotes; no defaults here
  // so that failed fetches render "—" rather than convincing-looking stale numbers.
  const MARKET_INDEX_DEFS = [
    { key: "dow",       name: "DOW" },
    { key: "sp500",     name: "S&P 500" },
    { key: "nasdaq",    name: "NASDAQ" },
    { key: "russell2000", name: "RUSSELL 2000" },
    { key: "sp400",     name: "S&P MIDCAP 400" },
    { key: "sp600",     name: "S&P SMALLCAP 600" },
    { key: "microcap",  name: "MICROCAP" },
    { key: "vix",       name: "VIX" },
    { key: "ftse100",   name: "FTSE 100" },
    { key: "dax",       name: "DAX" },
    { key: "nikkei225", name: "NIKKEI 225" },
    { key: "hangseng",  name: "HANG SENG" },
    { key: "gold",      name: "GOLD" },
    { key: "silver",    name: "SILVER" },
    { key: "copper",    name: "COPPER" },
    { key: "crudeoil",  name: "CRUDE OIL" },
    { key: "brent",     name: "BRENT" },
    { key: "natgas",    name: "NAT GAS" },
    { key: "us10y",     name: "US 10Y" },
    { key: "dxy",       name: "DXY" },
    { key: "eurusd",    name: "EUR/USD" },
    { key: "bitcoin",   name: "BITCOIN" },
    { key: "ethereum",  name: "ETHEREUM" }
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

  const ASTROLAB_DEFAULTS = {
    useDeviceLocationDefault: false,
    fallbackLocation: "",
    rememberLastLocation: true,
    showLocationAccuracy: true,
    defaultTimeMode: "now", // now | sunset | custom
    customTime: "21:00",
    sliderStepMinutes: 30,
    autoAdvanceTime: false,
    autoAdvanceSpeedSeconds: 5,
    rememberLastTime: true,

    showConstellationLines: true,
    showConstellationLabels: true,
    showPlanetLabels: true,
    showDsoLabels: true,
    showMilkyWay: true,
    showHorizonOverlay: true,

    magnitudeLimit: 6.0,
    labelDensity: "standard", // minimal | standard | dense
    highlightIntensity: 70,
    nightLabelContrast: true,

    showSkyConditions: true,
    showCalendar: true,
    showHighlights: true,
    showResources: true,
    showLaunches: true,
    showAstroNews: true,
    defaultCardState: "expanded", // expanded | collapsed | remember

    autoRefreshMinutes: 15,
    launchRefreshMinutes: 30,
    newsRefreshMinutes: 30,
    cacheMinutes: 30,

    notifyIssPasses: false,
    notifyTopEvents: false,
    notifyLaunchWindows: false,
    quietHoursStart: "23:00",
    quietHoursEnd: "07:00",

    timeFormat: "12h", // 12h | 24h
    coordinateFormat: "hms", // hms | decimal
    dateFormat: "us", // us | iso | eu
    showSeconds: true,

    lowPowerMode: false,
    lightweightMobile: false,
    disableHeavyOverlays: false
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
    pageVisibility: { news: true, weather: true, stocks: true, astrolab: true },

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

    // AstroLab preferences
    astrolab: clone(ASTROLAB_DEFAULTS),

    // Content arrays
  widgets: [
    // All working RSS feeds - verified and tested
    { name:"NPR", rss:"https://feeds.npr.org/1001/rss.xml", site:"https://www.npr.org", headlinesCount:5 },
    { name:"BBC", rss:"https://feeds.bbci.co.uk/news/rss.xml", site:"https://www.bbc.com/news", headlinesCount:5 },
    { name:"The Guardian (US)", rss:"https://www.theguardian.com/us-news/rss", site:"https://www.theguardian.com/us-news", headlinesCount:5 },
    { name:"ArsTechnica", rss:"https://feeds.arstechnica.com/arstechnica/index", site:"https://arstechnica.com", headlinesCount:5 },
    { name:"PBS NewsHour", rss:"https://www.pbs.org/newshour/feeds/rss/headlines", site:"https://www.pbs.org/newshour", headlinesCount:5 },
    { name:"Al Jazeera", rss:"https://www.aljazeera.com/xml/rss/all.xml", site:"https://www.aljazeera.com", headlinesCount:5 },
    { name:"Hacker News", rss:"https://news.ycombinator.com/rss", site:"https://news.ycombinator.com", headlinesCount:5 },
    { name:"Deutsche Welle", rss:"https://rss.dw.com/rdf/rss-en-all", site:"https://www.dw.com", headlinesCount:5 },
    { name:"Nature", rss:"https://www.nature.com/nature.rss", site:"https://www.nature.com", headlinesCount:5 }
  ],

  stocks: [
    { symbol:"NASDAQ:CLOV", label:"Clover Health Investments Corp" },
    { symbol:"NASDAQ:FNIPX", label:"Fidelity Freedom Index 2035 Fund Premier Class" },
    { symbol:"NASDAQ:TLYIX", label:"Nuveen Lifecycle Index 2035 Fund R6" },
    { symbol:"NASDAQ:VIIIX", label:"Vanguard Institutional Index Fund Institutional Plus" },
    { symbol:"NASDAQ:VSMPX", label:"Vanguard Total Stock Market Index Fund Institutional Plus" },
  ]
};

  function clone(x){ return JSON.parse(JSON.stringify(x)); }

  // Migrate old RSS feeds to working alternatives
  function migrateWidgets(widgets){
    if(!Array.isArray(widgets)) return clone(DEFAULTS.widgets);
    return widgets;
  }

  function normalizeConfig(cfg){
    const out = { ...clone(DEFAULTS), ...(cfg || {}) };

    out.theme = out.theme === "light" ? "light" : "dark";
    out.density = ["compact","cozy","comfortable"].includes(out.density) ? out.density : "comfortable";
    out.renderMode = ["smooth", "stable"].includes(String(out.renderMode || "").toLowerCase())
      ? String(out.renderMode).toLowerCase()
      : DEFAULTS.renderMode;
    out.startupPage = ["news", "weather", "stocks", "astrolab"].includes(out.startupPage) ? out.startupPage : DEFAULTS.startupPage;
    out.stocksNewsMode = ["watchlist", "major"].includes(out.stocksNewsMode) ? out.stocksNewsMode : DEFAULTS.stocksNewsMode;

    out.zipCode = String(out.zipCode || "").trim();
    if(!/^\d{5}$/.test(out.zipCode)) out.zipCode = DEFAULTS.zipCode;

    out.useDeviceLocation = out.useDeviceLocation === true;
    out.deviceLat = Number(out.deviceLat);
    out.deviceLon = Number(out.deviceLon);
    if(!Number.isFinite(out.deviceLat) || !Number.isFinite(out.deviceLon)){
      out.useDeviceLocation = false;
      out.deviceLat = null;
      out.deviceLon = null;
    }
    out.deviceLocationLabel = String(out.deviceLocationLabel || "").trim().slice(0, 120);

    out.weatherRefreshMinutes = Number(out.weatherRefreshMinutes || DEFAULTS.weatherRefreshMinutes);
    if(!Number.isFinite(out.weatherRefreshMinutes) || out.weatherRefreshMinutes < 2) out.weatherRefreshMinutes = 10;

    out.timezone = String(out.timezone || DEFAULTS.timezone).trim();
    // Validate timezone exists in our list or is a valid IANA timezone
    if(!TIMEZONES.find(t => t.value === out.timezone)){
      try{
        Intl.DateTimeFormat(undefined, { timeZone: out.timezone });
      }catch{
        out.timezone = DEFAULTS.timezone;
      }
    }

    if(!Array.isArray(out.widgets)) out.widgets = clone(DEFAULTS.widgets);
    // Migrate old feeds to NewsAPI
    out.widgets = migrateWidgets(out.widgets);
    out.widgets = out.widgets.map(w => ({
      name: String(w?.name || "").trim() || "Source",
      rss:  String(w?.rss  || "").trim(),
      site: String(w?.site || "").trim(),
      headlinesCount: Math.max(1, Math.min(20, Number(w?.headlinesCount || 6)))
    })).filter(w => w.rss).slice(0, 15); // Max 15 sources

    if(!Array.isArray(out.stocks)) out.stocks = clone(DEFAULTS.stocks);
    out.stocks = out.stocks.map(s => ({
      symbol: String(s?.symbol || "").trim(),
      label:  String(s?.label || "").trim() || String(s?.symbol || "").trim(),
      market: String(s?.market || "").trim()
    })).filter(s => s.symbol);

    // Normalize new preference fields
    if(typeof out.pageVisibility !== "object" || !out.pageVisibility){
      out.pageVisibility = clone(DEFAULTS.pageVisibility);
    } else {
      out.pageVisibility = {
        news: out.pageVisibility.news !== false,
        weather: out.pageVisibility.weather !== false,
        stocks: out.pageVisibility.stocks !== false
      };
    }

    out.weatherAlertScope = ["local","national","both"].includes(out.weatherAlertScope) ? out.weatherAlertScope : "local";
    out.forecastLength = [3, 7, 14].includes(out.forecastLength) ? out.forecastLength : 7;
    out.weatherDefaultMapLayer = ["radar","wind","temp","clouds","air"].includes(out.weatherDefaultMapLayer) ? out.weatherDefaultMapLayer : "radar";
    out.weatherTempUnit = ["fahrenheit","celsius"].includes(out.weatherTempUnit) ? out.weatherTempUnit : "fahrenheit";
    out.weatherWindUnit = ["mph","kmh","ms"].includes(out.weatherWindUnit) ? out.weatherWindUnit : "mph";
    out.weatherPrecipUnit = ["inch","mm"].includes(out.weatherPrecipUnit) ? out.weatherPrecipUnit : "inch";
    out.weatherShowMap = out.weatherShowMap !== false;
    out.weatherStaleWarnMinutes = Number(out.weatherStaleWarnMinutes ?? DEFAULTS.weatherStaleWarnMinutes);
    if(!Number.isFinite(out.weatherStaleWarnMinutes)) out.weatherStaleWarnMinutes = DEFAULTS.weatherStaleWarnMinutes;
    out.weatherStaleWarnMinutes = Math.max(5, Math.min(180, Math.round(out.weatherStaleWarnMinutes)));
    out.stockSortMode = ["pinned","az","symbol"].includes(out.stockSortMode) ? out.stockSortMode : "pinned";
    out.marketNewsSourceMode = ["google","direct"].includes(out.marketNewsSourceMode) ? out.marketNewsSourceMode : "google";
    out.marketNewsOpenMode = ["new-tab","same-tab"].includes(out.marketNewsOpenMode) ? out.marketNewsOpenMode : "new-tab";
    out.newsTickerScope = ["local","regional","national","international"].includes(out.newsTickerScope) ? out.newsTickerScope : "national";

    const astro = (out.astrolab && typeof out.astrolab === "object") ? out.astrolab : {};
    out.astrolab = {
      ...clone(ASTROLAB_DEFAULTS),
      ...astro
    };

    out.astrolab.useDeviceLocationDefault = out.astrolab.useDeviceLocationDefault !== false;
    out.astrolab.fallbackLocation = String(out.astrolab.fallbackLocation || "").trim().slice(0, 120);
    out.astrolab.rememberLastLocation = out.astrolab.rememberLastLocation !== false;
    out.astrolab.showLocationAccuracy = out.astrolab.showLocationAccuracy !== false;
    out.astrolab.defaultTimeMode = ["now", "sunset", "custom"].includes(out.astrolab.defaultTimeMode) ? out.astrolab.defaultTimeMode : ASTROLAB_DEFAULTS.defaultTimeMode;
    out.astrolab.customTime = /^\d{2}:\d{2}$/.test(String(out.astrolab.customTime || "")) ? String(out.astrolab.customTime) : ASTROLAB_DEFAULTS.customTime;
    out.astrolab.sliderStepMinutes = [15, 30, 60].includes(Number(out.astrolab.sliderStepMinutes)) ? Number(out.astrolab.sliderStepMinutes) : ASTROLAB_DEFAULTS.sliderStepMinutes;
    out.astrolab.autoAdvanceTime = out.astrolab.autoAdvanceTime === true;
    out.astrolab.autoAdvanceSpeedSeconds = Math.max(1, Math.min(120, Number(out.astrolab.autoAdvanceSpeedSeconds) || ASTROLAB_DEFAULTS.autoAdvanceSpeedSeconds));
    out.astrolab.rememberLastTime = out.astrolab.rememberLastTime !== false;

    out.astrolab.showConstellationLines = out.astrolab.showConstellationLines !== false;
    out.astrolab.showConstellationLabels = out.astrolab.showConstellationLabels !== false;
    out.astrolab.showPlanetLabels = out.astrolab.showPlanetLabels !== false;
    out.astrolab.showDsoLabels = out.astrolab.showDsoLabels !== false;
    out.astrolab.showMilkyWay = out.astrolab.showMilkyWay !== false;
    out.astrolab.showHorizonOverlay = out.astrolab.showHorizonOverlay !== false;

    out.astrolab.magnitudeLimit = Math.max(3, Math.min(8, Number(out.astrolab.magnitudeLimit) || ASTROLAB_DEFAULTS.magnitudeLimit));
    out.astrolab.labelDensity = ["minimal", "standard", "dense"].includes(out.astrolab.labelDensity) ? out.astrolab.labelDensity : ASTROLAB_DEFAULTS.labelDensity;
    out.astrolab.highlightIntensity = Math.max(0, Math.min(100, Number(out.astrolab.highlightIntensity) || ASTROLAB_DEFAULTS.highlightIntensity));
    out.astrolab.nightLabelContrast = out.astrolab.nightLabelContrast !== false;

    out.astrolab.showSkyConditions = out.astrolab.showSkyConditions !== false;
    out.astrolab.showCalendar = out.astrolab.showCalendar !== false;
    out.astrolab.showHighlights = out.astrolab.showHighlights !== false;
    out.astrolab.showResources = out.astrolab.showResources !== false;
    out.astrolab.showLaunches = out.astrolab.showLaunches !== false;
    out.astrolab.showAstroNews = out.astrolab.showAstroNews !== false;
    out.astrolab.defaultCardState = ["expanded", "collapsed", "remember"].includes(out.astrolab.defaultCardState) ? out.astrolab.defaultCardState : ASTROLAB_DEFAULTS.defaultCardState;

    out.astrolab.autoRefreshMinutes = Math.max(2, Math.min(240, Number(out.astrolab.autoRefreshMinutes) || ASTROLAB_DEFAULTS.autoRefreshMinutes));
    out.astrolab.launchRefreshMinutes = Math.max(2, Math.min(240, Number(out.astrolab.launchRefreshMinutes) || ASTROLAB_DEFAULTS.launchRefreshMinutes));
    out.astrolab.newsRefreshMinutes = Math.max(2, Math.min(240, Number(out.astrolab.newsRefreshMinutes) || ASTROLAB_DEFAULTS.newsRefreshMinutes));
    out.astrolab.cacheMinutes = Math.max(1, Math.min(240, Number(out.astrolab.cacheMinutes) || ASTROLAB_DEFAULTS.cacheMinutes));

    out.astrolab.notifyIssPasses = out.astrolab.notifyIssPasses === true;
    out.astrolab.notifyTopEvents = out.astrolab.notifyTopEvents === true;
    out.astrolab.notifyLaunchWindows = out.astrolab.notifyLaunchWindows === true;
    out.astrolab.quietHoursStart = /^\d{2}:\d{2}$/.test(String(out.astrolab.quietHoursStart || "")) ? String(out.astrolab.quietHoursStart) : ASTROLAB_DEFAULTS.quietHoursStart;
    out.astrolab.quietHoursEnd = /^\d{2}:\d{2}$/.test(String(out.astrolab.quietHoursEnd || "")) ? String(out.astrolab.quietHoursEnd) : ASTROLAB_DEFAULTS.quietHoursEnd;

    out.astrolab.timeFormat = ["12h", "24h"].includes(out.astrolab.timeFormat) ? out.astrolab.timeFormat : ASTROLAB_DEFAULTS.timeFormat;
    out.astrolab.coordinateFormat = ["hms", "decimal"].includes(out.astrolab.coordinateFormat) ? out.astrolab.coordinateFormat : ASTROLAB_DEFAULTS.coordinateFormat;
    out.astrolab.dateFormat = ["us", "iso", "eu"].includes(out.astrolab.dateFormat) ? out.astrolab.dateFormat : ASTROLAB_DEFAULTS.dateFormat;
    out.astrolab.showSeconds = out.astrolab.showSeconds !== false;

    out.astrolab.lowPowerMode = out.astrolab.lowPowerMode === true;
    out.astrolab.lightweightMobile = out.astrolab.lightweightMobile === true;
    out.astrolab.disableHeavyOverlays = out.astrolab.disableHeavyOverlays === true;

    if(!Array.isArray(out.marketIndices)) out.marketIndices = clone(DEFAULTS.marketIndices);
    const validKeys = new Set(MARKET_INDEX_DEFS.map(item => item.key));

    // Migrate older string-based arrays (stored as market names) to key+visible objects.
    const isLegacyMarketArray = out.marketIndices.every(item => typeof item === "string");
    if(isLegacyMarketArray){
      const selectedOrdered = [];
      const selectedSeen = new Set();

      out.marketIndices.forEach((name) => {
        const key = LEGACY_MARKET_INDEX_NAME_TO_KEY[name] || String(name || "").trim().toLowerCase();
        if(!validKeys.has(key) || selectedSeen.has(key)) return;
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
        if(!entry || typeof entry !== "object") return;
        const key = String(entry.key || "").trim().toLowerCase();
        if(!validKeys.has(key) || seenKeys.has(key)) return;
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

  function loadConfig(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return normalizeConfig(clone(DEFAULTS));
      
      const stored = JSON.parse(raw);
      const normalized = normalizeConfig(stored);
      
      // Check if migration occurred by comparing widgets
      const needsSave = JSON.stringify(stored.widgets) !== JSON.stringify(normalized.widgets);
      
      if(needsSave){
        console.log("Config migrated to reliable RSS feeds, clearing cache and saving...");
        localStorage.setItem(LS_KEY, JSON.stringify(normalized));
        // Clear localStorage news cache
        try{ localStorage.removeItem("jas_cache_news_v1"); }catch{}
      }
      
      return normalized;
    }catch{
      return normalizeConfig(clone(DEFAULTS));
    }
  }

  function saveConfig(cfg){
    const clean = normalizeConfig(cfg);
    localStorage.setItem(LS_KEY, JSON.stringify(clean));
    if(window.App) window.App.cfg = clean;  // keep global in sync
    return clean;
  }

  function hasValidDeviceCoords(config){
    return Number.isFinite(Number(config?.deviceLat)) && Number.isFinite(Number(config?.deviceLon));
  }

  function loadGeoPref(){
    try{
      const raw = localStorage.getItem(GEO_PREF_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch{
      return null;
    }
  }

  function saveGeoPref(pref){
    try{
      localStorage.setItem(GEO_PREF_KEY, JSON.stringify(pref || {}));
    }catch{}
  }

  function shouldAutoDetectLocation(config){
    if(typeof navigator === "undefined" || !navigator.geolocation) return false;
    if(typeof window !== "undefined" && window.isSecureContext === false) return false;
    if(hasValidDeviceCoords(config) && config?.useDeviceLocation) return false;

    // Only silently re-use geolocation if the user has previously explicitly granted it.
    // Never trigger the browser permission prompt without a direct user gesture.
    const pref = loadGeoPref();
    return pref?.granted === true;
  }

  function getCurrentPositionAsync(options = {}){
    return new Promise((resolve, reject) => {
      if(typeof navigator === "undefined" || !navigator.geolocation){
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

  async function reverseGeocodeCoords(lat, lon){
    try{
      // Try Nominatim first (more reliable for city names)
      try{
        const nominatimUrl =
          `https://nominatim.openstreetmap.org/reverse` +
          `?lat=${encodeURIComponent(lat)}` +
          `&lon=${encodeURIComponent(lon)}` +
          `&format=json&language=en&zoom=10&addressdetails=1`;
        
        const res = await fetch(nominatimUrl, { 
          cache: "no-store",
          headers: { "User-Agent": "HAPPENING-NOW/1.0" }
        });
        
        if(res.ok){
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

          if(city){
            console.log("[geocode] Nominatim found:", { city, state });
            return {
              city,
              state,
              zipCode: /^\d{5}$/.test(zip) ? zip : "",
              label: label || city
            };
          }
        }
      }catch(nomErr){
        console.log("[geocode] Nominatim error:", nomErr.message);
      }

      // Fallback: try open-meteo reverse geocoding
      try{
        const openMeteoUrl =
          `https://geocoding-api.open-meteo.com/v1/reverse` +
          `?latitude=${encodeURIComponent(lat)}` +
          `&longitude=${encodeURIComponent(lon)}` +
          `&language=en&format=json`;
        
        const res = await fetch(openMeteoUrl, { cache: "no-store" });
        if(res.ok){
          const j = await res.json();
          const row = Array.isArray(j?.results) ? j.results[0] : null;

          if(row && String(row.name || "").trim()){
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
      }catch(omErr){
        console.log("[geocode] OpenMeteo error:", omErr.message);
      }

      // Return null if both services failed
      console.log("[geocode] No city found for", { lat, lon });
      return null;
    }catch(e){
      console.error("[geocode] reverseGeocodeCoords error:", e);
      return null;
    }
  }

  function startTopClock(getCfg){
    const timeEl = document.getElementById("topClockTime");
    const dateEl = document.getElementById("topClockDate");
    const tzEl = document.getElementById("topClockTz");
    if(!timeEl || !dateEl || !tzEl) return;
  
    if(window.__jasTopClockTimer) clearInterval(window.__jasTopClockTimer);
  
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

  function applyThemeDensity(cfg){
    document.documentElement.setAttribute("data-theme", cfg.theme);
    document.documentElement.setAttribute("data-density", cfg.density);
    document.documentElement.setAttribute("data-render-mode", cfg.renderMode || "smooth");
    document.documentElement.setAttribute("data-font-size", "normal");
  }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function stripTags(html){
    return String(html || "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<\/?[^>]+(>|$)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function faviconUrl(site){
    try{
      const u = new URL(site);
      // Google's favicon service: 32x32 PNG, cached/optimized, gracefully
      // returns a generic globe icon for sites without a favicon. Avoids
      // 404s and the 5-22 KB per-source /favicon.ico downloads PSI flags.
      return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
    }catch{
      return "";
    }
  }

  function normalizeOutboundLink(url){
    try{
      if(!url) return url;
      const u = new URL(url);

      // Google News RSS often wraps outbound links
      if(u.hostname.includes("news.google.com")){
        const real = u.searchParams.get("url") || u.searchParams.get("u");
        if(real) return decodeURIComponent(real);
      }
      if(u.hostname.includes("google.com") && u.pathname === "/url"){
        const q = u.searchParams.get("q");
        if(q) return q;
      }
      return url;
    }catch{
      return url;
    }
  }

  // Simple cache for API calls (5 minute TTL)
  const cache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const RSS_REQUEST_TIMEOUT_MS = 9000;
  const RSS_REQUEST_TIMEOUT_FAST_MS = 4500;
  const RSS_STALE_CACHE_MAX_AGE_MS = 30 * 60 * 1000; // serve stale for up to 30 minutes on failures
  const RSS_ROUTE_COOLDOWN_BASE_MS = 8000;
  const RSS_ROUTE_COOLDOWN_MAX_MS = 60000;
  const rssInFlight = new Map();
  const rssRouteCooldowns = new Map();
  const rssLastSuccessAt = new Map();

  function timeoutSignal(timeoutMs){
    if(typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"){
      return AbortSignal.timeout(timeoutMs);
    }
    return null;
  }

  function getCached(key){
    const entry = cache.get(key);
    if(!entry) return null;
    if(Date.now() - entry.timestamp > CACHE_TTL){
      cache.delete(key);
      return null;
    }
    return entry.data;
  }

  function setCached(key, data){
    cache.set(key, { data, timestamp: Date.now() });
  }

  function getCachedStale(key, maxStaleAgeMs = RSS_STALE_CACHE_MAX_AGE_MS){
    const entry = cache.get(key);
    if(!entry) return null;
    if(Date.now() - entry.timestamp > CACHE_TTL + maxStaleAgeMs){
      return null;
    }
    return entry.data;
  }

  function getRssRouteKey(feedUrl, proxyBase){
    return `${proxyBase}|${feedUrl}`;
  }

  function getRssFeedVariants(rssUrl){
    const feeds = [rssUrl];
    if(rssUrl.includes("rsshub.app")){
      feeds.push(rssUrl.replace("rsshub.app", "rss.shab.fun"));
    }
    return feeds;
  }

  function isGoogleNewsRssUrl(rssUrl){
    try{
      const url = new URL(rssUrl);
      return url.hostname.includes("news.google.com") && url.pathname.includes("/rss/");
    }catch{
      return false;
    }
  }

  function getRssProxyFallbacksForFeed(feedUrl){
    // Google News feeds are generally reachable through the primary worker and one fallback.
    // Keeping this list short avoids long serial timeouts that block widget rendering.
    if(isGoogleNewsRssUrl(feedUrl)){
      return RSS_PROXY_FALLBACKS.slice(0, 2);
    }
    return RSS_PROXY_FALLBACKS;
  }

  function getRssRequestTimeoutMs(feedUrl){
    return isGoogleNewsRssUrl(feedUrl) ? RSS_REQUEST_TIMEOUT_FAST_MS : RSS_REQUEST_TIMEOUT_MS;
  }

  function getRssRouteCooldownMs(routeKey){
    const cooldown = rssRouteCooldowns.get(routeKey);
    if(!cooldown) return 0;
    const remaining = cooldown.until - Date.now();
    if(remaining <= 0){
      rssRouteCooldowns.delete(routeKey);
      return 0;
    }
    return remaining;
  }

  function getRssCooldownStatus(rssUrl){
    const feedUrls = getRssFeedVariants(rssUrl);
    let totalRoutes = 0;
    let routesOnCooldown = 0;
    let minRetryMs = Infinity;

    for(const feedUrl of feedUrls){
      const proxiesToTry = getRssProxyFallbacksForFeed(feedUrl);
      for(const proxyBase of proxiesToTry){
        totalRoutes += 1;
        const routeKey = getRssRouteKey(feedUrl, proxyBase);
        const cooldownMs = getRssRouteCooldownMs(routeKey);
        if(cooldownMs > 0){
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

  function noteRssFeedSuccess(rssUrl){
    if(!rssUrl) return;
    rssLastSuccessAt.set(rssUrl, Date.now());
  }

  function getRssLastSuccessAgeMs(rssUrl){
    if(!rssUrl) return null;
    const ts = rssLastSuccessAt.get(rssUrl);
    if(!ts) return null;
    return Math.max(0, Date.now() - ts);
  }

  function noteRssRouteFailure(routeKey, error){
    const msg = String(error?.message || "");
    const shouldBackoff = /503|timeout|timed out|network|failed to fetch/i.test(msg);
    if(!shouldBackoff) return;

    const prev = rssRouteCooldowns.get(routeKey);
    const failCount = Math.min((prev?.failCount || 0) + 1, 5);
    const waitMs = Math.min(RSS_ROUTE_COOLDOWN_BASE_MS * (2 ** (failCount - 1)), RSS_ROUTE_COOLDOWN_MAX_MS);
    rssRouteCooldowns.set(routeKey, { failCount, until: Date.now() + waitMs });
  }

  function noteRssRouteSuccess(routeKey){
    rssRouteCooldowns.delete(routeKey);
  }

  function clearRssCache(){
    // Clear all RSS cache entries
    for(let key of cache.keys()){
      if(key.startsWith("rss:") || key.startsWith("newsapi:")){
        cache.delete(key);
      }
    }
    rssInFlight.clear();
    rssRouteCooldowns.clear();
    rssLastSuccessAt.clear();
  }

  // Rate-limit tracking for API calls
  function getRateLimits(){
    try{
      const raw = localStorage.getItem("jas_rate_limits_v1");
      return raw ? JSON.parse(raw) : {
        newsapi: { remaining: 100, limit: 100, resetTime: Date.now() + 86400000 },
        gnews: { remaining: 100, limit: 100, resetTime: Date.now() + 86400000 },
        mediastack: { remaining: 999, limit: 1000, resetTime: Date.now() + 2592000000 } // 30 days
      };
    }catch{
      return {};
    }
  }

  function updateRateLimit(apiName, remainingHeader, limitHeader){
    try{
      const limits = getRateLimits();
      if(!limits[apiName]) limits[apiName] = { remaining: 999, limit: 1000, resetTime: Date.now() + 86400000 };
      
      if(remainingHeader) limits[apiName].remaining = parseInt(remainingHeader) || limits[apiName].remaining;
      if(limitHeader) limits[apiName].limit = parseInt(limitHeader) || limits[apiName].limit;
      
      localStorage.setItem("jas_rate_limits_v1", JSON.stringify(limits));
      console.log(`[${apiName}] Rate limit: ${limits[apiName].remaining}/${limits[apiName].limit}`);
      return limits[apiName];
    }catch{
      return null;
    }
  }

  function getAvailableNewsApis(){
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
  function handleError(error, context="Operation"){
    console.error(`[${context}]`, error);
    return {
      error: true,
      message: error.message || `${context} failed. Please try again.`,
      context
    };
  }

  // Show user-friendly error message
  function showError(message, element){
    if(!element) return;
    const errorEl = document.createElement("div");
    errorEl.className = "errorMessage";
    errorEl.setAttribute("role", "alert");
    errorEl.setAttribute("aria-live", "polite");
    errorEl.textContent = message;
    element.innerHTML = "";
    element.appendChild(errorEl);
  }

  async function fetchNewsApiItems(domain, limit=10, useCache=true){
    if(!NEWS_API_KEY){
      console.warn("NewsAPI key not configured");
      return [];
    }

    const cacheKey = `newsapi:${domain}:${limit}`;
    
    if(useCache){
      const cached = getCached(cacheKey);
      if(cached) return cached;
    }

    try{
      // Try using the /v2/everything endpoint with proper headers
      const url = `https://newsapi.org/v2/everything?domains=${domain}&pageSize=${limit}&sortBy=publishedAt&language=en`;
      const res = await fetch(url, { 
        cache:"no-store", 
        signal: AbortSignal.timeout(10000),
        headers: {
          'X-Api-Key': NEWS_API_KEY
        }
      });
      
      // Track rate limits from response headers
      updateRateLimit("newsapi", res.headers.get("X-RateLimit-Remaining"), res.headers.get("X-RateLimit-Limit"));
      
      if(!res.ok){
        const errorText = await res.text();
        console.error(`NewsAPI error (${res.status}):`, errorText);
        throw new Error(`NewsAPI request failed: ${res.status}`);
      }

      const data = await res.json();
      
      if(data.status !== "ok"){
        throw new Error(data.message || "NewsAPI error");
      }

      const result = (data.articles || []).slice(0, limit).map(article => ({
        title: article.title || "Untitled",
        url: article.url || "",
        pubDate: article.publishedAt || "",
        desc: article.description || "",
        image: article.urlToImage || ""
      }));

      if(useCache && result.length > 0){
        setCached(cacheKey, result);
      }

      return result;
    }catch(error){
      handleError(error, "NewsAPI Fetch");
      return [];
    }
  }

  async function fetchGNewsItems(query, limit=10, useCache=true){
    if(!GNEWS_API_KEY){
      return [];
    }

    const cacheKey = `gnews:${query}:${limit}`;
    
    if(useCache){
      const cached = getCached(cacheKey);
      if(cached) return cached;
    }

    try{
      const gNewsUrl = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&max=${limit}&sortby=publishedAt&token=${GNEWS_API_KEY}`;
      const url = `https://corsproxy.io/?${encodeURIComponent(gNewsUrl)}`;
      const res = await fetch(url, { 
        cache:"no-store", 
        signal: AbortSignal.timeout(10000)
      });
      
      updateRateLimit("gnews", res.headers.get("X-RateLimit-Remaining"), res.headers.get("X-RateLimit-Limit"));
      
      if(!res.ok) throw new Error(`GNews error: ${res.status}`);

      const data = await res.json();
      
      const result = (data.articles || []).slice(0, limit).map(article => ({
        title: article.title || "Untitled",
        url: article.url || "",
        pubDate: article.publishedAt || "",
        desc: article.description || "",
        image: article.image || ""
      }));

      if(useCache && result.length > 0){
        setCached(cacheKey, result);
      }

      return result;
    }catch(error){
      handleError(error, "GNews Fetch");
      return [];
    }
  }

  async function fetchMediaStackItems(keywords, limit=10, useCache=true){
    if(!MEDIASTACK_API_KEY){
      return [];
    }

    const cacheKey = `mediastack:${keywords}:${limit}`;
    
    if(useCache){
      const cached = getCached(cacheKey);
      if(cached) return cached;
    }

    try{
      const url = `https://api.mediastack.com/v1/news?keywords=${encodeURIComponent(keywords)}&limit=${limit}&sort=published_desc&access_key=${MEDIASTACK_API_KEY}`;
      const res = await fetch(url, { 
        cache:"no-store", 
        signal: AbortSignal.timeout(10000)
      });
      
      updateRateLimit("mediastack", res.headers.get("X-RateLimit-Remaining"), res.headers.get("X-RateLimit-Limit"));
      
      if(!res.ok) throw new Error(`MediaStack error: ${res.status}`);

      const data = await res.json();
      
      const result = (data.data || []).slice(0, limit).map(article => ({
        title: article.title || "Untitled",
        url: article.url || "",
        pubDate: article.published_at || "",
        desc: article.description || "",
        image: article.image || ""
      }));

      if(useCache && result.length > 0){
        setCached(cacheKey, result);
      }

      return result;
    }catch(error){
      handleError(error, "MediaStack Fetch");
      return [];
    }
  }

  function annotateNewsItems(items, sourceLabel, isFallback){
    return (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      _newsSourceLabel: sourceLabel,
      _newsFallback: isFallback === true
    }));
  }

  function getGoogleNewsSearchQuery(rssUrl){
    try{
      const url = new URL(rssUrl);
      if(!url.hostname.includes("news.google.com") || !url.pathname.includes("/rss/search")){
        return "";
      }
      return String(url.searchParams.get("q") || "").trim();
    }catch{
      return "";
    }
  }

  async function fetchGoogleNewsFallbackItems(rssUrl, limit=10, useCache=true){
    const rawQuery = getGoogleNewsSearchQuery(rssUrl);
    if(!rawQuery) return [];

    const query = decodeURIComponent(rawQuery).replace(/\+/g, " ").trim();
    if(!query) return [];

    // API fallbacks are stricter than RSS query syntax; normalize symbol-heavy search text.
    const apiQuery = query
      .replace(/\b[A-Z]{1,8}:[A-Z0-9._-]+\b/g, " ")
      .replace(/["'`]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);

    const fallbackQuery = apiQuery || query;

    let items = await fetchGNewsItems(fallbackQuery, limit, useCache);
    if(items.length > 0) return annotateNewsItems(items, "Fallback news source in use", true);

    items = await fetchMediaStackItems(fallbackQuery, limit, useCache);
    return annotateNewsItems(items, "Fallback news source in use", true);
  }

  async function fetchRssItems(rssUrl, limit=10, useCache=true){
    const cacheKey = `rss:${rssUrl}:${limit}`;
    
    if(useCache){
      const cached = getCached(cacheKey);
      if(cached) return cached;
    }

    const inFlightKey = `${cacheKey}:${useCache ? "cache" : "nocache"}`;
    if(rssInFlight.has(inFlightKey)){
      return rssInFlight.get(inFlightKey);
    }

    const request = (async () => {

      // Try primary feed, then fallback to backup RSSHub if using RSSHub
      const feedsToTry = getRssFeedVariants(rssUrl);

      for(let feedUrl of feedsToTry){
        const bustUrl = feedUrl.includes("?") ? feedUrl + "&t=" + Date.now() : feedUrl + "?t=" + Date.now();
        const proxiesToTry = getRssProxyFallbacksForFeed(feedUrl);
        const requestTimeoutMs = getRssRequestTimeoutMs(feedUrl);

        for(let proxyBase of proxiesToTry){
          const routeKey = getRssRouteKey(feedUrl, proxyBase);
          const cooldownMs = getRssRouteCooldownMs(routeKey);
          if(cooldownMs > 0){
            continue;
          }

          try{
            const proxied = proxyBase + encodeURIComponent(bustUrl);
            const res = await fetch(proxied, { cache:"no-store", signal: timeoutSignal(requestTimeoutMs) });

            if(!res.ok){
              throw new Error(`Failed to fetch RSS feed: ${res.status} ${res.statusText}`);
            }

            const xmlText = await res.text();
            const xml = new DOMParser().parseFromString(xmlText, "text/xml");

            const parseError = xml.querySelector("parsererror");
            if(parseError){
              throw new Error("Invalid RSS feed format");
            }

            let items = Array.from(xml.querySelectorAll("item"));
            if(items.length === 0) items = Array.from(xml.querySelectorAll("entry"));

            const result = annotateNewsItems(items.slice(0, limit).map(it => {
              const title = (it.querySelector("title")?.textContent || "Untitled").trim();
              const linkNode = it.querySelector("link");
              const link = (linkNode?.getAttribute("href") || linkNode?.textContent || "").trim();
              const pubDate = (it.querySelector("pubDate")?.textContent || it.querySelector("updated")?.textContent || it.querySelector("published")?.textContent || "").trim();

              const descRaw =
                (it.querySelector("description")?.textContent ||
                 it.querySelector("content")?.textContent ||
                 it.querySelector("content\\:encoded")?.textContent ||
                 "").trim();

              const desc = stripTags(descRaw).slice(0, 240);

              let image = null;
              const mediaContentNode = it.getElementsByTagName("media:content")?.[0];
              const mediaThumbNode = it.getElementsByTagName("media:thumbnail")?.[0];
              const mediaContent = it.querySelector("media\\:content");
              if(mediaContent || mediaContentNode){
                const node = mediaContent || mediaContentNode;
                const mediaUrl = node.getAttribute("url") || "";
                const mediaType = String(node.getAttribute("type") || "").toLowerCase();
                const mediaMedium = String(node.getAttribute("medium") || "").toLowerCase();
                if(mediaUrl && (mediaType.includes("image") || mediaMedium === "image" || (!mediaType && !mediaMedium))){
                  image = mediaUrl;
                }
              } else {
                const mediaThumb = it.querySelector("media\\:thumbnail") || mediaThumbNode;
                if(mediaThumb) image = mediaThumb.getAttribute("url");
              }
              if(!image){
                const enclosure = it.querySelector("enclosure");
                if(enclosure && enclosure.getAttribute("type")?.includes("image")){
                  image = enclosure.getAttribute("url");
                }
              }
              if(!image){
                const imageTag = it.querySelector("image");
                if(imageTag) image = imageTag.textContent?.trim();
              }
              if(!image && descRaw){
                const imgMatch = descRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
                if(imgMatch && imgMatch[1]){
                  image = imgMatch[1].trim();
                }
                if(!image){
                  const decodedDesc = descRaw
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&amp;/g, "&");
                  const decodedMatch = decodedDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
                  if(decodedMatch && decodedMatch[1]){
                    image = decodedMatch[1].trim();
                  }
                }
              }
              if(image && image.startsWith("//")){
                image = `https:${image}`;
              }

              return { title, url: normalizeOutboundLink(link), pubDate, desc, image };
            }), proxyBase === RSS_PROXY_BASE ? "" : "Fallback news source in use", proxyBase !== RSS_PROXY_BASE);

            if(useCache && result.length > 0){
              setCached(cacheKey, result);
            }

            if(result.length > 0){
              noteRssFeedSuccess(rssUrl);
            }

            noteRssRouteSuccess(routeKey);
            return result;
          }catch(error){
            noteRssRouteFailure(routeKey, error);
            console.warn(`RSS fetch failed for ${feedUrl} via ${proxyBase}:`, error.message);
          }
        }
      }

      const fallbackItems = await fetchGoogleNewsFallbackItems(rssUrl, limit, useCache);
      if(useCache && fallbackItems.length > 0){
        setCached(cacheKey, fallbackItems);
      }
      if(fallbackItems.length > 0){
        noteRssFeedSuccess(rssUrl);
        return fallbackItems;
      }

      if(useCache){
        const staleCached = getCachedStale(cacheKey);
        if(staleCached && staleCached.length > 0){
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
    try{
      return await request;
    }finally{
      rssInFlight.delete(inFlightKey);
    }
  }

  // Unified news fetch - automatically uses NewsAPI or RSS based on URL format
  async function fetchNewsItems(source, limit=10, useCache=true){
    // Handle GNews queries (legacy support, auto-converts to RSS)
    if(source.startsWith("gnews:")){
      // Already handled by migration - shouldn't reach here
      return fetchRssItems(source, limit, useCache);
    }
    
    // Handle NewsAPI queries (legacy support, auto-converts to RSS)
    if(source.startsWith("newsapi:")){
      // Already handled by migration - shouldn't reach here
      return fetchRssItems(source, limit, useCache);
    }
    
    // Otherwise use RSS (all sources are now RSS)
    return fetchRssItems(source, limit, useCache);
  }

  async function syncTimezoneFromZip(cfg){
    try{
      const zip = String(cfg?.zipCode || "").trim();
      if(!/^\d{5}$/.test(zip)) return cfg;

      if(cfg?._zipTz === zip && cfg.timezone) return cfg;

      const loc = await geocodeZip(zip);
      const wx = await fetchCurrentWeather(loc.lat, loc.lon);
      const tz = wx?.timezone;

      if(tz && tz !== cfg.timezone){
        return saveConfig({ ...cfg, timezone: tz, _zipTz: zip });
      }
      if(tz && tz === cfg.timezone && cfg?._zipTz !== zip){
        return saveConfig({ ...cfg, _zipTz: zip });
      }
      if(!cfg.timezone) return saveConfig({ ...cfg, timezone: DEFAULTS.timezone });
      return cfg;
    }catch{
      return cfg;
    }
  }

  function renderTopbar(cfg){
    const key = (p) => String(p || "").toLowerCase();
    const path = key(location.pathname.split("/").pop());
    const active = (name) => {
      if(name === "news" && (path === "" || path === "index.html" || path === "index")) return true;
      return path === `${name}.html` || path === name;
    };

    const topbar = document.getElementById("topbar");
    if(!topbar) return;

    topbar.innerHTML = `
      <div class="topbarInner">
        <a href="index.html" class="brand" aria-label="Home">
          <div class="dot" aria-hidden="true"></div>
          <div>
            <div class="brandTitle">Happening Now!</div>
            <div class="brandSub">News • Weather • Stocks • AstroLab</div>
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
            
              ${active("astrolab")
                ? `<span class="btn btnMain btnActive btnDisabled" aria-current="page">AstroLab</span>`
                : `<a class="btn btnMain" href="AstroLab.html">AstroLab</a>`}
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

  async function fetchAndDisplayWeather(_cfg){
    try{
      // Always read the latest cfg so stale references after saveConfig don't break this
      const cfg = window.App?.cfg || loadConfig();
      console.log("[topbar] fetchAndDisplayWeather start", cfg);
      const loc = await resolvePreferredLocation({
        cfg,
        autoDetect: false
      });
      if(!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lon))){
        console.warn("[topbar] fetchAndDisplayWeather: unable to resolve location");
        const weatherEl = document.getElementById("topWeather");
        if(weatherEl){
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

      const res = await fetch(url, { cache:"no-store" });
      if(!res.ok) return;
      
      const data = await res.json();
      const current = data.current || {};
      const daily = (data.daily?.temperature_2m_max || [])[0];
      const dailyMin = (data.daily?.temperature_2m_min || [])[0];
      
      const weatherEl = document.getElementById("topWeather");
      if(!weatherEl) return;
      
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
    }catch{/* best-effort only */}
  }

  // Reusable component: News Card Header
  function createCardHeader({ name, site, onOpen }){
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
    if(onOpen){
      open.addEventListener("click", () => onOpen(site));
    }

    head.appendChild(left);
    head.appendChild(open);

    return head;
  }

  // Reusable component: Page Header
  function createPageHeader({ title, subtitle, actions=[] }){
    const header = document.createElement("section");
    header.className = "pageHead";

    const titleSection = document.createElement("div");
    const h1 = document.createElement("h1");
    h1.textContent = title;
    const sub = document.createElement("div");
    sub.className = "sub";
    if(subtitle) sub.textContent = subtitle;
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

  function formatTime(date, timezone){
    try{
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }).format(date);
    }catch{
      return date.toLocaleTimeString();
    }
  }

  function formatDate(date, timezone){
    try{
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric"
      }).format(date);
    }catch{
      return date.toLocaleDateString();
    }
  }

  function getTimezoneLabel(timezone){
    const tz = TIMEZONES.find(t => t.value === timezone);
    return tz ? tz.label : timezone.split("/").pop();
  }

  function getTimezoneAbbrev(timezone){
    const full = getTimezoneLabel(timezone);       // e.g. "Eastern (ET)"
    const m = /\(([^)]+)\)/.exec(full);
    return m ? m[1] : full;                         // => "ET"
  }
  
  function maybeRenderLegacyTopbar(cfg){
    const topbar = document.getElementById("topbar");
    if(!topbar) return;
    if(topbar.classList.contains("hn-topbar")) return;
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
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => maybeRenderLegacyTopbar(cfg), { once:true });
  }else{
    maybeRenderLegacyTopbar(cfg);
  }

  function cacheSet(key, value){
    try{
      localStorage.setItem(key, JSON.stringify(value));
    }catch{}
  }
  
  function cacheGet(key){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }catch{
      return null;
    }
  }

  function parseDateOnlyLocal(value){
    if(typeof value !== "string") return null;
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return null;

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if(!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

    return new Date(year, month - 1, day);
  }

  function parseTimeValue(value){
    if(typeof value === "number") return value;
    if(typeof value !== "string") return NaN;

    const localDate = parseDateOnlyLocal(value);
    if(localDate) return localDate.getTime();

    return Date.parse(value);
  }
  
  function cacheAgeMs(savedAt){
    const t = parseTimeValue(savedAt);
    return Number.isFinite(t) ? (Date.now() - t) : Infinity;
  }
  
  function formatAge(ms){
    if(!Number.isFinite(ms) || ms < 0) return "";
    const s = Math.floor(ms / 1000);
    if(s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if(m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h`;
  }

  // Stock price fetching - uses multiple free APIs with fallback
  async function fetchStockPrice(symbol){
    const cacheKey = `stock:${symbol}`;
    const cached = getCached(cacheKey);
    if(cached && Number.isFinite(Number(cached.price)) && Number(cached.price) > 0) return cached;

    try{
      // Normalize symbol: remove exchange prefix like NASDAQ:, BITSTAMP:, etc.
      const baseSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;
      
      // Try Finnhub first (if API key is configured)
      if(STOCK_API_KEYS.finnhub){
        const result = await fetchStockPriceFromFinnhub(baseSymbol);
        if(result){
          setCached(cacheKey, result);
          return result;
        }
      }
      
      // Try Alpha Vantage (if API key is configured)
      if(STOCK_API_KEYS.alphaVantage){
        const result = await fetchStockPriceFromAlphaVantage(baseSymbol);
        if(result){
          setCached(cacheKey, result);
          return result;
        }
      }
      
      // Try IEX Cloud (if API key is configured)
      if(STOCK_API_KEYS.iex){
        const result = await fetchStockPriceFromIex(baseSymbol);
        if(result){
          setCached(cacheKey, result);
          return result;
        }
      }
      
      // Try Twelve Data free endpoint as last resort
      const result = await fetchStockPriceFromTwelveData(baseSymbol);
      if(result){
        setCached(cacheKey, result);
        return result;
      }

      // Fallback: Yahoo chart endpoint (works for many mutual funds, incl. FNIPX)
      const yahooResult = await fetchStockPriceFromYahooChart(baseSymbol);
      if(yahooResult){
        setCached(cacheKey, yahooResult);
        return yahooResult;
      }

      // Final fallback (no API key): Stooq end-of-day quote via CORS-friendly relay
      const stooqResult = await fetchStockPriceFromStooq(baseSymbol);
      if(stooqResult){
        setCached(cacheKey, stooqResult);
        return stooqResult;
      }
      
      return null;
    }catch(error){
      handleError(error, "Stock Price Fetch");
      return null;
    }
  }

  async function fetchStockCandles(symbol, options = {}){
    const resolution = String(options.resolution || "30");
    const days = Number.isFinite(options.days) ? options.days : 5;

    const baseSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;
    const now = Math.floor(Date.now() / 1000);
    const bucket = Math.max(1, Number(resolution)) * 60;
    const to = Math.floor(now / bucket) * bucket;
    const from = to - Math.max(1, days) * 24 * 60 * 60;
    const cacheKey = `candles:${baseSymbol}:${resolution}:${from}:${to}`;
    const cached = getCached(cacheKey);
    if(cached) return { data: cached, error: null, source: "cache" };

    let finnhubError = "";
    if(STOCK_API_KEYS.finnhub){
      const res = await fetchStockCandlesFromFinnhub(baseSymbol, resolution, from, to);
      if(res.data){
        setCached(cacheKey, res.data);
        return { data: res.data, error: null, source: "finnhub" };
      }
      finnhubError = res.error || "Finnhub: no data";
    } else {
      finnhubError = "Finnhub key not configured";
    }

    const tdRes = await fetchStockCandlesFromTwelveData(baseSymbol, resolution, days);
    if(tdRes.data){
      setCached(cacheKey, tdRes.data);
      return { data: tdRes.data, error: null, source: "twelvedata" };
    }

    const yahooRes = await fetchStockCandlesFromYahooChart(baseSymbol, days);
    if(yahooRes.data){
      setCached(cacheKey, yahooRes.data);
      return { data: yahooRes.data, error: null, source: "yahoo" };
    }

    const stooqRes = await fetchStockCandlesFromStooq(baseSymbol, days);
    if(stooqRes.data){
      setCached(cacheKey, stooqRes.data);
      return { data: stooqRes.data, error: null, source: "stooq" };
    }

    const twelveError = tdRes.error || "Twelve Data: no data";
    const yahooError = yahooRes.error || "Yahoo: no data";
    const stooqError = stooqRes.error || "Stooq: no data";
    return { data: null, error: `${finnhubError}; ${twelveError}; ${yahooError}; ${stooqError}`, source: null };
  }

  async function fetchStockPriceFromYahooChart(symbol){
    try{
      const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
      const proxyUrl = `${RSS_PROXY_BASE}${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl, { cache: "no-store" });
      if(!res.ok) return null;

      const payload = await res.json();
      const result = payload?.chart?.result?.[0];
      if(!result) return null;

      const closes = result?.indicators?.quote?.[0]?.close;
      if(!Array.isArray(closes)) return null;

      const finiteCloses = closes.filter(v => Number.isFinite(Number(v))).map(v => Number(v));
      if(finiteCloses.length === 0) return null;

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
    }catch{
      return null;
    }
  }

  async function fetchStockCandlesFromYahooChart(symbol, days){
    try{
      const range = Math.max(1, Number(days) || 5) <= 5 ? "1mo" : "3mo";
      const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
      const proxyUrl = `${RSS_PROXY_BASE}${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl, { cache: "no-store" });
      if(!res.ok) return { data: null, error: `Yahoo error (${res.status})` };

      const payload = await res.json();
      const closes = payload?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if(!Array.isArray(closes)) return { data: null, error: "Yahoo: no data" };

      const points = closes.filter(v => Number.isFinite(Number(v))).map(v => Number(v));
      if(points.length < 2) return { data: null, error: "Yahoo: invalid data" };

      const desired = Math.max(5, Math.min(60, Math.round((Number(days) || 5) * 2)));
      return { data: points.slice(-desired), error: null };
    }catch(err){
      return { data: null, error: `Yahoo fetch error (${err?.message || "unknown"})` };
    }
  }

  function normalizeSymbolForStooq(symbol){
    const base = String(symbol || "").trim().toUpperCase();
    if(!base) return "";
    const cleaned = base.replace(/\./g, "-");
    return `${cleaned}.US`;
  }

  function shouldSkipFinnhubSymbol(symbol){
    const normalized = String(symbol || "").trim().toUpperCase();
    if(!normalized) return true;

    const base = normalized.includes(":") ? normalized.split(":").pop() : normalized;

    // Finnhub free plans commonly reject many index/futures/forex synthetic symbols.
    if(base.startsWith("^") || base.includes("=") || base.includes("/")){
      return true;
    }

    // Mutual funds and similar instruments commonly end in X and usually 403 on Finnhub.
    return base.length >= 5 && base.endsWith("X");
  }

  async function fetchStockPriceFromStooq(symbol){
    try{
      const stooqSymbol = normalizeSymbolForStooq(symbol);
      if(!stooqSymbol) return null;

      const targetUrl = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
      const proxyUrl = `${RSS_PROXY_BASE}${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl, { cache: "no-store" });
      if(!res.ok) return null;

      const csv = (await res.text()).trim();
      const rows = csv.split(/\r?\n/);
      if(rows.length < 2) return null;

      const [sym, , , open, high, low, close] = rows[1].split(",").map(v => String(v || "").replace(/^"|"$/g, "").trim());
      const price = Number(close);
      if(!Number.isFinite(price) || price <= 0) return null;

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
    }catch{
      return null;
    }
  }

  async function fetchStockCandlesFromStooq(symbol, days){
    try{
      const stooqSymbol = normalizeSymbolForStooq(symbol);
      if(!stooqSymbol) return { data: null, error: "Stooq symbol invalid" };

      const targetUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
      const proxyUrl = `${RSS_PROXY_BASE}${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl, { cache: "no-store" });
      if(!res.ok) return { data: null, error: `Stooq error (${res.status})` };

      const csv = (await res.text()).trim();
      const rows = csv.split(/\r?\n/);
      if(rows.length < 3) return { data: null, error: "Stooq: no data" };

      const closes = rows
        .slice(1)
        .map(line => line.split(",")[4])
        .map(v => Number(String(v || "").replace(/^"|"$/g, "").trim()))
        .filter(v => Number.isFinite(v));

      if(closes.length < 2) return { data: null, error: "Stooq: invalid data" };

      const desired = Math.max(5, Math.min(60, Math.round((Number(days) || 5) * 2)));
      const sliced = closes.slice(-desired);
      return { data: sliced, error: null };
    }catch(err){
      return { data: null, error: `Stooq fetch error (${err?.message || "unknown"})` };
    }
  }

  async function fetchStockCandlesFromFinnhub(symbol, resolution, from, to){
    if(shouldSkipFinnhubSymbol(symbol)){
      return { data: null, error: "Finnhub skipped for unsupported fund symbol" };
    }
    try{
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${STOCK_API_KEYS.finnhub}`;
      const res = await fetch(url, { cache: "no-store" });
      if(!res.ok){
        if(res.status === 401) return { data: null, error: "Finnhub unauthorized (401)" };
        if(res.status === 403) return { data: null, error: "Finnhub forbidden (403)" };
        if(res.status === 429) return { data: null, error: "Finnhub rate limit (429)" };
        return { data: null, error: `Finnhub error (${res.status})` };
      }

      const data = await res.json();
      if(data.s !== "ok" || !Array.isArray(data.c) || data.c.length < 2){
        return { data: null, error: `Finnhub ${data.s || "no_data"}` };
      }

      const maxPoints = 60;
      const step = Math.max(1, Math.floor(data.c.length / maxPoints));
      const compact = data.c.filter((_, i) => i % step === 0);
      return { data: compact, error: null };
    }catch(err){
      return { data: null, error: `Finnhub fetch error (${err?.message || "unknown"})` };
    }
  }

  async function fetchStockCandlesFromTwelveData(symbol, resolution, days){
    try{
      const apiKey = STOCK_API_KEYS.twelvedata || "";
      if(!apiKey) return { data: null, error: "Twelve Data key not configured" };

      const interval = Number(resolution) >= 60 ? `${Math.round(Number(resolution) / 60)}h` : `${resolution}min`;
      const outputSize = Math.max(24, Math.min(240, Math.round(days * 24 * 60 / Math.max(1, Number(resolution)))));
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputSize}&apikey=${apiKey}`;
      const res = await fetch(url, { cache: "no-store" });
      if(!res.ok){
        return { data: null, error: `Twelve Data error (${res.status})` };
      }

      const data = await res.json();
      if(data?.status === "error"){
        return { data: null, error: `Twelve Data: ${data?.message || "error"}` };
      }

      if(!Array.isArray(data?.values) || data.values.length < 2){
        return { data: null, error: "Twelve Data: no data" };
      }

      const closes = data.values
        .map(v => Number(v?.close))
        .filter(v => Number.isFinite(v))
        .reverse();

      if(closes.length < 2) return { data: null, error: "Twelve Data: invalid data" };

      const maxPoints = 60;
      const step = Math.max(1, Math.floor(closes.length / maxPoints));
      const compact = closes.filter((_, i) => i % step === 0);
      return { data: compact, error: null };
    }catch(err){
      return { data: null, error: `Twelve Data fetch error (${err?.message || "unknown"})` };
    }
  }

  // Finnhub API
  async function fetchStockPriceFromFinnhub(symbol){
    if(shouldSkipFinnhubSymbol(symbol)){
      return null;
    }
    try{
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${STOCK_API_KEYS.finnhub}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const res = await fetch(url, { 
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if(!res.ok){
        // 403 Forbidden = symbol not supported by Finnhub (e.g. mutual funds)
        // 401 Unauthorized = invalid API key
        // 429 Too Many Requests = rate limit hit
        if(res.status === 403){
          console.info(`Finnhub: ${symbol} not supported on this plan; trying fallback providers.`);
        } else {
          console.warn(`Finnhub error for ${symbol}: ${res.status}`);
        }
        return null;
      }
      
      const data = await res.json();
      if(data.error){
        console.warn(`Finnhub API error for ${symbol}:`, data.error);
        return null;
      }
      
      const price = Number(data.c);
      if(Number.isFinite(price) && price > 0){ 
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
    }catch(err){
      console.warn(`Finnhub fetch error for ${symbol}:`, err.message);
      return null;
    }
  }

  // Alpha Vantage API
  async function fetchStockPriceFromAlphaVantage(symbol){
    try{
      const res = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${STOCK_API_KEYS.alphaVantage}`,
        { cache: "no-store" }
      );
      if(res.ok){
        const data = await res.json();
        const quote = data["Global Quote"];
        if(quote && quote["05. price"]){
          return {
            symbol,
            price: parseFloat(quote["05. price"]),
            change: parseFloat(quote["09. change"]) || 0,
            changePercent: parseFloat(quote["10. change percent"]?.replace('%','')) || 0,
            previousClose: parseFloat(quote["08. previous close"]),
            timestamp: new Date().toISOString()
          };
        }
      }
    }catch{}
    return null;
  }

  // Try IEX Cloud free tier
  async function fetchStockPriceFromIex(symbol){
    try{
      if(!STOCK_API_KEYS.iex){
        return null; // API key not configured
      }
      const res = await fetch(
        `https://cloud.iexapis.com/stable/quote/${encodeURIComponent(symbol)}?token=${STOCK_API_KEYS.iex}&displayPercent=true`,
        { cache: "no-store" }
      );
      if(res.ok){
        const data = await res.json();
        if(data.latestPrice){
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
    }catch{}
    return null;
  }

  // Try Twelve Data free endpoint
  async function fetchStockPriceFromTwelveData(symbol){
    try{
      const apiKey = STOCK_API_KEYS.twelvedata || "demo";
      const res = await fetch(
        `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`,
        { cache: "no-store" }
      );
      if(!res.ok){
        return null;
      }
      const data = await res.json();
      if(data?.status === "error"){
        return null;
      }
      const price = Number(data.price ?? data.close);
      if(Number.isFinite(price) && price > 0){
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
    }catch{}
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

  function parsePercentLike(value){
    if(value === null || value === undefined) return 0;
    const cleaned = String(value).replace(/[()%+]/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeFmpMover(item){
    const symbol = String(item?.symbol || "").trim();
    if(!symbol) return null;

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

  async function fetchFmpMovers(kind, limit){
    try{
      const route = String(kind || "").trim().toLowerCase();
      if(!["gainers", "losers", "actives"].includes(route)) return null;

      const url = `https://financialmodelingprep.com/api/v3/stock_market/${route}?apikey=${encodeURIComponent(FMP_API_KEY)}`;
      const proxied = `${RSS_PROXY_BASE}${encodeURIComponent(url)}`;
      const res = await fetch(proxied, { cache: "no-store" });
      if(!res.ok) return null;

      const data = await res.json();
      if(!Array.isArray(data) || data.length === 0) return null;

      const normalized = data
        .map(normalizeFmpMover)
        .filter(Boolean)
        .filter(item => Number.isFinite(item.price) && item.price > 0)
        .slice(0, Math.max(1, Number(limit) || 5));

      return normalized.length > 0 ? normalized : null;
    }catch(err){
      console.warn(`FMP ${kind} fetch failed:`, err?.message || err);
      return null;
    }
  }

  async function fetchYahooMovers(scrId, limit){
    try{
      const allowed = new Set(["day_gainers", "day_losers", "most_actives"]);
      const key = String(scrId || "").trim().toLowerCase();
      if(!allowed.has(key)) return null;

      const count = Math.max(1, Math.min(25, Number(limit) || 5));
      const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=${count}&scrIds=${encodeURIComponent(key)}`;
      const proxied = `${RSS_PROXY_BASE}${encodeURIComponent(url)}`;
      const res = await fetch(proxied, { cache: "no-store" });
      if(!res.ok) return null;

      const data = await res.json();
      const quotes = data?.finance?.result?.[0]?.quotes;
      if(!Array.isArray(quotes) || quotes.length === 0) return null;

      const normalized = quotes.map((q) => {
        const symbol = String(q?.symbol || "").trim();
        const price = Number(q?.regularMarketPrice);
        const change = Number(q?.regularMarketChange);
        const changePercent = Number(q?.regularMarketChangePercent);
        if(!symbol || !Number.isFinite(price)) return null;
        return {
          symbol,
          name: String(q?.shortName || q?.longName || symbol).trim() || symbol,
          price,
          change: Number.isFinite(change) ? change : 0,
          changePercent: Number.isFinite(changePercent) ? changePercent : 0
        };
      }).filter(Boolean);

      return normalized.length > 0 ? normalized.slice(0, count) : null;
    }catch(err){
      console.warn(`Yahoo ${scrId} fetch failed:`, err?.message || err);
      return null;
    }
  }

  function withMoverSource(items, source){
    return {
      items: Array.isArray(items) ? items : [],
      source: String(source || "unknown")
    };
  }

  // Fetch real market data from Alpha Vantage (TOP_GAINERS endpoint)
  async function fetchStockGainers() {
    const cacheKey = "market:gainers";
    const cached = getCached(cacheKey);
    if(cached) return cached;

    try {
      // Try Alpha Vantage first for real market gainers
      if(STOCK_API_KEYS.alphaVantage) {
        const url = `https://www.alphavantage.co/query?function=TOP_GAINERS&apikey=${STOCK_API_KEYS.alphaVantage}`;
        const res = await fetch(url, { cache: "no-store" });
        
        if(res.ok) {
          const data = await res.json();
          if(data.top_gainers && Array.isArray(data.top_gainers)) {
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
      if(yahooGainers && yahooGainers.length > 0){
        const payload = withMoverSource(yahooGainers, "yahoo");
        setCached(cacheKey, payload);
        return payload;
      }

      // Secondary dynamic source: FMP market gainers list via proxy.
      const fmpGainers = await fetchFmpMovers("gainers", 5);
      if(fmpGainers && fmpGainers.length > 0){
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
      
      if(gainers.length > 0) {
        const payload = withMoverSource(gainers, "preset-list");
        setCached(cacheKey, payload);
        return payload;
      }
      return null;
    } catch(err) {
      console.error("Finnhub gainers fetch error:", err.message);
      return null;
    }
  }

  async function fetchStockLosers() {
    const cacheKey = "market:losers";
    const cached = getCached(cacheKey);
    if(cached) return cached;

    try {
      // Try Alpha Vantage first for real market losers
      if(STOCK_API_KEYS.alphaVantage) {
        const url = `https://www.alphavantage.co/query?function=TOP_LOSERS&apikey=${STOCK_API_KEYS.alphaVantage}`;
        const res = await fetch(url, { cache: "no-store" });
        
        if(res.ok) {
          const data = await res.json();
          if(data.top_losers && Array.isArray(data.top_losers)) {
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
      if(yahooLosers && yahooLosers.length > 0){
        const payload = withMoverSource(yahooLosers, "yahoo");
        setCached(cacheKey, payload);
        return payload;
      }

      // Secondary dynamic source: FMP market losers list via proxy.
      const fmpLosers = await fetchFmpMovers("losers", 5);
      if(fmpLosers && fmpLosers.length > 0){
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
      
      if(losers.length > 0) {
        const payload = withMoverSource(losers, "preset-list");
        setCached(cacheKey, payload);
        return payload;
      }
      return null;
    } catch(err) {
      console.error("Finnhub losers fetch error:", err.message);
      return null;
    }
  }

  async function fetchStockMovers() {
    const cacheKey = "market:movers";
    const cached = getCached(cacheKey);
    if(cached) return cached;

    try {
      // Combine both gainers and losers data to get most active/volatile stocks
      let allStocks = [];
      
      if(STOCK_API_KEYS.alphaVantage) {
        try {
          const gainerUrl = `https://www.alphavantage.co/query?function=TOP_GAINERS&apikey=${STOCK_API_KEYS.alphaVantage}`;
          const gainerRes = await fetch(gainerUrl, { cache: "no-store" });
          if(gainerRes.ok) {
            const gainerData = await gainerRes.json();
            if(gainerData.top_gainers) {
              allStocks = allStocks.concat(gainerData.top_gainers.slice(0, 3));
            }
          }
          
          const loserUrl = `https://www.alphavantage.co/query?function=TOP_LOSERS&apikey=${STOCK_API_KEYS.alphaVantage}`;
          const loserRes = await fetch(loserUrl, { cache: "no-store" });
          if(loserRes.ok) {
            const loserData = await loserRes.json();
            if(loserData.top_losers) {
              allStocks = allStocks.concat(loserData.top_losers.slice(0, 3));
            }
          }
          
          if(allStocks.length > 0) {
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
        } catch(err) {
          console.warn("Alpha Vantage movers failed, falling back:", err.message);
        }
      }

      const yahooActives = await fetchYahooMovers("most_actives", 6);
      if(yahooActives && yahooActives.length > 0){
        const payload = withMoverSource(yahooActives, "yahoo");
        setCached(cacheKey, payload);
        return payload;
      }

      // Secondary dynamic source: FMP most-active list.
      const fmpActives = await fetchFmpMovers("actives", 6);
      if(fmpActives && fmpActives.length > 0){
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
      
      if(movers.length > 0) {
        const payload = withMoverSource(movers, "preset-list");
        setCached(cacheKey, payload);
        return payload;
      }
      return null;
    } catch(err) {
      console.error("Finnhub movers fetch error:", err.message);
      return null;
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
    abbreviateState
  };

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
          registration.update().catch(() => {});

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
