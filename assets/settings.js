(() => {
  "use strict";

  let { cfg, applyThemeDensity } = window.App;
  const MARKET_INDEX_DEFS = Array.isArray(window.App.MARKET_INDEX_DEFS) ? window.App.MARKET_INDEX_DEFS : [];
  const MARKET_INDEX_META = {
    dow: { type: "US Equity", region: "United States" },
    sp500: { type: "US Equity", region: "United States" },
    nasdaq: { type: "US Equity", region: "United States" },
    russell2000: { type: "US Equity", region: "United States" },
    sp400: { type: "US Equity", region: "United States" },
    sp600: { type: "US Equity", region: "United States" },
    microcap: { type: "US Equity", region: "United States" },
    vix: { type: "Volatility", region: "United States" },
    ftse100: { type: "Global Equity", region: "United Kingdom" },
    dax: { type: "Global Equity", region: "Germany" },
    nikkei225: { type: "Global Equity", region: "Japan" },
    hangseng: { type: "Global Equity", region: "Hong Kong" },
    gold: { type: "Commodities", region: "Global" },
    silver: { type: "Commodities", region: "Global" },
    copper: { type: "Commodities", region: "Global" },
    crudeoil: { type: "Commodities", region: "Global" },
    brent: { type: "Commodities", region: "Global" },
    natgas: { type: "Commodities", region: "Global" },
    us10y: { type: "Rates", region: "United States" },
    dxy: { type: "FX", region: "United States" },
    eurusd: { type: "FX", region: "Global" },
    bitcoin: { type: "Crypto", region: "Global" },
    ethereum: { type: "Crypto", region: "Global" }
  };
  const TYPE_SORT_ORDER = ["US Equity", "Global Equity", "Volatility", "Commodities", "Rates", "FX", "Crypto", "Other"];
  const REGION_SORT_ORDER = ["United States", "United Kingdom", "Germany", "Japan", "Hong Kong", "Global", "Other"];
  const AUTO_MARKET_INDICES_SORT_MODE = "region";
  let marketIndicesSortMode = "manual";

  // Apply theme, density, and font size on page load
  applyThemeDensity(cfg);

  const saveBtn = document.getElementById("saveBtn");
  const saveStatus = document.getElementById("saveStatus");

  // Tab elements
  const tabButtons = document.querySelectorAll(".settingsTab");
  const tabContents = document.querySelectorAll(".settingsTabContent");

  // Collapsible sections
  const collapsibleHeaders = document.querySelectorAll(".collapsibleHeader");
  const newsHeaderInfoToggle = document.getElementById("newsHeaderInfoToggle");
  const newsHeaderGuide = document.getElementById("newsHeaderGuide");
  const stocksHeaderInfoToggle = document.getElementById("stocksHeaderInfoToggle");
  const stocksHeaderGuide = document.getElementById("stocksHeaderGuide");

  // General inputs
  const themeSel = document.getElementById("themeSel");
  const zipInput = document.getElementById("zipInput");
  const wxRefreshInput = document.getElementById("wxRefreshInput");
  const weatherStaleWarnInput = document.getElementById("weatherStaleWarnInput");

  // Removed: Page visibility toggles (not used)


  // Content control button groups
  const weatherAlertButtons = document.querySelectorAll("[data-field='weatherAlertScope']");
  const forecastLengthButtons = document.querySelectorAll("[data-field='forecastLength']");
  const weatherDefaultMapLayerButtons = document.querySelectorAll("[data-field='weatherDefaultMapLayer']");
  const weatherTempUnitButtons = document.querySelectorAll("[data-field='weatherTempUnit']");
  const weatherWindUnitButtons = document.querySelectorAll("[data-field='weatherWindUnit']");
  const weatherPrecipUnitButtons = document.querySelectorAll("[data-field='weatherPrecipUnit']");
  const weatherShowMapToggle = document.getElementById("weatherShowMapToggle");
  const stockSortButtons = document.querySelectorAll("[data-field='stockSortMode']");
  const marketNewsSourceButtons = document.querySelectorAll("[data-field='marketNewsSourceMode']");
  const marketNewsOpenButtons = document.querySelectorAll("[data-field='marketNewsOpenMode']");
  const marketIndicesContainer = document.getElementById("marketIndicesCheckboxes");

  // News
  const stocksEditor = document.getElementById("stocksEditor");
  const addStockBtn = document.getElementById("addStockBtn");
  const newsEditor = document.getElementById("newsEditor");
  const addNewsBtn = document.getElementById("addNewsBtn");

  // System
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const jsonBox = document.getElementById("jsonBox");
  const resetBtn = document.getElementById("resetBtn");

  // AstroLab settings
  const ASTROLAB_DEFAULTS = window.App?.DEFAULTS?.astrolab || {
    useDeviceLocationDefault: true,
    fallbackLocation: "",
    rememberLastLocation: true,
    showLocationAccuracy: true,
    defaultTimeMode: "now",
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
    magnitudeLimit: 6,
    labelDensity: "standard",
    highlightIntensity: 70,
    nightLabelContrast: true,
    showSkyConditions: true,
    showCalendar: true,
    showHighlights: true,
    showResources: true,
    showLaunches: true,
    showAstroNews: true,
    defaultCardState: "expanded",
    autoRefreshMinutes: 15,
    launchRefreshMinutes: 30,
    newsRefreshMinutes: 30,
    cacheMinutes: 30,
    notifyIssPasses: false,
    notifyTopEvents: false,
    notifyLaunchWindows: false,
    quietHoursStart: "23:00",
    quietHoursEnd: "07:00",
    timeFormat: "12h",
    coordinateFormat: "hms",
    dateFormat: "us",
    showSeconds: true,
    lowPowerMode: false,
    lightweightMobile: false,
    disableHeavyOverlays: false
  };

  const astrolabControls = {
    useDeviceLocationDefault: document.getElementById("astUseDeviceLocationDefault"),
    fallbackLocation: document.getElementById("astFallbackLocation"),
    rememberLastLocation: document.getElementById("astRememberLastLocation"),
    showLocationAccuracy: document.getElementById("astShowLocationAccuracy"),
    defaultTimeMode: document.getElementById("astDefaultTimeMode"),
    customTime: document.getElementById("astCustomTime"),
    sliderStepMinutes: document.getElementById("astSliderStepMinutes"),
    autoAdvanceTime: document.getElementById("astAutoAdvanceTime"),
    autoAdvanceSpeedSeconds: document.getElementById("astAutoAdvanceSpeedSeconds"),
    rememberLastTime: document.getElementById("astRememberLastTime"),
    showConstellationLines: document.getElementById("astShowConstellationLines"),
    showConstellationLabels: document.getElementById("astShowConstellationLabels"),
    showPlanetLabels: document.getElementById("astShowPlanetLabels"),
    showDsoLabels: document.getElementById("astShowDsoLabels"),
    showMilkyWay: document.getElementById("astShowMilkyWay"),
    showHorizonOverlay: document.getElementById("astShowHorizonOverlay"),
    magnitudeLimit: document.getElementById("astMagnitudeLimit"),
    magnitudeLimitLabel: document.getElementById("astMagnitudeLimitLabel"),
    labelDensity: document.getElementById("astLabelDensity"),
    highlightIntensity: document.getElementById("astHighlightIntensity"),
    highlightIntensityLabel: document.getElementById("astHighlightIntensityLabel"),
    nightLabelContrast: document.getElementById("astNightLabelContrast"),
    showSkyConditions: document.getElementById("astShowSkyConditions"),
    showCalendar: document.getElementById("astShowCalendar"),
    showHighlights: document.getElementById("astShowHighlights"),
    showResources: document.getElementById("astShowResources"),
    showLaunches: document.getElementById("astShowLaunches"),
    showAstroNews: document.getElementById("astShowAstroNews"),
    defaultCardState: document.getElementById("astDefaultCardState"),
    autoRefreshMinutes: document.getElementById("astAutoRefreshMinutes"),
    launchRefreshMinutes: document.getElementById("astLaunchRefreshMinutes"),
    newsRefreshMinutes: document.getElementById("astNewsRefreshMinutes"),
    cacheMinutes: document.getElementById("astCacheMinutes"),
    clearCacheBtn: document.getElementById("astClearCacheBtn"),
    notifyIssPasses: document.getElementById("astNotifyIssPasses"),
    notifyTopEvents: document.getElementById("astNotifyTopEvents"),
    notifyLaunchWindows: document.getElementById("astNotifyLaunchWindows"),
    quietHoursStart: document.getElementById("astQuietHoursStart"),
    quietHoursEnd: document.getElementById("astQuietHoursEnd"),
    timeFormat: document.getElementById("astTimeFormat"),
    coordinateFormat: document.getElementById("astCoordinateFormat"),
    dateFormat: document.getElementById("astDateFormat"),
    showSeconds: document.getElementById("astShowSeconds"),
    lowPowerMode: document.getElementById("astLowPowerMode"),
    lightweightMobile: document.getElementById("astLightweightMobile"),
    disableHeavyOverlays: document.getElementById("astDisableHeavyOverlays")
  };
  const astrolabSettingInputs = document.querySelectorAll(".astrolabSetting");

  // Status
  function setStatus(msg, type = "default"){
    saveStatus.textContent = msg;
    saveStatus.className = `statusIndicator ${type}`;
  }

  function ensureAstrolabConfig(){
    cfg.astrolab = {
      ...ASTROLAB_DEFAULTS,
      ...(cfg.astrolab || {})
    };
  }

  function syncAstrolabControlStates(){
    const mode = astrolabControls.defaultTimeMode?.value || "now";
    if(astrolabControls.customTime) astrolabControls.customTime.disabled = mode !== "custom";

    const autoAdv = astrolabControls.autoAdvanceTime?.checked === true;
    if(astrolabControls.autoAdvanceSpeedSeconds) astrolabControls.autoAdvanceSpeedSeconds.disabled = !autoAdv;
  }

  function updateAstrolabRangeLabels(){
    if(astrolabControls.magnitudeLimit && astrolabControls.magnitudeLimitLabel){
      const v = Number(astrolabControls.magnitudeLimit.value || 6);
      astrolabControls.magnitudeLimitLabel.textContent = v.toFixed(1);
    }
    if(astrolabControls.highlightIntensity && astrolabControls.highlightIntensityLabel){
      const v = Number(astrolabControls.highlightIntensity.value || 70);
      astrolabControls.highlightIntensityLabel.textContent = `${Math.round(v)}%`;
    }
  }

  function loadAstrolabToUI(){
    ensureAstrolabConfig();
    const a = cfg.astrolab;

    if(astrolabControls.useDeviceLocationDefault) astrolabControls.useDeviceLocationDefault.checked = a.useDeviceLocationDefault === true;
    if(astrolabControls.fallbackLocation) astrolabControls.fallbackLocation.value = a.fallbackLocation || "";
    if(astrolabControls.rememberLastLocation) astrolabControls.rememberLastLocation.checked = a.rememberLastLocation !== false;
    if(astrolabControls.showLocationAccuracy) astrolabControls.showLocationAccuracy.checked = a.showLocationAccuracy !== false;
    if(astrolabControls.defaultTimeMode) astrolabControls.defaultTimeMode.value = a.defaultTimeMode || "now";
    if(astrolabControls.customTime) astrolabControls.customTime.value = a.customTime || "21:00";
    if(astrolabControls.sliderStepMinutes) astrolabControls.sliderStepMinutes.value = String(a.sliderStepMinutes || 30);
    if(astrolabControls.autoAdvanceTime) astrolabControls.autoAdvanceTime.checked = a.autoAdvanceTime === true;
    if(astrolabControls.autoAdvanceSpeedSeconds) astrolabControls.autoAdvanceSpeedSeconds.value = String(a.autoAdvanceSpeedSeconds || 5);
    if(astrolabControls.rememberLastTime) astrolabControls.rememberLastTime.checked = a.rememberLastTime !== false;

    if(astrolabControls.showConstellationLines) astrolabControls.showConstellationLines.checked = a.showConstellationLines !== false;
    if(astrolabControls.showConstellationLabels) astrolabControls.showConstellationLabels.checked = a.showConstellationLabels !== false;
    if(astrolabControls.showPlanetLabels) astrolabControls.showPlanetLabels.checked = a.showPlanetLabels !== false;
    if(astrolabControls.showDsoLabels) astrolabControls.showDsoLabels.checked = a.showDsoLabels !== false;
    if(astrolabControls.showMilkyWay) astrolabControls.showMilkyWay.checked = a.showMilkyWay !== false;
    if(astrolabControls.showHorizonOverlay) astrolabControls.showHorizonOverlay.checked = a.showHorizonOverlay !== false;

    if(astrolabControls.magnitudeLimit) astrolabControls.magnitudeLimit.value = String(a.magnitudeLimit ?? 6);
    if(astrolabControls.labelDensity) astrolabControls.labelDensity.value = a.labelDensity || "standard";
    if(astrolabControls.highlightIntensity) astrolabControls.highlightIntensity.value = String(a.highlightIntensity ?? 70);
    if(astrolabControls.nightLabelContrast) astrolabControls.nightLabelContrast.checked = a.nightLabelContrast !== false;

    if(astrolabControls.showSkyConditions) astrolabControls.showSkyConditions.checked = a.showSkyConditions !== false;
    if(astrolabControls.showCalendar) astrolabControls.showCalendar.checked = a.showCalendar !== false;
    if(astrolabControls.showHighlights) astrolabControls.showHighlights.checked = a.showHighlights !== false;
    if(astrolabControls.showResources) astrolabControls.showResources.checked = a.showResources !== false;
    if(astrolabControls.showLaunches) astrolabControls.showLaunches.checked = a.showLaunches !== false;
    if(astrolabControls.showAstroNews) astrolabControls.showAstroNews.checked = a.showAstroNews !== false;
    if(astrolabControls.defaultCardState) astrolabControls.defaultCardState.value = a.defaultCardState || "expanded";

    if(astrolabControls.autoRefreshMinutes) astrolabControls.autoRefreshMinutes.value = String(a.autoRefreshMinutes || 15);
    if(astrolabControls.launchRefreshMinutes) astrolabControls.launchRefreshMinutes.value = String(a.launchRefreshMinutes || 30);
    if(astrolabControls.newsRefreshMinutes) astrolabControls.newsRefreshMinutes.value = String(a.newsRefreshMinutes || 30);
    if(astrolabControls.cacheMinutes) astrolabControls.cacheMinutes.value = String(a.cacheMinutes || 30);

    if(astrolabControls.notifyIssPasses) astrolabControls.notifyIssPasses.checked = a.notifyIssPasses === true;
    if(astrolabControls.notifyTopEvents) astrolabControls.notifyTopEvents.checked = a.notifyTopEvents === true;
    if(astrolabControls.notifyLaunchWindows) astrolabControls.notifyLaunchWindows.checked = a.notifyLaunchWindows === true;
    if(astrolabControls.quietHoursStart) astrolabControls.quietHoursStart.value = a.quietHoursStart || "23:00";
    if(astrolabControls.quietHoursEnd) astrolabControls.quietHoursEnd.value = a.quietHoursEnd || "07:00";

    if(astrolabControls.timeFormat) astrolabControls.timeFormat.value = a.timeFormat || "12h";
    if(astrolabControls.coordinateFormat) astrolabControls.coordinateFormat.value = a.coordinateFormat || "hms";
    if(astrolabControls.dateFormat) astrolabControls.dateFormat.value = a.dateFormat || "us";
    if(astrolabControls.showSeconds) astrolabControls.showSeconds.checked = a.showSeconds !== false;

    if(astrolabControls.lowPowerMode) astrolabControls.lowPowerMode.checked = a.lowPowerMode === true;
    if(astrolabControls.lightweightMobile) astrolabControls.lightweightMobile.checked = a.lightweightMobile === true;
    if(astrolabControls.disableHeavyOverlays) astrolabControls.disableHeavyOverlays.checked = a.disableHeavyOverlays === true;

    syncAstrolabControlStates();
    updateAstrolabRangeLabels();
  }

  function pullAstrolabFromUI(){
    ensureAstrolabConfig();
    const a = cfg.astrolab;

    if(astrolabControls.useDeviceLocationDefault) a.useDeviceLocationDefault = astrolabControls.useDeviceLocationDefault.checked;
    if(astrolabControls.fallbackLocation) a.fallbackLocation = String(astrolabControls.fallbackLocation.value || "").trim();
    if(astrolabControls.rememberLastLocation) a.rememberLastLocation = astrolabControls.rememberLastLocation.checked;
    if(astrolabControls.showLocationAccuracy) a.showLocationAccuracy = astrolabControls.showLocationAccuracy.checked;
    if(astrolabControls.defaultTimeMode) a.defaultTimeMode = astrolabControls.defaultTimeMode.value;
    if(astrolabControls.customTime) a.customTime = astrolabControls.customTime.value || ASTROLAB_DEFAULTS.customTime;
    if(astrolabControls.sliderStepMinutes) a.sliderStepMinutes = Number(astrolabControls.sliderStepMinutes.value || ASTROLAB_DEFAULTS.sliderStepMinutes);
    if(astrolabControls.autoAdvanceTime) a.autoAdvanceTime = astrolabControls.autoAdvanceTime.checked;
    if(astrolabControls.autoAdvanceSpeedSeconds) a.autoAdvanceSpeedSeconds = Math.max(1, Math.min(120, Number(astrolabControls.autoAdvanceSpeedSeconds.value || ASTROLAB_DEFAULTS.autoAdvanceSpeedSeconds)));
    if(astrolabControls.rememberLastTime) a.rememberLastTime = astrolabControls.rememberLastTime.checked;

    if(astrolabControls.showConstellationLines) a.showConstellationLines = astrolabControls.showConstellationLines.checked;
    if(astrolabControls.showConstellationLabels) a.showConstellationLabels = astrolabControls.showConstellationLabels.checked;
    if(astrolabControls.showPlanetLabels) a.showPlanetLabels = astrolabControls.showPlanetLabels.checked;
    if(astrolabControls.showDsoLabels) a.showDsoLabels = astrolabControls.showDsoLabels.checked;
    if(astrolabControls.showMilkyWay) a.showMilkyWay = astrolabControls.showMilkyWay.checked;
    if(astrolabControls.showHorizonOverlay) a.showHorizonOverlay = astrolabControls.showHorizonOverlay.checked;

    if(astrolabControls.magnitudeLimit) a.magnitudeLimit = Math.max(3, Math.min(8, Number(astrolabControls.magnitudeLimit.value || ASTROLAB_DEFAULTS.magnitudeLimit)));
    if(astrolabControls.labelDensity) a.labelDensity = astrolabControls.labelDensity.value;
    if(astrolabControls.highlightIntensity) a.highlightIntensity = Math.max(0, Math.min(100, Number(astrolabControls.highlightIntensity.value || ASTROLAB_DEFAULTS.highlightIntensity)));
    if(astrolabControls.nightLabelContrast) a.nightLabelContrast = astrolabControls.nightLabelContrast.checked;

    if(astrolabControls.showSkyConditions) a.showSkyConditions = astrolabControls.showSkyConditions.checked;
    if(astrolabControls.showCalendar) a.showCalendar = astrolabControls.showCalendar.checked;
    if(astrolabControls.showHighlights) a.showHighlights = astrolabControls.showHighlights.checked;
    if(astrolabControls.showResources) a.showResources = astrolabControls.showResources.checked;
    if(astrolabControls.showLaunches) a.showLaunches = astrolabControls.showLaunches.checked;
    if(astrolabControls.showAstroNews) a.showAstroNews = astrolabControls.showAstroNews.checked;
    if(astrolabControls.defaultCardState) a.defaultCardState = astrolabControls.defaultCardState.value;

    if(astrolabControls.autoRefreshMinutes) a.autoRefreshMinutes = Math.max(2, Number(astrolabControls.autoRefreshMinutes.value || ASTROLAB_DEFAULTS.autoRefreshMinutes));
    if(astrolabControls.launchRefreshMinutes) a.launchRefreshMinutes = Math.max(2, Number(astrolabControls.launchRefreshMinutes.value || ASTROLAB_DEFAULTS.launchRefreshMinutes));
    if(astrolabControls.newsRefreshMinutes) a.newsRefreshMinutes = Math.max(2, Number(astrolabControls.newsRefreshMinutes.value || ASTROLAB_DEFAULTS.newsRefreshMinutes));
    if(astrolabControls.cacheMinutes) a.cacheMinutes = Math.max(1, Number(astrolabControls.cacheMinutes.value || ASTROLAB_DEFAULTS.cacheMinutes));

    if(astrolabControls.notifyIssPasses) a.notifyIssPasses = astrolabControls.notifyIssPasses.checked;
    if(astrolabControls.notifyTopEvents) a.notifyTopEvents = astrolabControls.notifyTopEvents.checked;
    if(astrolabControls.notifyLaunchWindows) a.notifyLaunchWindows = astrolabControls.notifyLaunchWindows.checked;
    if(astrolabControls.quietHoursStart) a.quietHoursStart = astrolabControls.quietHoursStart.value || ASTROLAB_DEFAULTS.quietHoursStart;
    if(astrolabControls.quietHoursEnd) a.quietHoursEnd = astrolabControls.quietHoursEnd.value || ASTROLAB_DEFAULTS.quietHoursEnd;

    if(astrolabControls.timeFormat) a.timeFormat = astrolabControls.timeFormat.value;
    if(astrolabControls.coordinateFormat) a.coordinateFormat = astrolabControls.coordinateFormat.value;
    if(astrolabControls.dateFormat) a.dateFormat = astrolabControls.dateFormat.value;
    if(astrolabControls.showSeconds) a.showSeconds = astrolabControls.showSeconds.checked;

    if(astrolabControls.lowPowerMode) a.lowPowerMode = astrolabControls.lowPowerMode.checked;
    if(astrolabControls.lightweightMobile) a.lightweightMobile = astrolabControls.lightweightMobile.checked;
    if(astrolabControls.disableHeavyOverlays) a.disableHeavyOverlays = astrolabControls.disableHeavyOverlays.checked;
  }

  function clearAstrolabCache(){
    let removed = 0;
    const keys = [];
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(key) keys.push(key);
    }
    keys.forEach((key) => {
      const k = key.toLowerCase();
      if(k.includes("astro") || k.includes("celestial") || k.includes("astronomy") || k.includes("launch")){
        localStorage.removeItem(key);
        removed += 1;
      }
    });
    if(typeof window.App.clearRssCache === "function"){
      window.App.clearRssCache();
    }
    setStatus(`Cleared AstroLab cache (${removed} keys)`, "default");
  }

  // Tab switching
  function activateTab(tab, options = {}){
    if(!tab) return;
    const { updateHash = true } = options;
    tabButtons.forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    tabContents.forEach(c => c.classList.remove("active"));

    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");

    const panel = document.querySelector(`.settingsTabContent[data-tab="${tab.dataset.tab}"]`);
    if(panel) panel.classList.add("active");

    if(updateHash && tab.dataset.tab){
      const nextHash = `#${tab.dataset.tab}`;
      if(window.location.hash !== nextHash){
        window.history.replaceState(null, "", nextHash);
      }
    }

    if(tab.dataset.tab === "stocks"){
      sortMarketIndices(AUTO_MARKET_INDICES_SORT_MODE, { markUnsaved: false });
    }
  }

  function activateTabFromHash(){
    const requestedTab = (window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
    if(!requestedTab) return;
    const targetTab = Array.from(tabButtons).find((btn) => btn.dataset.tab === requestedTab);
    if(targetTab) activateTab(targetTab, { updateHash: false });
  }

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      activateTab(btn);
    });

    btn.addEventListener("keydown", (e) => {
      const idx = Array.from(tabButtons).indexOf(btn);
      if(idx < 0) return;

      let targetIdx = -1;
      if(e.key === "ArrowRight") targetIdx = (idx + 1) % tabButtons.length;
      if(e.key === "ArrowLeft") targetIdx = (idx - 1 + tabButtons.length) % tabButtons.length;
      if(e.key === "Home") targetIdx = 0;
      if(e.key === "End") targetIdx = tabButtons.length - 1;

      if(targetIdx >= 0){
        e.preventDefault();
        tabButtons[targetIdx].focus();
        activateTab(tabButtons[targetIdx]);
        return;
      }

      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        activateTab(btn);
      }
    });
  });

  window.addEventListener("hashchange", activateTabFromHash);

  // Collapsible sections
  collapsibleHeaders.forEach(header => {
    if(!header.querySelector(".collapsibleArrowHit")){
      const arrow = document.createElement("span");
      arrow.className = "collapsibleArrowHit";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "►";
      header.appendChild(arrow);
    }

    header.addEventListener("click", (event) => {
      if(!event.target.closest(".collapsibleArrowHit")) return;
      const body = header.nextElementSibling;
      header.classList.toggle("expanded");
      body.classList.toggle("expanded");
    });
  });

  function attachHeaderGuideToggle(toggleEl, panelEl){
    if(!(toggleEl && panelEl)) return;

    let closeTimer = 0;

    const openGuide = () => {
      if(closeTimer) window.clearTimeout(closeTimer);
      panelEl.removeAttribute("hidden");
      window.requestAnimationFrame(() => {
        panelEl.classList.add("is-open");
      });
      toggleEl.setAttribute("data-expanded", "true");
    };

    const closeGuide = () => {
      panelEl.classList.remove("is-open");
      toggleEl.setAttribute("data-expanded", "false");
      if(closeTimer) window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        if(!panelEl.classList.contains("is-open")){
          panelEl.setAttribute("hidden", "");
        }
      }, 220);
    };

    const toggleGuide = () => {
      const isHidden = panelEl.hasAttribute("hidden");
      if(isHidden){
        openGuide();
      }else{
        closeGuide();
      }
    };

    toggleEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleGuide();
    });

    if(toggleEl.hasAttribute("tabindex")){
      toggleEl.addEventListener("keydown", (event) => {
        if(event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        toggleGuide();
      });
    }
  }

  attachHeaderGuideToggle(newsHeaderInfoToggle, newsHeaderGuide);
  attachHeaderGuideToggle(stocksHeaderInfoToggle, stocksHeaderGuide);

  // Icon button helper
  function createIconButton(txt, title){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "iconBtn";
    b.title = title;
    b.textContent = txt;
    return b;
  }

  function toLookupCandidates(rawSymbol){
    const src = String(rawSymbol || "").trim().toUpperCase();
    if(!src) return [];

    const base = src.includes(":") ? src.split(":").pop() : src;
    const out = [];

    function push(sym){
      const s = String(sym || "").trim().toUpperCase();
      if(!s) return;
      if(!out.includes(s)) out.push(s);
    }

    push(base);

    if(/^[A-Z]{6}$/.test(base) && base.endsWith("USD")){
      push(`${base.slice(0, 3)}-USD`);
      push(`${base}=X`);
    }

    if(/^[A-Z]{3}-[A-Z]{3}$/.test(base)){
      const pair = base.replace("-", "");
      push(`${pair}=X`);
    }

    if(/^[A-Z]{6}$/.test(base) && !base.endsWith("USD")){
      push(`${base}=X`);
    }

    return out;
  }

  async function lookupSymbolName(rawSymbol){
    try{
      const candidates = toLookupCandidates(rawSymbol);
      if(candidates.length === 0) return "";

      const proxyBase = String(window.App?.RSS_PROXY_BASE || "").trim();
      if(!proxyBase) return "";

      const query = encodeURIComponent(candidates.join(","));
      const targetUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${query}`;
      const proxyUrl = `${proxyBase}${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl, { cache: "no-store" });
      if(!res.ok) return "";

      const payload = await res.json();
      const rows = Array.isArray(payload?.quoteResponse?.result) ? payload.quoteResponse.result : [];
      if(rows.length === 0) return "";

      const bySymbol = new Map(rows.map((row) => [String(row?.symbol || "").toUpperCase(), row]));
      const best = candidates
        .map((sym) => bySymbol.get(sym))
        .find(Boolean) || rows[0];

      const name = String(best?.longName || best?.shortName || best?.displayName || "").trim();
      return name;
    }catch{
      return "";
    }
  }

  const WELL_KNOWN_SOURCE_NAMES = {
    // Major US news
    "apnews.com": "AP News",       "ap.org": "AP News",
    "reuters.com": "Reuters",
    "nytimes.com": "NY Times",
    "washingtonpost.com": "Washington Post",
    "theguardian.com": "The Guardian",
    "usatoday.com": "USA Today",
    "nypost.com": "NY Post",
    "huffpost.com": "HuffPost",
    "thehill.com": "The Hill",
    "politico.com": "Politico",
    "axios.com": "Axios",
    "npr.org": "NPR",
    "pbs.org": "PBS",
    "cnn.com": "CNN",
    "cbsnews.com": "CBS News",
    "nbcnews.com": "NBC News",
    "abcnews.go.com": "ABC News",  "abcnews.com": "ABC News",
    "foxnews.com": "Fox News",
    "msn.com": "MSN",
    "bbc.co.uk": "BBC",            "bbc.com": "BBC",
    // Business & Finance
    "wsj.com": "WSJ",
    "ft.com": "Financial Times",
    "bloomberg.com": "Bloomberg",
    "marketwatch.com": "MarketWatch",
    "cnbc.com": "CNBC",
    "investopedia.com": "Investopedia",
    "fortune.com": "Fortune",
    "businessinsider.com": "Business Insider",
    "economist.com": "The Economist",
    // Tech
    "techcrunch.com": "TechCrunch",
    "theverge.com": "The Verge",
    "arstechnica.com": "Ars Technica",
    "wired.com": "Wired",
    "engadget.com": "Engadget",
    "9to5mac.com": "9to5Mac",
    "macrumors.com": "MacRumors",
    "slashdot.org": "Slashdot",
    "zdnet.com": "ZDNet",
    "cnet.com": "CNET",
    "thenextweb.com": "TNW",
    "venturebeat.com": "VentureBeat",
    // Science & Nature
    "nature.com": "Nature",
    "scientificamerican.com": "Scientific American",
    "nationalgeographic.com": "Nat Geo",
    "newscientist.com": "New Scientist",
    "space.com": "Space.com",
    "nasa.gov": "NASA",
    // Sports
    "espn.com": "ESPN",
    "si.com": "Sports Illustrated",
    "nfl.com": "NFL",
    "nba.com": "NBA",
    // Aggregators
    "news.google.com": "Google News",
    "yahoo.com": "Yahoo News",
  };

  // Resolves a hostname to a well-known display name, supporting subdomains.
  // e.g. feeds.npr.org → "NPR", news.bbc.co.uk → "BBC"
  function resolveKnownSourceName(hostname){
    const h = String(hostname || "").toLowerCase().replace(/^www\./i, "");
    if(!h) return null;
    if(WELL_KNOWN_SOURCE_NAMES[h]) return WELL_KNOWN_SOURCE_NAMES[h];
    // Walk up subdomain segments (feeds.npr.org → npr.org)
    const parts = h.split(".");
    for(let i = 1; i < parts.length - 1; i++){
      const tail = parts.slice(i).join(".");
      if(WELL_KNOWN_SOURCE_NAMES[tail]) return WELL_KNOWN_SOURCE_NAMES[tail];
    }
    return null;
  }

  function toPrettySourceName(raw){
    const token = String(raw || "").trim().replace(/^www\./i, "");
    if(!token) return "";
    const known = resolveKnownSourceName(token);
    if(known) return known;
    const base = token.split(".")[0] || token;
    return base
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase())
      .trim();
  }

  function fallbackNewsMetaFromRssUrl(rawUrl){
    try{
      const u = new URL(String(rawUrl || "").trim());
      const origin = `${u.protocol}//${u.hostname}`;
      return {
        name: toPrettySourceName(u.hostname),
        site: origin
      };
    }catch{
      return { name: "", site: "" };
    }
  }

  async function lookupRssSourceMeta(rawUrl){
    const fallback = fallbackNewsMetaFromRssUrl(rawUrl);
    try{
      const rssUrl = String(rawUrl || "").trim();
      if(!rssUrl) return fallback;

      const proxyBase = String(window.App?.RSS_PROXY_BASE || "").trim();
      if(!proxyBase) return fallback;

      const proxied = `${proxyBase}${encodeURIComponent(rssUrl)}`;
      const res = await fetch(proxied, { cache: "no-store" });
      if(!res.ok) return fallback;

      const xmlText = await res.text();
      if(!xmlText) return fallback;

      const doc = new DOMParser().parseFromString(xmlText, "application/xml");
      const parserErr = doc.querySelector("parsererror");
      if(parserErr) return fallback;

      const titleNode = doc.querySelector("channel > title, feed > title");
      let name = String(titleNode?.textContent || "").trim();
      if(!name) name = fallback.name;
      // Prefer a well-known label over verbose feed titles (e.g. "BBC News - Home" → "BBC")
      try{
        const knownLabel = resolveKnownSourceName(new URL(rssUrl).hostname);
        if(knownLabel) name = knownLabel;
      }catch{}

      const rssLinkNode = doc.querySelector("channel > link");
      const atomLinkNode = doc.querySelector("feed > link[rel='alternate']");
      const rssLink = String(rssLinkNode?.textContent || "").trim();
      const atomHref = String(atomLinkNode?.getAttribute("href") || "").trim();

      let site = fallback.site;
      try{
        const linkCandidate = atomHref || rssLink;
        if(linkCandidate){
          const asUrl = new URL(linkCandidate);
          site = `${asUrl.protocol}//${asUrl.hostname}`;
        }
      }catch{}

      return { name, site };
    }catch{
      return fallback;
    }
  }

  function normalizeMarketIndicesConfig(){
    const defs = MARKET_INDEX_DEFS;
    if(defs.length === 0){
      cfg.marketIndices = [];
      return;
    }

    const visibilityByKey = new Map();
    const orderedKeys = [];
    const seen = new Set();
    const raw = Array.isArray(cfg.marketIndices) ? cfg.marketIndices : [];

    raw.forEach((entry) => {
      if(typeof entry === "string"){
        const legacyKey = defs.find(d => d.name === entry || d.key === entry)?.key;
        if(legacyKey && !seen.has(legacyKey)){
          seen.add(legacyKey);
          orderedKeys.push(legacyKey);
          visibilityByKey.set(legacyKey, true);
        }
        return;
      }

      if(!entry || typeof entry !== "object") return;
      const key = String(entry.key || "").trim().toLowerCase();
      if(!key || seen.has(key)) return;
      seen.add(key);
      orderedKeys.push(key);
      visibilityByKey.set(key, entry.visible !== false);
    });

    cfg.marketIndices = [
      ...orderedKeys
        .filter((key) => defs.some((d) => d.key === key))
        .map((key) => ({ key, visible: visibilityByKey.has(key) ? visibilityByKey.get(key) : true })),
      ...defs
        .filter((def) => !seen.has(def.key))
        .map((def) => ({ key: def.key, visible: true }))
    ];
  }

  function moveMarketIndex(fromIdx, toIdx){
    const list = Array.isArray(cfg.marketIndices) ? [...cfg.marketIndices] : [];
    if(fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length || fromIdx === toIdx) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    cfg.marketIndices = list;
    marketIndicesSortMode = "manual";
  }

  function setAllMarketIndicesVisible(visible){
    normalizeMarketIndicesConfig();
    cfg.marketIndices = cfg.marketIndices.map((entry) => ({ ...entry, visible: !!visible }));
    renderMarketIndices();
    setStatus("Market strip updated (not saved yet)", "unsaved");
  }

  function getMarketMeta(key){
    return MARKET_INDEX_META[key] || { type: "Other", region: "Other" };
  }

  function getMarketSortLabel(mode){
    if(mode === "type") return "Market Type";
    if(mode === "region") return "Country/Region";
    if(mode === "az") return "A-Z";
    return "Manual";
  }

  function sortMarketIndices(mode, options = {}){
    if(!["manual", "type", "region", "az"].includes(mode)) return;
    const { markUnsaved = true } = options;
    marketIndicesSortMode = mode;

    if(mode === "manual"){
      renderMarketIndices();
      return;
    }

    normalizeMarketIndicesConfig();
    const typeRank = new Map(TYPE_SORT_ORDER.map((label, idx) => [label, idx]));
    const regionRank = new Map(REGION_SORT_ORDER.map((label, idx) => [label, idx]));

    cfg.marketIndices = [...cfg.marketIndices].sort((a, b) => {
      const defA = MARKET_INDEX_DEFS.find((item) => item.key === a.key);
      const defB = MARKET_INDEX_DEFS.find((item) => item.key === b.key);
      const nameA = String(defA?.name || a.key || "");
      const nameB = String(defB?.name || b.key || "");
      const metaA = MARKET_INDEX_META[a.key] || { type: "Other", region: "Other" };
      const metaB = MARKET_INDEX_META[b.key] || { type: "Other", region: "Other" };

      if(mode === "type"){
        const typeDelta = (typeRank.get(metaA.type) ?? 99) - (typeRank.get(metaB.type) ?? 99);
        if(typeDelta !== 0) return typeDelta;
        const regionDelta = (regionRank.get(metaA.region) ?? 99) - (regionRank.get(metaB.region) ?? 99);
        if(regionDelta !== 0) return regionDelta;
        return nameA.localeCompare(nameB);
      }

      if(mode === "region"){
        const regionDelta = (regionRank.get(metaA.region) ?? 99) - (regionRank.get(metaB.region) ?? 99);
        if(regionDelta !== 0) return regionDelta;
        const typeDelta = (typeRank.get(metaA.type) ?? 99) - (typeRank.get(metaB.type) ?? 99);
        if(typeDelta !== 0) return typeDelta;
        return nameA.localeCompare(nameB);
      }

      return nameA.localeCompare(nameB);
    });

    renderMarketIndices();
    if(markUnsaved){
      setStatus("Market strip sorted (not saved yet)", "unsaved");
    }
  }

  // Render market indices visibility controls
  function renderMarketIndices(){
    normalizeMarketIndicesConfig();

    const visibleByKey = new Map((cfg.marketIndices || []).map((item) => [item.key, item.visible !== false]));
    const activeSortLabel = getMarketSortLabel(marketIndicesSortMode);
    const groupMode = marketIndicesSortMode === "type"
      ? "type"
      : (marketIndicesSortMode === "region" ? "region" : "");

    marketIndicesContainer.innerHTML = `
      <div class="marketIndicesControls">
        <div class="buttonGroup">
          <button type="button" class="buttonGroupItem" id="marketIndicesShowAll">Show All</button>
          <button type="button" class="buttonGroupItem" id="marketIndicesHideAll">Hide All</button>
        </div>
        <div class="marketIndicesSort" role="group" aria-label="Sort market indices">
          <span class="marketIndicesSortLabel">Sort Market Indices By</span>
          <button type="button" class="buttonGroupItem marketSortBtn ${marketIndicesSortMode === "manual" ? "active" : ""}" data-sort-mode="manual">Manual</button>
          <button type="button" class="buttonGroupItem marketSortBtn ${marketIndicesSortMode === "type" ? "active" : ""}" data-sort-mode="type">Market Type</button>
          <button type="button" class="buttonGroupItem marketSortBtn ${marketIndicesSortMode === "region" ? "active" : ""}" data-sort-mode="region">Country/Region</button>
          <button type="button" class="buttonGroupItem marketSortBtn ${marketIndicesSortMode === "az" ? "active" : ""}" data-sort-mode="az">A-Z</button>
        </div>
      </div>
      <div class="marketIndicesSortCurrent" aria-live="polite">Current Sort: ${activeSortLabel}</div>
      <div class="marketIndicesList ${groupMode ? `grouped grouped-${groupMode}` : ""}" id="marketIndicesList">
        ${(() => {
          const list = cfg.marketIndices || [];
          const renderRow = (entry, idx) => {
            const def = MARKET_INDEX_DEFS.find((item) => item.key === entry.key);
            if(!def) return "";
            const meta = getMarketMeta(entry.key);
            const checked = visibleByKey.get(entry.key) !== false;
            const id = `idx_${entry.key.replace(/[^a-zA-Z0-9]/g, "_")}`;

            return `<div class="marketIndexRow" data-row-index="${idx}" draggable="true" title="Drag to reorder ${def.name}">
                <label class="checkboxLabel marketIndexToggle" for="${id}">
                  <input type="checkbox" class="checkbox" id="${id}" data-index-key="${entry.key}" ${checked ? "checked" : ""}>
                  <span class="marketIndexText">
                    <span class="marketIndexName">${def.name}</span>
                    <span class="marketIndexMeta">
                      <span class="marketMetaType">Type: ${meta.type}</span>
                      <span class="marketMetaRegion">Region: ${meta.region}</span>
                    </span>
                  </span>
                  <span class="marketDragHandle" aria-hidden="true">::</span>
                </label>
              </div>`;
          };

          if(!groupMode){
            return list.map((entry, idx) => renderRow(entry, idx)).join("");
          }

          const grouped = [];
          list.forEach((entry, idx) => {
            const meta = getMarketMeta(entry.key);
            const groupValue = groupMode === "type" ? String(meta.type || "Other") : String(meta.region || "Other");
            const last = grouped[grouped.length - 1];
            if(!last || last.value !== groupValue){
              grouped.push({ value: groupValue, rows: [renderRow(entry, idx)] });
            }else{
              last.rows.push(renderRow(entry, idx));
            }
          });

          const prefix = groupMode === "type" ? "Market Type" : "Region";
          const renderGroup = (group, extraClass = "") => `
            <section class="marketIndexGroup ${extraClass}">
              <div class="marketIndexSectionHead">
                <div class="marketIndexSectionHeader">${prefix}: ${group.value}</div>
                <div class="marketIndexSectionActions">
                  <button type="button" class="marketGroupToggleBtn" data-group-mode="${groupMode}" data-group-value="${encodeURIComponent(group.value)}" data-group-visible="1">All</button>
                  <button type="button" class="marketGroupToggleBtn" data-group-mode="${groupMode}" data-group-value="${encodeURIComponent(group.value)}" data-group-visible="0">None</button>
                </div>
              </div>
              <div class="marketIndexGroupList">
                ${group.rows.join("")}
              </div>
            </section>
          `;

          if(groupMode === "region"){
            const byValue = new Map(grouped.map((group) => [group.value, group]));
            const topGroups = ["United States", "Global"]
              .map((value) => byValue.get(value))
              .filter(Boolean);
            const used = new Set(topGroups.map((group) => group.value));
            const bottomGroups = grouped.filter((group) => !used.has(group.value));

            const topHtml = topGroups.map((group) => renderGroup(group, "marketIndexGroup--primary")).join("");
            const bottomHtml = bottomGroups.map((group) => renderGroup(group, "marketIndexGroup--secondary")).join("");

            return `
              <div class="marketRegionTop">${topHtml}</div>
              <div class="marketRegionBottom">${bottomHtml}</div>
            `;
          }

          return grouped.map((group) => renderGroup(group)).join("");
        })()}
      </div>
    `;

    const showAllBtn = document.getElementById("marketIndicesShowAll");
    const hideAllBtn = document.getElementById("marketIndicesHideAll");
    if(showAllBtn) showAllBtn.addEventListener("click", () => setAllMarketIndicesVisible(true));
    if(hideAllBtn) hideAllBtn.addEventListener("click", () => setAllMarketIndicesVisible(false));

    marketIndicesContainer.querySelectorAll(".marketSortBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        sortMarketIndices(String(btn.dataset.sortMode || "manual"));
      });
    });

    marketIndicesContainer.querySelectorAll(".marketGroupToggleBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = String(btn.dataset.groupMode || "");
        const rawValue = String(btn.dataset.groupValue || "");
        const groupValue = decodeURIComponent(rawValue);
        const makeVisible = btn.dataset.groupVisible === "1";
        if(!(mode === "type" || mode === "region")) return;

        cfg.marketIndices = (cfg.marketIndices || []).map((entry) => {
          const meta = getMarketMeta(entry.key);
          const value = mode === "type"
            ? String(meta.type || "Other")
            : String(meta.region || "Other");
          if(value !== groupValue) return entry;
          return { ...entry, visible: makeVisible };
        });

        renderMarketIndices();
        setStatus("Market strip updated (not saved yet)", "unsaved");
      });
    });

    marketIndicesContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        const key = String(cb.dataset.indexKey || "");
        cfg.marketIndices = (cfg.marketIndices || []).map((entry) =>
          entry.key === key ? { ...entry, visible: cb.checked } : entry
        );
        setStatus("Market strip updated (not saved yet)", "unsaved");
      });
    });

    let dragFrom = -1;
    marketIndicesContainer.querySelectorAll(".marketIndexRow").forEach((row) => {
      row.addEventListener("dragstart", (event) => {
        dragFrom = Number(row.dataset.rowIndex);
        row.classList.add("dragging");
        if(event.dataTransfer){
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(dragFrom));
        }
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        dragFrom = -1;
      });

      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        row.classList.add("drag-over");
      });

      row.addEventListener("dragleave", () => {
        row.classList.remove("drag-over");
      });

      row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("drag-over");
        const dragTo = Number(row.dataset.rowIndex);
        const from = Number.isInteger(dragFrom) && dragFrom >= 0
          ? dragFrom
          : Number(event.dataTransfer?.getData("text/plain"));

        if(!Number.isInteger(from) || !Number.isInteger(dragTo) || from === dragTo) return;
        moveMarketIndex(from, dragTo);
        renderMarketIndices();
        setStatus("Market strip reordered (not saved yet)", "unsaved");
      });
    });
  }

  // Render stocks list
  function renderStocks(){
    stocksEditor.innerHTML = "";
    const list = cfg.stocks || [];
    let dragFrom = -1;

    const clearStockDropHints = () => {
      stocksEditor.querySelectorAll(".stockEditorRow").forEach((el) => {
        el.classList.remove("drag-over", "drag-over-before", "drag-over-after");
      });
      stocksEditor.querySelectorAll(".stockDropHint").forEach((hint) => {
        hint.classList.remove("active");
        hint.textContent = "";
      });
    };

    const getDropIntent = (event, row, rowIndex) => {
      const rect = row.getBoundingClientRect();
      const offsetY = event.clientY - rect.top;
      const after = offsetY > (rect.height / 2);
      let insertAt = rowIndex + (after ? 1 : 0);
      if(dragFrom >= 0 && dragFrom < insertAt) insertAt -= 1;
      const hint = `Will become #${insertAt + 1}`;
      return { after, hint };
    };

    list.forEach((s, idx) => {
      const row = document.createElement("div");
      row.className = "editorRow stockEditorRow";
      row.dataset.stockIndex = String(idx);

      const orderBadge = document.createElement("div");
      orderBadge.className = "stockOrderBadge";
      orderBadge.textContent = String(idx + 1);

      const sym = document.createElement("input");
      sym.className = "input stockEditorSymbolInput";
      sym.placeholder = "SYMBOL (ex: NASDAQ:CLOV)";
      sym.value = s.symbol || "";
      sym.draggable = false;
      let autoFillTimer = 0;
      const maybeAutoFillLabel = async () => {
        const currentSymbol = String(sym.value || "").trim();
        if(!currentSymbol) return;

        const existingLabel = String(label.value || "").trim();
        if(existingLabel) return;

        const requestedSymbol = currentSymbol;
        const foundName = await lookupSymbolName(requestedSymbol);
        if(!foundName) return;

        // Guard against stale async responses.
        if(String(sym.value || "").trim() !== requestedSymbol) return;
        if(String(label.value || "").trim()) return;

        label.value = foundName;
        cfg.stocks[idx].label = foundName;
        setStatus("Auto-filled name (not saved yet)", "unsaved");
      };

      sym.addEventListener("input", () => {
        cfg.stocks[idx].symbol = sym.value;
        if(autoFillTimer) window.clearTimeout(autoFillTimer);
        autoFillTimer = window.setTimeout(() => {
          maybeAutoFillLabel();
        }, 350);
      });
      sym.addEventListener("blur", () => {
        if(autoFillTimer) window.clearTimeout(autoFillTimer);
        maybeAutoFillLabel();
      });

      const label = document.createElement("input");
      label.className = "input stockEditorLabelInput";
      label.placeholder = "Label (ex: Clover Health)";
      label.value = s.label || "";
      label.draggable = false;
      label.addEventListener("input", () => { cfg.stocks[idx].label = label.value; });

      const drag = createIconButton("::", "Drag to reorder · Alt+↑↓ to move");
      drag.classList.add("stockDragBtn");
      drag.setAttribute("aria-label", "Drag to reorder · Alt+↑↓ to move");
      drag.draggable = true;
      drag.addEventListener("dragstart", (event) => {
        dragFrom = idx;
        row.classList.add("dragging");
        if(event.dataTransfer){
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(idx));
        }
      });
      drag.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        clearStockDropHints();
        dragFrom = -1;
      });
      drag.addEventListener("keydown", (event) => {
        if(!event.altKey) return;
        if(event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const dir = event.key === "ArrowUp" ? -1 : 1;
        const newIdx = idx + dir;
        if(newIdx < 0 || newIdx >= (cfg.stocks || []).length) return;
        const moved = cfg.stocks.splice(idx, 1)[0];
        cfg.stocks.splice(newIdx, 0, moved);
        renderStocks();
        const newDragBtn = stocksEditor.querySelectorAll(".stockDragBtn")[newIdx];
        newDragBtn?.focus();
        setStatus("Reordered (not saved yet)", "unsaved");
      });

      const del = createIconButton("✕", "Remove");
      del.classList.add("stockDeleteBtn");
      del.addEventListener("click", () => {
        cfg.stocks.splice(idx, 1);
        renderStocks();
        setStatus("Removed (not saved yet)", "unsaved");
      });

      const fields = document.createElement("div");
      fields.className = "stockEditorFields";
      fields.appendChild(sym);
      fields.appendChild(label);

      const dropHint = document.createElement("div");
      dropHint.className = "stockDropHint";
      dropHint.setAttribute("aria-hidden", "true");

      row.appendChild(orderBadge);
      row.appendChild(drag);
      row.appendChild(fields);
      row.appendChild(del);
      row.appendChild(dropHint);

      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        if(!(Number.isInteger(dragFrom) && dragFrom >= 0)) return;
        clearStockDropHints();
        row.classList.add("drag-over");
        const dragTo = Number(row.dataset.stockIndex);
        if(Number.isInteger(dragTo)){
          const intent = getDropIntent(event, row, dragTo);
          row.classList.add(intent.after ? "drag-over-after" : "drag-over-before");
          dropHint.textContent = intent.hint;
          dropHint.classList.add("active");
        }
      });

      row.addEventListener("dragleave", () => {
        row.classList.remove("drag-over", "drag-over-before", "drag-over-after");
        dropHint.classList.remove("active");
        dropHint.textContent = "";
      });

      row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("drag-over", "drag-over-before", "drag-over-after");
        dropHint.classList.remove("active");
        dropHint.textContent = "";
        const dragTo = Number(row.dataset.stockIndex);
        const from = Number.isInteger(dragFrom) && dragFrom >= 0
          ? dragFrom
          : Number(event.dataTransfer?.getData("text/plain"));

        if(!Number.isInteger(from) || !Number.isInteger(dragTo) || from === dragTo) return;
        const intent = getDropIntent(event, row, dragTo);
        let insertAt = dragTo + (intent.after ? 1 : 0);
        if(from < insertAt) insertAt -= 1;
        if(insertAt === from) return;

        const moved = cfg.stocks.splice(from, 1)[0];
        cfg.stocks.splice(insertAt, 0, moved);
        renderStocks();
        setStatus("Reordered (not saved yet)", "unsaved");
      });

      stocksEditor.appendChild(row);
    });

    if(list.length === 0){
      const empty = document.createElement("div");
      empty.className = "hint stockEditorEmptyHint";
      empty.textContent = "No symbols yet. Add your first stock.";
      stocksEditor.appendChild(empty);
    }

    addStockBtn.classList.add("addStockCardBtn");
    addStockBtn.classList.remove("btnSettings");
    addStockBtn.textContent = "+ Add Stock";
    stocksEditor.appendChild(addStockBtn);
  }

  // Render news sources
  function renderNews(){
    newsEditor.innerHTML = "";
    const list = cfg.widgets || [];
    let dragFrom = -1;

    const clearNewsDropHints = () => {
      newsEditor.querySelectorAll(".newsEditorRow").forEach((el) => {
        el.classList.remove("drag-over", "drag-over-before", "drag-over-after");
      });
      newsEditor.querySelectorAll(".stockDropHint").forEach((hint) => {
        hint.classList.remove("active");
        hint.textContent = "";
      });
    };

    const getDropIntent = (event, row, rowIndex) => {
      const rect = row.getBoundingClientRect();
      const offsetY = event.clientY - rect.top;
      const after = offsetY > (rect.height / 2);
      let insertAt = rowIndex + (after ? 1 : 0);
      if(dragFrom >= 0 && dragFrom < insertAt) insertAt -= 1;
      const hint = `Will become #${insertAt + 1}`;
      return { after, hint };
    };

    // Disable add button if at max capacity (9 sources)
    if(addNewsBtn){
      addNewsBtn.disabled = list.length >= 9;
      addNewsBtn.title = list.length >= 9 ? "Maximum 9 sources reached" : "Add a new news source";
    }

    list.forEach((w, idx) => {
      const row = document.createElement("div");
      row.className = "editorRow newsEditorRow";
      row.dataset.newsIndex = String(idx);

      const orderBadge = document.createElement("div");
      orderBadge.className = "stockOrderBadge";
      orderBadge.textContent = String(idx + 1);

      const name = document.createElement("input");
      name.className = "input newsFieldName";
      name.placeholder = "Source Name";
      name.value = w.name || "";
      name.draggable = false;
      name.addEventListener("input", () => { cfg.widgets[idx].name = name.value; });

      const rss = document.createElement("input");
      rss.className = "input newsFieldRss";
      rss.placeholder = "RSS URL";
      rss.value = w.rss || "";
      rss.draggable = false;

      const site = document.createElement("input");
      site.className = "input newsFieldSite";
      site.placeholder = "Site URL (optional)";
      site.value = w.site || "";
      site.draggable = false;
      site.addEventListener("input", () => { cfg.widgets[idx].site = site.value; });

      let rssAutoFillTimer = 0;

      const maybeAutoFillNewsMeta = async () => {
        const currentRss = String(rss.value || "").trim();
        if(!currentRss) return;

        const requestedRss = currentRss;
        const fallback = fallbackNewsMetaFromRssUrl(requestedRss);
        let changed = false;

        if(!String(name.value || "").trim() && fallback.name){
          name.value = fallback.name;
          cfg.widgets[idx].name = fallback.name;
          changed = true;
        }

        if(!String(site.value || "").trim() && fallback.site){
          site.value = fallback.site;
          cfg.widgets[idx].site = fallback.site;
          changed = true;
        }

        const lookedUp = await lookupRssSourceMeta(requestedRss);
        if(String(rss.value || "").trim() !== requestedRss) return;

        if(!String(name.value || "").trim() && lookedUp.name){
          name.value = lookedUp.name;
          cfg.widgets[idx].name = lookedUp.name;
          changed = true;
        }

        if(!String(site.value || "").trim() && lookedUp.site){
          site.value = lookedUp.site;
          cfg.widgets[idx].site = lookedUp.site;
          changed = true;
        }

        if(changed){
          setStatus("Auto-filled source details (not saved yet)", "unsaved");
        }
      };

      rss.addEventListener("input", () => {
        cfg.widgets[idx].rss = rss.value;
        if(rssAutoFillTimer) window.clearTimeout(rssAutoFillTimer);
        rssAutoFillTimer = window.setTimeout(() => {
          maybeAutoFillNewsMeta();
        }, 450);
      });
      rss.addEventListener("blur", () => {
        if(rssAutoFillTimer) window.clearTimeout(rssAutoFillTimer);
        maybeAutoFillNewsMeta();
      });

      const count = document.createElement("input");
      count.className = "input newsFieldCount";
      count.placeholder = "Count";
      count.value = String(w.headlinesCount ?? 6);
      count.draggable = false;
      count.addEventListener("input", () => {
        const n = Number(count.value);
        cfg.widgets[idx].headlinesCount = Number.isFinite(n) ? n : 6;
      });

      const drag = createIconButton("::", "Drag to reorder · Alt+↑↓ to move");
      drag.classList.add("newsDragBtn");
      drag.setAttribute("aria-label", "Drag to reorder · Alt+↑↓ to move");
      drag.draggable = true;
      drag.addEventListener("dragstart", (event) => {
        dragFrom = idx;
        row.classList.add("dragging");
        if(event.dataTransfer){
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(idx));
        }
      });
      drag.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        clearNewsDropHints();
        dragFrom = -1;
      });
      drag.addEventListener("keydown", (event) => {
        if(!event.altKey) return;
        if(event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const dir = event.key === "ArrowUp" ? -1 : 1;
        const newIdx = idx + dir;
        if(newIdx < 0 || newIdx >= (cfg.widgets || []).length) return;
        const moved = cfg.widgets.splice(idx, 1)[0];
        cfg.widgets.splice(newIdx, 0, moved);
        renderNews();
        const newDragBtn = newsEditor.querySelectorAll(".newsDragBtn")[newIdx];
        newDragBtn?.focus();
        setStatus("Reordered (not saved yet)", "unsaved");
      });

      const del = createIconButton("", "Remove source");
      del.classList.add("newsDeleteBtn");
      del.innerHTML = '<span class="newsDelIcon" aria-hidden="true"></span>';
      del.addEventListener("click", () => {
        cfg.widgets.splice(idx, 1);
        renderNews();
        setStatus("Removed (not saved yet)", "unsaved");
      });

      const countWrap = document.createElement("div");
      countWrap.className = "newsCountWrap";
      const countLbl = document.createElement("span");
      countLbl.className = "newsCountLabel";
      countLbl.textContent = "Headlines";
      countWrap.appendChild(countLbl);
      countWrap.appendChild(count);

      const fields = document.createElement("div");
      fields.className = "newsEditorFields";
      fields.appendChild(rss);
      fields.appendChild(name);
      fields.appendChild(site);
      fields.appendChild(countWrap);

      const dropHint = document.createElement("div");
      dropHint.className = "stockDropHint";
      dropHint.setAttribute("aria-hidden", "true");

      row.appendChild(orderBadge);
      row.appendChild(drag);
      row.appendChild(fields);
      row.appendChild(del);
      row.appendChild(dropHint);

      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        if(!(Number.isInteger(dragFrom) && dragFrom >= 0)) return;
        clearNewsDropHints();
        row.classList.add("drag-over");
        const dragTo = Number(row.dataset.newsIndex);
        if(Number.isInteger(dragTo)){
          const intent = getDropIntent(event, row, dragTo);
          row.classList.add(intent.after ? "drag-over-after" : "drag-over-before");
          dropHint.textContent = intent.hint;
          dropHint.classList.add("active");
        }
      });

      row.addEventListener("dragleave", () => {
        row.classList.remove("drag-over", "drag-over-before", "drag-over-after");
        dropHint.classList.remove("active");
        dropHint.textContent = "";
      });

      row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("drag-over", "drag-over-before", "drag-over-after");
        dropHint.classList.remove("active");
        dropHint.textContent = "";
        const dragTo = Number(row.dataset.newsIndex);
        const from = Number.isInteger(dragFrom) && dragFrom >= 0
          ? dragFrom
          : Number(event.dataTransfer?.getData("text/plain"));

        if(!Number.isInteger(from) || !Number.isInteger(dragTo) || from === dragTo) return;
        const intent = getDropIntent(event, row, dragTo);
        let insertAt = dragTo + (intent.after ? 1 : 0);
        if(from < insertAt) insertAt -= 1;
        if(insertAt === from) return;

        const moved = cfg.widgets.splice(from, 1)[0];
        cfg.widgets.splice(insertAt, 0, moved);
        renderNews();
        setStatus("Reordered (not saved yet)", "unsaved");
      });

      newsEditor.appendChild(row);
    });

    if(list.length === 0){
      const empty = document.createElement("div");
      empty.className = "hint stockEditorEmptyHint";
      empty.textContent = "No sources yet. Add your first source.";
      newsEditor.appendChild(empty);
    }

    addNewsBtn.classList.add("addNewsCardBtn");
    addNewsBtn.classList.remove("btnSettings");
    addNewsBtn.textContent = "+ Add News Source";
    newsEditor.appendChild(addNewsBtn);
  }

  // Load config to UI
  function loadToUI(){
    themeSel.value = cfg.theme || "dark";
    zipInput.value = cfg.zipCode || "";
    wxRefreshInput.value = String(cfg.weatherRefreshMinutes || 10);
    if(weatherStaleWarnInput) weatherStaleWarnInput.value = String(cfg.weatherStaleWarnMinutes || 30);

    // Page visibility settings removed from UI

    // Set button group active states
    updateButtonGroupState(weatherAlertButtons, cfg.weatherAlertScope || "local");
    updateButtonGroupState(forecastLengthButtons, String(cfg.forecastLength || 7));
    updateButtonGroupState(weatherDefaultMapLayerButtons, cfg.weatherDefaultMapLayer || "radar");
    updateButtonGroupState(weatherTempUnitButtons, cfg.weatherTempUnit || "fahrenheit");
    updateButtonGroupState(weatherWindUnitButtons, cfg.weatherWindUnit || "mph");
    updateButtonGroupState(weatherPrecipUnitButtons, cfg.weatherPrecipUnit || "inch");
    if(weatherShowMapToggle) weatherShowMapToggle.checked = cfg.weatherShowMap !== false;
    updateButtonGroupState(stockSortButtons, cfg.stockSortMode || "pinned");
    updateButtonGroupState(marketNewsSourceButtons, cfg.marketNewsSourceMode || "google");
    updateButtonGroupState(marketNewsOpenButtons, cfg.marketNewsOpenMode || "new-tab");
    renderMarketIndices();
    loadAstrolabToUI();

    renderStocks();
    renderNews();
  }

  // Update button group visual state
  function updateButtonGroupState(buttons, value){
    buttons.forEach(btn => {
      if(String(btn.dataset.value) === String(value)){
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  // Pull UI values back to config
  function pullFromUI(){
    cfg.theme = themeSel.value;
    cfg.zipCode = String(zipInput.value || "").trim();
    cfg.weatherRefreshMinutes = Number(wxRefreshInput.value || 10);
    if(weatherStaleWarnInput){
      cfg.weatherStaleWarnMinutes = Number(weatherStaleWarnInput.value || 30);
    }

    // Extract button group values from active buttons
    const activeForecastBtn = document.querySelector("[data-field='forecastLength'].active");
    if(activeForecastBtn){
      cfg.forecastLength = Number(activeForecastBtn.dataset.value);
    }

    const activeAlertBtn = document.querySelector("[data-field='weatherAlertScope'].active");
    if(activeAlertBtn){
      cfg.weatherAlertScope = activeAlertBtn.dataset.value;
    }

    const activeMapLayerBtn = document.querySelector("[data-field='weatherDefaultMapLayer'].active");
    if(activeMapLayerBtn){
      cfg.weatherDefaultMapLayer = activeMapLayerBtn.dataset.value;
    }

    const activeTempBtn = document.querySelector("[data-field='weatherTempUnit'].active");
    if(activeTempBtn){
      cfg.weatherTempUnit = activeTempBtn.dataset.value;
    }

    const activeWindBtn = document.querySelector("[data-field='weatherWindUnit'].active");
    if(activeWindBtn){
      cfg.weatherWindUnit = activeWindBtn.dataset.value;
    }

    const activePrecipBtn = document.querySelector("[data-field='weatherPrecipUnit'].active");
    if(activePrecipBtn){
      cfg.weatherPrecipUnit = activePrecipBtn.dataset.value;
    }

    if(weatherShowMapToggle){
      cfg.weatherShowMap = weatherShowMapToggle.checked;
    }

    const activeStockBtn = document.querySelector("[data-field='stockSortMode'].active");
    if(activeStockBtn){
      cfg.stockSortMode = activeStockBtn.dataset.value;
    }

    const activeMarketSourceBtn = document.querySelector("[data-field='marketNewsSourceMode'].active");
    if(activeMarketSourceBtn){
      cfg.marketNewsSourceMode = activeMarketSourceBtn.dataset.value;
    }

    const activeMarketOpenBtn = document.querySelector("[data-field='marketNewsOpenMode'].active");
    if(activeMarketOpenBtn){
      cfg.marketNewsOpenMode = activeMarketOpenBtn.dataset.value;
    }

    pullAstrolabFromUI();
    
    // Keep default page visibility config

  }

  // Save config
  function doSave(){
    pullFromUI();
    cfg = window.App.saveConfig(cfg);
    window.App.applyThemeDensity(cfg);
    setStatus("✓ Saved", "saved");
    setTimeout(() => setStatus("Ready"), 2000);
  }

  saveBtn.addEventListener("click", doSave);

  // Button group selection
  document.querySelectorAll(".buttonGroupItem").forEach(btn => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.field;
      const value = btn.dataset.value;

      if(field === "weatherAlertScope"){
        cfg.weatherAlertScope = value;
        updateButtonGroupState(weatherAlertButtons, value);
      } else if(field === "forecastLength"){
        cfg.forecastLength = Number(value);
        updateButtonGroupState(forecastLengthButtons, value);
      } else if(field === "weatherDefaultMapLayer"){
        cfg.weatherDefaultMapLayer = value;
        updateButtonGroupState(weatherDefaultMapLayerButtons, value);
      } else if(field === "weatherTempUnit"){
        cfg.weatherTempUnit = value;
        updateButtonGroupState(weatherTempUnitButtons, value);
      } else if(field === "weatherWindUnit"){
        cfg.weatherWindUnit = value;
        updateButtonGroupState(weatherWindUnitButtons, value);
      } else if(field === "weatherPrecipUnit"){
        cfg.weatherPrecipUnit = value;
        updateButtonGroupState(weatherPrecipUnitButtons, value);
      } else if(field === "stockSortMode"){
        cfg.stockSortMode = value;
        updateButtonGroupState(stockSortButtons, value);
      } else if(field === "marketNewsSourceMode"){
        cfg.marketNewsSourceMode = value;
        updateButtonGroupState(marketNewsSourceButtons, value);
      } else if(field === "marketNewsOpenMode"){
        cfg.marketNewsOpenMode = value;
        updateButtonGroupState(marketNewsOpenButtons, value);
      }

      setStatus("Modified (not saved yet)", "unsaved");
    });
  });

  if(weatherShowMapToggle){
    weatherShowMapToggle.addEventListener("change", () => {
      cfg.weatherShowMap = weatherShowMapToggle.checked;
      setStatus("Modified (not saved yet)", "unsaved");
    });
  }

  // Page visibility toggles removed from UI

  astrolabSettingInputs.forEach((el) => {
    const eventName = (el.tagName === "INPUT" && (el.type === "text" || el.type === "number" || el.type === "range")) ? "input" : "change";
    el.addEventListener(eventName, () => {
      updateAstrolabRangeLabels();
      syncAstrolabControlStates();
      setStatus("Modified (not saved yet)", "unsaved");
    });
  });

  astrolabControls.clearCacheBtn?.addEventListener("click", () => {
    clearAstrolabCache();
  });

  // Theme & Appearance settings
  themeSel.addEventListener("change", () => {
    cfg.theme = themeSel.value;
    applyThemeDensity(cfg); // Live preview
    setStatus("Modified (not saved yet)", "unsaved");
  });

  // Location & Weather settings
  zipInput.addEventListener("input", () => {
    setStatus("Modified (not saved yet)", "unsaved");
  });

  wxRefreshInput.addEventListener("input", () => {
    setStatus("Modified (not saved yet)", "unsaved");
  });

  if(weatherStaleWarnInput){
    weatherStaleWarnInput.addEventListener("input", () => {
      setStatus("Modified (not saved yet)", "unsaved");
    });
  }

  // Add stock
  addStockBtn.addEventListener("click", () => {
    cfg.stocks = cfg.stocks || [];
    cfg.stocks.push({ symbol:"", label:"" });
    renderStocks();
    setStatus("Added (not saved yet)", "unsaved");
  });

  // Add news
  addNewsBtn.addEventListener("click", () => {
    cfg.widgets = cfg.widgets || [];
    if(cfg.widgets.length >= 9){
      setStatus("Maximum 9 sources reached", "error");
      return;
    }
    cfg.widgets.push({ name:"", rss:"", site:"", headlinesCount:6 });
    renderNews();
    setStatus("Added (not saved yet)", "unsaved");
  });

  // Export config
  exportBtn.addEventListener("click", () => {
    pullFromUI();
    jsonBox.value = JSON.stringify(window.App.normalizeConfig(cfg), null, 2);
    setStatus("Exported to box (not saved unless you click Save)", "default");
  });

  // Import config
  importBtn.addEventListener("click", () => {
    const raw = (jsonBox.value || "").trim();
    if(!raw){
      setStatus("Paste JSON first", "error");
      return;
    }
    try{
      const parsed = JSON.parse(raw);
      cfg = window.App.normalizeConfig(parsed);
      setStatus("Imported (click Save to commit)", "unsaved");
      loadToUI();
    }catch(e){
      setStatus("Invalid JSON", "error");
    }
  });

  // Reset to defaults
  resetBtn.addEventListener("click", () => {
    if(!confirm("Reset all settings to defaults? This cannot be undone.")){
      return;
    }
    cfg = window.App.normalizeConfig(window.App.DEFAULTS);
    setStatus("Reset to defaults (click Save to commit)", "unsaved");
    loadToUI();
  });

  // PWA Install functionality
  let deferredPrompt;
  let canAutoInstall = false;
  const installAppBtn = document.getElementById("installAppBtn");
  const installBtnText = document.getElementById("installBtnText");
  const installStatus = document.getElementById("installStatus");
  const installStatusText = document.getElementById("installStatusText");
  const installModal = document.getElementById("installModal");
  const installModalClose = document.getElementById("installModalClose");
  const browserSpecificInstructions = document.getElementById("browserSpecificInstructions");

  // Enhanced browser detection
  function detectBrowser() {
    const ua = navigator.userAgent;
    const platform = navigator.platform;
    
    // Detect operating system
    const isWindows = /Win/.test(platform);
    const isMac = /Mac/.test(platform);
    const isLinux = /Linux/.test(platform) && !/Android/.test(ua);
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    
    // Detect browser
    const isFirefox = /Firefox/.test(ua);
    const isDuckDuckGo = /DuckDuckGo/.test(ua);
    const isChrome = /Chrome/.test(ua) && !/Edg|OPR|DuckDuckGo/.test(ua);
    const isEdge = /Edg/.test(ua);
    const isOpera = /OPR/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome|Edg|OPR|DuckDuckGo/.test(ua);
    const isBrave = navigator.brave !== undefined;
    
    return {
      isWindows, isMac, isLinux, isIOS, isAndroid,
      isFirefox, isDuckDuckGo, isChrome, isEdge, isOpera, isSafari, isBrave,
      name: isFirefox ? 'Firefox' : 
            isDuckDuckGo ? 'DuckDuckGo' : 
            isEdge ? 'Edge' : 
            isChrome ? 'Chrome' : 
            isSafari ? 'Safari' : 
            isOpera ? 'Opera' : 
            isBrave ? 'Brave' : 
            'your browser',
      os: isWindows ? 'Windows' : 
          isMac ? 'macOS' : 
          isLinux ? 'Linux' : 
          isIOS ? 'iOS' : 
          isAndroid ? 'Android' : 
          'your device'
    };
  }

  // Generate browser-specific installation instructions
  function generateInstallInstructions(browser) {
    let html = '<div style="font-size: 13px; font-weight: 600; margin-bottom: 12px;">📱 Installation Steps:</div>';
    
    // Firefox instructions
    if (browser.isFirefox) {
      html += `
        <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🦊 Firefox ${browser.os}</div>
          <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
            <strong>Step 1:</strong> Look for the <strong>install icon</strong> (⊕ or 🏠) in the address bar<br>
            <strong>Step 2:</strong> Click it and select <strong>"Install"</strong><br><br>
            <em style="color: var(--muted);">Alternative:</em> Menu (☰) → "Install this site as an app"
          </div>
        </div>
      `;
    }
    
    // DuckDuckGo instructions
    else if (browser.isDuckDuckGo) {
      if (browser.isAndroid) {
        html += `
          <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🦆 DuckDuckGo (Android)</div>
            <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
              <strong>Step 1:</strong> Tap the <strong>menu</strong> (⋮) in the top right<br>
              <strong>Step 2:</strong> Select <strong>"Add to Home screen"</strong><br>
              <strong>Step 3:</strong> Tap <strong>"Add"</strong> to confirm<br><br>
              <em style="color: var(--muted);">The app icon will appear on your home screen!</em>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🦆 DuckDuckGo Browser</div>
            <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
              <strong>Step 1:</strong> Look for the <strong>install icon</strong> in your address bar or menu<br>
              <strong>Step 2:</strong> Click it and select <strong>"Install"</strong><br><br>
              <em style="color: var(--muted);">You can also bookmark this page for quick access!</em>
            </div>
          </div>
        `;
      }
    }
    
    // Chrome/Edge instructions
    else if (browser.isChrome || browser.isEdge) {
      const browserName = browser.isEdge ? 'Edge' : 'Chrome';
      html += `
        <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🖥️ ${browserName} (${browser.os})</div>
          <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
            <strong>Step 1:</strong> Look for the <strong>install icon</strong> (⊕ or 💻) in the address bar<br>
            <strong>Step 2:</strong> Click it and select <strong>"Install"</strong><br><br>
            <em style="color: var(--muted);">Or: Menu (⋮) → "Install HAPPENING NOW..."</em>
          </div>
        </div>
      `;
    }
    
    // Safari instructions
    else if (browser.isSafari) {
      if (browser.isIOS) {
        html += `
          <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🍎 Safari (iOS)</div>
            <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
              <strong>Step 1:</strong> Tap the <strong>Share button</strong> (□↑) at the bottom of the screen<br>
              <strong>Step 2:</strong> Scroll down and tap <strong>"Add to Home Screen"</strong><br>
              <strong>Step 3:</strong> Tap <strong>"Add"</strong> in the top right<br><br>
              <em style="color: var(--muted);">The app will appear on your home screen!</em>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🍎 Safari (macOS)</div>
            <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
              <strong>Step 1:</strong> Click <strong>File</strong> in the menu bar<br>
              <strong>Step 2:</strong> Select <strong>"Add to Dock"</strong><br><br>
              <em style="color: var(--muted);">You can also add this page to your favorites for quick access!</em>
            </div>
          </div>
        `;
      }
    }
    
    // Generic/fallback instructions
    else {
      html += `
        <div class="install-step" style="margin-bottom: 16px; padding: 14px; background: var(--card-bg); border: 2px solid var(--accent); border-radius: 8px;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent);">🌐 ${browser.name} (${browser.os})</div>
          <div style="font-size: 12px; color: var(--text); line-height: 1.6;">
            <strong>Option 1:</strong> Look for an <strong>install icon</strong> (⊕, 💻, or 📱) in your address bar or menu<br>
            <strong>Option 2:</strong> Check browser menu → Look for "Install", "Add to Home Screen", or "Add to Dock"<br>
            <strong>Option 3:</strong> Bookmark this page for quick access<br><br>
            <em style="color: var(--muted);">Installation steps vary by browser, but most support PWAs!</em>
          </div>
        </div>
      `;
    }
    
    return html;
  }

  // Check if already installed
  function checkInstalled() {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      installAppBtn.style.display = "none";
      installStatus.style.display = "block";
      installStatusText.textContent = "App is installed! Launch from your home screen or app menu.";
      return true;
    }
    return false;
  }

  function getShortcutLaunchUrl(){
    return new URL("index.html", window.location.href).href;
  }

  function buildWindowsShortcutContent(){
    const launchUrl = getShortcutLaunchUrl();
    return [
      "[InternetShortcut]",
      `URL=${launchUrl}`,
      "IconIndex=0"
    ].join("\r\n");
  }

  function downloadWindowsDesktopShortcut(){
    const shortcutBlob = new Blob([buildWindowsShortcutContent()], { type: "application/internet-shortcut" });
    const fileUrl = URL.createObjectURL(shortcutBlob);
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = "H!.url";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
  }

  function getManualShortcutPanel(browser){
    if(!browser.isWindows){
      return "";
    }

    return `
      <div style="margin-top: 14px; padding: 12px; border: 1px dashed var(--accent); border-radius: 8px; background: var(--panel2);">
        <div style="font-size: 12px; margin-bottom: 8px; line-height: 1.5; color: var(--muted);">
          If install is unavailable in ${browser.name}, you can download a Windows desktop shortcut now.
        </div>
        <button id="downloadDesktopShortcutBtn" type="button" class="btn btnSubtle">Download Desktop Shortcut (H!)</button>
        <div style="margin-top: 8px; font-size: 11px; color: var(--muted);">
          After download: move <strong>H!.url</strong> to your Desktop. Browsers cannot place files directly on Desktop without your action.
        </div>
      </div>
    `;
  }

  function bindManualShortcutActions(browser){
    const shortcutBtn = document.getElementById("downloadDesktopShortcutBtn");
    if(!shortcutBtn || !browser.isWindows) return;

    shortcutBtn.addEventListener("click", () => {
      downloadWindowsDesktopShortcut();
      setStatus("Shortcut downloaded. Move H!.url to Desktop.", "default");
    });
  }

  function showInlineInstallFallback(){
    const browser = detectBrowser();
    if(browser.isWindows){
      downloadWindowsDesktopShortcut();
      setStatus("Downloaded H!.url. Move it to Desktop.", "default");
      return;
    }
    setStatus("Install instructions unavailable on this build. Use browser menu: Install/Add to Home Screen.", "default");
  }

  // Show install modal with browser-specific instructions
  function showInstallModal() {
    const browser = detectBrowser();
    if(!installModal || !browserSpecificInstructions){
      showInlineInstallFallback();
      return;
    }

    browserSpecificInstructions.innerHTML = generateInstallInstructions(browser) + getManualShortcutPanel(browser);
    bindManualShortcutActions(browser);
    installModal.style.display = "flex";
    setStatus("Showing install options", "default");
  }

  // Hide install modal
  function hideInstallModal() {
    installModal.style.display = "none";
  }

  // Modal close handlers
  if (installModalClose) {
    installModalClose.addEventListener('click', hideInstallModal);
  }
  installModal?.addEventListener('click', (e) => {
    if (e.target === installModal) hideInstallModal();
  });

  // Listen for beforeinstallprompt event (Chrome/Edge support)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    canAutoInstall = true;
    console.log('[PWA] Auto-install available');
  });

  // Handle install button click
  if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
      // If already installed, do nothing
      if (checkInstalled()) return;

      // If browser supports auto-install, use it
      if (canAutoInstall && deferredPrompt) {
        try {
          setStatus("Opening install prompt...", "default");
          await deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;

          if (outcome === 'accepted') {
            console.log('[PWA] User accepted the install prompt');
            installAppBtn.style.display = "none";
            installStatus.style.display = "block";
            installStatusText.textContent = "Installing... check your home screen!";
          } else {
            console.log('[PWA] User dismissed the install prompt');
          }

          deferredPrompt = null;
          canAutoInstall = false;
        } catch (err) {
          console.warn('[PWA] Install prompt failed:', err);
          showInstallModal();
        }
      } else {
        // Browser doesn't support auto-install or this page is not currently installable.
        showInstallModal();
      }
    });
  }

  // Listen for app installed event
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App was installed');
    installAppBtn.style.display = "none";
    installStatus.style.display = "block";
    installStatusText.textContent = "Successfully installed! 🎉";
    setTimeout(hideInstallModal, 500);
  });

  // Initialize install state
  if (!checkInstalled()) {
    const browser = detectBrowser();
    // Update button text based on browser
    if (browser.isFirefox) {
      installBtnText.textContent = "Install in Firefox";
    } else if (browser.isDuckDuckGo) {
      installBtnText.textContent = "Install in DuckDuckGo";
    } else if (browser.isSafari && browser.isIOS) {
      installBtnText.textContent = "Install on iPhone/iPad";
    } else if (browser.isSafari) {
      installBtnText.textContent = "Install on Mac";
    } else if (browser.isAndroid) {
      installBtnText.textContent = "Install on Android";
    } else if (browser.isEdge) {
      installBtnText.textContent = "Install in Edge";
    } else if (browser.isChrome) {
      installBtnText.textContent = "Install in Chrome";
    } else {
      installBtnText.textContent = `Install in ${browser.name}`;
    }
  }

  // "New" badge — auto-hides after first expand of each usage guide
  function initUsageGuideBadges(){
    document.querySelectorAll(".usageGuide[data-guide]").forEach((details) => {
      const key = `jas_guide_${details.dataset.guide}_seen_v1`;
      const badge = details.querySelector(".usageGuideBadge");
      if(!badge) return;
      if(localStorage.getItem(key)){
        badge.hidden = true;
        return;
      }
      details.addEventListener("toggle", () => {
        if(!details.open) return;
        localStorage.setItem(key, "1");
        badge.classList.add("usageGuideBadgeFade");
        window.setTimeout(() => { badge.hidden = true; }, 450);
      }, { once: true });
    });
  }

  // Initialize
  loadToUI();
  activateTabFromHash();
  initUsageGuideBadges();
  setStatus("Ready");
})();
