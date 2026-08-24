// Watchlist quotes, cached one symbol at a time.
//
// The watchlist can't ride the markets snapshot: its symbols are whatever each
// visitor added, so there is no fixed bundle to build. What it can share is the
// snapshot's provider. Every watchlist symbol used to enter the browser's
// fallback chain at Finnhub, whose free tier is 60 calls a minute across all
// visitors — so a single page load with a handful of tickers drew 429s
// (NVDA, MSFT, AAPL and TSLA all hit it on 2026-08-24). Yahoo's v8 chart
// endpoint needs no key, and already fills all 47 board tiles from this Worker.
//
// Caching per symbol rather than per request is what makes a shared watchlist
// nearly free: two visitors holding NVDA cost one upstream call between them,
// and only the tickers nobody else watches are ever fetched fresh.

import { fetchYahooChartQuote, mapWithConcurrency } from "./markets.js";

const CACHE_PREFIX = "public:quote:v1:";
const FRESH_MS = 5 * 60 * 1000;
// Kept well past FRESH_MS on purpose, so a bad minute upstream still has a
// stale copy to fall back on rather than blanking the card.
const KV_TTL_S = 60 * 60;
const MAX_SYMBOLS = 25;
const FETCH_CONCURRENCY = 6;

// Yahoo's own symbols use dots, dashes, carets and equals signs (BRK-B, ^GSPC,
// GC=F). Anything outside that set is a caller mistake, not a ticker.
const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/;

export function parseSymbols(raw) {
  const seen = new Set();
  String(raw || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    // The page stores some symbols exchange-qualified (NASDAQ:NVDA); Yahoo
    // wants the bare ticker, which is what the last segment always is.
    .map((s) => (s.includes(":") ? s.split(":").pop() : s))
    .filter((s) => SYMBOL_RE.test(s))
    .forEach((s) => seen.add(s));
  return Array.from(seen).slice(0, MAX_SYMBOLS);
}

async function readCached(env, symbol) {
  try {
    return await env.HN_STATE_DATA.get(CACHE_PREFIX + symbol, "json");
  } catch {
    return null;
  }
}

export async function getQuotes(env, symbols) {
  const cached = await mapWithConcurrency(symbols, FETCH_CONCURRENCY, (s) => readCached(env, s));

  const quotes = {};
  const stale = {};
  const misses = [];

  symbols.forEach((symbol, i) => {
    const entry = cached[i];
    const age = entry?.fetchedAt ? Date.now() - Date.parse(entry.fetchedAt) : Infinity;
    if (entry && age < FRESH_MS) {
      quotes[symbol] = entry;
    } else {
      if (entry) stale[symbol] = entry;
      misses.push(symbol);
    }
  });

  const fetched = await mapWithConcurrency(misses, FETCH_CONCURRENCY, async (symbol) => {
    const quote = await fetchYahooChartQuote(symbol);
    if (!quote) return null;

    const entry = { symbol, ...quote, fetchedAt: new Date().toISOString() };
    try {
      await env.HN_STATE_DATA.put(CACHE_PREFIX + symbol, JSON.stringify(entry), {
        expirationTtl: KV_TTL_S,
      });
    } catch {
      // A cache write failing shouldn't cost the caller a quote it already has.
    }
    return entry;
  });

  fetched.forEach((entry, i) => {
    const symbol = misses[i];
    // Serve stale rather than nothing — the same rule the markets snapshot
    // follows. A symbol with no copy at all is simply left out, and the page
    // falls through to its own per-symbol providers for it.
    const value = entry || stale[symbol];
    if (value) quotes[symbol] = value;
  });

  return { fetchedAt: new Date().toISOString(), count: Object.keys(quotes).length, quotes };
}
