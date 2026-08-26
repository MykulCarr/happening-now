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

// Bumped from v1 when the board grew from 23 instruments to 101 and currencies
// moved onto live FX quotes. The old bundle is a different shape, so starting
// clean beats serving a 15-minute window of half-empty tiles.
const SNAPSHOT_KEY = "public:markets-snapshot:v2";
const SNAPSHOT_TTL_MS = 15 * 60 * 1000;

// Yahoo's v8 chart endpoint, one symbol at a time. Still used by quotes.js for
// the watchlist, where the symbols are per-visitor and arrive one at a time
// anyway, so there is no fixed list to batch.
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/";

// Yahoo's v7 *spark* endpoint takes many symbols in one call and carries the
// same `meta` block the chart endpoint does — price, previous close, day
// high/low. Unlike v7/quote it needs no authenticated crumb.
//
// The board is a fixed list, so batching here is what makes a 149-symbol
// snapshot affordable: 8 upstream calls instead of 149, and fewer than the 24
// the old one-at-a-time version made for a quarter as many tiles. That matters
// beyond politeness — a Worker request is capped at 50 subrequests on the free
// plan, so the unbatched version simply could not have grown this far.
const YAHOO_SPARK = "https://query1.finance.yahoo.com/v7/finance/spark?range=1d&interval=1d&symbols=";

// Verified against the live endpoint from a Worker IP: 20 symbols answer 200,
// 21 answer 400. Raising this doesn't fail loudly — it drops a whole batch.
const SPARK_BATCH = 20;

// How many batches run at once. Yahoo starts answering 429 under a burst and
// nothing here is urgent — the refresh happens behind a served-stale response.
const FETCH_CONCURRENCY = 3;

