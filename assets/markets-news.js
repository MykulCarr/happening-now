// Markets page: the Market News card (headlines for your watchlist or the
// major business outlets), with its own cache of the last good list.
// Split out of stocks.js on 2026-11-17; loaded just before it.
(() => {
  "use strict";
  const S = (window.App.marketsPage ||= {});
  // From the main script, looked up when called (it loads after this file).
  const { cfg, escapeHtml, fetchRssItems, formatAge, getRssCooldownStatus, getRssLastSuccessAgeMs } = window.App;


  const STOCKS_NEWS_CACHE_KEY = "jas_stocks_news_cache_v1";
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

      if (S.newsMode === "watchlist") {
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
        saveCachedStocksNews(S.newsMode, articles);
      }

      if (articles.length === 0) {
        clearSlowNotice();
        const cached = loadCachedStocksNews(S.newsMode);
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
      const cached = loadCachedStocksNews(S.newsMode);
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


  Object.assign(S, { MAJOR_NEWS_FEED_URLS, WATCHLIST_NEWS_SYMBOL_LIMIT, renderNews, stocksNewsRssQueryForSymbol });
})();
