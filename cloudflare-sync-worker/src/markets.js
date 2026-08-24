// One cached market snapshot, shared by every visitor.
//
// Each tile on the stocks page used to be its own browser fetch: a cold page
// fired around nineteen quote calls, and the free provider tiers (TwelveData
// allows 8 credits a minute and charges one per symbol even inside a batch,
// Finnhub 60 a minute) meant the page rate-limited itself before anyone
// touched it. More visitors made it strictly worse.
//
// Fetching here instead makes the cost constant. The same handful of upstream
// calls fills a bundle in KV, and every visitor is served from that bundle, so
// ten visitors a day and ten thousand cost the same. The browser makes one
// request rather than nineteen.

const SNAPSHOT_KEY = "public:markets-snapshot:v1";
const SNAPSHOT_TTL_MS = 15 * 60 * 1000;
const CURRENCY_URL = "https://open.er-api.com/v6/latest/USD";

// Yahoo's v8 chart endpoint, one symbol at a time. Its v7 batch endpoint has
// needed an authenticated crumb since late 2024 and answers 401 to anonymous
// callers, which is why this fans out instead of asking for everything at once.
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/";

// How many upstream calls run at once. Yahoo tolerates the whole set arriving
// together but starts shedding under a burst, and nothing here is urgent — the
// refresh happens behind a served-stale response.
const FETCH_CONCURRENCY = 6;

// `group` is what the page arranges tiles by. Keys match MARKET_INDEX_DEFS in
// assets/common.js; changing one without the other leaves a tile unfilled.
const INSTRUMENTS = [
  { key: "dow", name: "DOW", group: "us-indices", yahoo: "^DJI" },
  { key: "sp500", name: "S&P 500", group: "us-indices", yahoo: "^GSPC" },
  { key: "nasdaq", name: "NASDAQ", group: "us-indices", yahoo: "^IXIC" },
  { key: "russell2000", name: "RUSSELL 2000", group: "us-indices", yahoo: "^RUT" },
  { key: "sp400", name: "S&P MIDCAP 400", group: "us-indices", yahoo: "MID" },
  // ^SML returns no price; IJR is the usual S&P SmallCap 600 proxy and does.
  { key: "sp600", name: "S&P SMALLCAP 600", group: "us-indices", yahoo: "IJR" },
  { key: "microcap", name: "MICROCAP", group: "us-indices", yahoo: "IWC" },
  { key: "vix", name: "VIX", group: "us-indices", yahoo: "^VIX" },

  { key: "ftse100", name: "FTSE 100", group: "global-indices", yahoo: "^FTSE" },
  { key: "dax", name: "DAX", group: "global-indices", yahoo: "^GDAXI" },
  { key: "nikkei225", name: "NIKKEI 225", group: "global-indices", yahoo: "^N225" },
  { key: "hangseng", name: "HANG SENG", group: "global-indices", yahoo: "^HSI" },

  { key: "gold", name: "GOLD", group: "commodities", yahoo: "GC=F" },
  { key: "silver", name: "SILVER", group: "commodities", yahoo: "SI=F" },
  { key: "copper", name: "COPPER", group: "commodities", yahoo: "HG=F" },
  { key: "crudeoil", name: "CRUDE OIL", group: "commodities", yahoo: "CL=F" },
  { key: "brent", name: "BRENT", group: "commodities", yahoo: "BZ=F" },
  { key: "natgas", name: "NAT GAS", group: "commodities", yahoo: "NG=F" },

  { key: "us10y", name: "US 10Y", group: "rates", yahoo: "^TNX" },
  { key: "dxy", name: "DXY", group: "rates", yahoo: "DX-Y.NYB" },
  { key: "eurusd", name: "EUR/USD", group: "rates", yahoo: "EURUSD=X" },

  { key: "bitcoin", name: "BITCOIN", group: "crypto", yahoo: "BTC-USD" },
  { key: "ethereum", name: "ETHEREUM", group: "crypto", yahoo: "ETH-USD" },
];

