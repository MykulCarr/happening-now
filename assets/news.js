(() => {
  "use strict";

  const { cfg, fetchNewsItems, escapeHtml, createCardHeader, handleError, showError, applyThemeDensity } = window.App;
  const RSS_PROXY_PROBE_URL = "/v1/rss/raw?url=" + encodeURIComponent("https://feeds.npr.org/1001/rss.xml");

  // Apply theme, density, and font size on page load
  applyThemeDensity(cfg);

  const newsGrid = document.getElementById("newsGrid");
  const criticalNewsBar = document.getElementById("criticalNewsBar");
  const refreshBtn = document.getElementById("refreshBtn");
  const statusLine = document.getElementById("statusLine");

  const NEWS_CACHE_KEY = "jas_cache_news_v1";
  const NEWS_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
  const CRITICAL_WORLD_RSS = "https://news.google.com/rss/search?q=world+breaking+news+when%3A1d&hl=en-US&gl=US&ceid=US:en";
  const CRITICAL_US_RSS = "https://news.google.com/rss/search?q=US+breaking+news+when%3A1d&hl=en-US&gl=US&ceid=US:en";
  let criticalTickerState = null;

  function destroyCriticalTicker(){
    criticalTickerState = null;
  }

  function setupCriticalTicker(container){
    destroyCriticalTicker();
    container.classList.add("criticalTickerReady");
  }

  function normalizeTickerItems(items, scope){
    return items.map((item) => ({
      scope,
      title: item.title || "Untitled",
      url: item.url || "",
      pubDate: item.pubDate || ""
    })).filter((item) => Boolean(item.url));
  }

  function dedupeTickerItems(items){
    const seen = new Set();
    return items.filter((item) => {
      const key = `${item.title}|${item.url}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function renderCriticalTicker(force=false){
    if(!criticalNewsBar) return;

    destroyCriticalTicker();
    criticalNewsBar.innerHTML = `<span class="criticalTickerEmpty">Loading critical headlines...</span>`;

    try{
      const [worldItems, usItems] = await Promise.all([
        fetchNewsItems(CRITICAL_WORLD_RSS, 10, !force),
        fetchNewsItems(CRITICAL_US_RSS, 10, !force)
      ]);

      const merged = dedupeTickerItems([
        ...normalizeTickerItems(worldItems, "world"),
        ...normalizeTickerItems(usItems, "us")
      ]);

      const prioritized = [
        ...merged.filter((item) => item.scope === "world").slice(0, 8),
        ...merged.filter((item) => item.scope === "us").slice(0, 8)
      ];

      if(prioritized.length === 0){
        criticalNewsBar.innerHTML = `<span class="criticalTickerEmpty">No critical headlines right now.</span>`;
        return;
      }

      const tickerItems = prioritized.map((item) => {
        const scopeClass = item.scope === "world" ? "world" : "us";
        const scopeLabel = item.scope === "world" ? "WORLD" : "US";
        return `
          <a class="criticalTickerItem" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="${scopeLabel}: ${escapeHtml(item.title)}">
            <span class="criticalBadge ${scopeClass}">${scopeLabel}</span>
            <span>${escapeHtml(item.title)}</span>
          </a>
        `;
      }).join('<span class="criticalTickerSep" aria-hidden="true">•</span>');

      criticalNewsBar.innerHTML = `
        <div class="criticalTickerViewport" aria-live="polite" aria-label="Critical headlines ticker">
          <div class="criticalTickerTrack">
            <div class="criticalTickerGroup">${tickerItems}</div>
            <div class="criticalTickerGroup" aria-hidden="true">${tickerItems}</div>
          </div>
        </div>
      `;

      setupCriticalTicker(criticalNewsBar);
    }catch(error){
      handleError(error, "Critical ticker");
      criticalNewsBar.innerHTML = `<span class="criticalTickerEmpty">Critical ticker unavailable right now.</span>`;
    }
  }

  function applyNewsStamps(savedAt){
    const age = window.App.cacheAgeMs(savedAt);
    const stale = age > NEWS_MAX_AGE_MS;
    const tz = (window.App?.cfg?.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone;

  document.querySelectorAll(".newsCard .modStamp").forEach(el => {
    const t = window.App.formatTime(new Date(savedAt), tz);
    el.innerHTML = `<b>${t}</b> • ${window.App.formatAge(age)}${stale ? ` • <span class="stale">Stale</span>` : ""}`;
  });
}

function restoreNewsFromCache(){
  const cached = window.App.cacheGet(NEWS_CACHE_KEY);
  if(!cached?.html || !cached?.savedAt) return false;

  newsGrid.innerHTML = cached.html;
  applyNewsStamps(cached.savedAt);
  return true;
}

  function buildCard(widget){
    const card = document.createElement("article");
    card.className = "card newsCard";
    card.setAttribute("aria-label", `News feed from ${widget.name}`);

    const head = createCardHeader({
      name: widget.name,
      site: widget.site,
      onOpen: (site) => window.open(site, "_blank", "noopener,noreferrer")
    });

    const body = document.createElement("div");
    body.className = "cardBody";

    const widgetName = String(widget?.name || "").trim();
    const categoryParts = widgetName.split(" - ");
    const category = categoryParts.length > 1 ? String(categoryParts.slice(1).join(" - ")).trim() : "";
    if(category){
      const categoryBadge = document.createElement("div");
      categoryBadge.className = "newsSourceCategory";
      categoryBadge.textContent = category;
      body.appendChild(categoryBadge);
    }

    const list = document.createElement("div");
    list.className = "rssList";
    list.setAttribute("role", "list");

    // Create skeleton loaders
    const skeletonCount = Math.max(3, widget.headlinesCount || 6);
    for(let i=0; i<skeletonCount; i++){
      const sk = document.createElement("div");
      sk.className = "skeleton";
      sk.setAttribute("aria-hidden", "true");
      list.appendChild(sk);
    }

    body.appendChild(list);
    card.appendChild(head);
    card.appendChild(body);

    return { card, list };
  }

  let inFlight = false;

  function updateStatus(message, isError=false){
    if(statusLine){
      statusLine.textContent = message;
      statusLine.setAttribute("aria-live", "polite");
      if(isError){
        statusLine.setAttribute("aria-label", `Error: ${message}`);
      }
    }
  }

  async function probeRssProxy(){
    try{
      const signal = (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function")
        ? AbortSignal.timeout(4500)
        : undefined;
      const res = await fetch(RSS_PROXY_PROBE_URL, {
        cache: "no-store",
        signal
      });
      return res.ok;
    }catch{
      return false;
    }
  }

  function summarizeRssRouteHealth(widgets){
    let totalRoutes = 0;
    let routesOnCooldown = 0;
    let bestSuccessAgeMs = Infinity;

    widgets.forEach((widget) => {
      const source = String(widget?.rss || "").trim();
      if(!source) return;

      const status = window.App.getRssCooldownStatus(source);
      totalRoutes += Number(status?.totalRoutes || 0);
      routesOnCooldown += Number(status?.routesOnCooldown || 0);

      const lastAgeMs = window.App.getRssLastSuccessAgeMs(source);
      if(Number.isFinite(lastAgeMs)){
        bestSuccessAgeMs = Math.min(bestSuccessAgeMs, lastAgeMs);
      }
    });

    const lastSuccessLabel = Number.isFinite(bestSuccessAgeMs)
      ? `${window.App.formatAge(bestSuccessAgeMs)} ago`
      : "none yet";

    return {
      totalRoutes,
      routesOnCooldown,
      lastSuccessLabel
    };
  }

  async function appendRssDiagnostics(baseMessage, widgets, isError=false){
    if(!statusLine) return;

    const proxyOk = await probeRssProxy();
    const route = summarizeRssRouteHealth(widgets);
    const health = proxyOk ? "reachable" : "unreachable";
    const detail =
      `RSS proxy ${health} • last success ${route.lastSuccessLabel} • cooldowns ${route.routesOnCooldown}/${route.totalRoutes}`;

    updateStatus(`${baseMessage} • ${detail}`, isError || !proxyOk);
  }

  function createRssItem(item){
    const container = document.createElement("a");
    container.className = "rssItem";
    container.href = item.url;
    container.target = "_blank";
    container.rel = "noopener noreferrer";
    container.setAttribute("aria-label", `Read article: ${item.title}`);
    
    // Publication date
    const dateDiv = document.createElement("div");
    dateDiv.className = "rssItemDate";
    if(item.pubDate){
      dateDiv.textContent = item.pubDate;
    } else {
      dateDiv.textContent = "Date unavailable";
      dateDiv.style.opacity = "0.6";
    }
    
    // Article title
    const titleDiv = document.createElement("div");
    titleDiv.className = "rssItemTitle";
    titleDiv.textContent = item.title;
    
    // Article description/blurb
    const descDiv = document.createElement("div");
    descDiv.className = "rssItemDesc";
    if(item.desc){
      descDiv.textContent = item.desc;
    } else {
      descDiv.textContent = "No description available";
      descDiv.style.opacity = "0.6";
    }
    
    container.appendChild(dateDiv);
    container.appendChild(titleDiv);
    container.appendChild(descDiv);
    
    return container;
  }

  async function render(force=false){
    if(inFlight && !force) return;
    inFlight = true;

    const priorGridHeight = Math.ceil(newsGrid.getBoundingClientRect().height || 0);
    if(priorGridHeight > 0){
      newsGrid.style.minHeight = `${priorGridHeight}px`;
    }

    updateStatus("Loading news…");
    renderCriticalTicker(force);
    newsGrid.innerHTML = "";
    newsGrid.setAttribute("aria-busy", "true");

    const widgets = (cfg.widgets || []).slice(0, 15);
    if(widgets.length === 0){
      updateStatus("No news sources configured", true);
      newsGrid.innerHTML = `<div class="hint" style="grid-column:1/-1;text-align:center;padding:20px;">Please configure news sources in Settings.</div>`;
      newsGrid.setAttribute("aria-busy", "false");
      inFlight = false;
      newsGrid.style.removeProperty("min-height");
      return;
    }

    const shells = widgets.map(w => buildCard(w));
    shells.forEach(s => newsGrid.appendChild(s.card));

    let successCount = 0;
    let errorCount = 0;

    await Promise.all(widgets.map(async (w, idx) => {
      const { card, list } = shells[idx];
      try{
        const items = await fetchNewsItems(w.rss, w.headlinesCount || 6, !force);
        
        if(items.length === 0){
          list.innerHTML = "";
          const emptyMsg = document.createElement("div");
          emptyMsg.className = "hint";
          emptyMsg.textContent = "No articles available";
          emptyMsg.setAttribute("aria-live", "polite");
          list.appendChild(emptyMsg);
          errorCount++;
          return;
        }

        list.innerHTML = "";
        items.forEach(item => {
          list.appendChild(createRssItem(item));
        });
        successCount++;
      }catch(error){
        handleError(error, `Loading ${w.name}`);
        showError(`Failed to load ${w.name}. Please try again.`, list);
        errorCount++;
      }
    }));

    newsGrid.setAttribute("aria-busy", "false");
    
    let statusMsg = "";
    let isErrorStatus = false;
    if(errorCount > 0 && successCount === 0){
      statusMsg = `Failed to load news (${errorCount} errors)`;
      isErrorStatus = true;
      updateStatus(statusMsg, true);
    }else if(errorCount > 0){
      statusMsg = `Loaded with ${errorCount} error${errorCount > 1 ? 's' : ''}`;
      updateStatus(statusMsg);
    }else{
      statusMsg = `Ready • ${successCount} source${successCount > 1 ? 's' : ''} loaded`;
      updateStatus(statusMsg);
    }

    await appendRssDiagnostics(statusMsg, widgets, isErrorStatus);

    // Update stats widget if available
    if(typeof window.updateNewsStats === "function"){
      const totalArticles = shells.reduce((sum, shell) => {
        return sum + shell.list.querySelectorAll(".rssItem").length;
      }, 0);
      window.updateNewsStats(`${successCount} source${successCount !== 1 ? 's' : ''} • ${totalArticles} article${totalArticles !== 1 ? 's' : ''}`);
    }
    
    inFlight = false;
    newsGrid.style.removeProperty("min-height");
  }

  // (tickers removed) top headline tickers were intentionally removed per user request

  // Clear stale news cache on page load to ensure fresh content
  window.App.clearRssCache();

  // Keyboard accessibility for refresh button
  refreshBtn?.addEventListener("click", () => render(true));
  refreshBtn?.addEventListener("keydown", (e) => {
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      render(true);
    }
  });

  // Initial render
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => { render(true); }); // force=true to bypass cache
  }else{
    render(true); // force=true to bypass cache on page load
  }
})();
