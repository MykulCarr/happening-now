// Settings > Markets: the indices picker (show/hide, order, sort by type or
// region, All / None per group and per type) and the currency list.
// Split out of settings.js on 2026-11-17; loaded just before it. Reads and
// changes the page's settings as S.cfg (see the top of settings.js).
(() => {
  "use strict";
  const S = (window.App.settingsPage ||= {});
  // From the main script, looked up when called (it loads after this file).
  const setStatus = (...args) => S.setStatus(...args);

  const MARKET_INDEX_DEFS = Array.isArray(window.App.MARKET_INDEX_DEFS) ? window.App.MARKET_INDEX_DEFS : [];
  // Type and region come from the catalog itself rather than a second table
  // kept alongside it — with a hundred instruments, the copy that drifts is the
  // one nobody remembers to update.
  const MARKET_INDEX_META = Object.fromEntries(
    MARKET_INDEX_DEFS.map((item) => [item.key, { type: item.type || "Other", region: item.region || "Other" }])
  );
  const TYPE_SORT_ORDER = [
    "US Equity", "Global Equity", "Volatility",
    "Metals", "Energy", "Agriculture", "Livestock", "Commodities",
    "Rates", "FX", "Crypto", "Other"
  ];
  // Roughly by trading day, west to east, so sorting by region walks the world
  // in the order the exchanges actually open.
  const REGION_SORT_ORDER = [
    "United States", "Canada", "Mexico", "Brazil", "Argentina",
    "United Kingdom", "Euro Area", "Germany", "France", "Netherlands", "Belgium",
    "Spain", "Italy", "Switzerland", "Sweden",
    "South Africa", "Egypt", "Israel",
    "India", "Thailand", "Indonesia", "Singapore", "Malaysia", "Hong Kong",
    "China", "Taiwan", "South Korea", "Japan", "Australia", "New Zealand",
    "Global", "Other"
  ];
  const AUTO_MARKET_INDICES_SORT_MODE = "region";
  let marketIndicesSortMode = "manual";

  const marketIndicesContainer = document.getElementById("marketIndicesCheckboxes");
  const currencyContainer = document.getElementById("currencyCheckboxes");

  function normalizeMarketIndicesConfig(){
    const defs = MARKET_INDEX_DEFS;
    if(defs.length === 0){
      S.cfg.marketIndices = [];
      return;
    }

    const visibilityByKey = new Map();
    const orderedKeys = [];
    const seen = new Set();
    const raw = Array.isArray(S.cfg.marketIndices) ? S.cfg.marketIndices : [];

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

    S.cfg.marketIndices = [
      ...orderedKeys
        .filter((key) => defs.some((d) => d.key === key))
        .map((key) => ({ key, visible: visibilityByKey.has(key) ? visibilityByKey.get(key) : true })),
      ...defs
        .filter((def) => !seen.has(def.key))
        .map((def) => ({ key: def.key, visible: true }))
    ];
  }

  function moveMarketIndex(fromIdx, toIdx){
    const list = Array.isArray(S.cfg.marketIndices) ? [...S.cfg.marketIndices] : [];
    if(fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length || fromIdx === toIdx) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    S.cfg.marketIndices = list;
    marketIndicesSortMode = "manual";
  }

  function setAllMarketIndicesVisible(visible){
    normalizeMarketIndicesConfig();
    S.cfg.marketIndices = S.cfg.marketIndices.map((entry) => ({ ...entry, visible: !!visible }));
    renderMarketIndices();
    setStatus("Market strip updated", "unsaved");
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

    S.cfg.marketIndices = [...S.cfg.marketIndices].sort((a, b) => {
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
      setStatus("Market strip sorted", "unsaved");
    }
  }

  // Render market indices visibility controls
  function renderMarketIndices(){
    normalizeMarketIndicesConfig();

    const visibleByKey = new Map((S.cfg.marketIndices || []).map((item) => [item.key, item.visible !== false]));
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
          const list = S.cfg.marketIndices || [];
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
              grouped.push({ value: groupValue, rows: [renderRow(entry, idx)], types: [meta.type] });
            }else{
              last.rows.push(renderRow(entry, idx));
              if(!last.types.includes(meta.type)) last.types.push(meta.type);
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
              ${groupMode === "region" && group.types.length > 1 ? `<div class="marketTypeToggles">${group.types.map((type) => `
                <span class="marketTypeToggle">
                  <span class="marketTypeToggleName">${type}</span>
                  <button type="button" class="marketGroupToggleBtn" data-group-mode="type" data-group-value="${encodeURIComponent(type)}" data-group-region="${encodeURIComponent(group.value)}" data-group-visible="1" aria-label="Show all ${type}">All</button>
                  <button type="button" class="marketGroupToggleBtn" data-group-mode="type" data-group-value="${encodeURIComponent(type)}" data-group-region="${encodeURIComponent(group.value)}" data-group-visible="0" aria-label="Hide all ${type}">None</button>
                </span>`).join("")}</div>` : ""}
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
        // Set on the per-type buttons inside a region group, so "Global > FX"
        // leaves a currency filed under another region alone.
        const onlyRegion = btn.dataset.groupRegion ? decodeURIComponent(btn.dataset.groupRegion) : "";
        if(!(mode === "type" || mode === "region")) return;

        S.cfg.marketIndices = (S.cfg.marketIndices || []).map((entry) => {
          const meta = getMarketMeta(entry.key);
          const value = mode === "type"
            ? String(meta.type || "Other")
            : String(meta.region || "Other");
          if(value !== groupValue) return entry;
          if(onlyRegion && String(meta.region || "Other") !== onlyRegion) return entry;
          return { ...entry, visible: makeVisible };
        });

        renderMarketIndices();
        setStatus("Market strip updated", "unsaved");
      });
    });

    marketIndicesContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        const key = String(cb.dataset.indexKey || "");
        S.cfg.marketIndices = (S.cfg.marketIndices || []).map((entry) =>
          entry.key === key ? { ...entry, visible: cb.checked } : entry
        );
        setStatus("Market strip updated", "unsaved");
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
        setStatus("Market strip reordered", "unsaved");
      });
    });
  }

  // The list of available currencies lives in the Worker, not here — the page
  // reads whatever /v1/markets/snapshot actually carries so the two can't drift.
  // A failed fetch leaves the saved selection alone rather than rendering an
  // empty picker that would look like "no currencies available".
  let currencyCatalog = null;
  async function loadCurrencyCatalog(){
    if(currencyCatalog) return currencyCatalog;
    try{
      const res = await fetch(window.App.MARKETS_SNAPSHOT_URL, { cache: "no-store" });
      if(!res.ok) return null;
      const data = await res.json();
      currencyCatalog = (data?.items || [])
        .filter(item => item.group === "currencies")
        .map(item => ({ code: String(item.currency || "").toUpperCase(), label: item.label || item.name }))
        .filter(item => item.code);
      return currencyCatalog;
    }catch{
      return null;
    }
  }

  async function renderCurrencies(){
    if(!currencyContainer) return;
    const catalog = await loadCurrencyCatalog();
    if(!catalog || !catalog.length){
      currencyContainer.innerHTML = `<div class="hint">Currency list unavailable right now — your saved selection is unchanged.</div>`;
      return;
    }

    const chosen = new Set(Array.isArray(S.cfg.currencies) ? S.cfg.currencies : []);
    currencyContainer.innerHTML = catalog.map(({ code, label }) => {
      const id = `cur_${code}`;
      return `<label class="checkboxLabel" for="${id}">
          <input type="checkbox" class="checkbox" id="${id}" data-currency-code="${code}" ${chosen.has(code) ? "checked" : ""}>
          <span>USD/${code} <span class="sectionToggleHint">${label}</span></span>
        </label>`;
    }).join("");
  }

  currencyContainer?.addEventListener("change", (event) => {
    const box = event.target?.closest?.("input[data-currency-code]");
    if(!box) return;
    const code = box.dataset.currencyCode;
    const chosen = new Set(Array.isArray(S.cfg.currencies) ? S.cfg.currencies : []);
    if(box.checked) chosen.add(code); else chosen.delete(code);
    // Kept in catalog order so the board doesn't reshuffle as boxes are ticked.
    S.cfg.currencies = (currencyCatalog || []).map(c => c.code).filter(c => chosen.has(c));
    S.cfg = window.App.saveConfig(S.cfg);
  });


  Object.assign(S, { AUTO_MARKET_INDICES_SORT_MODE, renderCurrencies, renderMarketIndices, sortMarketIndices });
})();
