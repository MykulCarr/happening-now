(() => {
  "use strict";

  const { cfg, escapeHtml, fetchRssItems, getRssCooldownStatus, getRssLastSuccessAgeMs, formatAge, clearRssCache, loadConfig, parseDateOnlyLocal, applyThemeDensity, resolvePreferredLocation, abbreviateState, geocodeZip, saveConfig, cacheGet, cacheSet } = window.App;

  // Apply theme, density, and font size on page load
  applyThemeDensity(cfg);

  const weatherSub = document.getElementById("weatherSub");
  const weatherCurrent = document.getElementById("weatherCurrent");
  const weatherCurrentUpdated = document.getElementById("weatherCurrentUpdated");
  const weatherHourly = document.getElementById("weatherHourly");
  const weatherDaily = document.getElementById("weatherDaily");
  const weatherAlerts = document.getElementById("weatherAlerts");
  const weatherNews = document.getElementById("weatherNews");
  const alertIndicator = document.getElementById("alertIndicator");
  const weatherRefreshBtn = document.getElementById("weatherRefreshBtn");
  const weatherNewsRetryBtn = document.getElementById("weatherNewsRetryBtn");
  const weatherNewsMoreBtn = document.getElementById("weatherNewsMoreBtn");

  weatherCurrent?.classList.add("isLoading");

  const radarOpenBtn = document.getElementById("radarOpenBtn");
  const alertsTabs = document.getElementById("alertsTabs");
  const forecastTabs = document.getElementById("forecastTabs");

  if(radarOpenBtn) radarOpenBtn.disabled = true;

  let alertScope = cfg.weatherAlertScope || "both"; // local | national | both
  let lastGeo = null; // {city,state,lat,lon}
  let manualLocationOverride = null; // session override from prompt
  let intervalId = null;
  let topAlertsTickerState = null;
  let topAlertsHoverController = null;
  let topAlertsHoverTimeout = null;
  let topAlertsCloseTimeout = null;
  let topAlertsPopup = null;
  let refreshRunId = 0;

  const METEO_CACHE_KEY = "jas_weather_meteo_v1";
  const LOCAL_ALERTS_CACHE_KEY = "jas_weather_alerts_local_v1";
  const NATIONAL_ALERTS_CACHE_KEY = "jas_weather_alerts_national_v1";
  const WEATHER_NEWS_CACHE_KEY = "jas_weather_news_cache_v1";
  const WEATHER_NEWS_ARTICLE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

  function staleWarnMs(){
    const mins = Number(cfg.weatherStaleWarnMinutes || 30);
    const clamped = Number.isFinite(mins) ? Math.max(5, Math.min(180, Math.round(mins))) : 30;
    return clamped * 60 * 1000;
  }

  function sleep(ms){
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function timeoutSignal(timeoutMs){
    if(typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"){
      return AbortSignal.timeout(timeoutMs);
    }
    return null;
  }

  async function fetchJsonWithRetry(url, options = {}){
    const {
      retries = 2,
      timeoutMs = 10000,
      retryDelayMs = 350,
      retryOn = [408, 425, 429, 500, 502, 503, 504],
      ...fetchOptions
    } = options;

    let lastError = null;
    for(let attempt = 0; attempt <= retries; attempt++){
      try{
        const signal = timeoutSignal(timeoutMs);
        const response = await fetch(url, { ...fetchOptions, signal });

        if(!response.ok){
          if(attempt < retries && retryOn.includes(response.status)){
            await sleep(retryDelayMs * Math.pow(2, attempt));
            continue;
          }
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
      }catch(error){
        lastError = error;
        if(attempt < retries){
          await sleep(retryDelayMs * Math.pow(2, attempt));
          continue;
        }
      }
    }

    throw lastError || new Error("Request failed");
  }

  function coordsKey(lat, lon){
    return `${Number(lat).toFixed(3)}:${Number(lon).toFixed(3)}`;
  }

  function loadCachedMeteo(lat, lon, days){
    const bag = cacheGet(METEO_CACHE_KEY) || {};
    const key = `${coordsKey(lat, lon)}:${Math.max(1, Math.min(16, Number(days) || 7))}`;
    return bag[key] || null;
  }

  function saveCachedMeteo(lat, lon, days, data){
    if(!data || typeof data !== "object") return;
    const bag = cacheGet(METEO_CACHE_KEY) || {};
    const key = `${coordsKey(lat, lon)}:${Math.max(1, Math.min(16, Number(days) || 7))}`;
    bag[key] = { savedAt: Date.now(), data };
    cacheSet(METEO_CACHE_KEY, bag);
  }

  function loadCachedAlerts(key){
    const payload = cacheGet(key);
    if(!payload || !Array.isArray(payload.items)) return null;
    return payload;
  }

  function saveCachedAlerts(key, items){
    if(!Array.isArray(items)) return;
    cacheSet(key, { savedAt: Date.now(), items });
  }

  function buildFreshnessText(savedAt, usedCache, label){
    const ts = Number(savedAt) || Date.now();
    const ageMs = Math.max(0, Date.now() - ts);
    const age = formatAge(ageMs) || "0s";
    const source = usedCache ? "cached" : "live";
    const staleText = ageMs >= staleWarnMs() ? " - stale" : "";
    return `${label}: ${source}, ${age} ago${staleText}`;
  }

  function setWidgetFreshness(container, text, stale = false){
    if(!container || !text) return;
    const prior = container.querySelector(".wxFreshnessHint");
    if(prior) prior.remove();
    const hint = document.createElement("div");
    hint.className = "hint wxFreshnessHint";
    if(stale){
      hint.style.color = "#f59e0b";
      hint.style.fontWeight = "700";
    }
    hint.textContent = text;
    container.prepend(hint);
  }

  function destroyTopAlertsTicker(){
    if(!topAlertsTickerState) return;
    if(topAlertsTickerState.resumeTimer){
      window.clearTimeout(topAlertsTickerState.resumeTimer);
    }
    if(topAlertsTickerState.rafId){
      window.cancelAnimationFrame(topAlertsTickerState.rafId);
    }
    if(topAlertsTickerState.abortController){
      topAlertsTickerState.abortController.abort();
    }
    topAlertsTickerState = null;
  }

  function clearTopAlertsPopup(){
    if(topAlertsPopup){
      topAlertsPopup.remove();
      topAlertsPopup = null;
    }
  }

  function clearTopAlertsTimers(){
    if(topAlertsHoverTimeout){
      window.clearTimeout(topAlertsHoverTimeout);
      topAlertsHoverTimeout = null;
    }
    if(topAlertsCloseTimeout){
      window.clearTimeout(topAlertsCloseTimeout);
      topAlertsCloseTimeout = null;
    }
  }

  function destroyTopAlertsHover(){
    clearTopAlertsTimers();
    clearTopAlertsPopup();
    if(topAlertsHoverController){
      topAlertsHoverController.abort();
      topAlertsHoverController = null;
    }
  }

  function setupTopAlertsTicker(topBar){
    destroyTopAlertsTicker();

    const viewport = topBar.querySelector(".alertsTickerViewport");
    const track = topBar.querySelector(".alertsTickerTrack");
    const firstGroup = topBar.querySelector(".alertsTickerGroup");
    if(!viewport || !track || !firstGroup) return;

    const abortController = new AbortController();
    const speedPxPerSecond = 32;
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
      cycleWidth = firstGroup.getBoundingClientRect().width + gap;
      if(resetPosition && cycleWidth > 0){
        offsetPx = 0;
        applyTrackTransform();
      }
    }

    function applyTrackTransform(){
      track.style.transform = `translate3d(${-offsetPx}px, 0, 0)`;
    }

    function normalizeScroll(){
      if(cycleWidth <= 0) return;
      while(offsetPx >= cycleWidth){
        offsetPx -= cycleWidth;
      }
      while(offsetPx < 0){
        offsetPx += cycleWidth;
      }
    }

    function clearResumeTimer(){
      if(resumeTimer){
        window.clearTimeout(resumeTimer);
        resumeTimer = 0;
      }
    }

    function queueAutoResume(delayMs = 600){
      clearResumeTimer();
      resumeTimer = window.setTimeout(() => {
        paused = false;
      }, delayMs);
    }

    function tick(timestamp){
      if(!lastFrameTs) lastFrameTs = timestamp;
      const dt = (timestamp - lastFrameTs) / 1000;
      lastFrameTs = timestamp;
      const hoverPaused = timestamp >= hoverPauseReadyAt && viewport.matches(":hover") && !dragging;

      if(paused && !dragging && !hoverPaused && !resumeTimer){
        paused = false;
      }

      if(cycleWidth <= 0){
        if(!lastMeasureTs || (timestamp - lastMeasureTs) >= 250){
          lastMeasureTs = timestamp;
          measure(false);
          if(cycleWidth > 0){
            normalizeScroll();
            applyTrackTransform();
          }
        }
      } else if(!paused && !dragging && !hoverPaused){
        offsetPx += speedPxPerSecond * dt;
        normalizeScroll();
        applyTrackTransform();
      }

      rafId = window.requestAnimationFrame(tick);
      if(topAlertsTickerState){
        topAlertsTickerState.rafId = rafId;
        topAlertsTickerState.resumeTimer = resumeTimer;
      }
    }

    measure(true);
    hoverPauseReadyAt = (window.performance?.now?.() || 0) + hoverPauseGraceMs;
    window.requestAnimationFrame(() => {
      measure(false);
      if(cycleWidth > 0){
        normalizeScroll();
        applyTrackTransform();
      }
    });
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(() => {
        measure(false);
        if(cycleWidth > 0){
          normalizeScroll();
          applyTrackTransform();
        }
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
      pointerDownUrl = event.target?.closest(".alertItem[data-alert-url]")?.dataset?.alertUrl || "";
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
      if(viewport.hasPointerCapture(event.pointerId)){
        viewport.releasePointerCapture(event.pointerId);
      }
      dragDistancePx = 0;
      if(shouldOpenLink){
        window.open(pointerDownUrl, "_blank", "noopener,noreferrer");
      }
      pointerDownUrl = "";
      queueAutoResume(350);
      hoverPauseReadyAt = (window.performance?.now?.() || 0) + hoverPauseGraceMs;
    }

    viewport.addEventListener("pointerup", endDrag, { signal: abortController.signal });
    viewport.addEventListener("pointercancel", endDrag, { signal: abortController.signal });
    viewport.addEventListener("lostpointercapture", endDrag, { signal: abortController.signal });
    viewport.addEventListener("dragstart", (event) => {
      event.preventDefault();
    }, { signal: abortController.signal });

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
    }, { passive:false, signal: abortController.signal });

    window.addEventListener("resize", () => {
      measure(false);
      if(cycleWidth > 0){
        normalizeScroll();
        applyTrackTransform();
      }
    }, { signal: abortController.signal });

    rafId = window.requestAnimationFrame(tick);
    topAlertsTickerState = {
      abortController,
      rafId,
      resumeTimer
    };
  }

  function setupTopAlertsHover(topBar, allTickerAlerts){
    destroyTopAlertsHover();
    const controller = new AbortController();
    topAlertsHoverController = controller;

    const clearCloseTimeout = () => {
      if(topAlertsCloseTimeout){
        window.clearTimeout(topAlertsCloseTimeout);
        topAlertsCloseTimeout = null;
      }
    };

    const schedulePopupClose = (delayMs=500) => {
      clearCloseTimeout();
      if(!topAlertsPopup) return;
      topAlertsCloseTimeout = window.setTimeout(() => {
        if(topAlertsPopup && !topAlertsPopup.matches(":hover")){
          clearTopAlertsPopup();
        }
      }, delayMs);
    };

    topBar.addEventListener("mousemove", (e) => {
      const viewport = topBar.querySelector(".alertsTickerViewport");
      if(viewport?.classList.contains("isDragging")) return;

      const alertItem = e.target.closest(".alertItem");
      if(!alertItem){
        if(topAlertsHoverTimeout){
          window.clearTimeout(topAlertsHoverTimeout);
          topAlertsHoverTimeout = null;
        }
        schedulePopupClose(400);
        return;
      }

      const idx = parseInt(alertItem.dataset.alertIdx, 10);
      const alert = allTickerAlerts[idx];
      if(!alert) return;

      if(topAlertsHoverTimeout){
        window.clearTimeout(topAlertsHoverTimeout);
      }
      clearCloseTimeout();

      topAlertsHoverTimeout = window.setTimeout(() => {
        clearTopAlertsPopup();

        const popup = document.createElement("div");
        popup.className = "alertHoverPopup";
        const apiUrl = alert.apiUrl || "";
        const webUrl = alert.webUrl || "";
        const hasAlertUrl = Boolean(apiUrl || webUrl);
        const linkUrl = hasAlertUrl
          ? (webUrl || apiUrl)
          : `https://news.google.com/search?q=${encodeURIComponent(alert.title)}`;
        const linkText = hasAlertUrl ? "Open Alert Details →" : "Read News Coverage →";

        popup.innerHTML = `
          <div class="popupTitle">${alert.isLocal ? '<span class="localAlertBadge">LOCAL</span> ' : ''}${escapeHtml(alert.title)}</div>
          <div class="popupMeta">
            ${alert.severity ? escapeHtml(alert.severity) + " • " : ""}
            ${alert.area ? escapeHtml(alert.area) : ""}
          </div>
          <div class="popupDesc">${escapeHtml(alert.desc || "No additional details available.")}</div>
          <a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="popupLink">${linkText}</a>
        `;

        popup.style.left = Math.min(e.clientX + 12, window.innerWidth - 420) + "px";
        popup.style.top = Math.min(e.clientY + 12, window.innerHeight - 300) + "px";

        document.body.appendChild(popup);
        topAlertsPopup = popup;

        popup.addEventListener("mouseenter", () => {
          clearCloseTimeout();
        }, { signal: controller.signal });

        popup.addEventListener("mouseleave", () => {
          schedulePopupClose(400);
        }, { signal: controller.signal });
      }, 1500);
    }, { signal: controller.signal });

    topBar.addEventListener("mouseleave", () => {
      if(topAlertsHoverTimeout){
        window.clearTimeout(topAlertsHoverTimeout);
        topAlertsHoverTimeout = null;
      }
      schedulePopupClose(400);
    }, { signal: controller.signal });

    topBar.addEventListener("mouseenter", () => {
      clearCloseTimeout();
    }, { signal: controller.signal });
  }

  function wmoDesc(code){
    const m = {
      0:"Clear", 1:"Mostly clear", 2:"Partly cloudy", 3:"Overcast",
      45:"Fog", 48:"Rime fog",
      51:"Light drizzle", 53:"Drizzle", 55:"Heavy drizzle",
      61:"Light rain", 63:"Rain", 65:"Heavy rain",
      71:"Light snow", 73:"Snow", 75:"Heavy snow",
      80:"Rain showers", 81:"Showers", 82:"Violent showers",
      95:"Thunderstorm"
    };
    return m[code] || `Code ${code}`;
  }

  async function fetchOpenMeteo(lat, lon, days){
    const forecastDays = Math.max(1, Math.min(16, Number(days) || 7));
    const tempUnit  = cfg.weatherTempUnit  || "fahrenheit";
    const windUnit  = cfg.weatherWindUnit  || "mph";
    const precipUnit = cfg.weatherPrecipUnit === "mm" ? "mm" : "inch";
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,relative_humidity_2m` +
      `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,relative_humidity_2m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset` +
      `&forecast_days=${forecastDays}` +
      `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&precipitation_unit=${precipUnit}&timezone=auto`;

    return fetchJsonWithRetry(url, {
      cache:"no-store",
      retries: 2,
      timeoutMs: 12000,
      retryDelayMs: 450
    });
  }

  async function fetchNwsAlerts(lat, lon){
    const url = `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
    const j = await fetchJsonWithRetry(url, {
      headers: { "Accept":"application/geo+json" },
      cache:"no-store",
      retries: 1,
      timeoutMs: 10000,
      retryDelayMs: 300
    });
    const feats = j.features || [];
    return feats.slice(0, 12).map(f => ({
      title: f.properties?.headline || f.properties?.event || "Alert",
      severity: f.properties?.severity || "",
      ends: f.properties?.ends || "",
      area: (f.properties?.areaDesc || "").slice(0, 140),
      desc: (f.properties?.description || "").slice(0, 320),
      apiUrl: f.properties?.id || f.id || "",
      webUrl: f.properties?.web || ""
    }));
  }

  function formatTimeLocal(iso, tz){
    try{ return new Date(iso).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }); }
    catch(e){ return iso }
  }

  // Simple moon phase calculator (returns text)
  function moonPhaseText(d){
    // d: Date
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1; // 1-12
    const day = d.getUTCDate();
    let c = 0, e = 0, jd = 0, b = 0;
    if (month < 3) { c = year - 1; e = Math.floor((c + 1) / 100); jd = Math.floor(365.25 * c) - 679006; }
    else { c = year; e = Math.floor((c) / 100); jd = Math.floor(365.25 * (c)) - 679006; }
    jd += Math.floor(30.6001 * (month + 1)) + day;
    jd += 1720995;
    b = 0;
    const days = jd - 2451550.1;
    const newMoons = days / 29.53058867;
    const phase = newMoons - Math.floor(newMoons);
    if (phase < 0.03) return 'New Moon';
    if (phase < 0.25) return 'Waxing Crescent';
    if (phase < 0.27) return 'First Quarter';
    if (phase < 0.49) return 'Waxing Gibbous';
    if (phase < 0.51) return 'Full Moon';
    if (phase < 0.74) return 'Waning Gibbous';
    if (phase < 0.76) return 'Last Quarter';
    return 'Waning Crescent';
  }

  function moonPhaseIcon(phase){
    if(phase.includes('New')) return '🌑';
    if(phase.includes('Waxing Crescent')) return '🌒';
    if(phase.includes('First Quarter')) return '🌓';
    if(phase.includes('Waxing Gibbous')) return '🌔';
    if(phase.includes('Full')) return '🌕';
    if(phase.includes('Waning Gibbous')) return '🌖';
    if(phase.includes('Last Quarter')) return '🌗';
    if(phase.includes('Waning Crescent')) return '🌘';
    return '🌙';
  }

  function getWeatherIcon(code){
    if(code === 0 || code === 1) return "☀️";
    if(code === 2) return "⛅";
    if(code === 3 || code === 45 || code === 48) return "☁️";
    if(code >= 51 && code <= 55) return "🌦️";
    if(code >= 61 && code <= 65) return "🌧️";
    if(code >= 71 && code <= 75) return "❄️";
    if(code >= 80 && code <= 82) return "🌦️";
    if(code === 95) return "⛈️";
    return "🌤️";
  }

  async function fetchNwsNationalAlerts(){
    const url = `https://api.weather.gov/alerts/active?status=actual&message_type=alert`;
    const j = await fetchJsonWithRetry(url, {
      headers: { "Accept":"application/geo+json" },
      cache:"no-store",
      retries: 1,
      timeoutMs: 10000,
      retryDelayMs: 300
    });
    const feats = j.features || [];

    // Filter to avoid a firehose
    const filtered = feats.filter(f => {
      const sev = (f.properties?.severity || "").toLowerCase();
      return sev === "severe" || sev === "extreme";
    });

    filtered.sort((a,b) => {
      const ta = Date.parse(a.properties?.sent || a.properties?.effective || 0) || 0;
      const tb = Date.parse(b.properties?.sent || b.properties?.effective || 0) || 0;
      return tb - ta;
    });

    return filtered.slice(0, 20).map(f => ({
      title: f.properties?.headline || f.properties?.event || "Alert",
      severity: f.properties?.severity || "",
      ends: f.properties?.ends || "",
      area: (f.properties?.areaDesc || "").slice(0, 140),
      desc: (f.properties?.description || "").slice(0, 320),
      apiUrl: f.properties?.id || f.id || "",
      webUrl: f.properties?.web || ""
    }));
  }

  function renderWeatherNewsFallback(mode="local"){
    const fallbackSources = [
      {
        title: "Google News Weather Coverage",
        url: "https://news.google.com/search?q=weather%20climate%20environment&hl=en-US&gl=US&ceid=US%3Aen",
        meta: mode === "local" ? "Live headlines open in a new tab" : "Fallback source"
      },
      {
        title: "NOAA Weather And Climate News",
        url: "https://www.noaa.gov/news",
        meta: "NOAA"
      },
      {
        title: "NASA Earth News",
        url: "https://www.nasa.gov/earth/",
        meta: "NASA Earth"
      },
      {
        title: "National Weather Service",
        url: "https://www.weather.gov/news/",
        meta: "weather.gov"
      },
      {
        title: "The Weather Channel News",
        url: "https://weather.com/news",
        meta: "weather.com"
      }
    ];

    const leadHint = mode === "local"
      ? `<div class="hint" style="margin-bottom:10px;">Live weather headlines are limited in local file mode. Open one of these sources:</div>`
      : `<div class="hint" style="margin-bottom:10px;">Live feed unavailable right now. Try one of these sources:</div>`;

    weatherNews.innerHTML = leadHint + fallbackSources.map((item) => `
      <a class="rssItem" href="${item.url}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(item.title)}">
        <div class="rssItemTitle">${escapeHtml(item.title)}</div>
        <div class="rssMeta"><span>${escapeHtml(item.meta)}</span></div>
      </a>
    `).join("");

    setWidgetFreshness(
      weatherNews,
      mode === "local" ? "News: fallback list (local file mode)" : "News: fallback list (feed unavailable)",
      true
    );
  }

  function loadCachedWeatherNews(){
    try{
      const raw = localStorage.getItem(WEATHER_NEWS_CACHE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
      return {
        savedAt: Number(parsed.savedAt) || Date.now(),
        items: parsed.items
          .filter((item) => item && item.title && item.url)
          .slice(0, 8)
      };
    }catch{
      return null;
    }
  }

  function saveCachedWeatherNews(items){
    if(!Array.isArray(items) || items.length === 0) return;
    const payload = {
      savedAt: Date.now(),
      items: items.slice(0, 8).map((item) => ({
        title: String(item?.title || "").trim(),
        url: String(item?.url || "").trim(),
        pubDate: String(item?.pubDate || "").trim()
      })).filter((item) => item.title && item.url)
    };
    if(payload.items.length === 0) return;
    try{
      localStorage.setItem(WEATHER_NEWS_CACHE_KEY, JSON.stringify(payload));
    }catch{}
  }

  function renderWeatherNewsFromCache(cached, reasonLabel){
    if(!cached || !Array.isArray(cached.items) || cached.items.length === 0){
      return false;
    }

    const reason = reasonLabel || "Live feed unavailable. Showing last loaded headlines.";
    weatherNews.innerHTML = `<div class="hint" style="margin-bottom:10px;">${escapeHtml(reason)}</div>`;

    cached.items.forEach((item) => {
      const link = document.createElement("a");
      link.className = "rssItem";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", `Read: ${item.title}`);

      const title = document.createElement("div");
      title.className = "rssItemTitle";
      title.textContent = item.title;
      link.appendChild(title);

      if(item.pubDate){
        const meta = document.createElement("div");
        meta.className = "rssMeta";
        meta.innerHTML = `<span>${escapeHtml(item.pubDate)}</span>`;
        link.appendChild(meta);
      }

      weatherNews.appendChild(link);
    });

    const ageMs = Math.max(0, Date.now() - (Number(cached.savedAt) || Date.now()));
    const age = typeof formatAge === "function" ? formatAge(ageMs) : "";
    setWidgetFreshness(
      weatherNews,
      age ? `News: cached, ${age} ago` : "News: cached",
      true
    );
    return true;
  }

  function appendWeatherNewsCooldownNote(rssUrl){
    if(typeof getRssCooldownStatus !== "function") return;
    const status = getRssCooldownStatus(rssUrl);
    if(!status || status.retryInSec <= 0) return;

    const note = document.createElement("div");
    note.className = "dataSourceTag isFallback newsFallbackNote newsCooldownNote";
    note.textContent = `Retrying feed routes in ${status.retryInSec}s`;
    weatherNews.appendChild(note);

    const ageMs = typeof getRssLastSuccessAgeMs === "function" ? getRssLastSuccessAgeMs(rssUrl) : null;
    const ageNote = document.createElement("div");
    ageNote.className = "hint newsLastSuccessNote";
    ageNote.textContent = ageMs != null && typeof formatAge === "function"
      ? `Last successful fetch ${formatAge(ageMs)} ago`
      : "No successful fetch yet";
    weatherNews.appendChild(ageNote);
  }

  async function geocodeCityName(query){
    const q = String(query || "").trim();
    if(!q) return null;

    // Prefer Open-Meteo geocoding for broad city support.
    const url =
      `https://geocoding-api.open-meteo.com/v1/search` +
      `?name=${encodeURIComponent(q)}` +
      `&count=1&language=en&format=json`;

    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) return null;
    const j = await res.json();
    const row = Array.isArray(j?.results) ? j.results[0] : null;
    if(!row) return null;

    const city = String(row.name || "").trim();
    const state = String(row.admin1 || "").trim();
    const label = [city, abbreviateState(state)].filter(Boolean).join(", ") || city;
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return {
      city,
      state,
      lat,
      lon,
      label,
      zipCode: ""
    };
  }

  // Allow user to change location on-the-fly
  async function changeLocationPrompt() {
    const input = prompt("Enter a new ZIP code (5 digits) or city name:");
    if (!input || !input.trim()) return;
    
    const trimmed = input.trim();
    
    // Check if it's a 5-digit ZIP
    if (/^\d{5}$/.test(trimmed)) {
      try {
        if(typeof geocodeZip !== "function"){
          alert("ZIP lookup is unavailable right now. Please refresh and try again.");
          return;
        }

        const geo = await geocodeZip(trimmed);
        if (geo && geo.lat && geo.lon) {
          // Ask if user wants to save permanently
          const savePermanent = confirm("Save this ZIP code to settings? (Cancel for session-only)");
          
          if (savePermanent) {
            // Update config and save permanently
            cfg.zipCode = trimmed;
            cfg.useDeviceLocation = false; // Switch from device to ZIP mode
            saveConfig(cfg);
            manualLocationOverride = null;
          } else {
            manualLocationOverride = {
              ...geo,
              label: geo.city && geo.state ? `${geo.city}, ${abbreviateState(geo.state)}` : trimmed,
              source: "manual-zip"
            };
          }
          
          // Update lastGeo with label for display
          lastGeo = { 
            ...geo, 
            label: geo.city && geo.state ? `${geo.city}, ${abbreviateState(geo.state)}` : trimmed 
          };
          
          await refresh(true);
          return;
        } else {
          alert("Could not find location for that ZIP code.");
        }
      } catch (err) {
        console.error("Geocode error:", err);
        alert("Error looking up ZIP code. Please try again.");
      }
    } else {
      try {
        const geo = await geocodeCityName(trimmed);
        if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lon)) {
          const savePermanent = confirm("Save this city as your default location? (Cancel for session-only)");
          if (savePermanent) {
            cfg.useDeviceLocation = true;
            cfg.deviceLat = Number(geo.lat);
            cfg.deviceLon = Number(geo.lon);
            cfg.deviceLocationLabel = geo.label || trimmed;
            saveConfig(cfg);
            manualLocationOverride = null;
          } else {
            manualLocationOverride = {
              ...geo,
              label: geo.label || trimmed,
              source: "manual-city"
            };
          }

          lastGeo = {
            ...geo,
            label: geo.label || trimmed
          };

          await refresh(true);
          return;
        }

        alert("Could not find that city. Try 'City, ST' (example: Lansing, MI) or a 5-digit ZIP.");
      } catch (err) {
        console.error("City geocode error:", err);
        alert("Error looking up city. Please try again.");
      }
    }
  }
  
  // Make changeLocationPrompt globally accessible for onclick handler
  window.changeLocationPrompt = changeLocationPrompt;

  radarOpenBtn?.addEventListener("click", () => {
    if(!lastGeo) return;
    const { lat, lon } = lastGeo;
    // Open NOAA National Weather Service radar for the location
    const url = `https://radar.weather.gov/?loc=${lat},${lon}&zoom=9`;
    window.open(url, "_blank", "noopener,noreferrer");
  });

  alertsTabs?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-scope]");
    if(!btn) return;
    alertScope = btn.dataset.scope;
    // Save to config
    cfg.weatherAlertScope = alertScope;
    window.App.saveConfig(cfg);

    alertsTabs.querySelectorAll("button[data-scope]").forEach(b => {
      b.classList.toggle("active", b.dataset.scope === alertScope);
    });

    refresh(true);
  });

  forecastTabs?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-forecast-days]");
    if(!btn) return;
    const days = Number(btn.dataset.forecastDays);
    cfg.forecastLength = days;
    window.App.saveConfig(cfg);

    forecastTabs.querySelectorAll("button[data-forecast-days]").forEach(b => {
      b.classList.toggle("active", Number(b.dataset.forecastDays) === days);
    });

    // Refresh forecast with new length
    if(lastGeo){
      try{
        const meteo = await fetchOpenMeteo(lastGeo.lat, lastGeo.lon, days);
        renderDailyTable(meteo);
      } catch(e){
        console.error("Forecast refresh error:", e);
      }
    }
  });

  function renderHourlyTable(meteo){
    const h = meteo.hourly || {};
    const times = h.time || [];
    const hTemp = h.temperature_2m || [];
    const hPop  = h.precipitation_probability || [];
    const hWind = h.wind_speed_10m || [];
    const hGust = h.wind_gusts_10m || [];
    const hCode = h.weather_code || [];
    const hHumidity = h.relative_humidity_2m || [];

    const now = Date.now();
    const next = [];
    for(let i=0;i<times.length;i++){
      const t = Date.parse(times[i]);
      if(!Number.isFinite(t)) continue;
      if(t < now) continue;
      next.push({ t, i });
      if(next.length >= 24) break;
    }

    if(next.length === 0){
      weatherHourly.innerHTML = `<div class="hint">Hourly unavailable.</div>`;
      return;
    }

    const rows = next.map(({ t, i }) => {
      const d  = new Date(t);
      const hh = d.toLocaleTimeString([], { hour:"numeric", minute:"2-digit" });
      const icon = getWeatherIcon(hCode[i]);
      const iconTitle = wmoDesc(hCode[i]);

      const tempTxt = (hTemp[i] != null) ? `${hTemp[i]}°` : "--";
      const popTxt  = (hPop[i]  != null) ? `${hPop[i]}%` : "--";
      const windTxt = (hWind[i] != null) ? `${hWind[i]}` : "--";
      const gustTxt = (hGust[i] != null) ? `↑${hGust[i]}` : "";
      const humidityTxt = (hHumidity[i] != null) ? `${hHumidity[i]}%` : "--";

      return `
        <tr>
          <td class="wxT wxDateCol">${escapeHtml(hh)}</td>
          <td class="wxI" title="${escapeHtml(iconTitle)}"><span class="wxIcon" aria-hidden="true">${icon}</span></td>
          <td class="wxN">${escapeHtml(tempTxt)}</td>
          <td class="wxN">${escapeHtml(popTxt)}</td>
          <td class="wxN hourlyWind">${escapeHtml(windTxt)}${gustTxt ? ` <span class="wxGust">${gustTxt}</span>` : ""}</td>
          <td class="wxN hourlyHumidity">${escapeHtml(humidityTxt)}</td>
        </tr>
      `;
    }).join("");

    weatherHourly.innerHTML = `
      <div class="wxTableWrap wxHourlyWrap">
        <table class="wxTable">
          <thead><tr><th class="wxDateCol">Time</th><th class="wxIconCol">Cond</th><th>Temp</th><th>Prec</th><th class="hourlyWind">Wind</th><th class="hourlyHumidity">Humidity</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderDailyTable(meteo){
    const d = meteo.daily || {};
    const dTime = d.time || [];
    const dMax  = d.temperature_2m_max || [];
    const dMin  = d.temperature_2m_min || [];
    const dPop  = d.precipitation_probability_max || [];
    const dWind = d.wind_speed_10m_max || [];
    const dGust = d.wind_gusts_10m_max || [];
    const dCode = d.weather_code || [];
    const dPrecip = d.precipitation_sum || [];

    if(dTime.length === 0){
      weatherDaily.innerHTML = `<div class="hint">7-day unavailable.</div>`;
      return;
    }

    const maxDays = Number(cfg.forecastLength) || 7;
    const n = Math.min(maxDays, dTime.length);
    
    // Update title based on forecast length
    const forecastTitle = document.getElementById("forecastTitle");
    if (forecastTitle) {
      forecastTitle.textContent = `${maxDays} Day Forecast`;
    }
    
    const rows = Array.from({length:n}).map((_, i) => {
      const day = parseDateOnlyLocal(dTime[i]);
      if(!day) return "";
      const label = day.toLocaleDateString([], { weekday:"short", month:"short", day:"numeric" });
      const icon = getWeatherIcon(dCode[i]);
      const iconTitle = wmoDesc(dCode[i]);

      const hiTxt = (dMax[i] != null) ? `${dMax[i]}°` : "--";
      const loTxt = (dMin[i] != null) ? `${dMin[i]}°` : "--";
      const popTxt = (dPop[i] != null) ? `${dPop[i]}%` : "--";
      const windTxt = (dWind[i] != null) ? `${dWind[i]}` : "--";
      const gustTxt = (dGust[i] != null) ? `↑${dGust[i]}` : "";
      const precipTxt = (dPrecip[i] != null) ? `${dPrecip[i].toFixed(2)}"` : "--";

      return `
        <tr>
          <td class="wxT wxDateCol">${escapeHtml(label)}</td>
          <td class="wxI" title="${escapeHtml(iconTitle)}"><span class="wxIcon" aria-hidden="true">${icon}</span></td>
          <td class="wxN">${escapeHtml(hiTxt)} / ${escapeHtml(loTxt)}</td>
          <td class="wxN">${escapeHtml(popTxt)}</td>
          <td class="wxN dailyWind">${escapeHtml(windTxt)}${gustTxt ? ` <span class="wxGust">${gustTxt}</span>` : ""}</td>
          <td class="wxN dailyPrecip">${escapeHtml(precipTxt)}</td>
        </tr>
      `;
    }).join("");


    // Always auto-expand to fit content (3, 7, or 14 days)
    const wrapClass = "wxTableWrap wxDailyWrap isExpanded";

    weatherDaily.innerHTML = `
      <div class="${wrapClass}">
        <table class="wxTable">
          <thead><tr><th class="wxDateCol">Day</th><th class="wxIconCol">Cond</th><th>Hi/Lo</th><th>Prec</th><th class="dailyWind">Wind</th><th class="dailyPrecip">Rain</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderAlerts(list){
    weatherAlerts.innerHTML = "";
    if(list.length === 0){
      weatherAlerts.innerHTML = `<div class="hint">No active alerts.</div>`;
      return;
    }

    list.forEach(a => {
      const div = document.createElement("div");
      div.className = "chip";
      div.innerHTML = `
        <div><b>${escapeHtml(a.title || "Alert")}</b></div>
        <small>
          ${escapeHtml(a.severity || "")}
          ${a.area ? ` • ${escapeHtml(a.area)}` : ""}
          ${a.ends ? ` • Ends ${escapeHtml(a.ends)}` : ""}
        </small>
        ${a.desc ? `<small>${escapeHtml(a.desc)}</small>` : ""}
      `;
      weatherAlerts.appendChild(div);
    });
  }

  async function renderWeatherNews(){
    let slowNoticeTimer = null;

    const scheduleSlowNotice = () => {
      slowNoticeTimer = window.setTimeout(() => {
        if(!weatherNews) return;
        if(weatherNews.querySelector(".newsSlowNotice")) return;
        const notice = document.createElement("div");
        notice.className = "hint newsSlowNotice";
        notice.textContent = "Gathering data from multiple sources. This page carries a lot of live content.";
        weatherNews.appendChild(notice);
      }, 1400);
    };

    const clearSlowNotice = () => {
      if(slowNoticeTimer){
        window.clearTimeout(slowNoticeTimer);
        slowNoticeTimer = null;
      }
      weatherNews?.querySelector(".newsSlowNotice")?.remove();
    };

    try {
      if(window.location.protocol === "file:"){
        renderWeatherNewsFallback("local");
        return { usedFallback: true, stale: true };
      }

      weatherNews.innerHTML = `<div class="hint">Loading news…</div>`;
      scheduleSlowNotice();

      const newsQueries = [
        `https://news.google.com/rss/search?q=weather+climate+environment+when:2d&hl=en-US&gl=US&ceid=US:en`,
        `https://news.google.com/rss/search?q=storm+forecast+NOAA+when:2d&hl=en-US&gl=US&ceid=US:en`,
        `https://news.google.com/rss/search?q=hurricane+tornado+flood+wildfire+weather+when:2d&hl=en-US&gl=US&ceid=US:en`
      ];

      const settled = await Promise.allSettled(
        newsQueries.map((url) => fetchRssItems(url, 4, true))
      );

      let fallbackLabel = "";
      let items = [];
      settled.forEach((result) => {
        if(result.status !== "fulfilled" || !Array.isArray(result.value)) return;
        if(!fallbackLabel){
          fallbackLabel = result.value.find((item) => item?._newsFallback && item?._newsSourceLabel)?._newsSourceLabel || "";
        }
        items.push(...result.value);
      });

      const seen = new Set();
      const nowTs = Date.now();
      items = items.filter((item) => {
        const ts = Date.parse(String(item?.pubDate || ""));
        if(!Number.isFinite(ts)) return false;
        if((nowTs - ts) > WEATHER_NEWS_ARTICLE_MAX_AGE_MS) return false;
        const key = `${String(item?.url || "").trim()}::${String(item?.title || "").trim().toLowerCase()}`;
        if(!item?.title || !item?.url || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      items.sort((a, b) => {
        const ta = Date.parse(String(a?.pubDate || ""));
        const tb = Date.parse(String(b?.pubDate || ""));
        const na = Number.isFinite(ta) ? ta : 0;
        const nb = Number.isFinite(tb) ? tb : 0;
        return nb - na;
      });

      items = items.slice(0, 8);
      clearSlowNotice();

      if(items.length > 0){
        saveCachedWeatherNews(items);
      }
      
      weatherNews.innerHTML = "";

      if(fallbackLabel){
        const note = document.createElement("div");
        note.className = "dataSourceTag isFallback newsFallbackNote";
        note.textContent = fallbackLabel;
        weatherNews.appendChild(note);
      }

      appendWeatherNewsCooldownNote(newsQueries[0]);
      
      if(items.length === 0){
        const cached = loadCachedWeatherNews();
        if(renderWeatherNewsFromCache(cached, "Live feed unavailable. Showing last loaded headlines.")){
          appendWeatherNewsCooldownNote(newsQueries[0]);
          return { usedFallback: true, stale: true };
        }
        renderWeatherNewsFallback("feed-error");
        appendWeatherNewsCooldownNote(newsQueries[0]);
        return { usedFallback: true, stale: true };
      }

      items.forEach(item => {
        const link = document.createElement("a");
        link.className = "rssItem";
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", `Read: ${item.title}`);
        
        const title = document.createElement("div");
        title.className = "rssItemTitle";
        title.textContent = item.title;
        
        link.appendChild(title);
        if(item.pubDate){
          const meta = document.createElement("div");
          meta.className = "rssMeta";
          meta.innerHTML = `<span>${escapeHtml(item.pubDate)}</span>`;
          link.appendChild(meta);
        }
        
        weatherNews.appendChild(link);
      });

      setWidgetFreshness(weatherNews, "News: live, just now", false);
      return { usedFallback: false, stale: false };
    } catch {
      clearSlowNotice();
      const cached = loadCachedWeatherNews();
      if(renderWeatherNewsFromCache(cached, "Live feed unavailable. Showing last loaded headlines.")){
        const newsUrl = `https://news.google.com/rss/search?q=weather+climate+environment+when:2d&hl=en-US&gl=US&ceid=US:en`;
        appendWeatherNewsCooldownNote(newsUrl);
        return { usedFallback: true, stale: true };
      }
      renderWeatherNewsFallback("feed-error");
      const newsUrl = `https://news.google.com/rss/search?q=weather+climate+environment+when:2d&hl=en-US&gl=US&ceid=US:en`;
      appendWeatherNewsCooldownNote(newsUrl);
      return { usedFallback: true, stale: true };
    } finally {
      clearSlowNotice();
    }
  }

  weatherNewsMoreBtn?.addEventListener("click", () => {
    const url = "https://news.google.com/search?q=weather%20climate%20environment&hl=en-US&gl=US&ceid=US%3Aen";
    window.open(url, "_blank", "noopener,noreferrer");
  });

  weatherNewsRetryBtn?.addEventListener("click", async () => {
    weatherNewsRetryBtn.disabled = true;
    const originalLabel = weatherNewsRetryBtn.textContent;
    weatherNewsRetryBtn.textContent = "Retrying...";
    try{
      if(typeof clearRssCache === "function") clearRssCache();
      await renderWeatherNews();
    }finally{
      weatherNewsRetryBtn.textContent = originalLabel || "Retry now";
      weatherNewsRetryBtn.disabled = false;
    }
  });

  let inFlight = false;

  async function refresh(force=false){
    if(inFlight && !force) return;
    const runId = ++refreshRunId;
    inFlight = true;
    weatherCurrent?.classList.add("isLoading");
    
    // Try to reload config from storage to get latest settings (in case they changed)
    try{
      const freshCfg = loadConfig();
      if(freshCfg){
        cfg.zipCode = freshCfg.zipCode;
        cfg.weatherAlertScope = freshCfg.weatherAlertScope;
        cfg.forecastLength = freshCfg.forecastLength;
        cfg.weatherRefreshMinutes = freshCfg.weatherRefreshMinutes;
        cfg.weatherStaleWarnMinutes = freshCfg.weatherStaleWarnMinutes;
      }
    }catch(e){
      console.warn("[weather] Failed to reload config:", e);
    }
    

    try{
      // Update alertScope from fresh config
      alertScope = cfg.weatherAlertScope || "local";
      
      // Update button states to match config
      alertsTabs?.querySelectorAll("button[data-scope]").forEach(b => {
        b.classList.toggle("active", b.dataset.scope === alertScope);
      });

      // Update forecast length button state to match config
      const forecastLength = cfg.forecastLength || 7;
      forecastTabs?.querySelectorAll("button[data-forecast-days]").forEach(b => {
        b.classList.toggle("active", Number(b.dataset.forecastDays) === forecastLength);
      });
      
      let resolvedLoc = manualLocationOverride || null;
      if(!resolvedLoc){
        try{
          resolvedLoc = await resolvePreferredLocation({ cfg, autoDetect: true });
        }catch(locError){
          console.warn("[weather] location resolve failed", locError);
        }
      }
      if(!resolvedLoc && lastGeo){
        resolvedLoc = {
          ...lastGeo,
          label: lastGeo.label || [lastGeo.city, lastGeo.state].filter(Boolean).join(", ")
        };
      }
      if(!resolvedLoc) throw new Error("No location available");

      const city = resolvedLoc.city || "";
      const state = resolvedLoc.state || "";
      const lat = Number(resolvedLoc.lat);
      const lon = Number(resolvedLoc.lon);

      if(!Number.isFinite(lat) || !Number.isFinite(lon)){
        throw new Error("Invalid coordinates");
      }
      if(runId !== refreshRunId) return;

      console.log("[weather] geocoded", { city, state, lat, lon });
      lastGeo = { city, state, lat, lon, label: resolvedLoc.label };
      weatherSub.textContent = resolvedLoc.label || [city, state].filter(Boolean).join(", ") || "Current Location";
      if(radarOpenBtn) radarOpenBtn.disabled = false;

      // Update map to center on the ZIP code location
      if(typeof updateMap === 'function') updateMap();

      const forecastDays = cfg.forecastLength || 7;
      let meteo = null;
      let meteoSavedAt = Date.now();
      let meteoUsedCache = false;

      try{
        meteo = await fetchOpenMeteo(lat, lon, forecastDays);
        saveCachedMeteo(lat, lon, forecastDays, meteo);
      }catch(meteoError){
        const cachedMeteo = loadCachedMeteo(lat, lon, forecastDays);
        if(cachedMeteo?.data){
          meteo = cachedMeteo.data;
          meteoSavedAt = Number(cachedMeteo.savedAt) || Date.now();
          meteoUsedCache = true;
          console.warn("[weather] using cached meteo payload", meteoError);
        } else {
          throw meteoError;
        }
      }

      if(!meteo || typeof meteo !== 'object'){
        throw new Error('Invalid meteo response');
      }
      if(runId !== refreshRunId) return;

      if(weatherCurrentUpdated){
        const stamp = new Date(meteoSavedAt).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
        const ageMs = Math.max(0, Date.now() - meteoSavedAt);
        const age = formatAge(ageMs);
        weatherCurrentUpdated.textContent = meteoUsedCache && age
          ? `Updated ${stamp} (cached ${age} ago${ageMs >= staleWarnMs() ? ", stale" : ""})`
          : `Updated ${stamp}`;
      }

      const cur = meteo.current || {};
      const temp   = cur.temperature_2m;
      const feels  = cur.apparent_temperature;
      const wind   = cur.wind_speed_10m;
      const gust   = cur.wind_gusts_10m;
      const rh     = cur.relative_humidity_2m;
      const precip = cur.precipitation;
      const code   = cur.weather_code;

      // Build enhanced current widget with sunrise/sunset and moon phase when available
      const sunrise = (meteo.daily && meteo.daily.sunrise && meteo.daily.sunrise[0]) ? meteo.daily.sunrise[0] : null;
      const sunset  = (meteo.daily && meteo.daily.sunset && meteo.daily.sunset[0]) ? meteo.daily.sunset[0] : null;
      const moon = moonPhaseText(new Date());
      const weatherIcon = getWeatherIcon(code);
      const moonIcon = moonPhaseIcon(moon);

      weatherCurrent.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:12px;">
          <!-- Top section: Icon + Temp + Location -->
          <div class="current-top-grid">
            <!-- Weather Icon + Temperature (grouped for mobile) -->
            <div class="weather-icon-temp">
              <div class="currentIconBlock" style="display:flex; flex-direction:column; align-items:center; gap:6px;">
                <div class="currentMainIcon" style="line-height:1;">${weatherIcon}</div>
                <div class="currentSummaryText" style="font-weight:700; text-align:center;">${escapeHtml(wmoDesc(code))}</div>
              </div>
              
              <div class="currentTempBlock" style="display:flex; flex-direction:column; align-items:flex-start;">
                <div class="currentTempValue" style="font-weight:900; line-height:1; letter-spacing:-1px;">${temp != null ? `${Math.round(temp)}°` : "--°"}</div>
                <div class="currentRangeText" style="color:var(--muted); margin-top:4px;">${meteo.daily?.temperature_2m_max?.[0] != null ? Math.round(meteo.daily.temperature_2m_max[0]) : '--'}° / ${meteo.daily?.temperature_2m_min?.[0] != null ? Math.round(meteo.daily.temperature_2m_min[0]) : '--'}°</div>
              </div>
            </div>
            
            <!-- Location -->
            <div class="current-location" style="display:flex; flex-direction:column; align-items:center; gap:6px; padding-top:10px;">
                <div id="currentLocationText" style="
                  font-weight:800; 
                  padding:10px 20px; 
                  cursor:pointer; 
                  text-align:center;
                  border-radius:8px;
                  background:var(--bg);
                  border:2px solid var(--border);
                  transition:all 0.2s;
                  box-shadow:0 2px 4px rgba(0,0,0,0.1);
                " 
                onmouseover="this.style.borderColor='#fbbf24'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 8px rgba(251,191,36,0.3)';"
                onmouseout="this.style.borderColor='var(--border)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.1)';"
                onclick="changeLocationPrompt()">
                  ${lastGeo?.city && lastGeo?.state ? `${escapeHtml(lastGeo.city)}, ${escapeHtml(abbreviateState(lastGeo.state))}` : (lastGeo?.label ? escapeHtml(lastGeo.label) : 'Location')}
                </div>
                <div class="currentLocationHint">click to update location (zip/city)</div>
            </div>
          </div>
          
          <!-- Separator -->
          <div style="border-top:1px solid var(--border);"></div>
          
          <!-- Bottom section: All stats in unified grid -->
          <div class="current-stats-unified">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:24px;">🌡️</span>
              <div>
                <div style="color:var(--muted); font-size:10px; font-weight:600;">FEELS LIKE</div>
                <div style="font-weight:700; font-size:13px;">${feels != null ? `${Math.round(feels)}°F` : "--"}</div>
              </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:24px;">💧</span>
              <div>
                <div style="color:var(--muted); font-size:10px; font-weight:600;">HUMIDITY</div>
                <div style="font-weight:700; font-size:13px;">${rh != null ? `${rh}%` : "--"}</div>
              </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:24px;">💨</span>
              <div>
                <div style="color:var(--muted); font-size:10px; font-weight:600;">WIND</div>
                <div style="font-weight:700; font-size:13px;">${wind != null ? `${Math.round(wind)} mph` : "--"}${gust != null ? ` (${Math.round(gust)})` : ""}</div>
              </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:24px;">🌧️</span>
              <div>
                <div style="color:var(--muted); font-size:10px; font-weight:600;">PRECIP</div>
                <div style="font-weight:700; font-size:13px;">${precip != null ? `${precip} in` : "--"}</div>
              </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:24px;">🌅</span>
              <div>
                <div style="color:var(--muted); font-size:10px; font-weight:600;">SUNRISE</div>
                <div style="font-weight:700; font-size:13px;">${sunrise ? formatTimeLocal(sunrise) : '--'}</div>
              </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:24px;">☀️</span>
              <div>
                <div style="color:var(--muted); font-size:10px; font-weight:600;">DAYLIGHT</div>
                <div style="font-weight:700; font-size:13px;">${(sunrise && sunset) ? (Math.round((Date.parse(sunset)-Date.parse(sunrise))/3600000) + 'h') : '--'}</div>
              </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:24px;">🌇</span>
              <div>
                <div style="color:var(--muted); font-size:10px; font-weight:600;">SUNSET</div>
                <div style="font-weight:700; font-size:13px;">${sunset ? formatTimeLocal(sunset) : '--'}</div>
              </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:24px;">${moonIcon}</span>
              <div>
                <div style="color:var(--muted); font-size:10px; font-weight:600;">MOON</div>
                <div style="font-weight:700; font-size:13px;">${escapeHtml(moon)}</div>
              </div>
            </div>
          </div>
        </div>
      `;

      renderHourlyTable(meteo);
      renderDailyTable(meteo);

      const meteoAgeMs = Math.max(0, Date.now() - meteoSavedAt);
      setWidgetFreshness(weatherHourly, buildFreshnessText(meteoSavedAt, meteoUsedCache, "24h"), meteoAgeMs >= staleWarnMs());
      setWidgetFreshness(weatherDaily, buildFreshnessText(meteoSavedAt, meteoUsedCache, "Daily"), meteoAgeMs >= staleWarnMs());

      // Fetch both local and national alerts for ticker display
      let localAlerts = [];
      let nationalAlerts = [];
      let alertsUsedCache = false;
      let localAlertsSavedAt = Date.now();
      let nationalAlertsSavedAt = Date.now();

      const [localResult, nationalResult] = await Promise.allSettled([
        fetchNwsAlerts(lat, lon),
        fetchNwsNationalAlerts()
      ]);

      if(localResult.status === "fulfilled"){
        localAlerts = Array.isArray(localResult.value) ? localResult.value : [];
        saveCachedAlerts(LOCAL_ALERTS_CACHE_KEY, localAlerts);
        localAlertsSavedAt = Date.now();
      } else {
        const cachedLocal = loadCachedAlerts(LOCAL_ALERTS_CACHE_KEY);
        if(cachedLocal){
          localAlerts = cachedLocal.items;
          localAlertsSavedAt = Number(cachedLocal.savedAt) || Date.now();
          alertsUsedCache = true;
        }
        console.warn("[weather] local alerts unavailable", localResult.reason);
      }

      if(nationalResult.status === "fulfilled"){
        nationalAlerts = Array.isArray(nationalResult.value) ? nationalResult.value : [];
        saveCachedAlerts(NATIONAL_ALERTS_CACHE_KEY, nationalAlerts);
        nationalAlertsSavedAt = Date.now();
      } else {
        const cachedNational = loadCachedAlerts(NATIONAL_ALERTS_CACHE_KEY);
        if(cachedNational){
          nationalAlerts = cachedNational.items;
          nationalAlertsSavedAt = Number(cachedNational.savedAt) || Date.now();
          alertsUsedCache = true;
        }
        console.warn("[weather] national alerts unavailable", nationalResult.reason);
      }
      if(runId !== refreshRunId) return;

        // Top alerts bar: show all major alerts with LOCAL prefix for local ones
        try{
          const topBar = document.getElementById('topAlertsBar');
          const localCount = localAlerts.length;
          const natCount = nationalAlerts.length;
          
          if(topBar){
            if(localCount === 0 && natCount === 0) {
              destroyTopAlertsTicker();
              destroyTopAlertsHover();
              topBar.innerHTML = `<span class="alertsTickerEmpty">No active alerts.</span>`;
            } else {
              // Build combined alert list for popup access
              const allTickerAlerts = [
                ...localAlerts.slice(0, 8).map(a => ({ ...a, isLocal: true })),
                ...nationalAlerts.slice(0, Math.max(4, 12 - localCount)).map(a => ({ ...a, isLocal: false }))
              ];
              
              // Build ticker with local alerts first (prefixed with LOCAL), then national
              const tickerParts = allTickerAlerts.map((a, idx) => {
                const prefix = a.isLocal ? `<span class="localAlertBadge">LOCAL</span> ` : '';
                const toneClass = idx % 2 === 0 ? "alertToneA" : "alertToneB";
                const apiUrl = a.apiUrl || "";
                const webUrl = a.webUrl || "";
                const hasAlertUrl = Boolean(apiUrl || webUrl);
                const linkUrl = hasAlertUrl
                  ? (webUrl || apiUrl)
                  : `https://news.google.com/search?q=${encodeURIComponent(a.title)}`;
                return `<span class="alertItem ${toneClass}" data-alert-idx="${idx}" data-alert-url="${escapeHtml(linkUrl)}">${prefix}${escapeHtml(a.title)}</span>`;
              });

              const tickerLine = `${tickerParts.join('<span class="alertSep" aria-hidden="true"> • </span>')}`;
              topBar.innerHTML = `
                <div class="alertsTickerViewport" aria-live="polite" aria-label="Weather alerts ticker">
                  <div class="alertsTickerTrack">
                    <div class="alertsTickerGroup">${tickerLine}</div>
                    <div class="alertsTickerGroup" aria-hidden="true">${tickerLine}</div>
                    <div class="alertsTickerGroup" aria-hidden="true">${tickerLine}</div>
                  </div>
                </div>
              `;

              setupTopAlertsTicker(topBar);
              setupTopAlertsHover(topBar, allTickerAlerts);
            }
          }
        }catch(e){console.error('[weather] ticker error', e);}

      // Show alert indicator if there are local alerts
      if(localAlerts.length > 0){
        alertIndicator.hidden = false;
      } else {
        alertIndicator.hidden = true;
      }

      const show = (alertScope === "local") ? localAlerts
                 : (alertScope === "national") ? nationalAlerts
                 : (alertScope === "both") ? [...localAlerts, ...nationalAlerts].slice(0, 25)
                 : localAlerts; // fallback to local

      renderAlerts(show);
      const alertsSavedAt = alertScope === "local"
        ? localAlertsSavedAt
        : alertScope === "national"
          ? nationalAlertsSavedAt
          : Math.max(localAlertsSavedAt, nationalAlertsSavedAt);
      const alertsAgeMs = Math.max(0, Date.now() - alertsSavedAt);
      setWidgetFreshness(weatherAlerts, buildFreshnessText(alertsSavedAt, alertsUsedCache, "Alerts"), alertsAgeMs >= staleWarnMs());
      if(alertsUsedCache && weatherCurrentUpdated && !/alerts cached/.test(weatherCurrentUpdated.textContent || "")){
        weatherCurrentUpdated.textContent += " • alerts cached";
      }
      
      // Fetch and render weather news
      try{ await renderWeatherNews(); }catch(e){ console.error('[weather] renderWeatherNews error', e); }

      // schedule periodic refresh
      if(intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => refresh(false), Math.max(2, Number(cfg.weatherRefreshMinutes || 10)) * 60_000);
    }catch(error){
      console.error("[weather] refresh error", error);
      weatherSub.textContent = "—";
      if(weatherCurrentUpdated) weatherCurrentUpdated.textContent = "Updated --";
      weatherCurrent.innerHTML = `<div class="hint">Weather unavailable. Check ZIP in Settings.</div>`;
      weatherHourly.innerHTML = `<div class="hint">Hourly unavailable.</div>`;
      weatherDaily.innerHTML  = `<div class="hint">7-day unavailable.</div>`;
      weatherAlerts.innerHTML = `<div class="hint">Alerts unavailable.</div>`;
    }finally{
      weatherCurrent?.classList.remove("isLoading");
      inFlight = false;
    }
  }

  weatherRefreshBtn?.addEventListener("click", () => refresh(true));

  // Map type selector
  const mapTypeSelect = document.getElementById("mapTypeSelect");
  const weatherMapFrame = document.getElementById("weatherMapFrame");
  const weatherMapWrap = document.getElementById("weatherMapWrap");
  const weatherMapSection = document.getElementById("weatherMapSection");
  let mapLoadScheduled = false;
  let mapHasLoaded = false;
  let mapObserver = null;

  // Apply show/hide map preference
  if(weatherMapSection){
    weatherMapSection.style.display = cfg.weatherShowMap !== false ? "" : "none";
  }

  // Pre-select default map layer from config
  if(mapTypeSelect && cfg.weatherDefaultMapLayer){
    mapTypeSelect.value = cfg.weatherDefaultMapLayer;
  }

  const mapOverlayMap = {
    radar: "radar",
    wind: "wind",
    temp: "temp",
    clouds: "clouds",
    air: "air"
  };

  function setMapLoadingState(pending){
    if(!weatherMapWrap) return;
    weatherMapWrap.classList.toggle("isPending", !!pending);
  }

  function updateMap(forceLoad = false) {
    if (!weatherMapFrame) return;
    if(!forceLoad && !mapHasLoaded) return;

    const mapType = mapTypeSelect?.value || cfg.weatherDefaultMapLayer || "radar";
    const overlay = mapOverlayMap[mapType] || "radar";

    // Get current coordinates from lastGeo (set during weather fetch) or default to US center
    const lat = lastGeo?.lat || 39.5;
    const lon = lastGeo?.lon || -98.35;
    const zoom = lastGeo ? 8 : 4; // Zoom in on specific location, or show US overview

    // Build Windy embed URL with the selected overlay
    const windyUrl = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&width=650&height=450&zoom=${zoom}&level=surface&overlay=${overlay}&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;

    if(!forceLoad && weatherMapFrame.dataset.loadedSrc === windyUrl) return;

    weatherMapFrame.dataset.loadedSrc = windyUrl;
    setMapLoadingState(true);
    weatherMapFrame.src = windyUrl;
    mapHasLoaded = true;
  }

  weatherMapFrame?.addEventListener("load", () => {
    setMapLoadingState(false);
  });

  weatherMapFrame?.addEventListener("error", () => {
    setMapLoadingState(false);
  });

  function scheduleMapLoad(){
    if(!weatherMapFrame || mapLoadScheduled) return;
    mapLoadScheduled = true;
    let triggered = false;

    const loadMapNow = () => {
      if(triggered) return;
      triggered = true;
      updateMap(true);
      if(mapObserver){
        mapObserver.disconnect();
        mapObserver = null;
      }
    };

    const idleTimer = window.setTimeout(loadMapNow, 1400);

    if(typeof window.requestIdleCallback === "function"){
      window.requestIdleCallback(() => {
        window.clearTimeout(idleTimer);
        loadMapNow();
      }, { timeout: 2200 });
    }

    if("IntersectionObserver" in window && weatherMapSection){
      mapObserver = new IntersectionObserver((entries) => {
        if(entries.some((entry) => entry.isIntersecting)){
          window.clearTimeout(idleTimer);
          loadMapNow();
        }
      }, { rootMargin: "180px 0px" });
      mapObserver.observe(weatherMapSection);
    }
  }

  if (mapTypeSelect) {
    mapTypeSelect.addEventListener("change", () => {
      scheduleMapLoad();
      updateMap(true);
    });
  }

  // Map legends
  const legendDefinitions = {
    radar: {
      title: "Radar Legend",
      sections: [
        {
          heading: "Precipitation",
          items: [
            { color: "#00eaf9", label: "Light drizzle / Trace rain" },
            { color: "#00a5ff", label: "Light rain" },
            { color: "#0071ff", label: "Moderate rain" },
            { color: "#00e90f", label: "Heavy rain" },
            { color: "#ffff00", label: "Very heavy rain" },
            { color: "#ff7e00", label: "Severe rain" },
            { color: "#ff0000", label: "Extreme rainfall" }
          ]
        },
        {
          heading: "Intensity Scale",
          items: [
            { label: "Darker colors indicate stronger precipitation and/or hail" }
          ]
        }
      ],
      mapInfo: "Based on NOAA National Weather Service Radar"
    },
    wind: {
      title: "Wind Legend",
      sections: [
        {
          heading: "Wind Speed",
          items: [
            { color: "#4575b4", label: "Calm / Very light" },
            { color: "#74add1", label: "Light" },
            { color: "#abd9e9", label: "Moderate" },
            { color: "#e0f3f8", label: "Fresh" },
            { color: "#ffffbf", label: "Strong" },
            { color: "#fee090", label: "Very strong" },
            { color: "#fdae61", label: "Gale / Severe" }
          ]
        },
        {
          heading: "Direction",
          items: [
            { label: "Arrows show wind direction (where wind is coming FROM)" }
          ]
        }
      ],
      mapInfo: "Wind vectors at surface level"
    },
    temp: {
      title: "Temperature Legend",
      sections: [
        {
          heading: "Temperature Range",
          items: [
            { color: "#1a1a50", label: "Extremely cold (< -40°F)" },
            { color: "#0000ff", label: "Very cold (-40 to 0°F)" },
            { color: "#00ffff", label: "Cold (0 to 32°F)" },
            { color: "#00ff00", label: "Cool (32 to 50°F)" },
            { color: "#ffff00", label: "Mild (50 to 70°F)" },
            { color: "#ff7f00", label: "Warm (70 to 90°F)" },
            { color: "#ff0000", label: "Very warm (> 90°F)" }
          ]
        }
      ],
      mapInfo: "2-meter surface temperature °F"
    },
    clouds: {
      title: "Cloud Cover Legend",
      sections: [
        {
          heading: "Cloud Coverage",
          items: [
            { color: "rgba(0, 0, 0, 0.05)", label: "Clear / Few clouds (0-25%)" },
            { color: "rgba(150, 150, 150, 0.3)", label: "Partially cloudy (25-50%)" },
            { color: "rgba(150, 150, 150, 0.6)", label: "Mostly cloudy (50-75%)" },
            { color: "rgba(100, 100, 100, 0.9)", label: "Overcast / Full coverage (75-100%)" }
          ]
        },
        {
          heading: "Cloud Tops",
          items: [
            { label: "Brighter areas indicate higher cloud tops; darker indicates lower clouds" }
          ]
        }
      ],
      mapInfo: "Total cloud coverage from satellite imagery"
    },
    air: {
      title: "Air Quality Legend",
      sections: [
        {
          heading: "Air Quality Index (AQI)",
          items: [
            { color: "#009966", label: "Good (0-50) - Air quality is satisfactory" },
            { color: "#ffff00", label: "Moderate (51-100) - Acceptable air quality" },
            { color: "#ff9933", label: "Unhealthy for Sensitive Groups (101-150)" },
            { color: "#cc0000", label: "Unhealthy (151-200)" },
            { color: "#990099", label: "Very Unhealthy (201-300)" },
            { color: "#8b0000", label: "Hazardous (301+)" }
          ]
        },
        {
          heading: "Primary Pollutants",
          items: [
            { label: "PM2.5, PM10, O₃, NO₂, SO₂, and CO levels determine the index" }
          ]
        }
      ],
      mapInfo: "Real-time air quality from monitoring stations"
    }
  };

  function showLegend() {
    const modal = document.getElementById("mapLegendModal");
    const mapType = mapTypeSelect?.value || "radar";
    const legend = legendDefinitions[mapType] || legendDefinitions.radar;
    const title = document.getElementById("mapLegendTitle");
    const body = document.getElementById("mapLegendBody");

    title.textContent = legend.title;
    body.innerHTML = "";

    legend.sections.forEach(section => {
      const sectionDiv = document.createElement("div");
      sectionDiv.className = "legendSection";

      if (section.heading) {
        const heading = document.createElement("h4");
        heading.textContent = section.heading;
        sectionDiv.appendChild(heading);
      }

      section.items.forEach(item => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "legendItem";

        if (item.color) {
          const colorBox = document.createElement("div");
          colorBox.className = "legendColor";
          colorBox.style.background = item.color;
          colorBox.style.border = "1px solid var(--border)";
          itemDiv.appendChild(colorBox);
        } else {
          const spacer = document.createElement("div");
          spacer.style.width = "20px";
          itemDiv.appendChild(spacer);
        }

        const label = document.createElement("div");
        label.className = "legendLabel";
        label.textContent = item.label;
        itemDiv.appendChild(label);

        sectionDiv.appendChild(itemDiv);
      });

      body.appendChild(sectionDiv);
    });

    if (legend.mapInfo) {
      const mapInfo = document.createElement("div");
      mapInfo.className = "legendMap";
      mapInfo.textContent = "📍 " + legend.mapInfo;
      body.appendChild(mapInfo);
    }

    modal.classList.add("isOpen");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeLegend() {
    const modal = document.getElementById("mapLegendModal");
    modal.classList.remove("isOpen");
    modal.setAttribute("aria-hidden", "true");
  }

  // Attach legend button handlers
  const mapLegendBtn = document.getElementById("mapLegendBtn");
  const mapLegendClose = document.getElementById("mapLegendClose");
  if (mapLegendBtn) mapLegendBtn.addEventListener("click", showLegend);
  if (mapLegendClose) mapLegendClose.addEventListener("click", closeLegend);

  // Close legend on modal background click
  const modal = document.getElementById("mapLegendModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeLegend();
    });
  }

  // Initialize button states from config
  function initButtonStates(){
    alertScope = cfg.weatherAlertScope || "local";
    alertsTabs?.querySelectorAll("button[data-scope]").forEach(b => {
      b.classList.toggle("active", b.dataset.scope === alertScope);
    });
    
    const forecastLength = cfg.forecastLength || 7;
    forecastTabs?.querySelectorAll("button[data-forecast-days]").forEach(b => {
      b.classList.toggle("active", Number(b.dataset.forecastDays) === forecastLength);
    });
  }

  // Defer map loading so above-the-fold text widgets can paint first.
  scheduleMapLoad();
  
  // Initialize button states
  initButtonStates();
  
  refresh(false);
})();