// `group` is what the page arranges tiles by. Keys match MARKET_INDEX_DEFS in
// assets/common.js; changing one without the other leaves a tile unfilled.
const INSTRUMENTS = [
  { key: "dow", name: "DOW", group: "us-indices", yahoo: "^DJI" },
  { key: "sp500", name: "S&P 500", group: "us-indices", yahoo: "^GSPC" },
  { key: "nasdaq", name: "NASDAQ", group: "us-indices", yahoo: "^IXIC" },
  { key: "nasdaq100", name: "NASDAQ 100", group: "us-indices", yahoo: "^NDX" },
  { key: "sp100", name: "S&P 100", group: "us-indices", yahoo: "^OEX" },
  { key: "nyse", name: "NYSE COMPOSITE", group: "us-indices", yahoo: "^NYA" },
  { key: "wilshire5000", name: "WILSHIRE 5000", group: "us-indices", yahoo: "^W5000" },
  { key: "russell1000", name: "RUSSELL 1000", group: "us-indices", yahoo: "^RUI" },
  { key: "russell2000", name: "RUSSELL 2000", group: "us-indices", yahoo: "^RUT" },
  { key: "russell3000", name: "RUSSELL 3000", group: "us-indices", yahoo: "^RUA" },
  { key: "sp400", name: "S&P MIDCAP 400", group: "us-indices", yahoo: "^SP400" },
  { key: "sp600", name: "S&P SMALLCAP 600", group: "us-indices", yahoo: "^SP600" },
  // No index symbol for the microcap tier returns a price; IWC is the usual proxy.
  { key: "microcap", name: "MICROCAP", group: "us-indices", yahoo: "IWC" },
  { key: "djtransport", name: "DOW TRANSPORTS", group: "us-indices", yahoo: "^DJT" },
  { key: "djutility", name: "DOW UTILITIES", group: "us-indices", yahoo: "^DJU" },
  { key: "vix", name: "VIX", group: "us-indices", yahoo: "^VIX" },
  { key: "vxn", name: "VXN", group: "us-indices", yahoo: "^VXN" },

  { key: "ftse100", name: "FTSE 100", group: "global-indices", yahoo: "^FTSE" },
  { key: "dax", name: "DAX", group: "global-indices", yahoo: "^GDAXI" },
  { key: "cac40", name: "CAC 40", group: "global-indices", yahoo: "^FCHI" },
  { key: "ibex35", name: "IBEX 35", group: "global-indices", yahoo: "^IBEX" },
  { key: "ftsemib", name: "FTSE MIB", group: "global-indices", yahoo: "FTSEMIB.MI" },
  { key: "smi", name: "SWISS SMI", group: "global-indices", yahoo: "^SSMI" },
  { key: "aex", name: "AEX", group: "global-indices", yahoo: "^AEX" },
  { key: "bel20", name: "BEL 20", group: "global-indices", yahoo: "^BFX" },
  { key: "omx30", name: "OMX STOCKHOLM 30", group: "global-indices", yahoo: "^OMX" },
  { key: "estoxx50", name: "EURO STOXX 50", group: "global-indices", yahoo: "^STOXX50E" },
  { key: "stoxx600", name: "STOXX EUROPE 600", group: "global-indices", yahoo: "^STOXX" },
  { key: "euronext100", name: "EURONEXT 100", group: "global-indices", yahoo: "^N100" },
  { key: "tsx", name: "S&P/TSX", group: "global-indices", yahoo: "^GSPTSE" },
  { key: "asx200", name: "ASX 200", group: "global-indices", yahoo: "^AXJO" },
  { key: "nzx50", name: "NZX 50", group: "global-indices", yahoo: "^NZ50" },
  { key: "nikkei225", name: "NIKKEI 225", group: "global-indices", yahoo: "^N225" },
  { key: "hangseng", name: "HANG SENG", group: "global-indices", yahoo: "^HSI" },
  { key: "kospi", name: "KOSPI", group: "global-indices", yahoo: "^KS11" },
  { key: "shanghai", name: "SHANGHAI COMP", group: "global-indices", yahoo: "000001.SS" },
  { key: "shenzhen", name: "SHENZHEN COMP", group: "global-indices", yahoo: "399001.SZ" },
  { key: "taiex", name: "TAIEX", group: "global-indices", yahoo: "^TWII" },
  { key: "sti", name: "STRAITS TIMES", group: "global-indices", yahoo: "^STI" },
  { key: "jakarta", name: "JAKARTA COMP", group: "global-indices", yahoo: "^JKSE" },
  { key: "klci", name: "MALAYSIA KLCI", group: "global-indices", yahoo: "^KLSE" },
  { key: "setindex", name: "SET THAILAND", group: "global-indices", yahoo: "^SET.BK" },
  { key: "sensex", name: "BSE SENSEX", group: "global-indices", yahoo: "^BSESN" },
  { key: "nifty50", name: "NIFTY 50", group: "global-indices", yahoo: "^NSEI" },
  { key: "bovespa", name: "BOVESPA", group: "global-indices", yahoo: "^BVSP" },
  { key: "ipcmexico", name: "IPC MEXICO", group: "global-indices", yahoo: "^MXX" },
  { key: "merval", name: "MERVAL", group: "global-indices", yahoo: "^MERV" },
  { key: "ta125", name: "TA-125", group: "global-indices", yahoo: "^TA125.TA" },
  { key: "egx30", name: "EGX 30", group: "global-indices", yahoo: "^CASE30" },
  { key: "jsetop40", name: "JSE TOP 40", group: "global-indices", yahoo: "^JN0U.JO" },

  { key: "gold", name: "GOLD", group: "commodities", yahoo: "GC=F" },
  { key: "silver", name: "SILVER", group: "commodities", yahoo: "SI=F" },
  { key: "platinum", name: "PLATINUM", group: "commodities", yahoo: "PL=F" },
  { key: "palladium", name: "PALLADIUM", group: "commodities", yahoo: "PA=F" },
  { key: "copper", name: "COPPER", group: "commodities", yahoo: "HG=F" },
  { key: "aluminium", name: "ALUMINIUM", group: "commodities", yahoo: "ALI=F" },
  { key: "crudeoil", name: "CRUDE OIL", group: "commodities", yahoo: "CL=F" },
  { key: "brent", name: "BRENT", group: "commodities", yahoo: "BZ=F" },
  { key: "natgas", name: "NAT GAS", group: "commodities", yahoo: "NG=F" },
  { key: "heatingoil", name: "HEATING OIL", group: "commodities", yahoo: "HO=F" },
  { key: "gasoline", name: "GASOLINE", group: "commodities", yahoo: "RB=F" },
  { key: "corn", name: "CORN", group: "commodities", yahoo: "ZC=F" },
  { key: "wheat", name: "WHEAT", group: "commodities", yahoo: "ZW=F" },
  { key: "soybeans", name: "SOYBEANS", group: "commodities", yahoo: "ZS=F" },
  { key: "oats", name: "OATS", group: "commodities", yahoo: "ZO=F" },
  { key: "coffee", name: "COFFEE", group: "commodities", yahoo: "KC=F" },
  { key: "sugar", name: "SUGAR", group: "commodities", yahoo: "SB=F" },
  { key: "cocoa", name: "COCOA", group: "commodities", yahoo: "CC=F" },
  { key: "cotton", name: "COTTON", group: "commodities", yahoo: "CT=F" },
  { key: "orangejuice", name: "ORANGE JUICE", group: "commodities", yahoo: "OJ=F" },
  { key: "livecattle", name: "LIVE CATTLE", group: "commodities", yahoo: "LE=F" },
  { key: "leanhogs", name: "LEAN HOGS", group: "commodities", yahoo: "HE=F" },
  { key: "lumber", name: "LUMBER", group: "commodities", yahoo: "LBR=F" },
  { key: "gsci", name: "S&P GSCI", group: "commodities", yahoo: "^SPGSCI" },

  { key: "us3m", name: "US 3M", group: "rates", yahoo: "^IRX" },
  { key: "us5y", name: "US 5Y", group: "rates", yahoo: "^FVX" },
  { key: "us10y", name: "US 10Y", group: "rates", yahoo: "^TNX" },
  { key: "us30y", name: "US 30Y", group: "rates", yahoo: "^TYX" },
  { key: "dxy", name: "DXY", group: "rates", yahoo: "DX-Y.NYB" },
  // Quoted the way a trading desk reads them, which is why some are inverted
  // against the USD/xxx reference rates in the currencies group.
  { key: "eurusd", name: "EUR/USD", group: "rates", yahoo: "EURUSD=X" },
  { key: "gbpusd", name: "GBP/USD", group: "rates", yahoo: "GBPUSD=X" },
  { key: "audusd", name: "AUD/USD", group: "rates", yahoo: "AUDUSD=X" },
  { key: "usdjpy", name: "USD/JPY", group: "rates", yahoo: "JPY=X" },
  { key: "usdchf", name: "USD/CHF", group: "rates", yahoo: "CHF=X" },
  { key: "usdcad", name: "USD/CAD", group: "rates", yahoo: "CAD=X" },
  { key: "usdcny", name: "USD/CNY", group: "rates", yahoo: "CNY=X" },

  { key: "bitcoin", name: "BITCOIN", group: "crypto", yahoo: "BTC-USD" },
  { key: "ethereum", name: "ETHEREUM", group: "crypto", yahoo: "ETH-USD" },
  { key: "bnb", name: "BNB", group: "crypto", yahoo: "BNB-USD" },
  { key: "solana", name: "SOLANA", group: "crypto", yahoo: "SOL-USD" },
  { key: "xrp", name: "XRP", group: "crypto", yahoo: "XRP-USD" },
  { key: "cardano", name: "CARDANO", group: "crypto", yahoo: "ADA-USD" },
  { key: "dogecoin", name: "DOGECOIN", group: "crypto", yahoo: "DOGE-USD" },
  { key: "tron", name: "TRON", group: "crypto", yahoo: "TRX-USD" },
  { key: "chainlink", name: "CHAINLINK", group: "crypto", yahoo: "LINK-USD" },
  { key: "avalanche", name: "AVALANCHE", group: "crypto", yahoo: "AVAX-USD" },
  { key: "litecoin", name: "LITECOIN", group: "crypto", yahoo: "LTC-USD" },
  { key: "bitcoincash", name: "BITCOIN CASH", group: "crypto", yahoo: "BCH-USD" },
  { key: "stellar", name: "STELLAR", group: "crypto", yahoo: "XLM-USD" },
  { key: "polkadot", name: "POLKADOT", group: "crypto", yahoo: "DOT-USD" },
  { key: "shiba", name: "SHIBA INU", group: "crypto", yahoo: "SHIB-USD" },
];