// A readable slice of the ~166 rates the upstream returns. Everything else is
// dropped so the bundle stays small; add a code here to surface it.
const CURRENCIES = [
  ["EUR", "Euro"], ["GBP", "British Pound"], ["JPY", "Japanese Yen"],
  ["CHF", "Swiss Franc"], ["CAD", "Canadian Dollar"], ["AUD", "Australian Dollar"],
  ["NZD", "New Zealand Dollar"], ["CNY", "Chinese Yuan"], ["HKD", "Hong Kong Dollar"],
  ["SGD", "Singapore Dollar"], ["INR", "Indian Rupee"], ["KRW", "South Korean Won"],
  ["TWD", "Taiwan Dollar"], ["MXN", "Mexican Peso"], ["BRL", "Brazilian Real"],
  ["ZAR", "South African Rand"], ["SEK", "Swedish Krona"], ["NOK", "Norwegian Krone"],
  ["DKK", "Danish Krone"], ["PLN", "Polish Zloty"], ["TRY", "Turkish Lira"],
  ["ILS", "Israeli Shekel"], ["AED", "UAE Dirham"], ["THB", "Thai Baht"],
];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// The single place that knows how to read a quote out of Yahoo's v8 chart
// endpoint. Exported because quotes.js serves the watchlist from the same
// provider — one copy so the board and the watchlist can't drift apart.
export async function fetchYahooChartQuote(symbol) {
  const url = `${YAHOO_CHART}${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        // Yahoo answers a bare API client from a Worker IP with an error page
        // rather than JSON — the same heuristic the RSS proxy carries a browser
        // UA to get past. Without this every quote here comes back empty while
        // the identical URL works through /v1/rss/raw.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      // No `cf: { cacheEverything }` here on purpose. The KV bundle already is
      // the cache layer, and edge-caching these responses cached the failures
      // too: one bad round of fetches stuck for the full TTL and kept refilling
      // the snapshot with nothing long after the underlying problem was fixed.
    });
    if (!res.ok) return null;

    const meta = (await res.json())?.chart?.result?.[0]?.meta;
    const price = num(meta?.regularMarketPrice);
    if (price === null) return null;

    // previousClose is absent outside regular hours on some symbols; the chart
    // variant is the same number and is always there.
    const prev = num(meta?.previousClose) ?? num(meta?.chartPreviousClose);
    const change = prev === null ? null : price - prev;
    return {
      price,
      previousClose: prev,
      change,
      changePercent: change === null || !prev ? null : (change / prev) * 100,
      // Only the watchlist cards use these; the board tiles ignore them.
      high: num(meta?.regularMarketDayHigh),
      low: num(meta?.regularMarketDayLow),
      currency: meta?.currency || "USD",
    };
  } catch {
    return null;
  }
}

async function fetchYahooQuote(instrument) {
  const quote = await fetchYahooChartQuote(instrument.yahoo);
  if (!quote) return null;
  return {
    key: instrument.key,
    name: instrument.name,
    group: instrument.group,
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    currency: quote.currency,
  };
}

async function fetchCurrencies() {
  try {
    const res = await fetch(CURRENCY_URL, {
      headers: { Accept: "application/json" },
      // Uncached for the same reason as the quote fetch above.
    });
    if (!res.ok) return [];

    const data = await res.json();
    const rates = data?.rates || {};
    return CURRENCIES.map(([code, name]) => {
      const rate = num(rates[code]);
      return rate === null ? null : {
        key: `fx-${code.toLowerCase()}`,
        name: `USD/${code}`,
        label: name,
        group: "currencies",
        price: rate,
        // The free tier publishes one set of rates a day, so a change figure
        // would be the same number every request. Better to show none than a
        // flat zero that reads like the market didn't move.
        change: null,
        changePercent: null,
        currency: code,
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// Small pool rather than Promise.all over the whole list — see FETCH_CONCURRENCY.
export async function mapWithConcurrency(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...await Promise.all(items.slice(i, i + limit).map(fn)));
  }
  return out;
}

export async function buildSnapshot(env) {
  const [quotes, currencies] = await Promise.all([
    mapWithConcurrency(INSTRUMENTS, FETCH_CONCURRENCY, fetchYahooQuote),
    fetchCurrencies(),
  ]);

  const items = [...quotes.filter(Boolean), ...currencies];
  const snapshot = {
    fetchedAt: new Date().toISOString(),
    count: items.length,
    // Reported so a thinning upstream is visible in the payload rather than
    // silently showing fewer tiles.
    expected: INSTRUMENTS.length + CURRENCIES.length,
    items,
  };

  if (items.length) {
    await env.HN_STATE_DATA.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
  }
  return snapshot;
}

// Serve cached, refresh behind it. A visitor never waits on upstream unless the
// bundle has never been built; a failed refresh keeps serving the last good one
// rather than blanking every tile.
export async function getMarketSnapshot(env, ctx) {
  let cached = null;
  try {
    cached = await env.HN_STATE_DATA.get(SNAPSHOT_KEY, "json");
  } catch {
    cached = null;
  }

  const age = cached?.fetchedAt ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
  if (cached && age < SNAPSHOT_TTL_MS) return { ...cached, cached: true };

  if (cached) {
    ctx?.waitUntil?.(buildSnapshot(env).catch(() => {}));
    return { ...cached, cached: true, stale: true };
  }

  return await buildSnapshot(env);
}
