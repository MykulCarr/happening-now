(() => {
  "use strict";

  const { cfg, fetchNewsItems, escapeHtml, createCardHeader, handleError, showError, applyThemeDensity, saveConfig, geocodeZip } = window.App;
  const RSS_PROXY_PROBE_URL = "/v1/rss/raw?url=" + encodeURIComponent("https://feeds.npr.org/1001/rss.xml");

  // Apply theme, density, and font size on page load
  applyThemeDensity(cfg);

  const newsGrid = document.getElementById("newsGrid");
  const criticalNewsBar = document.getElementById("criticalNewsBar");
  const tickerScopeBar = document.getElementById("tickerScopeBar");
  const refreshBtn = document.getElementById("refreshBtn");
  const statusLine = document.getElementById("statusLine");

  const NEWS_CACHE_KEY = "jas_cache_news_v1";
  const NEWS_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

  const CRITICAL_NATIONAL_RSS = "https://news.google.com/rss/search?q=US+breaking+news+when%3A1d&hl=en-US&gl=US&ceid=US:en";
  const CRITICAL_INTERNATIONAL_RSS = "https://news.google.com/rss/search?q=world+breaking+news+when%3A1d&hl=en-US&gl=US&ceid=US:en";

  // Single state for the four scope tabs (LOCAL/REGIONAL/NATIONAL/INTERNATIONAL).
  // Drives both the critical ticker and the main news grid. Reads the old
  // `newsTickerScope` key for back-compat with users who only had the ticker.
  let currentScope = cfg.newsScope || cfg.newsTickerScope || "national";
  let geoCache = null;
  let criticalTickerState = null;
  let criticalTickerPopup = null;
  let criticalTickerHoverController = null;
  let criticalTickerHoverTimeout = null;
  let criticalTickerCloseTimeout = null;

  function destroyCriticalTicker(){
    if(!criticalTickerState) return;
    if(criticalTickerState.resumeTimer) window.clearTimeout(criticalTickerState.resumeTimer);
    if(criticalTickerState.rafId) window.cancelAnimationFrame(criticalTickerState.rafId);
    if(criticalTickerState.abortController) criticalTickerState.abortController.abort();
    criticalTickerState = null;
  }

  function clearCriticalTickerPopup(){
    if(criticalTickerPopup){ criticalTickerPopup.remove(); criticalTickerPopup = null; }
  }

  function clearCriticalTickerTimers(){
    if(criticalTickerHoverTimeout){ window.clearTimeout(criticalTickerHoverTimeout); criticalTickerHoverTimeout = null; }
    if(criticalTickerCloseTimeout){ window.clearTimeout(criticalTickerCloseTimeout); criticalTickerCloseTimeout = null; }
  }

  function destroyCriticalTickerHover(){
    clearCriticalTickerTimers();
    clearCriticalTickerPopup();
    if(criticalTickerHoverController){ criticalTickerHoverController.abort(); criticalTickerHoverController = null; }
  }

  function setupCriticalTicker(container){
    destroyCriticalTicker();
    container.classList.add("criticalTickerReady");

    const viewport = container.querySelector(".criticalTickerViewport");
    const track    = container.querySelector(".criticalTickerTrack");
    const firstGroup = container.querySelector(".criticalTickerGroup");
    if(!viewport || !track || !firstGroup) return;

    const abortController = new AbortController();
    const speedPxPerSecond = 22;
    const gap = Number.parseFloat(window.getComputedStyle(track).columnGap || window.getComputedStyle(track).gap || "0") || 0;

    let cycleWidth = 0;
    let paused = false;
    let dragging = false;
    let activePointerId = null;
    let lastPointerX = 0;
    let dragDistancePx = 0;
    let pointerDownUrl = "";
    let offsetPx = 0;
    const hoverPauseGraceMs = 1200;
    let hoverPauseReadyAt = 0;
    let lastFrameTs = 0;
    let lastMeasureTs = 0;
    let rafId = 0;
    let resumeTimer = 0;

    function measure(resetPosition = false){
      // offsetWidth (integer) avoids sub-pixel drift that makes the cycle wrap
      // look jumpy when offsetPx wraps from cycleWidth back to 0.
      cycleWidth = firstGroup.offsetWidth + gap;
      if(resetPosition && cycleWidth > 0){ offsetPx = 0; applyTrackTransform(); }
    }

    function applyTrackTransform(){
      track.style.transform = `translate3d(${-Math.round(offsetPx)}px, 0, 0)`;
    }

    function normalizeScroll(){
      if(cycleWidth <= 0) return;
      while(offsetPx >= cycleWidth) offsetPx -= cycleWidth;
      while(offsetPx < 0) offsetPx += cycleWidth;
    }

    function clearResumeTimer(){
      if(resumeTimer){ window.clearTimeout(resumeTimer); resumeTimer = 0; }
    }

    function queueAutoResume(delayMs = 600){
      clearResumeTimer();
      resumeTimer = window.setTimeout(() => { paused = false; }, delayMs);
    }

    function tick(timestamp){
      if(!lastFrameTs) lastFrameTs = timestamp;
      const dt = (timestamp - lastFrameTs) / 1000;
      lastFrameTs = timestamp;
      const hoverPaused = timestamp >= hoverPauseReadyAt && viewport.matches(":hover") && !dragging;

      if(paused && !dragging && !hoverPaused && !resumeTimer) paused = false;

      if(cycleWidth <= 0){
        if(!lastMeasureTs || (timestamp - lastMeasureTs) >= 250){
          lastMeasureTs = timestamp;
          measure(false);
          if(cycleWidth > 0){ normalizeScroll(); applyTrackTransform(); }
        }
      } else if(!paused && !dragging && !hoverPaused){
        offsetPx += speedPxPerSecond * dt;
        normalizeScroll();
        applyTrackTransform();
      }

      rafId = window.requestAnimationFrame(tick);
      if(criticalTickerState){ criticalTickerState.rafId = rafId; criticalTickerState.resumeTimer = resumeTimer; }
    }

    measure(true);
    hoverPauseReadyAt = (window.performance?.now?.() || 0) + hoverPauseGraceMs;
    window.requestAnimationFrame(() => {
      measure(false);
      if(cycleWidth > 0){ normalizeScroll(); applyTrackTransform(); }
    });
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(() => {
        measure(false);
        if(cycleWidth > 0){ normalizeScroll(); applyTrackTransform(); }
      }).catch(() => {});
    }

    viewport.addEventListener("pointerdown", (event) => {
      if(event.pointerType === "mouse" && event.button !== 0) return;
      if(activePointerId !== null) return;
      event.preventDefault();
      if(cycleWidth <= 0) measure(false);
      clearResumeTimer();
      dragging = true;
      paused = true;
      activePointerId = event.pointerId;
      lastPointerX = event.clientX;
      dragDistancePx = 0;
      pointerDownUrl = event.target?.closest(".criticalTickerItem[data-item-url]")?.dataset?.itemUrl || "";
      viewport.classList.add("isDragging");
      viewport.setPointerCapture(event.pointerId);
    }, { signal: abortController.signal });

    viewport.addEventListener("pointermove", (event) => {
      if(!dragging || event.pointerId !== activePointerId) return;
      event.preventDefault();
      const dx = event.clientX - lastPointerX;
      lastPointerX = event.clientX;
      dragDistancePx += Math.abs(dx);
      offsetPx -= dx;
      normalizeScroll();
      applyTrackTransform();
    }, { signal: abortController.signal });

    function endDrag(event){
      if(!dragging || event.pointerId !== activePointerId) return;
      const shouldOpenLink = event.type === "pointerup" && dragDistancePx < 8 && pointerDownUrl;
      dragging = false;
      activePointerId = null;
      viewport.classList.remove("isDragging");
      if(viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      dragDistancePx = 0;
      if(shouldOpenLink) window.open(pointerDownUrl, "_blank", "noopener,noreferrer");
      pointerDownUrl = "";
      queueAutoResume(350);
      hoverPauseReadyAt = (window.performance?.now?.() || 0) + hoverPauseGraceMs;
    }

    viewport.addEventListener("pointerup",           endDrag, { signal: abortController.signal });
    viewport.addEventListener("pointercancel",        endDrag, { signal: abortController.signal });
    viewport.addEventListener("lostpointercapture",   endDrag, { signal: abortController.signal });
    viewport.addEventListener("dragstart", (event) => { event.preventDefault(); }, { signal: abortController.signal });

    viewport.addEventListener("wheel", (event) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if(!delta) return;
      event.preventDefault();
      clearResumeTimer();
      paused = true;
      offsetPx += delta;
      normalizeScroll();
      applyTrackTransform();
      queueAutoResume(700);
    }, { passive: false, signal: abortController.signal });

    window.addEventListener("resize", () => {
      measure(false);
      if(cycleWidth > 0){ normalizeScroll(); applyTrackTransform(); }
    }, { signal: abortController.signal });

    rafId = window.requestAnimationFrame(tick);
    criticalTickerState = { abortController, rafId, resumeTimer };
  }

  function setupCriticalTickerHover(container, items){
    destroyCriticalTickerHover();
    const controller = new AbortController();
    criticalTickerHoverController = controller;

    const clearCloseTimeout = () => {
      if(criticalTickerCloseTimeout){ window.clearTimeout(criticalTickerCloseTimeout); criticalTickerCloseTimeout = null; }
    };

    const schedulePopupClose = (delayMs = 500) => {
      clearCloseTimeout();
      if(!criticalTickerPopup) return;
      criticalTickerCloseTimeout = window.setTimeout(() => {
        if(criticalTickerPopup && !criticalTickerPopup.matches(":hover")) clearCriticalTickerPopup();
      }, delayMs);
    };

    container.addEventListener("mousemove", (e) => {
      const viewport = container.querySelector(".criticalTickerViewport");
      if(viewport?.classList.contains("isDragging")) return;

      const itemEl = e.target.closest(".criticalTickerItem[data-item-idx]");
      if(!itemEl){
        if(criticalTickerHoverTimeout){ window.clearTimeout(criticalTickerHoverTimeout); criticalTickerHoverTimeout = null; }
        schedulePopupClose(400);
        return;
      }

      const idx = parseInt(itemEl.dataset.itemIdx, 10);
      const item = items[idx];
      if(!item) return;

      if(criticalTickerHoverTimeout) window.clearTimeout(criticalTickerHoverTimeout);
      clearCloseTimeout();

      criticalTickerHoverTimeout = window.setTimeout(() => {
        clearCriticalTickerPopup();

        const popup = document.createElement("div");
        popup.className = "alertHoverPopup";
        popup.innerHTML = `
          <div class="popupTitle"><span class="localAlertBadge">${escapeHtml(item.label || item.scope.toUpperCase())}</span> ${escapeHtml(item.title)}</div>
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="popupLink">Read Article →</a>
        `;

        popup.style.left = Math.min(e.clientX + 12, window.innerWidth - 420) + "px";
        popup.style.top  = Math.min(e.clientY + 12, window.innerHeight - 300) + "px";

        document.body.appendChild(popup);
        criticalTickerPopup = popup;

        popup.addEventListener("mouseenter", () => { clearCloseTimeout(); }, { signal: controller.signal });
        popup.addEventListener("mouseleave", () => { schedulePopupClose(400); }, { signal: controller.signal });
      }, 1500);
    }, { signal: controller.signal });

    container.addEventListener("mouseleave", () => {
      if(criticalTickerHoverTimeout){ window.clearTimeout(criticalTickerHoverTimeout); criticalTickerHoverTimeout = null; }
      schedulePopupClose(400);
    }, { signal: controller.signal });

    container.addEventListener("mouseenter", () => { clearCloseTimeout(); }, { signal: controller.signal });
  }

  function normalizeTickerItems(items, scope, label){
    return items.map((item) => ({
      scope,
      label: label || scope.toUpperCase(),
      title: item.title || "Untitled",
      url: item.url || "",
      pubDate: item.pubDate || ""
    })).filter((item) => Boolean(item.url));
  }

  async function getGeoForScope(){
    if(geoCache) return geoCache;
    // Honor whatever source the user set their location with — GPS, saved
    // device coords, or ZIP. Same resolver that weather.js uses, so the
    // user only sets location once.
    const liveCfg = window.App?.cfg || cfg;
    try {
      if(typeof window.App?.resolvePreferredLocation === "function"){
        const loc = await window.App.resolvePreferredLocation({ cfg: liveCfg, autoDetect: false });
        if(loc?.city){
          geoCache = { lat: Number(loc.lat), lon: Number(loc.lon), city: loc.city, state: loc.state || "" };
          return geoCache;
        }
      }
    } catch {}
    const zip = liveCfg.zipCode;
    if(!zip || !/^\d{5}$/.test(zip)) return null;
    try{
      geoCache = await geocodeZip(zip);
      return geoCache;
    }catch{
      return null;
    }
  }

  // Build a Google News RSS search URL. We deliberately drop the
  // `when:1d` restriction we used to send: in many small/medium markets
  // there isn't a fresh story every day, and Google's relevance/recency
  // ranking already biases recent results to the top.
  function googleNewsRssFor(query){
    return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  }

  // The picker modal + Reddit discovery moved to common.js so both news.js
  // and settings.js can open it. Use window.App.openSourcePicker(scope, onSaved).

  async function getTickerFeedsForScope(scope){
    if(scope === "national"){
      return [{ rss: CRITICAL_NATIONAL_RSS, scope: "national", label: "US" }];
    }
    if(scope === "international"){
      return [{ rss: CRITICAL_INTERNATIONAL_RSS, scope: "international", label: "WORLD" }];
    }
    const geo = await getGeoForScope();
    if(scope === "local"){
      if(!geo) return [{ rss: CRITICAL_NATIONAL_RSS, scope: "national", label: "US" }];
      // Quoted "City, ST" disambiguates common-name cities (Jackson, MS vs
      // Jackson, MI). Pair with unquoted "City StateName" for broader
      // recall — both feed into the ticker dedupe.
      const fullState = window.App?.expandStateName?.(geo.state) || geo.state;
      const label = geo.city.toUpperCase();
      return [
        { rss: googleNewsRssFor(`"${geo.city}, ${geo.state}"`), scope: "local", label },
        { rss: googleNewsRssFor(`${geo.city} ${fullState}`), scope: "local", label }
      ];
    }
    if(scope === "regional"){
      if(!geo) return [{ rss: CRITICAL_NATIONAL_RSS, scope: "national", label: "US" }];
      // "${state} state news" is more reliable than "${state} news" — the
      // latter returns 0 for some states (Michigan being the notable case).
      const fullState = window.App?.expandStateName?.(geo.state) || geo.state;
      const label = (fullState || geo.state).toUpperCase();
      return [
        { rss: googleNewsRssFor(`${fullState} state news`), scope: "regional", label },
        { rss: googleNewsRssFor(`${fullState} headlines`), scope: "regional", label }
      ];
    }
    return [{ rss: CRITICAL_NATIONAL_RSS, scope: "national", label: "US" }];
  }

  // Pick the news-grid widgets for the active scope.
  // - national / international: filter cfg.widgets by their `scopes` tag.
  //   Widgets without a `scopes` field count as ["national","international"]
  //   so older saved configs keep rendering on those views.
  // - local / regional: synthesize a Google News search widget from the user's
  //   geocoded city/state. If no ZIP, returns []; the caller renders a hint.
  async function getWidgetsForScope(scope, sourceCfg){
    if(scope === "local" || scope === "regional"){
      // If the user has curated sources for this scope, use them directly —
      // no Google News guesswork. This is the fast path on every visit
      // after the first scope selection.
      const savedKey = scope === "local" ? "localSources" : "regionalSources";
      const skipKey  = scope === "local" ? "localSourcesSkipped" : "regionalSourcesSkipped";
      const saved = Array.isArray(sourceCfg?.[savedKey]) ? sourceCfg[savedKey] : [];
      if(saved.length > 0){
        return { widgets: saved.slice(0, 8), reason: "" };
      }

      const geo = await getGeoForScope();
      if(!geo) return { widgets: [], reason: "no-geo" };
      const fullState = window.App?.expandStateName?.(geo.state) || geo.state;

      // No saved sources and the user hasn't opted to skip the picker → open it.
      // The picker will save selections (or set the skip flag) and the
      // onSaved callback re-runs render so the page picks up the new sources.
      if(!sourceCfg?.[skipKey]){
        // Fire and forget; render below shows the auto-search fallback in the
        // meantime so the page isn't empty while the modal is open.
        window.App?.openSourcePicker?.(scope, () => render(true));
      }

      if(scope === "local"){
        // Disambiguated by direct probing of Google News RSS. Common-name
        // cities like Jackson, Springfield, Madison, Albany were returning
        // results from the wrong-state homonym when we used bare ${city}
        // queries. The quoted "City, ST" form (e.g. `"Jackson, MI"`) is the
        // most reliable disambiguator across cities. Per-category combos
        // ("Jackson sports", "Jackson entertainment", etc.) are highly
        // inconsistent — many return 0 — so we use complementary angles
        // instead of strict topical splits and add a state-level card so
        // the row never feels empty for small markets.
        return {
          widgets: [
            {
              name: `${geo.city}, ${geo.state} — Local News`,
              rss: googleNewsRssFor(`"${geo.city}, ${geo.state}"`),
              site: "https://news.google.com",
              headlinesCount: 6
            },
            {
              name: `${geo.city} — Headlines`,
              rss: googleNewsRssFor(`${geo.city} ${fullState}`),
              site: "https://news.google.com",
              headlinesCount: 6
            },
            {
              name: `${fullState} — State News`,
              rss: googleNewsRssFor(`${fullState} state news`),
              site: "https://news.google.com",
              headlinesCount: 6
            }
          ],
          reason: ""
        };
      }

      // Regional: full state name avoids "NY" matching every "ny" substring.
      // Use "${state} state news" (verified to return content even for states
      // where the bare "${state} news" returns 0, like Michigan) and add the
      // headlines + sports angles. Some states / categories may still come
      // back sparse — that's a Google News content limitation, not a query
      // we can fix client-side.
      return {
        widgets: [
          {
            name: `${fullState} — State News`,
            rss: googleNewsRssFor(`${fullState} state news`),
            site: "https://news.google.com",
            headlinesCount: 6
          },
          {
            name: `${fullState} — Headlines`,
            rss: googleNewsRssFor(`${fullState} headlines`),
            site: "https://news.google.com",
            headlinesCount: 6
          },
          {
            name: `${fullState} — Sports`,
            rss: googleNewsRssFor(`${fullState} sports`),
            site: "https://news.google.com",
            headlinesCount: 6
          }
        ],
        reason: ""
      };
    }

    const all = Array.isArray(sourceCfg?.widgets) ? sourceCfg.widgets : [];
    const filtered = all.filter(w => {
      // normalizeConfig assigns scopes on save (canonical defaults by RSS
      // URL or ["national"] for unrecognized custom feeds), so this fallback
      // is just a safety net for in-memory cfgs that bypass normalize.
      const tags = Array.isArray(w?.scopes) && w.scopes.length
        ? w.scopes
        : ["national"];
      return tags.includes(scope);
    });
    return {
      widgets: filtered,
      reason: filtered.length === 0 ? "no-match" : ""
    };
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
    criticalNewsBar.innerHTML = `<span class="criticalTickerEmpty">Loading headlines...</span>`;

    try{
      const feeds = await getTickerFeedsForScope(currentScope);
      const allItems = [];
      await Promise.all(feeds.map(async (feed) => {
        const items = await fetchNewsItems(feed.rss, 12, !force);
        allItems.push(...normalizeTickerItems(items, feed.scope, feed.label));
      }));

      const prioritized = dedupeTickerItems(allItems).slice(0, 16);

      if(prioritized.length === 0){
        criticalNewsBar.innerHTML = `<span class="criticalTickerEmpty">No headlines right now.</span>`;
        return;
      }

      const tickerItemsHtml = prioritized.map((item, idx) => {
        return `<a class="criticalTickerItem" data-item-idx="${idx}" data-item-url="${escapeHtml(item.url)}" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(item.label)}: ${escapeHtml(item.title)}"><span class="criticalBadge ${escapeHtml(item.scope)}">${escapeHtml(item.label)}</span><span>${escapeHtml(item.title)}</span></a>`;
      }).join('<span class="criticalTickerSep" aria-hidden="true">•</span>');

      criticalNewsBar.innerHTML = `
        <div class="criticalTickerViewport" aria-live="polite" aria-label="Headlines ticker">
          <div class="criticalTickerTrack">
            <div class="criticalTickerGroup">${tickerItemsHtml}</div>
            <div class="criticalTickerGroup" aria-hidden="true">${tickerItemsHtml}</div>
          </div>
        </div>
      `;

      setupCriticalTicker(criticalNewsBar);
      setupCriticalTickerHover(criticalNewsBar, prioritized);
    }catch(error){
      handleError(error, "Critical ticker");
      criticalNewsBar.innerHTML = `<span class="criticalTickerEmpty">Headlines unavailable right now.</span>`;
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
    // No aria-label — the accessible name is the link's text content
    // (date + title + description), which already includes the article title.
    // axe's label-content-name-mismatch rule fails when aria-label omits any
    // visible substring (e.g. the date), so let the natural name win.
    
    // Publication date
    const dateDiv = document.createElement("div");
    dateDiv.className = "rssItemDate";
    if(item.pubDate){
      dateDiv.textContent = item.pubDate;
    } else {
      dateDiv.textContent = "Date unavailable";
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

    const liveCfg = window.App?.cfg || cfg;
    const { widgets: scopeWidgets, reason } = await getWidgetsForScope(currentScope, liveCfg);
    const widgets = scopeWidgets.slice(0, 15);

    if(widgets.length === 0){
      let hint;
      if(reason === "no-geo"){
        updateStatus("Set your ZIP code to enable local/regional news", true);
        hint = `Set your ZIP code in <a class="subLink" href="settings.html#weather">SETTINGS</a> to see ${currentScope} news.`;
      } else if(reason === "no-match"){
        updateStatus(`No sources tagged "${currentScope}"`, true);
        hint = `None of your configured sources are tagged for the ${currentScope.toUpperCase()} scope. Adjust their tags in <a class="subLink" href="settings.html#news">SETTINGS</a>.`;
      } else {
        updateStatus("No news sources configured", true);
        hint = `Please configure news sources in <a class="subLink" href="settings.html#news">SETTINGS</a>.`;
      }
      newsGrid.innerHTML = `<div class="hint" style="grid-column:1/-1;text-align:center;padding:20px;">${hint}</div>`;
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

  // Initialize scope button active state from saved config
  function syncScopeButtons(scope){
    document.querySelectorAll(".tickerScopeBtn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.scope === scope);
    });
    syncEditSourcesLink(scope);
  }

  // Show "Edit sources" only on local/regional and only when something is
  // saved (or skipped) — gives users a way back to the picker.
  function syncEditSourcesLink(scope){
    const host = document.getElementById("editSourcesHost");
    if(!host) return;
    const liveCfg = window.App?.cfg || cfg;
    const showable = scope === "local" || scope === "regional";
    const key = scope === "local" ? "localSources" : "regionalSources";
    const skipKey = scope === "local" ? "localSourcesSkipped" : "regionalSourcesSkipped";
    const has = (liveCfg?.[key] || []).length > 0 || liveCfg?.[skipKey] === true;
    host.innerHTML = (showable && has)
      ? `<a href="#" class="subLink editSourcesLink" data-edit-scope="${scope}">Edit ${scope} sources</a>`
      : "";
    host.querySelector(".editSourcesLink")?.addEventListener("click", (e) => {
      e.preventDefault();
      const sc = e.currentTarget.dataset.editScope;
      // Clear skip so the picker opens fresh; saved sources are still shown
      // pre-checked since the picker uses suggestions, not pre-existing picks
      // (custom URLs the user previously added would need re-adding — kept
      // intentionally simple for now).
      const next = { ...window.App.cfg };
      if(sc === "local") next.localSourcesSkipped = false;
      else next.regionalSourcesSkipped = false;
      saveConfig(next);
      window.App?.openSourcePicker?.(sc, () => render(true));
    });
  }
  syncScopeButtons(currentScope);

  // Wire scope buttons — drive both the critical ticker AND the news grid
  // off the same scope state so the whole page reflects the chosen perspective.
  tickerScopeBar?.querySelectorAll(".tickerScopeBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const scope = btn.dataset.scope;
      if(scope === currentScope) return;
      currentScope = scope;
      syncScopeButtons(scope);
      // Persist as newsScope; keep newsTickerScope in sync for any older code
      // that still reads it (back-compat across deploys).
      saveConfig({ ...window.App.cfg, newsScope: scope, newsTickerScope: scope });
      geoCache = null;
      renderCriticalTicker(true);
      render(true);
    });
  });

  // Keyboard accessibility for refresh button
  refreshBtn?.addEventListener("click", () => render(true));
  refreshBtn?.addEventListener("keydown", (e) => {
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      render(true);
    }
  });

  // "Sources" button — opens the picker for the current scope (local/regional)
  // or sends the user to Settings > News for national/international, where the
  // existing News Sources editor manages the cfg.widgets list.
  document.getElementById("manageSourcesBtn")?.addEventListener("click", () => {
    if(currentScope === "local" || currentScope === "regional"){
      // Clear skip flag so the picker opens fresh.
      const next = { ...window.App.cfg };
      if(currentScope === "local") next.localSourcesSkipped = false;
      else next.regionalSourcesSkipped = false;
      saveConfig(next);
      window.App?.openSourcePicker?.(currentScope, () => render(true));
    } else {
      // For national/international, jump to the appropriate Settings panel.
      window.location.href = `settings.html#news-${currentScope}-sources`;
    }
  });

  // Initial render
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => { render(true); }); // force=true to bypass cache
  }else{
    render(true); // force=true to bypass cache on page load
  }
})();