// World currencies, quoted as units per one US dollar. Each becomes the Yahoo
// symbol USD<code>=X, so they ride in the same batched fetch as everything
// above and arrive with a previous close — which is what lets a currency tile
// show a real move rather than the flat "daily rate" label it used to.
//
// This replaced open.er-api.com, whose free tier publishes one set of rates a
// day: correct numbers, but no way to say whether they had risen or fallen.
const CURRENCIES = [
  ["EUR", "Euro"], ["GBP", "British Pound"], ["JPY", "Japanese Yen"],
  ["CHF", "Swiss Franc"], ["CAD", "Canadian Dollar"], ["AUD", "Australian Dollar"],
  ["NZD", "New Zealand Dollar"], ["CNY", "Chinese Yuan"], ["HKD", "Hong Kong Dollar"],
  ["SGD", "Singapore Dollar"], ["INR", "Indian Rupee"], ["KRW", "South Korean Won"],
  ["TWD", "Taiwan Dollar"], ["MXN", "Mexican Peso"], ["BRL", "Brazilian Real"],
  ["ZAR", "South African Rand"], ["SEK", "Swedish Krona"], ["NOK", "Norwegian Krone"],
  ["DKK", "Danish Krone"], ["PLN", "Polish Zloty"], ["CZK", "Czech Koruna"],
  ["HUF", "Hungarian Forint"], ["RON", "Romanian Leu"], ["BGN", "Bulgarian Lev"],
  ["ISK", "Icelandic Krona"], ["UAH", "Ukrainian Hryvnia"], ["TRY", "Turkish Lira"],
  ["ILS", "Israeli Shekel"], ["AED", "UAE Dirham"], ["SAR", "Saudi Riyal"],
  ["QAR", "Qatari Riyal"], ["KWD", "Kuwaiti Dinar"], ["EGP", "Egyptian Pound"],
  ["MAD", "Moroccan Dirham"], ["NGN", "Nigerian Naira"], ["KES", "Kenyan Shilling"],
  ["THB", "Thai Baht"], ["IDR", "Indonesian Rupiah"], ["MYR", "Malaysian Ringgit"],
  ["PHP", "Philippine Peso"], ["VND", "Vietnamese Dong"], ["PKR", "Pakistani Rupee"],
  ["BDT", "Bangladeshi Taka"], ["LKR", "Sri Lankan Rupee"], ["CLP", "Chilean Peso"],
  ["COP", "Colombian Peso"], ["ARS", "Argentine Peso"], ["PEN", "Peruvian Sol"],
];

