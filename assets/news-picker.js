/* National / International source picker.
 *
 * Opened from Settings > News. Browses data/news-sources.json, and lets a
 * reader "peek" at any source before adding it: its latest real headlines,
 * fetched live through the same /v1/rss/raw path the news page uses, plus
 * numbers measured from that fetch (how many stories in the last 24h, how
 * long since the last one). Nothing about a source's activity is typed in
 * by hand, so the peek can't flatter a feed that has gone quiet — CNN's
 * feed parses perfectly and stopped updating in 2023.
 *
 * It never touches cfg itself. Settings passes callbacks:
 *   NewsPicker.open({ scope, isAdded(rss), add(entry) -> errorText,
 *                     remove(rss), addCustom(rss) -> Promise<errorText>, returnFocus })
 */
(function () {
  "use strict";

  const CATALOG_URL = "/data/news-sources.json";
  const PEEK_SHOWN = 5;
  const PEEK_SAMPLE = 30;          // fetched to measure volume; only PEEK_SHOWN are listed
  const QUIET_AFTER_H = 72;        // newest story older than this gets a "quiet" warning

  const BEAT_LABELS = {
    general: "Top stories", politics: "Politics", accountability: "Investigations",
    business: "Business", science: "Science", "human-interest": "Human interest", sports: "Sports"
  };
  const REGION_LABELS = {
    global: "Global", europe: "Europe", "middle-east": "Middle East", africa: "Africa",
    "asia-pacific": "Asia-Pacific", americas: "Americas"
  };
  const KIND_LABELS = { public: "Public or state-funded", nonprofit: "Nonprofit", commercial: "Commercial", wire: "Wire service" };

  let catalogPromise = null;
  const peekCache = new Map();     // rss -> Promise<items[]>, per page load

  const esc = (s) => window.App.escapeHtml(String(s ?? ""));

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(CATALOG_URL)
        .then((r) => { if (!r.ok) throw new Error(`catalog ${r.status}`); return r.json(); })
        .then((j) => j.sources || [])
        .catch((e) => { catalogPromise = null; throw e; });
    }
    return catalogPromise;
  }

  function ago(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h}h ago`;
    return `${Math.round(h / 24)} days ago`;
  }

  function peekItems(rss) {
    if (!peekCache.has(rss)) {
      const p = window.App.fetchRssItems(rss, PEEK_SAMPLE, true).catch(() => null);
      peekCache.set(rss, p);
      p.then((items) => { if (!items) peekCache.delete(rss); }); // let a failure be retried
    }
    return peekCache.get(rss);
  }

  // The honest numbers line, computed from what was just fetched.
  function peekStats(items) {
    const now = Date.now();
    const times = items.map((i) => Date.parse(i.pubDate)).filter((t) => Number.isFinite(t) && t <= now + 3600e3);
    if (!times.length) return { text: "Stories carry no dates, so we can't say how recent they are.", quiet: false };
    const newest = Math.max(...times);
    const day = times.filter((t) => now - t < 86400e3).length;
    const dayText = day >= items.length && items.length >= PEEK_SAMPLE ? `${PEEK_SAMPLE}+` : String(day);
    const quiet = now - newest > QUIET_AFTER_H * 3600e3;
    return {
      quiet,
      text: quiet
        ? `Quiet lately: newest story is from ${ago(now - newest)}.`
        : `${dayText} ${day === 1 ? "story" : "stories"} in the last 24 hours · newest ${ago(now - newest)}`
    };
  }

  function renderPeek(el, items, site) {
    if (!items || !items.length) {
      el.innerHTML = `<p class="npPeekNote">Couldn't load this feed right now. It may be a temporary hiccup at the publisher.</p>`;
      return;
    }
    const stats = peekStats(items);
    const now = Date.now();
    el.innerHTML = `
      <p class="npPeekStats${stats.quiet ? " isQuiet" : ""}">${esc(stats.text)}</p>
      <ol class="npPeekList">${items.slice(0, PEEK_SHOWN).map((i) => {
        const t = Date.parse(i.pubDate);
        return `<li><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a>${Number.isFinite(t) ? `<span class="npPeekAge">${ago(now - t)}</span>` : ""}</li>`;
      }).join("")}</ol>
      ${site ? `<a class="npPeekSite" href="${esc(site)}" target="_blank" rel="noopener">Visit site ↗</a>` : ""}`;
  }

  function open(opts) {
    if (document.getElementById("npOverlay")) return;
    const scope = opts.scope === "international" ? "international" : "national";
    const intl = scope === "international";

    const overlay = document.createElement("div");
    overlay.id = "npOverlay";
    overlay.className = "npOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "npTitle");
    overlay.innerHTML = `
      <div class="npSheet">
        <div class="npHead">
          <h2 id="npTitle" class="npTitle">${intl ? "International sources" : "National sources"}</h2>
          <button type="button" class="npClose" aria-label="Close">✕</button>
        </div>
        <p class="npLead">Every source here is free to read, with no paywall. Tap one to peek at what it's publishing right now.</p>
        <input type="search" class="input npSearch" placeholder="Search by name or subject" aria-label="Search sources">
        <div class="npChips" role="group" aria-label="Filter"></div>
        <div class="npStatus" aria-live="polite"></div>
        <div class="npList" role="list"><p class="npPeekNote">Loading sources…</p></div>
        <details class="npCustom">
          <summary>Add a feed by its RSS address</summary>
          <div class="npCustomRow">
            <input type="url" class="input npCustomInput" placeholder="https://example.com/feed.xml" aria-label="RSS feed address">
            <button type="button" class="btn npCustomPeek">Peek</button>
            <button type="button" class="btn primary npCustomAdd">Add</button>
          </div>
          <div class="npPeek npCustomPeekBody" hidden></div>
        </details>
      </div>`;
    document.body.appendChild(overlay);
    document.body.classList.add("npOpen");

    const $ = (sel) => overlay.querySelector(sel);
    const listEl = $(".npList"), chipsEl = $(".npChips"), searchEl = $(".npSearch"), statusEl = $(".npStatus");
    let sources = [];
    let filter = "all";

    const status = (msg, isError) => {
      statusEl.textContent = msg || "";
      statusEl.classList.toggle("isError", !!isError);
    };

    function close() {
      overlay.remove();
      document.body.classList.remove("npOpen");
      opts.returnFocus?.focus?.();
    }
    $(".npClose").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    function matches(src) {
      if (filter !== "all" && !(intl ? src.regions : src.beats)?.includes(filter)) return false;
      const q = searchEl.value.trim().toLowerCase();
      if (!q) return true;
      const tags = [...(src.beats || []).map((b) => BEAT_LABELS[b]), ...(src.regions || []).map((r) => REGION_LABELS[r])];
      return [src.name, src.blurb, KIND_LABELS[src.kind], ...tags].join(" ").toLowerCase().includes(q);
    }

    function renderChips() {
      // International filters by where a source is from; national by what it covers.
      const labels = intl ? REGION_LABELS : BEAT_LABELS;
      const present = Object.keys(labels).filter((k) => sources.some((s) => (intl ? s.regions : s.beats)?.includes(k)));
      chipsEl.innerHTML = ["all", ...present].map((k) =>
        `<button type="button" class="npChip${k === filter ? " active" : ""}" data-k="${k}" aria-pressed="${k === filter}">${k === "all" ? "All" : esc(labels[k])}</button>`
      ).join("");
    }
    chipsEl.addEventListener("click", (e) => {
      const b = e.target.closest(".npChip");
      if (!b) return;
      filter = b.dataset.k;
      renderChips();
      renderList();
    });
    searchEl.addEventListener("input", () => renderList());

    function addButtonState(btn, src) {
      const added = opts.isAdded(src.rss);
      btn.textContent = added ? "✓ Added" : "+ Add";
      btn.classList.toggle("isAdded", added);
      btn.setAttribute("aria-pressed", String(added));
      btn.setAttribute("aria-label", `${added ? "Remove" : "Add"} ${src.name}`);
    }

    function renderList() {
      const shown = sources.filter(matches);
      if (!shown.length) {
        listEl.innerHTML = `<p class="npPeekNote">Nothing matches. Try another word, or add a feed by its address below.</p>`;
        return;
      }
      listEl.innerHTML = "";
      for (const src of shown) {
        const card = document.createElement("div");
        card.className = "npCard";
        card.setAttribute("role", "listitem");
        const where = intl ? (src.regions || []).map((r) => REGION_LABELS[r]).join(", ") : "";
        card.innerHTML = `
          <div class="npCardRow">
            <button type="button" class="npCardMain" aria-expanded="false">
              <img class="npIcon" alt="" loading="lazy" src="${esc(window.App.faviconUrl(src.site, 32))}">
              <span class="npCardText">
                <span class="npName">${esc(src.name)}${src.default ? `<span class="npBadge">Starter</span>` : ""}</span>
                <span class="npBlurb">${esc(src.blurb)}</span>
                <span class="npMeta">${esc(KIND_LABELS[src.kind] || "")}${where ? ` · ${esc(where)}` : ""} · <span class="npPeekHint">Peek ▾</span></span>
              </span>
            </button>
            <button type="button" class="btn npAdd"></button>
          </div>
          <div class="npPeek" hidden></div>`;
        const addBtn = card.querySelector(".npAdd");
        addButtonState(addBtn, src);
        addBtn.addEventListener("click", () => {
          if (opts.isAdded(src.rss)) { opts.remove(src.rss); status(`Removed ${src.name}.`); }
          else {
            const err = opts.add(src);
            status(err || `Added ${src.name}. It's on your ${intl ? "International" : "National"} tab now.`, !!err);
          }
          addButtonState(addBtn, src);
        });
        const main = card.querySelector(".npCardMain");
        const peekEl = card.querySelector(".npPeek");
        main.addEventListener("click", async () => {
          const opening = peekEl.hidden;
          peekEl.hidden = !opening;
          main.setAttribute("aria-expanded", String(opening));
          card.querySelector(".npPeekHint").textContent = opening ? "Hide ▴" : "Peek ▾";
          if (!opening || peekEl.dataset.loaded) return;
          peekEl.innerHTML = `<p class="npPeekNote">Fetching the latest from ${esc(src.name)}…</p>`;
          const items = await peekItems(src.rss);
          if (items) peekEl.dataset.loaded = "1";
          renderPeek(peekEl, items, src.site);
        });
        listEl.appendChild(card);
      }
    }

    // Custom feed: the same peek, then Add.
    const customInput = $(".npCustomInput"), customPeek = $(".npCustomPeekBody");
    const customUrl = () => {
      try {
        const u = new URL(customInput.value.trim());
        return /^https?:$/.test(u.protocol) ? u.href : "";
      } catch { return ""; }
    };
    $(".npCustomPeek").addEventListener("click", async () => {
      const url = customUrl();
      if (!url) { status("That doesn't look like a web address.", true); return; }
      customPeek.hidden = false;
      customPeek.innerHTML = `<p class="npPeekNote">Fetching…</p>`;
      renderPeek(customPeek, await peekItems(url), "");
    });
    $(".npCustomAdd").addEventListener("click", async () => {
      const url = customUrl();
      if (!url) { status("That doesn't look like a web address.", true); return; }
      status("Checking the feed…");
      const items = await peekItems(url);
      if (!items || !items.length) { status("Couldn't read any stories from that address, so it wasn't added.", true); return; }
      const err = await opts.addCustom(url);
      status(err || "Added.", !!err);
      if (!err) { customInput.value = ""; customPeek.hidden = true; }
    });

    loadCatalog().then((all) => {
      sources = all.filter((s) => s.scope === scope);
      renderChips();
      renderList();
    }).catch(() => {
      listEl.innerHTML = `<p class="npPeekNote">Couldn't load the source list. You can still add a feed by its address below.</p>`;
    });
    searchEl.focus();
  }

  window.NewsPicker = { open };
})();
