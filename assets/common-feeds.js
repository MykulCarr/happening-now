// Feed downloading and parsing, split out of common.js on 2026-11-17: every
// headline on the site comes through fetchRssItems here. Loaded right after
// common.js, and only on the pages that show feeds (News, Weather, Markets,
// Settings, the Today view). It uses common.js's cache (getCached / setCached
// / getCachedStale, which also remember feeds between visits) and adds
// fetchRssItems, fetchNewsItems, getRssCooldownStatus, getRssLastSuccessAgeMs
// and clearRssCache to window.App.
//
// The repairs in this file (trimFeedEnvelope, escapeBareAmpersands,
// repairFeedNamespaces, the HTML entity fix) are mirrored on purpose in
// cloudflare-sync-worker/src/feed-health.mjs, so the health checks judge a
// feed the way the browser reads it. Keep the two in step.
(() => {
  "use strict";
  const App = window.App;
  if (!App) return;
  const { RSS_PROXY_BASE, getCached, setCached, getCachedStale, timeoutSignal, stripTags, normalizeOutboundLink } = App;
  // There is one route for every feed: our own Worker (see common.js on why
  // no third-party proxy sits behind it).
  const RSS_PROXY_FALLBACKS = [RSS_PROXY_BASE];

  const RSS_REQUEST_TIMEOUT_MS = 9000;
  // Google News goes through one extra hop (our CF worker -> Google), and
  // Google itself rate-limits / 503's intermittently. 4500ms was too tight:
  // any worker cold start or upstream slowdown blew past the timeout. 8s
  // covers the realistic worst-case while still failing fast enough that
  // we move on to the fallback proxy.
  const RSS_REQUEST_TIMEOUT_FAST_MS = 8000;
  const MAX_ITEM_AGE_MS = 45 * 24 * 60 * 60 * 1000; // hide headlines older than this
  const RSS_ROUTE_COOLDOWN_BASE_MS = 8000;
  const RSS_ROUTE_COOLDOWN_MAX_MS = 60000;
  const rssInFlight = new Map();
  const rssRouteCooldowns = new Map();
  const rssLastSuccessAt = new Map();

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

  function getRssProxyFallbacksForFeed() {
    // There is only the first-party route now, for every feed alike — the
    // Worker's last-known-good cache replaced the third-party fallback this
    // used to trim for Google News. Kept as a function because the cooldown
    // bookkeeping and the fetch loop both iterate over "routes to try", and
    // that shape is what makes adding a real second route possible later.
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

  // Forget every downloaded feed and every route's back-off. The cache itself
  // lives in common.js (stock quotes use it too), hence forgetCached.
  function clearRssCache() {
    App.forgetCached((key) => key.startsWith("rss:") || key.startsWith("newsapi:"));
    rssInFlight.clear();
    rssRouteCooldowns.clear();
    rssLastSuccessAt.clear();
  }

  function annotateNewsItems(items, sourceLabel, isFallback) {
    return (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      _newsSourceLabel: sourceLabel,
      _newsFallback: isFallback === true
    }));
  }

  // Trim anything outside the XML document itself. Two real cases, both of
  // which made DOMParser reject an otherwise perfect feed and return zero items
  // with no error anywhere a curl-and-count check could see it:
  //   - leading blank lines before `<?xml` (lwlies.com — a WordPress plugin
  //     echoing newlines), which is "text declaration not at start of entity";
  //   - anything after the closing `</rss>` / `</feed>`, which is "junk after
  //     document element". Our own proxy no longer causes this (it labels every
  //     response application/xml so the Cloudflare zone stops injecting its
  //     beacon), but the third-party fallback proxy still can.
  function trimFeedEnvelope(xmlText) {
    const text = xmlText.replace(/^[\s\uFEFF]+/, "");
    const close = text.lastIndexOf("</rss>") >= 0 ? "</rss>" : (text.lastIndexOf("</feed>") >= 0 ? "</feed>" : "");
    if (!close) return text;
    const end = text.lastIndexOf(close) + close.length;
    return end < text.length ? text.slice(0, end) : text;
  }

  // Escape ampersands that aren't already an entity reference. A bare `&` is the
  // single most common way a publisher breaks their own feed, and it is fatal:
  // KTLA 5's channel title ("Latest News Headlines & Top Stories") made the
  // whole Los Angeles feed unparseable, so that city rendered nothing at all
  // while every item-counting check called the feed healthy. CDATA sections are
  // left alone — `&` is legal inside them, and escaping there would put a
  // visible "&amp;" into the headline text.
  function escapeBareAmpersands(xmlText) {
    return xmlText
      .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
      .map((part, i) => (i % 2 ? part : part
        .replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;|#x[0-9a-fA-F]+;)/g, "&amp;")
        .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, fixHtmlEntity)))
      .join("");
  }

  // XML defines only five named entities; a feed that says `&nbsp;` outside
  // CDATA is fatal to DOMParser ("Entity 'nbsp' not defined"). Ancient Origins
  // did this and its whole card rendered "No articles available". Known HTML
  // names become numeric references; anything else is shown as literal text.
  const HTML_ENTITIES = { nbsp: 160, hellip: 8230, mdash: 8212, ndash: 8211, lsquo: 8216, rsquo: 8217, ldquo: 8220, rdquo: 8221, copy: 169, reg: 174, trade: 8482, bull: 8226, middot: 183, laquo: 171, raquo: 187, eacute: 233, egrave: 232, uuml: 252, ouml: 246, auml: 228 };
  function fixHtmlEntity(match, name) {
    if (/^(amp|lt|gt|quot|apos)$/.test(name)) return match;
    return HTML_ENTITIES[name] ? `&#${HTML_ENTITIES[name]};` : `&amp;${name};`;
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

  // Every request for SHARED_FEED_COUNT headlines or fewer shares one
  // download per feed, and takes the first `limit` of it. Keyed by the exact
  // count, the news ticker (12), a card (6) and the Today view (6) each
  // downloaded the same feed separately: NPR three times on one page load.
  const SHARED_FEED_COUNT = 12;

  async function fetchRssItems(rssUrl, limit = 10, useCache = true) {
    const items = await downloadFeed(rssUrl, Math.max(limit, SHARED_FEED_COUNT), useCache);
    return items.length > limit ? items.slice(0, limit) : items;
  }

  async function downloadFeed(rssUrl, limit, useCache) {
    const cacheKey = `rss:${rssUrl}:${limit}`;

    if (useCache) {
      const cached = getCached(cacheKey);
      if (cached) return cached;
    }

    // One download in flight per feed, whether or not the caller may read the
    // cache: once the cache has missed, both kinds want the same fresh copy.
    const inFlightKey = cacheKey;
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
        "news.google.com",
        // Vox Media (The Verge, Eater), Business Insider and hnrss.org answer
        // 404/502 to *any* query param they don't recognise, so the buster made
        // healthy feeds read as permanently dead. The retry below would recover
        // them anyway; listing them here just skips the wasted round trip.
        "www.theverge.com", "theverge.com",
        "www.eater.com", "eater.com",
        "www.businessinsider.com", "businessinsider.com",
        "hnrss.org",
        // The Hill is the dangerous kind: with any extra param it answers a
        // valid feed holding ONE item instead of 100, so nothing fails and the
        // retry never fires — the card just quietly shows a single headline.
        "thehill.com",
        // These return an empty feed with the buster (found 2026-10-18 by
        // probing every news-sources.json feed both ways). Retry recovers
        // them; listing them saves the round trip.
        "www.cbsnews.com", "feeds.nbcnews.com", "www.vox.com", "news.un.org",
        "www.politico.eu", "allafrica.com"
      ]);
      const skipCacheBust = (url) => {
        try { return NO_CACHE_BUST_HOSTS.has(new URL(url).host); }
        catch { return false; }
      };

      for (let feedUrl of feedsToTry) {
        // The buster is named `_hn`, not `t`. TownNews search feeds — the whole
        // `/search/?f=rss&t=article&c=news` family, nine papers and stations in
        // data/local-stations.json — use `t` for *type*, so appending `&t=<ts>`
        // overrode `t=article` and the search returned a valid, completely empty
        // feed. Nothing errored; those cities just quietly showed no news.
        // Any new name must not collide with a real feed parameter.
        const bustUrl = skipCacheBust(feedUrl)
          ? feedUrl
          : (feedUrl.includes("?") ? feedUrl + "&_hn=" + Date.now() : feedUrl + "?_hn=" + Date.now());
        const proxiesToTry = getRssProxyFallbacksForFeed(feedUrl);
        const requestTimeoutMs = getRssRequestTimeoutMs(feedUrl);

        for (let proxyBase of proxiesToTry) {
          const routeKey = getRssRouteKey(feedUrl, proxyBase);
          const cooldownMs = getRssRouteCooldownMs(routeKey);
          if (cooldownMs > 0) {
            continue;
          }

          try {
            // Cache-busted URL first, then the untouched one. A publisher that
            // rejects unknown query params otherwise looks dead forever, and
            // the failure is invisible — it needs someone to notice a tab has
            // gone quiet. Falling back costs at most 120s of staleness (the
            // proxy's own cache TTL) on a page that refreshes every 10 minutes.
            const urlAttempts = bustUrl === feedUrl ? [feedUrl] : [bustUrl, feedUrl];
            let res;
            for (const attemptUrl of urlAttempts) {
              res = await fetch(proxyBase + encodeURIComponent(attemptUrl), { cache: "no-store", signal: timeoutSignal(requestTimeoutMs) });
              if (res.ok) break;
            }

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
            const repairedXmlText = repairFeedNamespaces(escapeBareAmpersands(trimFeedEnvelope(xmlText)));
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

            // Drop items older than MAX_ITEM_AGE_MS so a feed that quietly died doesn't
            // keep showing months-old headlines as if they were current. Undated
            // items are kept; we can't tell they're old.
            const cutoff = Date.now() - MAX_ITEM_AGE_MS;
            items = items.filter(it => {
              const t = Date.parse(firstText(it, "pubDate", "updated", "published", "dc:date").trim());
              return Number.isNaN(t) || t >= cutoff;
            });

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

              // Webcomics put the punchline in the <img title="...">, so a
              // caption-less image loses half the joke. Only used by sources
              // flagged embed:true in data/topic-sources.json.
              let imageTitle = "";
              if (descRaw) {
                const decoded = descRaw
                  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
                  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
                  .replace(/&amp;/g, "&");
                // Capture the quote character and match to the matching one.
                // A [^"'] class would stop at the first apostrophe inside a
                // double-quoted attribute — xkcd's "...incident wasn't enough"
                // truncated to "...incident wasn".
                const m = decoded.match(/<img[^>]+\btitle=(["'])([\s\S]*?)\1/i)
                  || decoded.match(/<img[^>]+\balt=(["'])([\s\S]*?)\1/i);
                if (m && m[2]) imageTitle = m[2].trim();
              }

              return { title, url: normalizeOutboundLink(link), pubDate, desc, image, imageTitle };
            }), proxyBase === RSS_PROXY_BASE ? "" : "Fallback news source in use", proxyBase !== RSS_PROXY_BASE);

            // Stored whether or not this call was allowed to *read* the cache:
            // a forced-fresh download is the newest copy there is, and not
            // keeping it meant the category a page opened on was the one
            // category that was never cached.
            if (result.length > 0) {
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

  Object.assign(App, { fetchRssItems, fetchNewsItems, getRssCooldownStatus, getRssLastSuccessAgeMs, clearRssCache });
})();
