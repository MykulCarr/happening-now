(() => {
  "use strict";

  let { cfg, applyThemeDensity } = window.App;
  // ---- pieces of this page that live in their own files ----
  // settings-*.js load just before this file and put their parts on S;
  // they read this file's settings object and helpers through S too.
  const S = (window.App.settingsPage ||= {});
  Object.defineProperty(S, "cfg", { get: () => cfg, set: (v) => { cfg = v; }, configurable: true });
  S.renderStocks = renderStocks;
  const { lookupSymbolName, renderStockAssignTargetOptions, runStockLookup, stockLookupForm, stockLookupInput } = S;
  const { AUTO_MARKET_INDICES_SORT_MODE, renderCurrencies, renderMarketIndices, sortMarketIndices } = S;
  S.setStatus = setStatus;

  // Apply theme, density, and font size on page load
  applyThemeDensity(cfg);
  const saveStatus = document.getElementById("saveStatus");

  // Tab elements
  const tabButtons = document.querySelectorAll(".settingsTab");
  const tabContents = document.querySelectorAll(".settingsTabContent");

  // Collapsible sections
  const collapsibleHeaders = document.querySelectorAll(".collapsibleHeader");
  const stocksHeaderInfoToggle = document.getElementById("stocksHeaderInfoToggle");
  const stocksHeaderGuide = document.getElementById("stocksHeaderGuide");

  // General inputs
  const themeSel = document.getElementById("themeSel");
  const renderModeSel = document.getElementById("renderModeSel");
  const startupPageSel = document.getElementById("startupPageSel");
  const marketGroupSel = document.getElementById("marketGroupSel");
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
  const newsTickerScopeButtons = document.querySelectorAll("[data-field='newsTickerScope']");
  // News
  const stocksEditor = document.getElementById("stocksEditor");
  // News editors split by scope: each section is a filtered view of
  // cfg.widgets — National shows widgets whose scopes[] includes 'national',
  // International shows those tagged 'international'. A widget tagged for
  // both appears in both sections; editing in either updates the same
  // underlying cfg.widgets entry.
  const newsSourceCounts = {
    national: document.getElementById("newsNationalCount"),
    international: document.getElementById("newsInternationalCount"),
  };
  const newsEditorNational = document.getElementById("newsEditorNational");
  const newsEditorInternational = document.getElementById("newsEditorInternational");
  const addNationalSourceBtn = document.getElementById("addNationalSourceBtn");
  const addInternationalSourceBtn = document.getElementById("addInternationalSourceBtn");

  // System
  const resetBtn = document.getElementById("resetBtn");

  // Status pill beside the page title. type is one of
  // "default" | "unsaved" | "saved" | "error".
  //
  // Settings save themselves (2026-10-18). There used to be a Save Changes
  // button and no unsaved-changes warning, so leaving the page quietly lost
  // edits, while the Local/State sections and the news lists saved
  // instantly. Every edit in this file already announces itself with
  // setStatus(..., "unsaved"), so that announcement is the save trigger:
  // one hook, no per-control wiring to forget.
  function setStatus(msg, type = "default"){
    if(!saveStatus) return;
    if(type === "unsaved"){
      scheduleSave();
      msg = "Saving…";
    }
    saveStatus.textContent = msg;
    saveStatus.className = `statusIndicator ${type}`;
  }

  // Debounced so a burst (tapping a stepper, typing a number) is one write.
  const SAVE_DELAY_MS = 500;
  let saveTimer = 0;
  function scheduleSave(){
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(doSave, SAVE_DELAY_MS);
  }
  // Leaving inside the debounce window must not drop the edit.
  function flushSave(){
    if(!saveTimer) return;
    window.clearTimeout(saveTimer);
    doSave();
  }
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden") flushSave(); });

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

  // Collapsible sections. Only the News tab actually collapses — its sections
  // ship closed (no "expanded" class in the markup) and the whole header
  // toggles. On the other tabs the arrow is hidden by CSS and the header is
  // just a label, so we don't wire a click at all.
  collapsibleHeaders.forEach(header => {
    if(!header.querySelector(".collapsibleArrowHit")){
      const arrow = document.createElement("span");
      arrow.className = "collapsibleArrowHit";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "►";
      header.appendChild(arrow);
    }

    if(!header.closest('.settingsTabContent[data-tab="news"]')) return;

    header.setAttribute("aria-expanded", String(header.classList.contains("expanded")));

    header.addEventListener("click", (event) => {
      // The "i" tips toggle lives inside the header and owns its own clicks.
      if(event.target.closest(".collapsibleHeaderInfo")) return;
      setSectionExpanded(header, !header.classList.contains("expanded"));
    });
  });

  function setSectionExpanded(header, open){
    if(!header || !header.classList.contains("collapsibleHeader")) return;
    const body = header.nextElementSibling;
    header.classList.toggle("expanded", open);
    if(body) body.classList.toggle("expanded", open);
    header.setAttribute("aria-expanded", String(open));
  }

  function attachHeaderGuideToggle(toggleEl, panelEl){
    if(!(toggleEl && panelEl)) return;

    let closeTimer = 0;

    const openGuide = () => {
      // The tips panel sits inside the section body. On the News tab that body
      // starts collapsed, so open it too or the "i" looks like a dead button.
      const section = panelEl.closest(".collapsibleBody");
      if(section && !section.classList.contains("expanded")){
        setSectionExpanded(section.previousElementSibling, true);
      }
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

  const WELL_KNOWN_SOURCE_NAMES = {
    // Major US news
    "apnews.com": "AP News",       "ap.org": "AP News",
    "reuters.com": "Reuters",
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

  const NEWS_SOURCE_LIMIT = 15; // national + international combined
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
        setStatus("Auto-filled name", "unsaved");
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
        setStatus("Reordered", "unsaved");
      });

      const del = createIconButton("✕", "Remove");
      del.classList.add("stockDeleteBtn");
      del.addEventListener("click", () => {
        cfg.stocks.splice(idx, 1);
        renderStocks();
        setStatus("Removed", "unsaved");
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
        setStatus("Reordered", "unsaved");
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

  // ── National / International source lists ───────────────────────
  // cfg.widgets is one array; each widget's scopes[] says which tab(s) it
  // shows on. These lists save on every change, like the Local and State
  // sections beside them — the old editor waited for a Save button with no
  // unsaved-changes warning, so a picked source was easy to lose.
  const scopesOf = (w) => Array.isArray(w?.scopes) && w.scopes.length ? w.scopes : ["national"];

  function commitWidgets(message){
    const saved = window.App.saveConfig({ ...(window.App?.cfg || cfg), widgets: cfg.widgets || [] });
    cfg.widgets = saved.widgets; // keep any other unsaved edits in cfg intact
    renderNews();
    if(message) setStatus(message, "saved");
  }

  // Add a feed to a scope. Returns an error message, or "" on success.
  function addWidgetToScope(scope, entry){
    cfg.widgets = cfg.widgets || [];
    const rss = String(entry?.rss || "").trim();
    if(!rss) return "That source has no feed address.";
    const existing = cfg.widgets.find((w) => w.rss === rss);
    if(existing){
      // One widget per feed (normalizeConfig dedupes by rss), so a feed
      // picked for a second tab gains that scope instead of a copy.
      if(!scopesOf(existing).includes(scope)) existing.scopes = [...scopesOf(existing), scope];
    }else{
      if(cfg.widgets.length >= NEWS_SOURCE_LIMIT){
        return `You're at the ${NEWS_SOURCE_LIMIT}-source limit (National and International combined). Remove one first.`;
      }
      cfg.widgets.push({
        name: String(entry.name || "Source").trim() || "Source",
        rss,
        site: String(entry.site || "").trim(),
        headlinesCount: 5,
        scopes: [scope]
      });
    }
    commitWidgets(`Added ${entry.name || "source"}`);
    return "";
  }

  function removeWidgetFromScope(scope, rss){
    const i = (cfg.widgets || []).findIndex((w) => w.rss === rss);
    if(i < 0) return;
    const w = cfg.widgets[i];
    const rest = scopesOf(w).filter((s) => s !== scope);
    if(rest.length) w.scopes = rest;
    else cfg.widgets.splice(i, 1);
    commitWidgets(`Removed ${w.name || "source"}`);
  }

  // Move a widget up/down among the widgets of the same scope. Buttons, not
  // drag-and-drop: HTML5 drag never fired on phone touchscreens.
  function moveWidgetInScope(scope, rss, dir){
    const inScope = cfg.widgets.map((w, idx) => ({ w, idx })).filter(({ w }) => scopesOf(w).includes(scope));
    const pos = inScope.findIndex(({ w }) => w.rss === rss);
    const other = inScope[pos + dir];
    if(pos < 0 || !other) return;
    const a = inScope[pos].idx, b = other.idx;
    [cfg.widgets[a], cfg.widgets[b]] = [cfg.widgets[b], cfg.widgets[a]];
    commitWidgets("Reordered");
    newsEditors[scope]?.querySelector(`[data-rss="${CSS.escape(rss)}"] [data-move="${dir}"]`)?.focus();
  }

  const newsEditors = { national: newsEditorNational, international: newsEditorInternational };

  function renderNews(){
    renderNewsByScope("national");
    renderNewsByScope("international");
  }

  function renderNewsByScope(scope){
    const editorEl = newsEditors[scope];
    if(!editorEl) return;
    const list = (cfg.widgets || []).filter((w) => scopesOf(w).includes(scope));
    const countEl = newsSourceCounts[scope];
    if(countEl) countEl.textContent = list.length === 1 ? "1 source" : `${list.length} sources`;

    editorEl.innerHTML = "";
    if(list.length === 0){
      editorEl.innerHTML = `<div class="hint">No ${scope} sources yet. Tap <strong>Browse sources</strong> to pick some.</div>`;
      return;
    }

    const esc = window.App.escapeHtml;
    list.forEach((w, i) => {
      let host = "";
      try{ host = new URL(w.site || w.rss).hostname.replace(/^www\./, ""); }catch{}
      const row = document.createElement("div");
      row.className = "srcRow";
      row.dataset.rss = w.rss;
      row.innerHTML = `
        <img class="srcRowIcon" alt="" loading="lazy" src="${esc(window.App.faviconUrl(w.site || w.rss, 32))}">
        <div class="srcRowText">
          <div class="srcRowName">${esc(w.name || host || "Source")}</div>
          <div class="srcRowHost">${esc(host)}</div>
        </div>
        <div class="srcRowCount" role="group" aria-label="Headlines shown">
          <button type="button" class="srcRowBtn" data-count="-1" aria-label="Fewer headlines">−</button>
          <span class="srcRowCountNum">${Number(w.headlinesCount) || 5} headlines</span>
          <button type="button" class="srcRowBtn" data-count="1" aria-label="More headlines">+</button>
        </div>
        <div class="srcRowMove">
          <button type="button" class="srcRowBtn" data-move="-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="srcRowBtn" data-move="1" aria-label="Move down" ${i === list.length - 1 ? "disabled" : ""}>↓</button>
        </div>
        <button type="button" class="srcRowBtn srcRowRemove" aria-label="Remove ${esc(w.name || "source")}">✕</button>`;
      row.querySelectorAll("[data-count]").forEach((btn) => btn.addEventListener("click", () => {
        const n = Math.max(1, Math.min(20, (Number(w.headlinesCount) || 5) + Number(btn.dataset.count)));
        if(n === w.headlinesCount) return;
        w.headlinesCount = n;
        commitWidgets(`${w.name}: ${n} headlines`);
        newsEditors[scope]?.querySelector(`[data-rss="${CSS.escape(w.rss)}"] [data-count="${btn.dataset.count}"]`)?.focus();
      }));
      row.querySelectorAll("[data-move]").forEach((btn) => btn.addEventListener("click", () => moveWidgetInScope(scope, w.rss, Number(btn.dataset.move))));
      row.querySelector(".srcRowRemove").addEventListener("click", () => removeWidgetFromScope(scope, w.rss));
      editorEl.appendChild(row);
    });
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
    if(marketGroupSel) marketGroupSel.value = cfg.marketGroup || "us-indices";
    updateButtonGroupState(marketNewsSourceButtons, cfg.marketNewsSourceMode || "google");
    updateButtonGroupState(marketNewsOpenButtons, cfg.marketNewsOpenMode || "new-tab");
    updateButtonGroupState(newsTickerScopeButtons, cfg.newsTickerScope || "national");
    renderMarketIndices();
    renderCurrencies();

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
    if(marketGroupSel) cfg.marketGroup = marketGroupSel.value;
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

    const activeTickerScopeBtn = document.querySelector("[data-field='newsTickerScope'].active");
    if(activeTickerScopeBtn){
      cfg.newsTickerScope = activeTickerScopeBtn.dataset.value;
    }

    // Keep default page visibility config

  }

  // Save config
  function doSave(){
    saveTimer = 0;
    pullFromUI();
    cfg = window.App.saveConfig(cfg);
    window.App.applyThemeDensity(cfg);
    setStatus("✓ Saved", "saved");
  }

  // ──────────────────────────────────────────────────────────────────
  // Local / State source lists (News tab)
  // ──────────────────────────────────────────────────────────────────
  // Same compact rows as National / International: favicon, name, up/down,
  // remove. "Browse sources" opens the shared picker (assets/news-picker.js
  // via App.openSourcePicker), which also holds the place / Reddit search
  // that used to live in a box here. Rebuilt 2026-10-18; the old tile grid,
  // search box, "Clear all" and "Skip picker" checkbox went with it — an
  // empty list now simply means "automatic picks", which is what Skip did.
  function setupScopedSourceManager(scope){
    const cap = scope === "local" ? "local" : "regional";
    const Cap = cap.charAt(0).toUpperCase() + cap.slice(1);
    const cfgKey = `${cap}Sources`;
    const skipKey = `${cap}SourcesSkipped`;
    const listEl  = document.getElementById(`${cap}SourcesList`);
    const openBtn = document.getElementById(`open${Cap}PickerBtn`);
    if(!listEl) return;

    const liveCfg = () => window.App?.cfg || cfg;
    const sources = () => (Array.isArray(liveCfg()[cfgKey]) ? liveCfg()[cfgKey] : []);

    function commit(next, message){
      const saved = window.App.saveConfig({ ...liveCfg(), [cfgKey]: next });
      cfg[cfgKey] = saved[cfgKey];
      cfg[skipKey] = saved[skipKey];
      render();
      if(message) setStatus(message, "saved");
    }

    function render(){
      const list = sources();
      listEl.innerHTML = "";
      if(!list.length){
        listEl.innerHTML = `<div class="hint">Using automatic picks: the outlets we curate near you. Tap <strong>Browse sources</strong> to choose your own.</div>`;
        return;
      }
      list.forEach((s, i) => {
        let host = "";
        try{ host = new URL(s.site || s.rss).hostname.replace(/^www\./, ""); }catch{}
        const row = document.createElement("div");
        row.className = "srcRow srcRow--compact";
        row.innerHTML = `
          <img class="srcRowIcon" alt="" loading="lazy" src="${escapeHtmlSafe(window.App.faviconUrl(s.site || s.rss, 32))}">
          <div class="srcRowText">
            <div class="srcRowName">${escapeHtmlSafe(s.name || host || "Source")}</div>
            <div class="srcRowHost">${escapeHtmlSafe(host)}</div>
          </div>
          <div class="srcRowMove">
            <button type="button" class="srcRowBtn" data-move="-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="srcRowBtn" data-move="1" aria-label="Move down" ${i === list.length - 1 ? "disabled" : ""}>↓</button>
          </div>
          <button type="button" class="srcRowBtn srcRowRemove" aria-label="Remove ${escapeHtmlSafe(s.name || "source")}">✕</button>`;
        row.querySelectorAll("[data-move]").forEach(btn => btn.addEventListener("click", () => {
          const j = i + Number(btn.dataset.move);
          const next = [...list];
          [next[i], next[j]] = [next[j], next[i]];
          commit(next, "Reordered");
          listEl.children[j]?.querySelector(`[data-move="${btn.dataset.move}"]`)?.focus();
        }));
        row.querySelector(".srcRowRemove").addEventListener("click", () => {
          commit(list.filter((_, j) => j !== i), `Removed ${s.name || "source"}`);
        });
        listEl.appendChild(row);
      });
    }

    openBtn?.addEventListener("click", () => {
      window.App?.openSourcePicker?.(scope, () => {
        cfg[cfgKey] = liveCfg()[cfgKey];
        cfg[skipKey] = liveCfg()[skipKey];
        render();
        setStatus(`${Cap} sources updated`, "saved");
      });
    });

    render();
  }

  // ──────────────────────────────────────────────────────────────────
  // News categories (topic tabs)
  // ──────────────────────────────────────────────────────────────────
  // Renders one toggle per topic in data/topic-sources.json. Saving fires
  // hn:topicschange so an open news page rebuilds its tab bar without a reload.
  async function setupTopicPicker(){
    const grid = document.getElementById("topicGrid");
    if(!grid) return;
    let topics = [];
    try { topics = await window.App?.getAllTopics?.() || []; }
    catch { grid.textContent = "Couldn't load the category list."; return; }
    if(!topics.length){ grid.textContent = "No categories available."; return; }

    function chosen(){
      const v = (window.App?.cfg || cfg)?.topics;
      return Array.isArray(v) ? v : [];
    }

    function save(next, msg){
      window.App.saveConfig(next);
      cfg = next;
      paint();
      window.dispatchEvent(new CustomEvent("hn:topicschange"));
      setStatus(msg, "saved");
    }

    // Tab order = order of cfg.topics. Arrow buttons rather than drag, because
    // drag-and-drop is unreliable on a phone.
    function paintOrder(){
      const list = document.getElementById("topicOrder");
      if(!list) return;
      const byId = new Map(topics.map(t => [t.id, t]));
      const ids = chosen().filter(id => byId.has(id));
      list.innerHTML = "";
      ids.forEach((id, i) => {
        const t = byId.get(id);
        const li = document.createElement("li");
        li.innerHTML = `<span class="topicEmoji">${escapeHtmlSafe(t.emoji)}</span>
          <span class="topicOrderName">${escapeHtmlSafe(t.label)}</span>
          <button type="button" data-dir="-1" aria-label="Move ${escapeHtmlSafe(t.label)} earlier" ${i === 0 ? "disabled" : ""}>▲</button>
          <button type="button" data-dir="1" aria-label="Move ${escapeHtmlSafe(t.label)} later" ${i === ids.length - 1 ? "disabled" : ""}>▼</button>`;
        li.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
          const order = [...ids];
          const j = i + Number(btn.dataset.dir);
          [order[i], order[j]] = [order[j], order[i]];
          save({ ...(window.App?.cfg || cfg), topics: order }, `Moved ${t.label} tab`);
        }));
        list.appendChild(li);
      });
    }

    function paint(){
      paintOrder();
      const on = new Set(chosen());
      grid.innerHTML = "";
      // Topics arrive pre-clustered by data/topic-sources.json's file order
      // (see its "group" field), so grouping here just has to preserve
      // first-seen order rather than re-sort anything.
      const groups = new Map();
      topics.forEach(t => {
        const key = t.group || "";
        if(!groups.has(key)) groups.set(key, []);
        groups.get(key).push(t);
      });
      groups.forEach((members, groupName) => {
        const section = document.createElement("div");
        section.className = "topicGroup";
        if(groupName){
          const label = document.createElement("div");
          label.className = "topicGroupLabel";
          label.textContent = groupName;
          section.appendChild(label);
        }
        const row = document.createElement("div");
        row.className = "topicGroupRow";
        members.forEach(t => {
          const chip = document.createElement("label");
          chip.className = "topicRow" + (on.has(t.id) ? " isOn" : "");
          chip.innerHTML = `
            <input type="checkbox" ${on.has(t.id) ? "checked" : ""} data-topic-id="${escapeHtmlSafe(t.id)}" />
            <span class="topicEmoji">${escapeHtmlSafe(t.emoji)}</span>
            <span class="topicText">
              <span class="topicTitle">${escapeHtmlSafe(t.title)}</span>
              <span class="topicMeta">${t.count} source${t.count === 1 ? "" : "s"}</span>
            </span>`;
          row.appendChild(chip);
        });
        section.appendChild(row);
        grid.appendChild(section);
      });
      grid.querySelectorAll("input[data-topic-id]").forEach(box => {
        box.addEventListener("change", () => {
          const id = box.dataset.topicId;
          const next = { ...(window.App?.cfg || cfg) };
          const list = new Set(Array.isArray(next.topics) ? next.topics : []);
          box.checked ? list.add(id) : list.delete(id);
          next.topics = [...list];
          save(next, box.checked ? `Added ${id} tab` : `Removed ${id} tab`);
        });
      });
    }
    paint();
  }
  setupTopicPicker();

  function escapeHtmlSafe(s){
    return String(s ?? "").replace(/[&<>"']/g, m => (
      { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]
    ));
  }

  setupScopedSourceManager("local");
  setupScopedSourceManager("regional");

  // Per-page section visibility toggles
  function setupSectionVisibilityToggles(){
    cfg.sectionVisibility = cfg.sectionVisibility || { weather:{}, stocks:{}};
    const checkboxes = document.querySelectorAll('input[type="checkbox"][data-section-page][data-section-key]');
    checkboxes.forEach((cb) => {
      const page = cb.dataset.sectionPage;
      const key = cb.dataset.sectionKey;
      if(!page || !key) return;
      cfg.sectionVisibility[page] = cfg.sectionVisibility[page] || {};
      // Missing key defaults to visible (true) so existing users see no change.
      const current = cfg.sectionVisibility[page][key];
      cb.checked = current !== false;
      cb.addEventListener("change", () => {
        cfg.sectionVisibility[page] = cfg.sectionVisibility[page] || {};
        cfg.sectionVisibility[page][key] = cb.checked;
        setStatus("Page sections updated", "unsaved");
      });
    });
  }
  setupSectionVisibilityToggles();

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
      } else if(field === "newsTickerScope"){
        cfg.newsTickerScope = value;
        updateButtonGroupState(newsTickerScopeButtons, value);
      }

      setStatus("Modified", "unsaved");
    });
  });

  if(weatherShowMapToggle){
    weatherShowMapToggle.addEventListener("change", () => {
      cfg.weatherShowMap = weatherShowMapToggle.checked;
      setStatus("Modified", "unsaved");
    });
  }

  // Page visibility toggles removed from UI

  // Theme & Appearance settings
  themeSel.addEventListener("change", () => {
    cfg.theme = themeSel.value;
    applyThemeDensity(cfg); // Live preview
    setStatus("Modified", "unsaved");
  });

  if(renderModeSel){
    renderModeSel.addEventListener("change", () => {
      cfg.renderMode = renderModeSel.value;
      applyThemeDensity(cfg); // Live preview
      setStatus("Modified", "unsaved");
    });
  }

  startupPageSel.addEventListener("change", () => {
    cfg.startupPage = startupPageSel.value;
    setStatus("Modified", "unsaved");
  });

  if(marketGroupSel){
    marketGroupSel.addEventListener("change", () => {
      cfg.marketGroup = marketGroupSel.value;
      setStatus("Modified", "unsaved");
    });
  }

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
    setStatus("Location updated", "unsaved");
  });

  settLocCancelGeoBtn?.addEventListener("click", settLocHideApply);

  // Location & Weather settings
  // A ZIP saves only once it's complete, never half-typed.
  zipInput?.addEventListener("input", () => {
    if(!/^\d{5}$/.test(String(zipInput.value || "").trim())){
      setStatus("Finish the 5-digit ZIP to save it", "default");
      return;
    }
    cfg.useDeviceLocation = false; // typing a ZIP clears device mode
    setStatus("Modified", "unsaved");
  });

  wxRefreshInput.addEventListener("input", () => {
    setStatus("Modified", "unsaved");
  });

  if(weatherStaleWarnInput){
    weatherStaleWarnInput.addEventListener("input", () => {
      setStatus("Modified", "unsaved");
    });
  }

  stockLookupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    runStockLookup(String(stockLookupInput?.value || ""));
  });

  // The source picker (assets/news-picker.js) owns browsing and peeking;
  // these callbacks are its only way to change the saved list.
  function openNewsPicker(scope, returnFocusEl){
    window.NewsPicker?.open({
      scope,
      returnFocus: returnFocusEl,
      isAdded: (rss) => (cfg.widgets || []).some((w) => w.rss === rss && scopesOf(w).includes(scope)),
      add: (entry) => addWidgetToScope(scope, entry),
      remove: (rss) => removeWidgetFromScope(scope, rss),
      // A pasted feed URL gets its name and site from the feed itself.
      addCustom: async (rss) => {
        const meta = await lookupRssSourceMeta(rss);
        return addWidgetToScope(scope, { name: meta.name || "Source", rss, site: meta.site });
      }
    });
  }
  addNationalSourceBtn?.addEventListener("click", () => openNewsPicker("national", addNationalSourceBtn));
  addInternationalSourceBtn?.addEventListener("click", () => openNewsPicker("international", addInternationalSourceBtn));

  // Backup files and transfer links live in assets/settings-backup.js. The old
  // "Export JSON / Import JSON" paste box they replaced was removed 2026-11-15.

  // Reset to defaults
  resetBtn.addEventListener("click", () => {
    if(!confirm("Reset all settings to defaults? This cannot be undone.")){
      return;
    }
    cfg = window.App.normalizeConfig(window.App.DEFAULTS);
    // Tell settings-sync.js a reset is coming so that the save it triggers
    // (immediately, now that settings auto-save) pauses sync instead of
    // overwriting the sync file with empty defaults.
    try { window.dispatchEvent(new CustomEvent("hn:config-reset")); } catch { }
    setStatus("Reset to defaults", "unsaved");
    loadToUI();
  });

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
  setStatus("Changes save automatically");
})();
