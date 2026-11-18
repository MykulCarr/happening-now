// Settings > Markets: the "Add a stock" lookup box (Yahoo symbol search through
// our proxy, result list, which row to fill) and the symbol-name lookup the
// watchlist editor in settings.js uses.
// Split out of settings.js on 2026-11-17; loaded just before it. Reads and
// changes the page's settings as S.cfg (see the top of settings.js).
(() => {
  "use strict";
  const S = (window.App.settingsPage ||= {});
  // From the main script, looked up when called (it loads after this file).
  const renderStocks = (...args) => S.renderStocks(...args);
  const setStatus = (...args) => S.setStatus(...args);

  const stockLookupForm = document.getElementById("stockLookupForm");
  const stockLookupInput = document.getElementById("stockLookupInput");
  const stockLookupBtn = document.getElementById("stockLookupBtn");
  const stockAssignTarget = document.getElementById("stockAssignTarget");
  const stockLookupStatus = document.getElementById("stockLookupStatus");
  const stockLookupResults = document.getElementById("stockLookupResults");
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

    (S.cfg.stocks || []).forEach((stock, index) => {
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

    S.cfg.stocks = S.cfg.stocks || [];
    const targetValue = String(stockAssignTarget?.value || "new");
    let targetIndex = -1;

    if(targetValue.startsWith("idx:")){
      const parsedIndex = Number(targetValue.split(":")[1]);
      if(Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < S.cfg.stocks.length){
        targetIndex = parsedIndex;
      }
    }

    // Combine exchange and symbol if exchange exists and symbol doesn't already contain it
    const finalSymbol = result.exchange && !String(result.symbol || "").includes(":") 
      ? `${result.exchange}:${result.symbol}`
      : result.symbol;

    if(targetIndex >= 0){
      S.cfg.stocks[targetIndex] = {
        ...S.cfg.stocks[targetIndex],
        symbol: finalSymbol,
        label: result.label || S.cfg.stocks[targetIndex]?.label || result.symbol
      };
      renderStocks();
      setStatus(`Assigned ${finalSymbol} to row ${targetIndex + 1}`, "unsaved");
      setStockLookupStatus(`Assigned ${finalSymbol} to row ${targetIndex + 1}.`, "success");
      setTimeout(() => closeStockLookupModal?.(), 600);
      return;
    }

    S.cfg.stocks.push({ symbol: finalSymbol, label: result.label || result.symbol });
    renderStocks();
    setStatus(`Added ${finalSymbol} to watchlist`, "unsaved");
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

  let stockLookupRunId = 0;
  let stockLookupCurrentResults = [];

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


  Object.assign(S, { lookupSymbolName, renderStockAssignTargetOptions, runStockLookup, stockLookupForm, stockLookupInput });
})();
