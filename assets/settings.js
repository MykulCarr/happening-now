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
  const renderModeSel = document.getElementById("renderModeSel");
  const startupPageSel = document.getElementById("startupPageSel");
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
  const stocksNewsButtons = document.querySelectorAll("[data-field='stocksNewsMode']");
  const marketNewsSourceButtons = document.querySelectorAll("[data-field='marketNewsSourceMode']");
  const marketNewsOpenButtons = document.querySelectorAll("[data-field='marketNewsOpenMode']");
  const marketIndicesContainer = document.getElementById("marketIndicesCheckboxes");

  // News
  const stocksEditor = document.getElementById("stocksEditor");
  const stockLookupForm = document.getElementById("stockLookupForm");
  const stockLookupInput = document.getElementById("stockLookupInput");
  const stockLookupBtn = document.getElementById("stockLookupBtn");
  const stockAssignTarget = document.getElementById("stockAssignTarget");
  const stockLookupStatus = document.getElementById("stockLookupStatus");
  const stockLookupResults = document.getElementById("stockLookupResults");
  const newsEditor = document.getElementById("newsEditor");
  const addNewsBtn = document.getElementById("addNewsBtn");
  const newsManualToggle = document.getElementById("newsManualToggle");
  const newsManualBody = document.getElementById("newsManualBody");
  const newsDiscoveryForm = document.getElementById("newsDiscoveryForm");
  const newsDiscoveryInput = document.getElementById("newsDiscoveryInput");
  const newsDiscoveryBtn = document.getElementById("newsDiscoveryBtn");
  const newsDiscoveryBrowse = document.getElementById("newsDiscoveryBrowse");
  const newsDiscoveryStatus = document.getElementById("newsDiscoveryStatus");
  const newsDiscoveryResults = document.getElementById("newsDiscoveryResults");

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

  function setStockLookupStatus(message, type = "default"){
    if(!stockLookupStatus) return;
    stockLookupStatus.textContent = message || "";
    stockLookupStatus.className = `stockLookupStatus ${type ? `is-${type}` : ""}`.trim();
  }

  function setStockLookupBusy(isBusy){
    if(stockLookupBtn){
      stockLookupBtn.disabled = isBusy;
      stockLookupBtn.textContent = isBusy ? "Searching..." : "Search Symbols";
    }
    if(stockLookupInput){
      stockLookupInput.setAttribute("aria-busy", isBusy ? "true" : "false");
    }
  }

  function normalizeStockLookupResult(raw){
    const symbol = String(raw?.symbol || "").trim().toUpperCase();
    if(!symbol) return null;
    const label = String(raw?.shortname || raw?.longname || raw?.name || "").trim();
    const exchange = String(raw?.exchDisp || raw?.exchange || "").trim();
    const type = String(raw?.typeDisp || raw?.quoteType || "").trim();
    return { symbol, label, exchange, type };
  }

  async function searchStockLookupCandidates(rawQuery){
    const query = String(rawQuery || "").trim();
    if(!query) return [];

    const proxyBase = String(window.App?.RSS_PROXY_BASE || "").trim();
    if(!proxyBase) return [];

    const targetUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=24&newsCount=0&lang=en-US&region=US`;
    const proxyUrl = `${proxyBase}${encodeURIComponent(targetUrl)}`;
    const res = await fetch(proxyUrl, { cache: "no-store" });
    if(!res.ok) return [];

    const payload = await res.json();
    const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
    const seen = new Set();
    return quotes
      .map(normalizeStockLookupResult)
      .filter((row) => {
        if(!row) return false;
        if(seen.has(row.symbol)) return false;
        seen.add(row.symbol);
        return true;
      });
  }

  function renderStockAssignTargetOptions(){
    if(!stockAssignTarget) return;

    const previousValue = stockAssignTarget.value;
    stockAssignTarget.innerHTML = "";

    const newOption = document.createElement("option");
    newOption.value = "new";
    newOption.textContent = "New row";
    stockAssignTarget.appendChild(newOption);

    (cfg.stocks || []).forEach((stock, index) => {
      const option = document.createElement("option");
      option.value = `idx:${index}`;
      const symbol = String(stock?.symbol || "").trim() || "(blank symbol)";
      const label = String(stock?.label || "").trim();
      option.textContent = `Row ${index + 1}: ${symbol}${label ? ` - ${label}` : ""}`;
      stockAssignTarget.appendChild(option);
    });

    const hasPrevious = Array.from(stockAssignTarget.options).some((opt) => opt.value === previousValue);
    stockAssignTarget.value = hasPrevious ? previousValue : "new";
  }

  function assignStockLookupResult(result){
    if(!result) return;

    cfg.stocks = cfg.stocks || [];
    const targetValue = String(stockAssignTarget?.value || "new");
    let targetIndex = -1;

    if(targetValue.startsWith("idx:")){
      const parsedIndex = Number(targetValue.split(":")[1]);
      if(Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < cfg.stocks.length){
        targetIndex = parsedIndex;
      }
    }

    // Combine exchange and symbol if exchange exists and symbol doesn't already contain it
    const finalSymbol = result.exchange && !String(result.symbol || "").includes(":") 
      ? `${result.exchange}:${result.symbol}`
      : result.symbol;

    if(targetIndex >= 0){
      cfg.stocks[targetIndex] = {
        ...cfg.stocks[targetIndex],
        symbol: finalSymbol,
        label: result.label || cfg.stocks[targetIndex]?.label || result.symbol
      };
      renderStocks();
      setStatus(`Assigned ${finalSymbol} to row ${targetIndex + 1} (not saved yet)`, "unsaved");
      setStockLookupStatus(`Assigned ${finalSymbol} to row ${targetIndex + 1}.`, "success");
      setTimeout(() => closeStockLookupModal?.(), 600);
      return;
    }

    cfg.stocks.push({ symbol: finalSymbol, label: result.label || result.symbol });
    renderStocks();
    setStatus(`Added ${finalSymbol} to watchlist (not saved yet)`, "unsaved");
    setStockLookupStatus(`Added ${result.symbol} as a new row.`, "success");
    if(stockAssignTarget) stockAssignTarget.value = "new";
    setTimeout(() => closeStockLookupModal?.(), 600);
  }

  function renderStockLookupResults(results){
    if(!stockLookupResults) return;

    const list = Array.isArray(results) ? results : stockLookupCurrentResults;
    stockLookupCurrentResults = list.slice();
    stockLookupResults.innerHTML = "";

    if(list.length === 0) return;

    list.forEach((item) => {
      const card = document.createElement("article");
      card.className = "stockLookupCard";

      const top = document.createElement("div");
      top.className = "stockLookupCardTop";

      const symbol = document.createElement("div");
      symbol.className = "stockLookupSymbol";
      symbol.textContent = item.symbol;

      const name = document.createElement("div");
      name.className = "stockLookupName";
      name.textContent = item.label || "Unnamed listing";

      top.appendChild(symbol);
      top.appendChild(name);

      const meta = document.createElement("div");
      meta.className = "stockLookupMeta";
      const parts = [item.exchange, item.type].filter(Boolean);
      meta.textContent = parts.length ? parts.join(" · ") : "Exchange info unavailable";

      const actions = document.createElement("div");
      actions.className = "stockLookupActions";
      const assignBtn = document.createElement("button");
      assignBtn.type = "button";
      assignBtn.className = "btn stockLookupAssignBtn";
      assignBtn.textContent = "Assign";
      assignBtn.addEventListener("click", () => assignStockLookupResult(item));
      actions.appendChild(assignBtn);

      card.appendChild(top);
      card.appendChild(meta);
      card.appendChild(actions);
      stockLookupResults.appendChild(card);
    });
  }

  async function runStockLookup(rawQuery){
    const query = String(rawQuery || "").trim();
    if(!query){
      setStockLookupStatus("Enter a ticker or company name first.", "error");
      if(stockLookupResults) stockLookupResults.innerHTML = "";
      return;
    }

    const runId = ++stockLookupRunId;
    setStockLookupBusy(true);
    setStockLookupStatus(`Searching symbols for "${query}"...`, "loading");
    if(stockLookupResults) stockLookupResults.innerHTML = "";

    try{
      const results = await searchStockLookupCandidates(query);
      if(runId !== stockLookupRunId) return;

      renderStockLookupResults(results);
      if(results.length === 0){
        setStockLookupStatus("No symbols matched that search. Try ticker, company name, or exchange-prefixed symbol.", "error");
      }else{
        const noun = results.length === 1 ? "match" : "matches";
        setStockLookupStatus(`Found ${results.length} ${noun}. Choose one and click Assign.`, "success");
      }
    }catch(error){
      window.App?.handleError?.(error, "Stock Symbol Lookup");
      if(runId !== stockLookupRunId) return;
      if(stockLookupResults) stockLookupResults.innerHTML = "";
      setStockLookupStatus("Stock lookup is unavailable right now. Please try again shortly.", "error");
    }finally{
      if(runId === stockLookupRunId){
        setStockLookupBusy(false);
      }
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

  const NEWS_DISCOVERY_COMMON_PATHS = [
    "/feed",
    "/rss",
    "/rss.xml",
    "/feed.xml",
    "/atom.xml",
    "/index.xml",
    "/feeds/posts/default?alt=rss",
    "/news/rss.xml",
    "/news/feed"
  ];
  const NEWS_DISCOVERY_MAX_RESULTS = 24;
  const NEWS_DISCOVERY_MAX_SITE_PROBES = 5;
  const NEWS_SOURCE_LIMIT = 15;
  const NEWS_DISCOVERY_CACHE_PREFIX = "jas_news_discovery_v2:";
  const NEWS_DISCOVERY_TOPIC_PRESETS = [
    { key: "top", label: "Top Stories", query: "latest news" },
    { key: "world", label: "World", query: "world news" },
    { key: "politics", label: "Politics", query: "politics" },
    { key: "business", label: "Business", query: "business" },
    { key: "markets", label: "Markets", query: "markets finance" },
    { key: "technology", label: "Technology", query: "technology" },
    { key: "science", label: "Science", query: "science" },
    { key: "health", label: "Health", query: "health" },
    { key: "sports", label: "Sports", query: "sports" },
    { key: "culture", label: "Culture", query: "culture arts entertainment" },
    { key: "lifestyle", label: "Lifestyle", query: "lifestyle travel food" },
    { key: "opinion", label: "Opinion", query: "opinion analysis editorials" }
  ];
  const NEWS_DISCOVERY_SOURCE_PRESETS = [
    {
      publisher: "BBC",
      site: "https://www.bbc.com/news",
      domain: "bbc.com",
      aliases: ["bbc", "bbc news", "bbc.com", "bbc.co.uk"],
      entries: [
        { category: "Top Stories", rss: "https://feeds.bbci.co.uk/news/rss.xml", site: "https://www.bbc.com/news", type: "direct" },
        { category: "World", rss: "https://feeds.bbci.co.uk/news/world/rss.xml", site: "https://www.bbc.com/news/world", type: "direct" },
        { category: "Business", rss: "https://feeds.bbci.co.uk/news/business/rss.xml", site: "https://www.bbc.com/news/business", type: "direct" },
        { category: "Technology", rss: "https://feeds.bbci.co.uk/news/technology/rss.xml", site: "https://www.bbc.com/news/technology", type: "direct" },
        { category: "Sports", rss: "https://feeds.bbci.co.uk/sport/rss.xml?edition=uk", site: "https://www.bbc.com/sport", type: "direct" },
        { category: "Culture", rss: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", site: "https://www.bbc.com/news/entertainment_and_arts", type: "direct" }
      ]
    },
    {
      publisher: "NPR",
      site: "https://www.npr.org",
      domain: "npr.org",
      aliases: ["npr", "npr.org", "national public radio"],
      entries: [
        { category: "Top Stories", rss: "https://feeds.npr.org/1001/rss.xml", site: "https://www.npr.org", type: "direct" }
      ],
      topicKeys: ["world", "politics", "business", "technology", "science", "culture", "opinion"]
    },
    {
      publisher: "Reuters",
      site: "https://www.reuters.com",
      domain: "reuters.com",
      aliases: ["reuters", "reuters.com"],
      topicKeys: ["top", "world", "politics", "business", "markets", "technology", "sports", "opinion"]
    },
    {
      publisher: "The Guardian",
      site: "https://www.theguardian.com",
      domain: "theguardian.com",
      aliases: ["guardian", "the guardian", "theguardian.com", "guardian.com"],
      entries: [
        { category: "US News", rss: "https://www.theguardian.com/us-news/rss", site: "https://www.theguardian.com/us-news", type: "direct" }
      ],
      topicKeys: ["world", "politics", "business", "technology", "science", "sports", "culture", "opinion"]
    },
    {
      publisher: "PBS NewsHour",
      site: "https://www.pbs.org/newshour",
      domain: "pbs.org",
      aliases: ["pbs", "pbs newshour", "pbs.org"],
      entries: [
        { category: "Top Stories", rss: "https://www.pbs.org/newshour/feeds/rss/headlines", site: "https://www.pbs.org/newshour", type: "direct" }
      ],
      topicKeys: ["world", "politics", "science", "health", "culture"]
    },
    {
      publisher: "Al Jazeera",
      site: "https://www.aljazeera.com",
      domain: "aljazeera.com",
      aliases: ["al jazeera", "aljazeera", "aljazeera.com"],
      entries: [
        { category: "Top Stories", rss: "https://www.aljazeera.com/xml/rss/all.xml", site: "https://www.aljazeera.com", type: "direct" }
      ],
      topicKeys: ["world", "politics", "business", "technology", "sports", "opinion"]
    },
    {
      publisher: "Deutsche Welle",
      site: "https://www.dw.com",
      domain: "dw.com",
      aliases: ["deutsche welle", "dw", "dw.com"],
      entries: [
        { category: "Top Stories", rss: "https://rss.dw.com/rdf/rss-en-all", site: "https://www.dw.com", type: "direct" }
      ],
      topicKeys: ["world", "politics", "business", "technology", "science", "sports", "culture", "opinion"]
    },
    {
      publisher: "AP News",
      site: "https://apnews.com",
      domain: "apnews.com",
      aliases: ["ap", "associated press", "apnews", "apnews.com"],
      topicKeys: ["top", "world", "politics", "business", "technology", "science", "health", "sports"]
    },
    {
      publisher: "ABC News",
      site: "https://abcnews.go.com",
      domain: "abcnews.go.com",
      aliases: ["abc", "abc news", "abcnews", "abcnews.go.com"],
      topicKeys: ["top", "world", "politics", "business", "technology", "health", "sports"]
    },
    {
      publisher: "CBS News",
      site: "https://www.cbsnews.com",
      domain: "cbsnews.com",
      aliases: ["cbs", "cbs news", "cbsnews", "cbsnews.com"],
      topicKeys: ["top", "world", "politics", "business", "technology", "health"]
    },
    {
      publisher: "NBC News",
      site: "https://www.nbcnews.com",
      domain: "nbcnews.com",
      aliases: ["nbc", "nbc news", "nbcnews", "nbcnews.com"],
      topicKeys: ["top", "world", "politics", "business", "technology", "health"]
    },
    {
      publisher: "CNN",
      site: "https://www.cnn.com",
      domain: "cnn.com",
      aliases: ["cnn", "cnn.com"],
      topicKeys: ["top", "world", "politics", "business", "technology", "health", "sports"]
    },
    {
      publisher: "Fox News",
      site: "https://www.foxnews.com",
      domain: "foxnews.com",
      aliases: ["fox", "fox news", "foxnews", "foxnews.com"],
      topicKeys: ["top", "world", "politics", "business", "health", "sports", "opinion"]
    },
    {
      publisher: "The New York Times",
      site: "https://www.nytimes.com",
      domain: "nytimes.com",
      aliases: ["new york times", "nytimes", "nyt", "nytimes.com"],
      topicKeys: ["top", "world", "politics", "business", "technology", "science", "health", "sports", "culture", "opinion"]
    },
    {
      publisher: "The Washington Post",
      site: "https://www.washingtonpost.com",
      domain: "washingtonpost.com",
      aliases: ["washington post", "wapo", "washingtonpost", "washingtonpost.com"],
      topicKeys: ["top", "world", "politics", "business", "technology", "health", "sports", "culture", "opinion"]
    },
    {
      publisher: "USA Today",
      site: "https://www.usatoday.com",
      domain: "usatoday.com",
      aliases: ["usa today", "usatoday", "usatoday.com"],
      topicKeys: ["top", "world", "politics", "business", "technology", "sports", "lifestyle"]
    },
    {
      publisher: "Politico",
      site: "https://www.politico.com",
      domain: "politico.com",
      aliases: ["politico", "politico.com"],
      topicKeys: ["top", "politics", "world", "business", "opinion"]
    },
    {
      publisher: "Axios",
      site: "https://www.axios.com",
      domain: "axios.com",
      aliases: ["axios", "axios.com"],
      topicKeys: ["top", "politics", "business", "technology", "science"]
    },
    {
      publisher: "The Hill",
      site: "https://thehill.com",
      domain: "thehill.com",
      aliases: ["the hill", "thehill", "thehill.com"],
      topicKeys: ["top", "politics", "business", "opinion"]
    },
    {
      publisher: "Bloomberg",
      site: "https://www.bloomberg.com",
      domain: "bloomberg.com",
      aliases: ["bloomberg", "bloomberg.com"],
      topicKeys: ["top", "world", "politics", "business", "markets", "technology", "opinion"]
    },
    {
      publisher: "CNBC",
      site: "https://www.cnbc.com",
      domain: "cnbc.com",
      aliases: ["cnbc", "cnbc.com"],
      topicKeys: ["top", "business", "markets", "technology"]
    },
    {
      publisher: "MarketWatch",
      site: "https://www.marketwatch.com",
      domain: "marketwatch.com",
      aliases: ["marketwatch", "marketwatch.com"],
      topicKeys: ["top", "business", "markets", "technology", "opinion"]
    },
    {
      publisher: "Financial Times",
      site: "https://www.ft.com",
      domain: "ft.com",
      aliases: ["financial times", "ft", "ft.com"],
      topicKeys: ["top", "world", "politics", "business", "markets", "technology", "opinion"]
    },
    {
      publisher: "The Wall Street Journal",
      site: "https://www.wsj.com",
      domain: "wsj.com",
      aliases: ["wall street journal", "wsj", "wsj.com"],
      topicKeys: ["top", "world", "politics", "business", "markets", "technology", "opinion", "lifestyle"]
    },
    {
      publisher: "Fortune",
      site: "https://fortune.com",
      domain: "fortune.com",
      aliases: ["fortune", "fortune.com"],
      topicKeys: ["top", "business", "markets", "technology", "opinion"]
    },
    {
      publisher: "Ars Technica",
      site: "https://arstechnica.com",
      domain: "arstechnica.com",
      aliases: ["ars technica", "arstechnica", "arstechnica.com"],
      entries: [
        { category: "Top Stories", rss: "https://feeds.arstechnica.com/arstechnica/index", site: "https://arstechnica.com", type: "direct" }
      ],
      topicKeys: ["technology", "science", "business"]
    },
    {
      publisher: "TechCrunch",
      site: "https://techcrunch.com",
      domain: "techcrunch.com",
      aliases: ["techcrunch", "tech crunch", "techcrunch.com"],
      topicKeys: ["top", "technology", "business"]
    },
    {
      publisher: "The Verge",
      site: "https://www.theverge.com",
      domain: "theverge.com",
      aliases: ["the verge", "verge", "theverge", "theverge.com"],
      topicKeys: ["top", "technology", "science", "culture"]
    },
    {
      publisher: "Wired",
      site: "https://www.wired.com",
      domain: "wired.com",
      aliases: ["wired", "wired.com"],
      topicKeys: ["top", "technology", "science", "culture", "business"]
    },
    {
      publisher: "CNET",
      site: "https://www.cnet.com",
      domain: "cnet.com",
      aliases: ["cnet", "cnet.com"],
      topicKeys: ["top", "technology", "science", "culture"]
    },
    {
      publisher: "Engadget",
      site: "https://www.engadget.com",
      domain: "engadget.com",
      aliases: ["engadget", "engadget.com"],
      topicKeys: ["top", "technology", "science", "culture"]
    },
    {
      publisher: "9to5Mac",
      site: "https://9to5mac.com",
      domain: "9to5mac.com",
      aliases: ["9to5mac", "9to5 mac", "9to5mac.com"],
      topicKeys: ["top", "technology", "business"]
    },
    {
      publisher: "MacRumors",
      site: "https://www.macrumors.com",
      domain: "macrumors.com",
      aliases: ["macrumors", "mac rumors", "macrumors.com"],
      topicKeys: ["top", "technology", "business"]
    },
    {
      publisher: "Nature",
      site: "https://www.nature.com",
      domain: "nature.com",
      aliases: ["nature", "nature.com"],
      entries: [
        { category: "Top Stories", rss: "https://www.nature.com/nature.rss", site: "https://www.nature.com", type: "direct" }
      ],
      topicKeys: ["science", "health", "technology"]
    },
    {
      publisher: "Scientific American",
      site: "https://www.scientificamerican.com",
      domain: "scientificamerican.com",
      aliases: ["scientific american", "scientificamerican", "scientificamerican.com"],
      topicKeys: ["top", "science", "health", "technology"]
    },
    {
      publisher: "New Scientist",
      site: "https://www.newscientist.com",
      domain: "newscientist.com",
      aliases: ["new scientist", "newscientist", "newscientist.com"],
      topicKeys: ["top", "science", "health", "technology"]
    },
    {
      publisher: "National Geographic",
      site: "https://www.nationalgeographic.com",
      domain: "nationalgeographic.com",
      aliases: ["national geographic", "nat geo", "natgeo", "nationalgeographic.com"],
      topicKeys: ["top", "science", "culture", "lifestyle"]
    },
    {
      publisher: "Space.com",
      site: "https://www.space.com",
      domain: "space.com",
      aliases: ["space.com", "space news", "space"],
      topicKeys: ["top", "science", "technology"]
    },
    {
      publisher: "ESPN",
      site: "https://www.espn.com",
      domain: "espn.com",
      aliases: ["espn", "espn.com"],
      topicKeys: ["top", "sports", "business"]
    },
    {
      publisher: "Sports Illustrated",
      site: "https://www.si.com",
      domain: "si.com",
      aliases: ["sports illustrated", "si", "si.com"],
      topicKeys: ["top", "sports", "culture"]
    },
    {
      publisher: "Sky News",
      site: "https://news.sky.com",
      domain: "news.sky.com",
      aliases: ["sky news", "skynews", "news.sky.com"],
      topicKeys: ["top", "world", "politics", "business", "technology", "sports"]
    },
    {
      publisher: "CBC News",
      site: "https://www.cbc.ca/news",
      domain: "cbc.ca",
      aliases: ["cbc", "cbc news", "cbc.ca"],
      topicKeys: ["top", "world", "politics", "business", "technology", "sports", "health"]
    },
    {
      publisher: "ProPublica",
      site: "https://www.propublica.org",
      domain: "propublica.org",
      aliases: ["propublica", "propublica.org"],
      topicKeys: ["top", "politics", "health", "business"]
    },
    {
      publisher: "Vox",
      site: "https://www.vox.com",
      domain: "vox.com",
      aliases: ["vox", "vox.com"],
      topicKeys: ["top", "world", "politics", "business", "technology", "culture", "opinion"]
    },
    {
      publisher: "Los Angeles Times",
      site: "https://www.latimes.com",
      domain: "latimes.com",
      aliases: ["la times", "los angeles times", "latimes", "latimes.com"],
      topicKeys: ["top", "world", "politics", "business", "sports", "culture", "lifestyle"]
    },
    {
      publisher: "San Francisco Chronicle",
      site: "https://www.sfchronicle.com",
      domain: "sfchronicle.com",
      aliases: ["sf chronicle", "san francisco chronicle", "sfchronicle", "sfchronicle.com"],
      topicKeys: ["top", "politics", "business", "technology", "sports", "culture"]
    },
    {
      publisher: "The Seattle Times",
      site: "https://www.seattletimes.com",
      domain: "seattletimes.com",
      aliases: ["seattle times", "the seattle times", "seattletimes", "seattletimes.com"],
      topicKeys: ["top", "politics", "business", "technology", "sports", "lifestyle"]
    },
    {
      publisher: "The Oregonian",
      site: "https://www.oregonlive.com",
      domain: "oregonlive.com",
      aliases: ["oregonian", "oregon live", "oregonlive", "oregonlive.com"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    },
    {
      publisher: "The Denver Post",
      site: "https://www.denverpost.com",
      domain: "denverpost.com",
      aliases: ["denver post", "denverpost", "denverpost.com"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    },
    {
      publisher: "The Dallas Morning News",
      site: "https://www.dallasnews.com",
      domain: "dallasnews.com",
      aliases: ["dallas morning news", "dallasnews", "dallasnews.com"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    },
    {
      publisher: "Houston Chronicle",
      site: "https://www.houstonchronicle.com",
      domain: "houstonchronicle.com",
      aliases: ["houston chronicle", "houstonchronicle", "houstonchronicle.com"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    },
    {
      publisher: "Chicago Tribune",
      site: "https://www.chicagotribune.com",
      domain: "chicagotribune.com",
      aliases: ["chicago tribune", "chicagotribune", "chicagotribune.com"],
      topicKeys: ["top", "politics", "business", "sports", "culture", "lifestyle"]
    },
    {
      publisher: "Detroit Free Press",
      site: "https://www.freep.com",
      domain: "freep.com",
      aliases: ["detroit free press", "freep", "freep.com"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    },
    {
      publisher: "The Boston Globe",
      site: "https://www.bostonglobe.com",
      domain: "bostonglobe.com",
      aliases: ["boston globe", "bostonglobe", "bostonglobe.com"],
      topicKeys: ["top", "politics", "business", "sports", "culture", "lifestyle"]
    },
    {
      publisher: "The Philadelphia Inquirer",
      site: "https://www.inquirer.com",
      domain: "inquirer.com",
      aliases: ["philadelphia inquirer", "inquirer", "inquirer.com"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    },
    {
      publisher: "Miami Herald",
      site: "https://www.miamiherald.com",
      domain: "miamiherald.com",
      aliases: ["miami herald", "miamiherald", "miamiherald.com"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    },
    {
      publisher: "The Arizona Republic",
      site: "https://www.azcentral.com",
      domain: "azcentral.com",
      aliases: ["arizona republic", "azcentral", "azcentral.com"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    },
    {
      publisher: "The Kansas City Star",
      site: "https://www.kansascity.com",
      domain: "kansascity.com",
      aliases: ["kansas city star", "kansascity", "kansascity.com"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    },
    {
      publisher: "Star Tribune",
      site: "https://www.startribune.com",
      domain: "startribune.com",
      aliases: ["star tribune", "startribune", "startribune.com"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    },
    {
      publisher: "The Plain Dealer",
      site: "https://www.cleveland.com",
      domain: "cleveland.com",
      aliases: ["plain dealer", "cleveland.com", "cleveland plain dealer"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    },
    {
      publisher: "Newsday",
      site: "https://www.newsday.com",
      domain: "newsday.com",
      aliases: ["newsday", "newsday.com"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    },
    {
      publisher: "Tampa Bay Times",
      site: "https://www.tampabay.com",
      domain: "tampabay.com",
      aliases: ["tampa bay times", "tampabay", "tampabay.com"],
      topicKeys: ["top", "politics", "business", "sports", "lifestyle"]
    }
  ];

  const NEWS_BROWSE_CATEGORIES = [
    {
      id: "popular",
      label: "Popular",
      publishers: ["BBC", "Reuters", "AP News", "NPR", "The Guardian", "CNN", "Bloomberg", "CNBC", "TechCrunch", "Ars Technica", "Nature", "ESPN"]
    },
    {
      id: "us-national",
      label: "US National",
      publishers: ["ABC News", "CBS News", "NBC News", "CNN", "Fox News", "NPR", "PBS NewsHour", "AP News", "The New York Times", "The Washington Post", "USA Today", "Politico", "Axios", "Vox"]
    },
    {
      id: "us-regional",
      label: "US Regional",
      publishers: ["Los Angeles Times", "San Francisco Chronicle", "The Seattle Times", "The Oregonian", "The Denver Post", "Chicago Tribune", "The Dallas Morning News", "Houston Chronicle", "The Boston Globe", "The Philadelphia Inquirer", "Miami Herald", "The Arizona Republic", "Detroit Free Press", "The Kansas City Star", "Star Tribune", "Newsday", "Tampa Bay Times"]
    },
    {
      id: "international",
      label: "International",
      publishers: ["BBC", "Reuters", "Al Jazeera", "Deutsche Welle", "Sky News", "CBC News", "Financial Times", "The Wall Street Journal", "Bloomberg", "The Guardian", "New Scientist"]
    },
    {
      id: "business",
      label: "Business & Finance",
      publishers: ["Bloomberg", "CNBC", "MarketWatch", "Financial Times", "The Wall Street Journal", "Fortune", "Reuters", "The New York Times", "The Washington Post"]
    },
    {
      id: "technology",
      label: "Technology",
      publishers: ["Ars Technica", "TechCrunch", "The Verge", "Wired", "CNET", "Engadget", "9to5Mac", "MacRumors"]
    },
    {
      id: "science",
      label: "Science",
      publishers: ["Nature", "Scientific American", "New Scientist", "National Geographic", "Space.com"]
    },
    {
      id: "sports",
      label: "Sports",
      publishers: ["ESPN", "Sports Illustrated", "BBC", "Sky News"]
    },
    {
      id: "politics",
      label: "Politics",
      publishers: ["Politico", "The Hill", "Axios", "ProPublica", "Reuters", "AP News", "The New York Times", "The Washington Post"]
    }
  ];
  const NEWS_DISCOVERY_KNOWN_FEEDS = buildKnownNewsFeedCatalog();
  let newsDiscoveryRunId = 0;
  let newsDiscoveryCurrentResults = [];
  let newsDiscoveryActiveCatId = "popular";
  let stockLookupRunId = 0;
  let stockLookupCurrentResults = [];

  function buildGoogleNewsTopicFeedUrl(publisher, domain, topicQuery){
    const queryBits = [publisher, topicQuery, `site:${domain}`].filter(Boolean);
    const query = queryBits.join(" ");
    return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  }

  function normalizePresetTopicKeys(preset){
    const keys = Array.isArray(preset?.topicKeys) ? preset.topicKeys : [];
    return NEWS_DISCOVERY_TOPIC_PRESETS.filter((topic) => keys.includes(topic.key));
  }

  function expandSourcePreset(preset){
    const publisher = String(preset?.publisher || "").trim();
    const site = String(preset?.site || "").trim();
    const domain = normalizeDiscoveryHost(preset?.domain || "");
    const directEntries = Array.isArray(preset?.entries) ? preset.entries : [];
    const results = directEntries.map((entry) => ({
      publisher,
      category: String(entry?.category || "Top Stories").trim(),
      name: `${publisher} - ${String(entry?.category || "Top Stories").trim()}`,
      rss: String(entry?.rss || "").trim(),
      site: String(entry?.site || site).trim(),
      hosts: [domain].filter(Boolean),
      reason: "preset",
      feedType: String(entry?.type || "direct").trim() || "direct"
    })).filter((entry) => entry.rss);

    const seenCategories = new Set(results.map((entry) => normalizeDiscoveryText(entry.category)));
    normalizePresetTopicKeys(preset).forEach((topic) => {
      const categoryKey = normalizeDiscoveryText(topic.label);
      if(seenCategories.has(categoryKey) || !publisher || !domain) return;
      results.push({
        publisher,
        category: topic.label,
        name: `${publisher} - ${topic.label}`,
        rss: buildGoogleNewsTopicFeedUrl(publisher, domain, topic.query),
        site,
        hosts: [domain].filter(Boolean),
        reason: "preset",
        feedType: "topic"
      });
    });

    return results;
  }

  function getPresetSearchTerms(preset){
    const terms = new Set();
    terms.add(normalizeDiscoveryText(preset?.publisher || ""));
    terms.add(normalizeDiscoveryHost(preset?.domain || ""));
    (Array.isArray(preset?.aliases) ? preset.aliases : []).forEach((alias) => terms.add(normalizeDiscoveryText(alias)));
    return Array.from(terms).filter(Boolean);
  }

  function getPresetMatchScore(preset, normalizedQuery){
    let best = 0;
    getPresetSearchTerms(preset).forEach((term) => {
      if(term === normalizedQuery){
        best = Math.max(best, 100);
        return;
      }
      if(term.startsWith(normalizedQuery) || normalizedQuery.startsWith(term)){
        best = Math.max(best, 70);
        return;
      }
      if(term.includes(normalizedQuery) || normalizedQuery.includes(term)){
        best = Math.max(best, 50);
      }
    });
    return best;
  }

  function findMatchingSourcePresets(query){
    const normalizedQuery = normalizeDiscoveryText(query).replace(/^https?:\/\//, "");
    if(!normalizedQuery) return [];

    return NEWS_DISCOVERY_SOURCE_PRESETS
      .map((preset) => ({ preset, score: getPresetMatchScore(preset, normalizedQuery) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || String(a.preset.publisher).localeCompare(String(b.preset.publisher)))
      .map((entry) => entry.preset);
  }

  function buildKnownNewsFeedCatalog(){
    const defaults = Array.isArray(window.App?.DEFAULTS?.widgets) ? window.App.DEFAULTS.widgets : [];
    const seen = new Set();

    const presetEntries = NEWS_DISCOVERY_SOURCE_PRESETS.flatMap((preset) => expandSourcePreset(preset));
    const defaultEntries = defaults.map((item) => {
      const name = String(item?.name || "").trim();
      const rss = String(item?.rss || "").trim();
      const site = String(item?.site || "").trim();
      const hosts = [];

      try{ hosts.push(normalizeDiscoveryHost(new URL(rss).hostname)); }catch{}
      try{ hosts.push(normalizeDiscoveryHost(new URL(site).hostname)); }catch{}

      const key = `${name}|${rss}`.toLowerCase();
      if(!name || !rss || seen.has(key)) return null;
      seen.add(key);

      return {
        publisher: name,
        category: "Top Stories",
        name,
        rss,
        site,
        hosts: hosts.filter(Boolean),
        reason: "known",
        feedType: "direct"
      };

    }).filter(Boolean);

    return [...presetEntries, ...defaultEntries].filter((entry) => {
      const key = `${String(entry?.name || "")}|${String(entry?.rss || "")}`.toLowerCase();
      if(!entry || !entry.rss || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeDiscoveryHost(hostname){
    return String(hostname || "").trim().toLowerCase().replace(/^www\./, "");
  }

  function normalizeDiscoveryText(value){
    return String(value || "").trim().toLowerCase();
  }

  function setNewsDiscoveryStatus(message, type = "default"){
    if(!newsDiscoveryStatus) return;
    newsDiscoveryStatus.textContent = message || "";
    newsDiscoveryStatus.className = `newsDiscoveryStatus ${type ? `is-${type}` : ""}`.trim();
  }

  function setNewsDiscoveryBusy(isBusy){
    if(newsDiscoveryBtn){
      newsDiscoveryBtn.disabled = isBusy;
      newsDiscoveryBtn.textContent = isBusy ? "Searching..." : "Search Feeds";
    }
    if(newsDiscoveryInput){
      newsDiscoveryInput.setAttribute("aria-busy", isBusy ? "true" : "false");
    }
  }

  function setManualNewsMode(expanded){
    const isExpanded = Boolean(expanded);
    if(newsManualBody) newsManualBody.hidden = !isExpanded;
    if(newsManualToggle){
      newsManualToggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      newsManualToggle.textContent = isExpanded ? "Hide Manual RSS URL" : "Manual RSS URL";
    }
  }

  function renderNewsDiscoveryBrowse(){
    if(!newsDiscoveryBrowse) return;

    newsDiscoveryBrowse.innerHTML = "";

    // Category pills row
    const pillsRow = document.createElement("div");
    pillsRow.className = "newsDiscoveryCatPills";
    pillsRow.setAttribute("role", "tablist");
    pillsRow.setAttribute("aria-label", "Browse by category");
    NEWS_BROWSE_CATEGORIES.forEach((cat) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "newsDiscoveryCatPill" + (cat.id === newsDiscoveryActiveCatId ? " active" : "");
      pill.textContent = cat.label;
      pill.setAttribute("role", "tab");
      pill.setAttribute("aria-selected", cat.id === newsDiscoveryActiveCatId ? "true" : "false");
      pill.addEventListener("click", () => {
        newsDiscoveryActiveCatId = cat.id;
        renderNewsDiscoveryBrowse();
      });
      pillsRow.appendChild(pill);
    });
    newsDiscoveryBrowse.appendChild(pillsRow);

    // Source chips for the active category
    const activeCat = NEWS_BROWSE_CATEGORIES.find((c) => c.id === newsDiscoveryActiveCatId);
    if(!activeCat) return;

    const chipsGrid = document.createElement("div");
    chipsGrid.className = "newsDiscoverySrcChips";
    (activeCat.publishers || []).forEach((pub) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "newsDiscoverySrcChip";
      chip.textContent = pub;
      chip.addEventListener("click", () => {
        if(newsDiscoveryInput) newsDiscoveryInput.value = pub;
        runNewsDiscovery(pub, { fromBrowse: true });
      });
      chipsGrid.appendChild(chip);
    });
    newsDiscoveryBrowse.appendChild(chipsGrid);
  }

  function getNewsDiscoveryCacheKey(query){
    return `${NEWS_DISCOVERY_CACHE_PREFIX}${normalizeDiscoveryText(query)}`;
  }

  function canUseFeedDiscoveryProxy(){
    const proxyBase = String(window.App?.RSS_PROXY_BASE || "").trim();
    if(!proxyBase) return false;
    if(window.location.protocol === "file:" && proxyBase.startsWith("/")) return false;
    return true;
  }

  function getCachedNewsDiscovery(query){
    const cached = window.App?.cacheGet?.(getNewsDiscoveryCacheKey(query));
    if(!cached || typeof cached !== "object") return null;
    if(Date.now() - Number(cached.savedAt || 0) > 15 * 60 * 1000) return null;
    return Array.isArray(cached.results) ? cached.results : null;
  }

  function setCachedNewsDiscovery(query, results){
    if(typeof window.App?.cacheSet !== "function") return;
    window.App.cacheSet(getNewsDiscoveryCacheKey(query), {
      savedAt: Date.now(),
      results: Array.isArray(results) ? results : []
    });
  }

  function escapeHtmlText(value){
    return typeof window.App?.escapeHtml === "function"
      ? window.App.escapeHtml(String(value || ""))
      : String(value || "");
  }

  function normalizeCandidateSiteUrl(rawValue){
    const raw = String(rawValue || "").trim();
    if(!raw) return "";

    try{
      const direct = new URL(raw);
      return `${direct.protocol}//${direct.hostname}`;
    }catch{}

    if(/^([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(raw)){
      try{
        const withHttps = new URL(`https://${raw}`);
        return `${withHttps.protocol}//${withHttps.hostname}`;
      }catch{}
    }

    return "";
  }

  function queryLooksLikeSite(query){
    return !!normalizeCandidateSiteUrl(query);
  }

  function findKnownNewsFeeds(query){
    const normalizedQuery = normalizeDiscoveryText(query).replace(/^https?:\/\//, "");
    if(!normalizedQuery) return [];

    const matchingPresets = findMatchingSourcePresets(normalizedQuery);
    if(matchingPresets.length > 0){
      return dedupeDiscoveryResults(matchingPresets.flatMap((preset) => expandSourcePreset(preset))).slice(0, NEWS_DISCOVERY_MAX_RESULTS);
    }

    return NEWS_DISCOVERY_KNOWN_FEEDS.filter((entry) => {
      if(normalizeDiscoveryText(entry.name).includes(normalizedQuery)) return true;
      if(normalizeDiscoveryText(entry.publisher).includes(normalizedQuery)) return true;
      if(normalizeDiscoveryText(entry.category).includes(normalizedQuery)) return true;
      return (entry.hosts || []).some((host) => {
        return host === normalizedQuery
          || host.includes(normalizedQuery)
          || normalizedQuery.includes(host);
      });
    }).slice(0, NEWS_DISCOVERY_MAX_RESULTS);
  }

  async function fetchTextViaProxy(targetUrl){
    const proxyBase = String(window.App?.RSS_PROXY_BASE || "").trim();
    if(!canUseFeedDiscoveryProxy() || !proxyBase) return "";

    try{
      const response = await fetch(`${proxyBase}${encodeURIComponent(targetUrl)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000)
      });
      if(!response.ok) return "";
      return await response.text();
    }catch{
      return "";
    }
  }

  function collectDiscoveredFeedLinks(htmlText, pageUrl){
    if(!htmlText) return [];

    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const found = [];
    const seen = new Set();
    const selectors = [
      'link[rel~="alternate"][type*="rss"]',
      'link[rel~="alternate"][type*="atom"]',
      'link[rel~="alternate"][type*="xml"]',
      'a[href*="/feed"]',
      'a[href*="/rss"]',
      'a[href*="atom.xml"]'
    ];

    selectors.forEach((selector) => {
      doc.querySelectorAll(selector).forEach((node) => {
        const href = String(node.getAttribute("href") || "").trim();
        if(!href) return;
        try{
          const absolute = new URL(href, pageUrl).toString();
          if(seen.has(absolute)) return;
          seen.add(absolute);
          found.push(absolute);
        }catch{}
      });
    });

    return found;
  }

  async function probeFeedCandidate(feedUrl, fallbackSite){
    const rawUrl = String(feedUrl || "").trim();
    if(!rawUrl) return null;

    const xmlText = await fetchTextViaProxy(rawUrl);
    if(!xmlText) return null;

    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if(doc.querySelector("parsererror")) return null;

    const titleNode = doc.querySelector("channel > title, feed > title");
    const channelLinkNode = doc.querySelector("channel > link");
    const atomLinkNode = doc.querySelector("feed > link[rel='alternate']");
    if(!(titleNode || channelLinkNode || atomLinkNode || doc.querySelector("item, entry"))) return null;

    const meta = await lookupRssSourceMeta(rawUrl);
    let site = String(meta?.site || fallbackSite || "").trim();
    let name = String(meta?.name || titleNode?.textContent || "").trim();

    const alternateHref = String(atomLinkNode?.getAttribute("href") || channelLinkNode?.textContent || "").trim();
    if(!site && alternateHref){
      try{
        const parsedSite = new URL(alternateHref, rawUrl);
        site = `${parsedSite.protocol}//${parsedSite.hostname}`;
      }catch{}
    }

    if(!site){
      try{
        const parsedFeed = new URL(rawUrl);
        site = `${parsedFeed.protocol}//${parsedFeed.hostname}`;
      }catch{}
    }

    if(!name){
      name = fallbackNewsMetaFromRssUrl(site || rawUrl).name || "Source";
    }

    return {
      name,
      rss: rawUrl,
      site,
      reason: "discovered"
    };
  }

  async function discoverFeedFromSite(siteUrl){
    const normalizedSite = normalizeCandidateSiteUrl(siteUrl);
    if(!normalizedSite) return null;

    const known = findKnownNewsFeeds(normalizedSite)[0];
    if(known) return { ...known, reason: "known" };

    const homepageHtml = await fetchTextViaProxy(normalizedSite);
    const candidates = collectDiscoveredFeedLinks(homepageHtml, normalizedSite);

    NEWS_DISCOVERY_COMMON_PATHS.forEach((path) => {
      try{
        const absolute = new URL(path, `${normalizedSite}/`).toString();
        if(!candidates.includes(absolute)) candidates.push(absolute);
      }catch{}
    });

    for(const candidate of candidates.slice(0, 12)){
      const result = await probeFeedCandidate(candidate, normalizedSite);
      if(result) return result;
    }

    return null;
  }

  function extractCandidateSitesFromArticles(items){
    const sites = [];
    const seen = new Set();

    (Array.isArray(items) ? items : []).forEach((item) => {
      const url = String(item?.url || "").trim();
      if(!url) return;
      try{
        const parsed = new URL(url);
        const site = `${parsed.protocol}//${parsed.hostname}`;
        const key = normalizeDiscoveryHost(parsed.hostname);
        if(!key || seen.has(key)) return;
        seen.add(key);
        sites.push(site);
      }catch{}
    });

    return sites;
  }

  function dedupeDiscoveryResults(results){
    const seen = new Set();
    return (Array.isArray(results) ? results : []).filter((result) => {
      const key = `${String(result?.rss || "").trim().toLowerCase()}|${String(result?.site || "").trim().toLowerCase()}`;
      if(!result || !result.rss || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, NEWS_DISCOVERY_MAX_RESULTS);
  }

  async function searchNewsFeedCandidates(query){
    const trimmedQuery = String(query || "").trim();
    if(!trimmedQuery) return [];

    const cached = getCachedNewsDiscovery(trimmedQuery);
    if(cached) return cached;

    const results = [];
    const knownMatches = findKnownNewsFeeds(trimmedQuery);
    if(knownMatches.length){
      results.push(...knownMatches);
    }

    if(!canUseFeedDiscoveryProxy()){
      const finalKnownResults = dedupeDiscoveryResults(results);
      setCachedNewsDiscovery(trimmedQuery, finalKnownResults);
      return finalKnownResults;
    }

    const siteCandidates = [];
    const directSite = normalizeCandidateSiteUrl(trimmedQuery);
    if(directSite) siteCandidates.push(directSite);

    if(siteCandidates.length === 0 || results.length < NEWS_DISCOVERY_MAX_RESULTS){
      try{
        const gNewsItems = typeof window.App?.fetchGNewsItems === "function"
          ? await window.App.fetchGNewsItems(trimmedQuery, 10, false)
          : [];
        siteCandidates.push(...extractCandidateSitesFromArticles(gNewsItems));
      }catch(error){
        window.App?.handleError?.(error, "News Feed Search");
      }
    }

    const probed = [];
    const seenSites = new Set();
    siteCandidates.forEach((candidate) => {
      const key = normalizeCandidateSiteUrl(candidate);
      if(!key || seenSites.has(key)) return;
      seenSites.add(key);
      probed.push(key);
    });

    for(const candidate of probed.slice(0, NEWS_DISCOVERY_MAX_SITE_PROBES)){
      const result = await discoverFeedFromSite(candidate);
      if(result) results.push(result);
      if(results.length >= NEWS_DISCOVERY_MAX_RESULTS) break;
    }

    const finalResults = dedupeDiscoveryResults(results);
    setCachedNewsDiscovery(trimmedQuery, finalResults);
    return finalResults;
  }

  function addDiscoveredNewsSource(result){
    if(!result || !result.rss) return;

    cfg.widgets = cfg.widgets || [];

    const alreadyExists = cfg.widgets.some((widget) => String(widget?.rss || "").trim() === String(result.rss || "").trim());
    if(alreadyExists){
      setStatus("That feed is already in your list", "default");
      renderNewsDiscoveryResults();
      return;
    }

    if(cfg.widgets.length >= NEWS_SOURCE_LIMIT){
      setStatus(`Maximum ${NEWS_SOURCE_LIMIT} sources reached`, "error");
      setNewsDiscoveryStatus("Remove a source before adding another feed.", "error");
      renderNewsDiscoveryResults();
      return;
    }

    cfg.widgets.push({
      name: String(result.name || "Source").trim() || "Source",
      rss: String(result.rss || "").trim(),
      site: String(result.site || "").trim(),
      headlinesCount: 6
    });
    renderNews();
    renderNewsDiscoveryResults();
    setStatus("Added discovered feed (not saved yet)", "unsaved");
    setNewsDiscoveryStatus(`Added ${result.name || "source"}. Click Save Changes to keep it.`, "success");
  }

  function addTopSectionsForPublisher(publisher, maxToAdd = 3){
    const label = String(publisher || "").trim();
    if(!label) return;

    cfg.widgets = cfg.widgets || [];
    const candidates = newsDiscoveryCurrentResults
      .filter((item) => String(item?.publisher || "").trim() === label)
      .sort((a, b) => {
        const ac = normalizeDiscoveryText(a?.category || "");
        const bc = normalizeDiscoveryText(b?.category || "");
        if(ac === "top stories") return -1;
        if(bc === "top stories") return 1;
        return String(a?.name || "").localeCompare(String(b?.name || ""));
      });

    if(candidates.length === 0){
      setNewsDiscoveryStatus(`No section options available for ${label}.`, "error");
      return;
    }

    let added = 0;
    for(const candidate of candidates){
      if(added >= maxToAdd) break;
      if((cfg.widgets || []).length >= NEWS_SOURCE_LIMIT) break;
      const exists = (cfg.widgets || []).some((widget) => String(widget?.rss || "").trim() === String(candidate?.rss || "").trim());
      if(exists) continue;
      cfg.widgets.push({
        name: String(candidate.name || `${label} - Top Stories`).trim(),
        rss: String(candidate.rss || "").trim(),
        site: String(candidate.site || "").trim(),
        headlinesCount: 6
      });
      added += 1;
    }

    renderNews();
    renderNewsDiscoveryResults(newsDiscoveryCurrentResults);

    if(added > 0){
      setStatus(`Added ${added} ${label} source${added === 1 ? "" : "s"} (not saved yet)`, "unsaved");
      setNewsDiscoveryStatus(`Added ${added} top section${added === 1 ? "" : "s"} for ${label}. Click Save Changes to keep them.`, "success");
      return;
    }

    if((cfg.widgets || []).length >= NEWS_SOURCE_LIMIT){
      setStatus(`Maximum ${NEWS_SOURCE_LIMIT} sources reached`, "error");
      setNewsDiscoveryStatus(`No room left. Remove a source before adding more from ${label}.`, "error");
      return;
    }

    setNewsDiscoveryStatus(`All shown ${label} sections are already added.`, "default");
  }

  function renderNewsDiscoveryResults(results){
    if(!newsDiscoveryResults) return;

    const list = Array.isArray(results) ? results : [];
    newsDiscoveryCurrentResults = list.slice();
    newsDiscoveryResults.innerHTML = "";

    if(list.length === 0) return;

    const perPublisherCount = new Map();
    const firstPublisherCardRendered = new Set();
    list.forEach((result) => {
      const publisherKey = String(result?.publisher || result?.name || "").trim();
      perPublisherCount.set(publisherKey, (perPublisherCount.get(publisherKey) || 0) + 1);
    });

    list.forEach((result) => {
      const exists = (cfg.widgets || []).some((widget) => String(widget?.rss || "").trim() === String(result.rss || "").trim());
      const atCapacity = (cfg.widgets || []).length >= NEWS_SOURCE_LIMIT;
      const card = document.createElement("article");
      card.className = "newsDiscoveryCard";

      const sourceLabel = escapeHtmlText(result.name || "Source");
      const siteValue = escapeHtmlText(result.site || "Not available");
      const rssValue = escapeHtmlText(result.rss || "");
      const reasonLabel = result.reason === "preset"
        ? (result.feedType === "topic" ? "Simple topic feed" : "Publisher feed")
        : (result.reason === "known" ? "Known feed" : "Auto-discovered");
      const publisherLabel = escapeHtmlText(result.publisher || result.name || "Source");
      const categoryLabel = escapeHtmlText(result.category || "Top Stories");
      const publisherKey = String(result?.publisher || result?.name || "").trim();
      const canBulkAdd = (perPublisherCount.get(publisherKey) || 0) > 1;
      const isFirstCardForPublisher = !firstPublisherCardRendered.has(publisherKey);
      if(isFirstCardForPublisher) firstPublisherCardRendered.add(publisherKey);

      card.innerHTML = `
        <div class="newsDiscoveryCardHead">
          <div>
            <div class="newsDiscoveryName">${publisherLabel}</div>
            <div class="newsDiscoverySection">${categoryLabel}</div>
            <div class="newsDiscoveryBadge">${reasonLabel}</div>
          </div>
        </div>
        <div class="newsDiscoveryMeta">
          <div class="newsDiscoveryMetaRow">
            <span class="newsDiscoveryMetaLabel">Site</span>
            <span class="newsDiscoveryMetaValue">${siteValue}</span>
          </div>
          <div class="newsDiscoveryMetaRow">
            <span class="newsDiscoveryMetaLabel">Feed</span>
            <span class="newsDiscoveryMetaValue newsDiscoveryMetaValue--mono">${rssValue}</span>
          </div>
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "newsDiscoveryActions";

      if(canBulkAdd && isFirstCardForPublisher){
        const topBtn = document.createElement("button");
        topBtn.type = "button";
        topBtn.className = "btn newsDiscoveryBulkBtn";
        topBtn.textContent = "Add Top 3";
        topBtn.disabled = atCapacity;
        topBtn.title = atCapacity
          ? `Maximum ${NEWS_SOURCE_LIMIT} sources reached`
          : `Add up to 3 top sections for ${publisherKey}`;
        if(!atCapacity){
          topBtn.addEventListener("click", () => addTopSectionsForPublisher(publisherKey, 3));
        }
        actions.appendChild(topBtn);
      }

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn newsDiscoveryAddBtn";

      if(exists){
        addBtn.disabled = true;
        addBtn.textContent = "Already Added";
      }else if(atCapacity){
        addBtn.disabled = true;
        addBtn.textContent = `Max ${NEWS_SOURCE_LIMIT} Reached`;
      }else{
        addBtn.textContent = "Add This Source";
        addBtn.addEventListener("click", () => addDiscoveredNewsSource(result));
      }

      actions.appendChild(addBtn);
      card.appendChild(actions);
      newsDiscoveryResults.appendChild(card);
    });
  }

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
      empty.textContent = "No symbols yet. Use symbol lookup above to add your first stock or fund.";
      stocksEditor.appendChild(empty);
    }
    renderStockAssignTargetOptions();
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

    // Disable add button if at max capacity
    if(addNewsBtn){
      addNewsBtn.disabled = list.length >= NEWS_SOURCE_LIMIT;
      addNewsBtn.title = list.length >= NEWS_SOURCE_LIMIT ? `Maximum ${NEWS_SOURCE_LIMIT} sources reached` : "Add a new news source";
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

    addNewsBtn.classList.remove("addNewsCardBtn");
    addNewsBtn.classList.add("btnSettings");
    addNewsBtn.textContent = "+ Add News Source Manually";
    renderNewsDiscoveryResults();
  }

  // Load config to UI
  function loadToUI(){
    themeSel.value = cfg.theme || "dark";
    if(renderModeSel) renderModeSel.value = cfg.renderMode || "smooth";
    startupPageSel.value = cfg.startupPage || "news";
    zipInput.value = cfg.zipCode || "";
    wxRefreshInput.value = String(cfg.weatherRefreshMinutes || 10);
    if(weatherStaleWarnInput) weatherStaleWarnInput.value = String(cfg.weatherStaleWarnMinutes || 30);

    // Sync location tab selection and current display
    if(cfg.useDeviceLocation && cfg.deviceLocationLabel) {
      settLocMode = "city"; // device location was set via city/GPS
      settLocTabs.forEach(b => {
        const mode = b.dataset.settLocMode;
        b.classList.toggle("active", mode === "city");
        b.setAttribute("aria-selected", String(mode === "city"));
      });
      settLocPanels.forEach(p => { p.hidden = p.dataset.settLocPanel !== "city"; });
      if(settLocCityInput) settLocCityInput.value = cfg.deviceLocationLabel;
    }
    settLocUpdateCurrentDisplay();

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
    updateButtonGroupState(stocksNewsButtons, cfg.stocksNewsMode || "watchlist");
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
    if(renderModeSel) cfg.renderMode = renderModeSel.value;
    cfg.startupPage = startupPageSel.value;
    cfg.zipCode = String(zipInput.value || "").trim();
    cfg.weatherRefreshMinutes = Number(wxRefreshInput.value || 10);
    if(weatherStaleWarnInput){
      cfg.weatherStaleWarnMinutes = Number(weatherStaleWarnInput.value || 30);
    }

    // If ZIP mode is active and no pending geo was applied, clear device location mode
    if(settLocMode === "zip") {
      cfg.useDeviceLocation = false;
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

    const activeStocksNewsBtn = document.querySelector("[data-field='stocksNewsMode'].active");
    if(activeStocksNewsBtn){
      cfg.stocksNewsMode = activeStocksNewsBtn.dataset.value;
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
      } else if(field === "stocksNewsMode"){
        cfg.stocksNewsMode = value;
        updateButtonGroupState(stocksNewsButtons, value);
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

  if(renderModeSel){
    renderModeSel.addEventListener("change", () => {
      cfg.renderMode = renderModeSel.value;
      applyThemeDensity(cfg); // Live preview
      setStatus("Modified (not saved yet)", "unsaved");
    });
  }

  startupPageSel.addEventListener("change", () => {
    cfg.startupPage = startupPageSel.value;
    setStatus("Modified (not saved yet)", "unsaved");
  });

  // ── Location section (Weather tab) ────────────────────────────────────────
  const settLocTabs = document.querySelectorAll("[data-sett-loc-mode]");
  const settLocPanels = document.querySelectorAll("[data-sett-loc-panel]");
  const settLocZipVerifyBtn = document.getElementById("settLocZipVerifyBtn");
  const settLocCityInput = document.getElementById("settLocCityInput");
  const settLocCityFindBtn = document.getElementById("settLocCityFindBtn");
  const settLocGpsBtn = document.getElementById("settLocGpsBtn");
  const settLocCurrentDisplay = document.getElementById("settLocCurrentDisplay");
  const settLocApplyRow = document.getElementById("settLocApplyRow");
  const settLocFoundLabel = document.getElementById("settLocFoundLabel");
  const settLocApplyBtn = document.getElementById("settLocApplyBtn");
  const settLocCancelGeoBtn = document.getElementById("settLocCancelGeoBtn");
  let settLocMode = "zip";
  let settLocPendingGeo = null;

  function settLocShowStatus(id, msg, type = "") {
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = msg;
    el.className = "locationPickerStatus" + (type ? " " + type : "");
  }

  function settLocUpdateCurrentDisplay() {
    if(!settLocCurrentDisplay) return;
    if(cfg.useDeviceLocation && cfg.deviceLocationLabel) {
      settLocCurrentDisplay.textContent = "Current: " + cfg.deviceLocationLabel;
    } else if(cfg.zipCode) {
      settLocCurrentDisplay.textContent = "Current: ZIP " + cfg.zipCode;
    } else {
      settLocCurrentDisplay.textContent = "";
    }
  }

  function settLocShowApply(geo, label) {
    settLocPendingGeo = geo;
    if(settLocFoundLabel) settLocFoundLabel.textContent = "Found: " + label;
    if(settLocApplyRow) settLocApplyRow.hidden = false;
  }

  function settLocHideApply() {
    settLocPendingGeo = null;
    if(settLocApplyRow) settLocApplyRow.hidden = true;
  }

  // Tab switching
  settLocTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.settLocMode;
      settLocMode = mode;
      settLocTabs.forEach(b => {
        b.classList.toggle("active", b.dataset.settLocMode === mode);
        b.setAttribute("aria-selected", String(b.dataset.settLocMode === mode));
      });
      settLocPanels.forEach(p => { p.hidden = p.dataset.settLocPanel !== mode; });
      settLocHideApply();
      ["settLocZipStatus", "settLocCityStatus", "settLocGpsStatus"].forEach(id => settLocShowStatus(id, ""));
    });
  });

  // City geocode helper (mirrors weather.js geocodeCityName)
  async function settLocGeocodeCityName(query) {
    const q = String(query || "").trim();
    if(!q) return null;
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) return null;
    const j = await res.json();
    const row = Array.isArray(j?.results) ? j.results[0] : null;
    if(!row) return null;
    const city = String(row.name || "").trim();
    const state = String(row.admin1 || "").trim();
    const abbrev = typeof window.App.abbreviateState === "function" ? window.App.abbreviateState(state) : state;
    const label = [city, abbrev].filter(Boolean).join(", ") || city;
    const lat = Number(row.latitude), lon = Number(row.longitude);
    if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { city, state, lat, lon, label, zipCode: "" };
  }

  // ZIP verify
  async function doSettLocVerifyZip() {
    const val = (zipInput?.value || "").trim();
    if(!/^\d{5}$/.test(val)) {
      settLocShowStatus("settLocZipStatus", "Enter a 5-digit ZIP code.", "isError");
      return;
    }
    settLocShowStatus("settLocZipStatus", "Looking up\u2026");
    try {
      const geo = typeof window.App.geocodeZip === "function" ? await window.App.geocodeZip(val) : null;
      if(geo && geo.lat) {
        const abbrev = typeof window.App.abbreviateState === "function" ? window.App.abbreviateState(geo.state || "") : (geo.state || "");
        const label = [geo.city, abbrev].filter(Boolean).join(", ") || val;
        settLocShowStatus("settLocZipStatus", "\u2713 " + label, "isSuccess");
      } else {
        settLocShowStatus("settLocZipStatus", "No location found for that ZIP.", "isError");
      }
    } catch(e) {
      settLocShowStatus("settLocZipStatus", "Lookup failed. Try again.", "isError");
    }
  }

  settLocZipVerifyBtn?.addEventListener("click", doSettLocVerifyZip);
  zipInput?.addEventListener("keydown", e => { if(e.key === "Enter") doSettLocVerifyZip(); });

  // City find
  async function doSettLocFindCity() {
    const val = (settLocCityInput?.value || "").trim();
    if(!val) { settLocShowStatus("settLocCityStatus", "Enter a city name.", "isError"); return; }
    settLocShowStatus("settLocCityStatus", "Looking up\u2026");
    settLocHideApply();
    try {
      const geo = await settLocGeocodeCityName(val);
      if(geo && Number.isFinite(geo.lat)) {
        settLocShowStatus("settLocCityStatus", "");
        settLocShowApply({ ...geo, source: "manual-city" }, geo.label);
      } else {
        settLocShowStatus("settLocCityStatus", "City not found. Try \u2018City, ST\u2019 format.", "isError");
      }
    } catch(e) {
      settLocShowStatus("settLocCityStatus", "Lookup failed. Try again.", "isError");
    }
  }

  settLocCityFindBtn?.addEventListener("click", doSettLocFindCity);
  settLocCityInput?.addEventListener("keydown", e => { if(e.key === "Enter") doSettLocFindCity(); });

  // GPS
  settLocGpsBtn?.addEventListener("click", async () => {
    if(!("geolocation" in navigator)) {
      settLocShowStatus("settLocGpsStatus", "GPS not available in this browser.", "isError");
      return;
    }
    settLocShowStatus("settLocGpsStatus", "Requesting location\u2026");
    settLocHideApply();
    try {
      const pos = typeof window.App.getCurrentPositionAsync === "function"
        ? await window.App.getCurrentPositionAsync()
        : await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }));
      const lat = Number(pos?.coords?.latitude), lon = Number(pos?.coords?.longitude);
      if(!Number.isFinite(lat) || !Number.isFinite(lon)) {
        settLocShowStatus("settLocGpsStatus", "Could not read GPS coordinates.", "isError");
        return;
      }
      settLocShowStatus("settLocGpsStatus", "Resolving address\u2026");
      const rev = typeof window.App.reverseGeocodeCoords === "function" ? await window.App.reverseGeocodeCoords(lat, lon) : null;
      const label = rev?.label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      settLocShowStatus("settLocGpsStatus", "");
      settLocShowApply({ lat, lon, city: rev?.city || "", state: rev?.state || "", label, source: "gps", zipCode: rev?.zipCode || "" }, label);
    } catch(e) {
      const denied = e?.code === 1 || /denied/i.test(e?.message || "");
      settLocShowStatus("settLocGpsStatus", denied ? "Permission denied. Allow location in browser settings." : "GPS lookup failed. Try again.", "isError");
    }
  });

  // Apply pending geo (saves immediately)
  settLocApplyBtn?.addEventListener("click", () => {
    if(!settLocPendingGeo) return;
    const geo = settLocPendingGeo;
    cfg.useDeviceLocation = true;
    cfg.deviceLat = Number(geo.lat);
    cfg.deviceLon = Number(geo.lon);
    cfg.deviceLocationLabel = geo.label;
    if(geo.zipCode && /^\d{5}$/.test(geo.zipCode)) {
      cfg.zipCode = geo.zipCode;
      if(zipInput) zipInput.value = geo.zipCode;
    }
    settLocHideApply();
    settLocUpdateCurrentDisplay();
    setStatus("Location updated \u2014 click Save Changes to keep", "unsaved");
  });

  settLocCancelGeoBtn?.addEventListener("click", settLocHideApply);

  // Location & Weather settings
  zipInput?.addEventListener("input", () => {
    cfg.useDeviceLocation = false; // typing a ZIP clears device mode
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

  stockLookupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    runStockLookup(String(stockLookupInput?.value || ""));
  });

  // Stock lookup modal
  const stockLookupModal = document.getElementById("stockLookupModal");
  const stockLookupModalBackdrop = document.getElementById("stockLookupModalBackdrop");
  const stockLookupModalClose = document.getElementById("stockLookupModalClose");
  const addStockBtn = document.getElementById("addStockBtn");

  function openStockLookupModal(){
    if(!stockLookupModal) return;
    renderStockAssignTargetOptions();
    if(stockLookupInput) stockLookupInput.value = "";
    if(stockLookupResults) stockLookupResults.innerHTML = "";
    setStockLookupStatus("", "default");
    stockLookupModal.hidden = false;
    document.body.classList.add("stockLookupModalOpen");
    requestAnimationFrame(() => stockLookupInput?.focus());
  }

  function closeStockLookupModal(){
    if(!stockLookupModal) return;
    stockLookupModal.hidden = true;
    document.body.classList.remove("stockLookupModalOpen");
    addStockBtn?.focus();
  }

  addStockBtn?.addEventListener("click", openStockLookupModal);
  stockLookupModalClose?.addEventListener("click", closeStockLookupModal);
  stockLookupModalBackdrop?.addEventListener("click", closeStockLookupModal);
  stockLookupModal?.addEventListener("keydown", (e) => {
    if(e.key === "Escape") closeStockLookupModal();
  });

  // News discovery modal
  const newsDiscoveryModal = document.getElementById("newsDiscoveryModal");
  const newsDiscoveryModalBackdrop = document.getElementById("newsDiscoveryModalBackdrop");
  const newsDiscoveryModalClose = document.getElementById("newsDiscoveryModalClose");
  const addNewsSourceBtn = document.getElementById("addNewsSourceBtn");

  function openNewsDiscoveryModal(){
    if(!newsDiscoveryModal) return;
    if(newsDiscoveryInput) newsDiscoveryInput.value = "";
    if(newsDiscoveryResults) newsDiscoveryResults.innerHTML = "";
    setNewsDiscoveryStatus("", "default");
    setManualNewsMode(false);
    renderNewsDiscoveryBrowse();
    newsDiscoveryModal.hidden = false;
    document.body.classList.add("newsDiscoveryModalOpen");
    requestAnimationFrame(() => newsDiscoveryInput?.focus());
  }

  function closeNewsDiscoveryModal(){
    if(!newsDiscoveryModal) return;
    newsDiscoveryModal.hidden = true;
    document.body.classList.remove("newsDiscoveryModalOpen");
    addNewsSourceBtn?.focus();
  }

  addNewsSourceBtn?.addEventListener("click", openNewsDiscoveryModal);
  newsDiscoveryModalClose?.addEventListener("click", closeNewsDiscoveryModal);
  newsDiscoveryModalBackdrop?.addEventListener("click", closeNewsDiscoveryModal);
  newsDiscoveryModal?.addEventListener("keydown", (e) => {
    if(e.key === "Escape") closeNewsDiscoveryModal();
  });

  // Add news (manual blank row — triggered from inside the modal)
  addNewsBtn.addEventListener("click", () => {
    cfg.widgets = cfg.widgets || [];
    if(cfg.widgets.length >= NEWS_SOURCE_LIMIT){
      setStatus(`Maximum ${NEWS_SOURCE_LIMIT} sources reached`, "error");
      return;
    }
    cfg.widgets.push({ name:"", rss:"", site:"", headlinesCount:6 });
    renderNews();
    setStatus("Added (not saved yet)", "unsaved");
  });

  newsManualToggle?.addEventListener("click", () => {
    const nextExpanded = newsManualToggle.getAttribute("aria-expanded") !== "true";
    setManualNewsMode(nextExpanded);
  });

  async function runNewsDiscovery(rawQuery, options = {}){
    const { fromBrowse = false } = options;
    const query = String(rawQuery || "").trim();
    if(!query){
      setNewsDiscoveryStatus("Enter a publisher name or website first.", "error");
      if(newsDiscoveryResults) newsDiscoveryResults.innerHTML = "";
      return;
    }

    const runId = ++newsDiscoveryRunId;
    setNewsDiscoveryBusy(true);
    setNewsDiscoveryStatus(fromBrowse ? `Loading options for \"${query}\"...` : `Searching for feeds matching \"${query}\"...`, "loading");
    if(newsDiscoveryResults) newsDiscoveryResults.innerHTML = "";

    try{
      const results = await searchNewsFeedCandidates(query);
      if(runId !== newsDiscoveryRunId) return;

      renderNewsDiscoveryResults(results);

      if(results.length === 0){
        setManualNewsMode(true);
        const hint = !canUseFeedDiscoveryProxy()
          ? "Simple feed suggestions need the app's RSS proxy, so discovery is unavailable in this local preview. You can still paste an RSS URL manually below."
          : (queryLooksLikeSite(query)
            ? "We could not confirm a working RSS/Atom feed for that site. You can still paste a feed URL manually below."
            : "We could not find simple feed options from that search. Try the publication's website address or paste a feed URL manually below.");
        setNewsDiscoveryStatus(hint, "error");
        return;
      }

      const publishers = Array.from(new Set(results.map((result) => String(result?.publisher || "").trim()).filter(Boolean)));
      const noun = results.length === 1 ? "option" : "options";
      setNewsDiscoveryStatus(
        publishers.length === 1
          ? `Found ${results.length} ${noun} for ${publishers[0]}. Pick the section you want.`
          : (publishers.length > 1
            ? `Found ${results.length} ${noun} across ${publishers.length} publishers. Pick the section you want.`
            : `Found ${results.length} feed ${noun}. Pick the one you want.`)
          ,
        "success"
      );
    }catch(error){
      window.App?.handleError?.(error, "News Feed Discovery");
      if(runId !== newsDiscoveryRunId) return;
      if(newsDiscoveryResults) newsDiscoveryResults.innerHTML = "";
      setManualNewsMode(true);
      setNewsDiscoveryStatus("Feed search is unavailable right now. You can still paste an RSS URL manually below.", "error");
    }finally{
      if(runId === newsDiscoveryRunId){
        setNewsDiscoveryBusy(false);
      }
    }
  }

  newsDiscoveryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    runNewsDiscovery(String(newsDiscoveryInput?.value || ""));
  });

  setManualNewsMode(false);
  renderNewsDiscoveryBrowse();

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
  let pendingInstallClick = false;
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

  // Render browser-specific install guide into #installBrowserGuide
  function renderInstallGuide(browser) {
    const guide = document.getElementById("installBrowserGuide");
    if (!guide) return;

    const isChromium = browser.isChrome || browser.isEdge || browser.isBrave || browser.isOpera || browser.isDuckDuckGo;

    // Chromium — native install dialog handles Desktop/Start menu/Taskbar; just explain + offer shortcut
    if (isChromium) {
      const name = browser.isBrave ? "Brave" : browser.isEdge ? "Edge" : browser.isOpera ? "Opera" : browser.isDuckDuckGo ? "DuckDuckGo" : "Chrome";
      let bodyHtml = "";
      if (browser.isAndroid) {
        bodyHtml = `<p class="installGuideNote">Tap <strong>Install</strong> above to add the app to your home screen and app drawer.</p>`;
      } else if (browser.isWindows) {
        bodyHtml = `<p class="installGuideNote">${name}'s install dialog lets you choose where to add the app &mdash; <strong>Desktop</strong>, <strong>Start menu</strong>, and/or <strong>Taskbar</strong>.</p>
          <p class="installGuideNote installGuideSub">Prefer just a shortcut? <button id="downloadDesktopShortcutBtn" type="button" class="installGuideLinkBtn">Download desktop shortcut (.url)</button></p>`;
      } else if (browser.isMac) {
        bodyHtml = `<p class="installGuideNote">${name}'s install dialog adds the app to your <strong>Applications</strong> folder and Dock.</p>`;
      } else {
        bodyHtml = `<p class="installGuideNote">Click <strong>Install</strong> above to add the app to your system.</p>`;
      }
      guide.innerHTML = bodyHtml;
      const shortcutBtn = guide.querySelector("#downloadDesktopShortcutBtn");
      if (shortcutBtn) shortcutBtn.addEventListener("click", () => downloadWindowsDesktopShortcut());
      return;
    }

    // Non-Chromium — numbered manual steps
    let title = "";
    let steps = [];
    let note = "";

    if (browser.isSafari && browser.isIOS) {
      title = "Install on iPhone / iPad (Safari)";
      steps = [
        'Tap the <strong>Share button</strong> (&#9633;&#8593;) at the bottom of the screen',
        'Scroll down and tap <strong>Add to Home Screen</strong>',
        'Tap <strong>Add</strong> in the top right to confirm',
      ];
    } else if (browser.isSafari) {
      title = "Install on macOS (Safari)";
      steps = [
        'In the menu bar, click <strong>File</strong>',
        'Select <strong>Add to Dock</strong>',
      ];
      note = "Requires macOS Sonoma (14) or later with Safari 17+.";
    } else if (browser.isFirefox && browser.isAndroid) {
      title = "Install on Android (Firefox)";
      steps = [
        'Tap the <strong>menu</strong> (&#8942;) in the top right',
        'Tap <strong>Install</strong> or <strong>Add to Home screen</strong>',
      ];
    } else if (browser.isFirefox) {
      title = "Install in Firefox";
      steps = [
        'Look for the <strong>install icon</strong> (a download arrow &#8659; in a tray) at the right end of the address bar &mdash; click it, then click <strong>Install</strong>',
        'Or: open the menu (&#9776;) and choose <strong>Install this site as an app</strong>',
      ];
      if (browser.isWindows) {
        note = 'Or: <button id="downloadDesktopShortcutBtn" type="button" class="installGuideLinkBtn">download a desktop shortcut</button> without a full install.';
      }
    } else if (browser.isDuckDuckGo && browser.isAndroid) {
      title = "Install on Android (DuckDuckGo)";
      steps = [
        'Tap the <strong>menu</strong> (&#8942;) in the top right',
        'Tap <strong>Add to Home screen</strong>',
        'Tap <strong>Add</strong> to confirm',
      ];
    } else {
      title = "Install in " + browser.name;
      steps = [
        'Look for an <strong>install icon</strong> in the address bar',
        'Or open the browser menu and look for <strong>Install</strong>, <strong>Add to Home Screen</strong>, or <strong>Add to Dock</strong>',
      ];
    }

    const stepsHtml = steps.map((s) => `<li>${s}</li>`).join("");
    const noteHtml = note ? `<p class="installGuideNote">${note}</p>` : "";
    guide.innerHTML = `<p class="installGuideTitle">${title}</p><ol class="installGuideSteps">${stepsHtml}</ol>${noteHtml}`;
    const shortcutBtn = guide.querySelector("#downloadDesktopShortcutBtn");
    if (shortcutBtn) shortcutBtn.addEventListener("click", () => downloadWindowsDesktopShortcut());
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

  // Listen for beforeinstallprompt event — only fires on Chromium-based browsers
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    canAutoInstall = true;
    // Reveal the install button now that native prompt is available
    if (installAppBtn) {
      installAppBtn.style.display = "";
      installAppBtn.disabled = false;
      if (installBtnText && installBtnText.textContent === "Preparing install…") {
        installBtnText.textContent = installAppBtn.dataset.origLabel || "Install HAPPENING NOW!";
      }
    }
    // User clicked install before the event fired — trigger now
    if (pendingInstallClick) {
      pendingInstallClick = false;
      installAppBtn?.click();
    }
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
        // beforeinstallprompt not ready yet — queue the click and wait for it to fire
        const b = detectBrowser();
        const isChromium = b.isChrome || b.isEdge || b.isBrave || b.isOpera || b.isDuckDuckGo;
        if (isChromium) {
          // Only queue if we're on a secure origin where the event can still fire
          const isSecure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
          if (!isSecure) {
            const guide = document.getElementById("installBrowserGuide");
            if (guide) guide.innerHTML = `<p class="installGuideNote"><strong>Install button unavailable.</strong> Install prompts require a secure connection (HTTPS). This page is being served over ${location.protocol}</p>`;
            if (installAppBtn) installAppBtn.style.display = "none";
            return;
          }
          pendingInstallClick = true;
          if (installAppBtn) {
            installAppBtn.dataset.origLabel = installBtnText?.textContent || "Install HAPPENING NOW!";
            installAppBtn.disabled = true;
          }
          if (installBtnText) installBtnText.textContent = "Preparing install…";
        } else {
          showInstallModal();
        }
      }
    });
  }

  // Listen for app installed event
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App was installed');
    if (installAppBtn) installAppBtn.style.display = "none";
    if (installStatus) installStatus.style.display = "block";
    if (installStatusText) installStatusText.textContent = "Successfully installed!";
    const guide = document.getElementById("installBrowserGuide");
    if (guide) guide.innerHTML = "";
    setTimeout(hideInstallModal, 500);
  });

  // Initialize install state
  if (!checkInstalled()) {
    const browser = detectBrowser();
    renderInstallGuide(browser);
    // Show install button immediately for Chromium-based browsers
    // (beforeinstallprompt fires asynchronously; show button now, native dialog activates it)
    const isChromium = browser.isChrome || browser.isEdge || browser.isBrave || browser.isOpera || browser.isDuckDuckGo;
    if (installAppBtn && isChromium) {
      installAppBtn.style.display = "";
      if (installBtnText) {
        if (browser.isEdge) installBtnText.textContent = "Install in Edge";
        else if (browser.isBrave) installBtnText.textContent = "Install in Brave";
        else if (browser.isOpera) installBtnText.textContent = "Install in Opera";
        else if (browser.isDuckDuckGo) installBtnText.textContent = "Install in DuckDuckGo";
        else installBtnText.textContent = "Install in Chrome";
      }

      // Timeout: if beforeinstallprompt never fires the site isn't installable here
      // (file://, non-HTTPS, already installed in another profile, etc.)
      setTimeout(() => {
        if (canAutoInstall) return; // already fired, all good
        // Cancel any pending click
        pendingInstallClick = false;
        if (installAppBtn) {
          installAppBtn.disabled = false;
          installAppBtn.style.display = "none";
        }
        const guide = document.getElementById("installBrowserGuide");
        if (guide) {
          const isSecure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
          const reason = isSecure
            ? "The browser hasn't offered an install prompt. The app may already be installed, or the browser requires an interaction first."
            : "Install prompts require a secure connection (HTTPS). This page is being served over " + location.protocol;
          guide.innerHTML = `<p class="installGuideNote"><strong>Install button unavailable.</strong> ${reason}</p>
            <p class="installGuideNote installGuideSub">Look for the install icon (&#10010; or monitor icon) in the address bar, or open the menu (&#8942;) and choose <strong>Install HAPPENING NOW</strong>.</p>`;
        }
        console.log('[PWA] beforeinstallprompt did not fire — install button hidden.');
      }, 5000);
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