// Yahoo answers a bare API client from a Worker IP with an error page rather
// than JSON — the same heuristic the RSS proxy carries a browser UA to get
// past. Without this every quote comes back empty while the identical URL
// works through /v1/rss/raw.
const BROWSER_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// The one place that knows how to read a quote out of a Yahoo `meta` block. The
// chart and spark endpoints return the same shape, so both go through here and
// can't drift apart.
function quoteFromMeta(meta) {
  const price = num(meta?.regularMarketPrice);
  if (price === null) return null;

  // previousClose is absent outside regular hours on some symbols, and the
  // spark endpoint omits it entirely; the chart variant is the same number.
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
}

// Exported because quotes.js serves the watchlist from the same provider — one
// copy of the parsing so the board and the watchlist can't drift apart.
export async function fetchYahooChartQuote(symbol) {
  const url = `${YAHOO_CHART}${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      // No `cf: { cacheEverything }` here on purpose. The KV bundle already is
      // the cache layer, and edge-caching these responses cached the failures
      // too: one bad round of fetches stuck for the full TTL and kept refilling
      // the snapshot with nothing long after the underlying problem was fixed.
    });
    if (!res.ok) return null;
    return quoteFromMeta((await res.json())?.chart?.result?.[0]?.meta);
  } catch {
    return null;
  }
}

// One spark call for up to SPARK_BATCH symbols, returning [symbol, quote] pairs.
// A failed batch now costs twenty tiles rather than one, so it gets a single
// retry — Yahoo's usual failure here is a transient 429 under burst, which a
// short pause clears.
async function fetchSparkBatch(symbols, attempt = 1) {
  const url = YAHOO_SPARK + symbols.map(encodeURIComponent).join(",");
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (res.ok) {
      const results = (await res.json())?.spark?.result;
      if (Array.isArray(results)) {
        // Key off the symbol we asked for, not meta.symbol — Yahoo normalises
        // some pairs (USDEUR=X comes back with meta.symbol "EUR=X").
        return results.map((entry) => [entry?.symbol, quoteFromMeta(entry?.response?.[0]?.meta)]);
      }
    }
  } catch {
    // fall through to the retry
  }

  if (attempt >= 2) return [];
  await new Promise((resolve) => setTimeout(resolve, 800));
  return fetchSparkBatch(symbols, attempt + 1);
}

// Small pool rather than Promise.all over the whole list — see FETCH_CONCURRENCY.
export async function mapWithConcurrency(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...await Promise.all(items.slice(i, i + limit).map(fn)));
  }
  return out;
}

async function fetchAllQuotes(symbols) {
  const batches = [];
  for (let i = 0; i < symbols.length; i += SPARK_BATCH) {
    batches.push(symbols.slice(i, i + SPARK_BATCH));
  }

  const pairs = await mapWithConcurrency(batches, FETCH_CONCURRENCY, (batch) => fetchSparkBatch(batch));
  return new Map(pairs.flat().filter(([symbol, quote]) => symbol && quote));
}

export async function buildSnapshot(env) {
  const quotes = await fetchAllQuotes([
    ...INSTRUMENTS.map((instrument) => instrument.yahoo),
    ...CURRENCIES.map(([code]) => `USD${code}=X`),
  ]);

  const items = [];

  for (const instrument of INSTRUMENTS) {
    const quote = quotes.get(instrument.yahoo);
    if (!quote) continue;
    items.push({
      key: instrument.key,
      name: instrument.name,
      group: instrument.group,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      currency: quote.currency,
    });
  }

  for (const [code, label] of CURRENCIES) {
    const quote = quotes.get(`USD${code}=X`);
    if (!quote) continue;
    items.push({
      key: `fx-${code.toLowerCase()}`,
      name: `USD/${code}`,
      label,
      group: "currencies",
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      // The ISO code, not Yahoo's view of it — settings.js builds the currency
      // picker from this field.
      currency: code,
    });
  }

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
