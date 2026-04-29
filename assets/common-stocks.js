(() => {
  "use strict";
  const App = window.App = window.App || {};
  const {
    RSS_PROXY_BASE,
    STOCK_API_KEYS,
    getCached,
    setCached,
    handleError
  } = App;

  async function fetchStockPrice(symbol){
    const cacheKey = `stock:${symbol}`;
    const cached = getCached(cacheKey);
    if(cached && Number.isFinite(Number(cached.price)) && Number(cached.price) > 0) return cached;

    try{
      const baseSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;
      const finnhubResult = await fetchStockPriceFromFinnhub(baseSymbol);
      if(finnhubResult){
        setCached(cacheKey, finnhubResult);
        return finnhubResult;
      }
      if(STOCK_API_KEYS.alphaVantage){
        const avResult = await fetchStockPriceFromAlphaVantage(baseSymbol);
        if(avResult){
          setCached(cacheKey, avResult);
          return avResult;
        }
      }
      if(STOCK_API_KEYS.iex){
        const iexResult = await fetchStockPriceFromIex(baseSymbol);
        if(iexResult){
          setCached(cacheKey, iexResult);
          return iexResult;
        }
      }
      const tdResult = await fetchStockPriceFromTwelveData(baseSymbol);
      if(tdResult){
        setCached(cacheKey, tdResult);
        return tdResult;
      }
      const yahooResult = await fetchStockPriceFromYahooChart(baseSymbol);
      if(yahooResult){
        setCached(cacheKey, yahooResult);
        return yahooResult;
      }
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
    {
      const res = await fetchStockCandlesFromFinnhub(baseSymbol, resolution, from, to);
      if(res.data){
        setCached(cacheKey, res.data);
        return { data: res.data, error: null, source: "finnhub" };
      }
      finnhubError = res.error || "Finnhub: no data";
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
    if(base.startsWith("^") || base.includes("=") || base.includes("/")){
      return true;
    }
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
    if(!STOCK_API_KEYS.finnhub) return { data: null, error: "Finnhub: no API key" };
    try{
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${STOCK_API_KEYS.finnhub}`;
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
      if(!apiKey) return { data: null, error: "Twelve Data: no API key" };
      const interval = Number(resolution) >= 60 ? `${Math.round(Number(resolution) / 60)}h` : `${resolution}min`;
      const outputSize = Math.max(24, Math.min(240, Math.round(days * 24 * 60 / Math.max(1, Number(resolution)))));
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${encodeURIComponent(outputSize)}&apikey=${apiKey}`;
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

  async function fetchStockPriceFromFinnhub(symbol){
    if(shouldSkipFinnhubSymbol(symbol)){
      return null;
    }
    if(!STOCK_API_KEYS.finnhub) return null;
    try{
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${STOCK_API_KEYS.finnhub}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      clearTimeout(timeoutId);
      if(!res.ok){
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

  async function fetchStockPriceFromIex(symbol){
    try{
      if(!STOCK_API_KEYS.iex){
        return null;
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

  async function fetchStockGainers() {
    const cacheKey = "market:gainers";
    const cached = getCached(cacheKey);
    if(cached) return cached;

    try {
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

      const fmpGainers = await fetchFmpMovers("gainers", 5);
      if(fmpGainers && fmpGainers.length > 0){
        const payload = withMoverSource(fmpGainers, "fmp");
        setCached(cacheKey, payload);
        return payload;
      }

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

      const fmpLosers = await fetchFmpMovers("losers", 5);
      if(fmpLosers && fmpLosers.length > 0){
        const payload = withMoverSource(fmpLosers, "fmp");
        setCached(cacheKey, payload);
        return payload;
      }

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

      const fmpActives = await fetchFmpMovers("actives", 6);
      if(fmpActives && fmpActives.length > 0){
        const payload = withMoverSource(fmpActives, "fmp");
        setCached(cacheKey, payload);
        return payload;
      }

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

  async function fetchYahooBatchQuotes(symbols){
    if(!Array.isArray(symbols) || symbols.length === 0) return null;
    try{
      const symStr = symbols.join(",");
      const targetUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symStr)}`;
      const proxyUrl = `${RSS_PROXY_BASE}${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl, { cache: "no-store" });
      if(!res.ok) return null;
      const data = await res.json();
      const quotes = data?.quoteResponse?.result;
      if(!Array.isArray(quotes) || quotes.length === 0) return null;
      const map = {};
      for(const q of quotes){
        const sym = q.symbol;
        const price = Number(q.regularMarketPrice);
        if(!sym || !Number.isFinite(price) || price <= 0) continue;
        map[sym] = {
          symbol: sym,
          price,
          change: Number.isFinite(Number(q.regularMarketChange)) ? Number(q.regularMarketChange) : 0,
          changePercent: Number.isFinite(Number(q.regularMarketChangePercent)) ? Number(q.regularMarketChangePercent) : 0,
          previousClose: Number.isFinite(Number(q.regularMarketPreviousClose)) ? Number(q.regularMarketPreviousClose) : null,
          high: Number.isFinite(Number(q.regularMarketDayHigh)) ? Number(q.regularMarketDayHigh) : null,
          low: Number.isFinite(Number(q.regularMarketDayLow)) ? Number(q.regularMarketDayLow) : null,
          timestamp: new Date().toISOString()
        };
      }
      return Object.keys(map).length > 0 ? map : null;
    }catch{
      return null;
    }
  }

  Object.assign(App, {
    fetchStockPrice,
    fetchStockCandles,
    fetchStockGainers,
    fetchStockLosers,
    fetchStockMovers,
    fetchYahooBatchQuotes
  });
})();