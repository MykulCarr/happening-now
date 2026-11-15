// The "top news" feeds for one news category (local, regional, national,
// international or a topic id). Shared by the news page's ticker (news.js)
// and the Today view (widget.js), so both show the same outlets for a
// category. Each feed is { rss, name, scope, label }.
//
// We can't use per-query search RSS (Google News / Bing News / Yahoo News all
// block the Cloudflare Worker IP range), so national and international come
// from a small set of high-volume outlet feeds that proxy fine.
(function () {
  const App = window.App;

  const NATIONAL = [
    { rss: "https://feeds.npr.org/1001/rss.xml", name: "NPR", scope: "national", label: "US" },
    { rss: "https://www.cbsnews.com/latest/rss/main", name: "CBS News", scope: "national", label: "US" }, // was Reuters: metered paywall since Oct 2024
  ];
  const INTERNATIONAL = [
    { rss: "https://rss.dw.com/rdf/rss-en-all", name: "DW", scope: "international", label: "WORLD" }, // was BBC World: US paywall since 2025
    { rss: "https://www.theguardian.com/world/rss", name: "The Guardian", scope: "international", label: "WORLD" },
    { rss: "https://www.aljazeera.com/xml/rss/all.xml", name: "Al Jazeera", scope: "international", label: "WORLD" },
  ];

  // `getGeo` is an async () => { city, state } | null, called only for local
  // and regional, since resolving a location can cost a lookup.
  async function getTopFeedsForScope(scope, getGeo) {
    if (scope === "national") return NATIONAL;
    if (scope === "international") return INTERNATIONAL;

    // Topics (science, music, comics...) come straight from
    // data/topic-sources.json — curated and verified, no geo to resolve.
    if (await App.isTopicScope(scope)) {
      const entries = await App.getTopicEntries(scope);
      const label = (await App.getAllTopics()).find((x) => x.id === scope)?.label || scope.toUpperCase();
      return entries.slice(0, 4).map((e) => ({ rss: e.rss, name: e.name, scope, label }));
    }

    // Local + regional: the reader's own picks first, then the curated
    // stations for their area, then national so the list is never empty.
    if (scope === "local" || scope === "regional") {
      const saved = App.cfg?.[scope === "local" ? "localSources" : "regionalSources"];
      if (Array.isArray(saved) && saved.length) {
        const label = scope === "local" ? "LOCAL" : "REGIONAL";
        return saved.slice(0, 3).map((s) => ({ rss: s.rss, name: s.name, scope, label }));
      }
      try {
        const geo = await getGeo();
        const stations = geo ? await App.getStationsForGeo(geo, scope) : [];
        if (stations.length) {
          const label = scope === "local"
            ? (geo.city ? geo.city.toUpperCase() : "LOCAL")
            : ((App.expandStateName?.(geo.state) || geo.state || "").toUpperCase() || "REGIONAL");
          return stations.slice(0, 3).map((s) => ({ rss: s.rss, name: s.name, scope, label }));
        }
      } catch { /* fall through */ }
    }
    return NATIONAL;
  }

  // The news page's own tabs, in its order: the four geographic ones, then
  // whichever topics the reader switched on. [{ id, label }]
  async function getNewsCategories() {
    const topics = await App.getEnabledTopics().catch(() => []);
    return [
      { id: "local", label: "LOCAL" },
      { id: "regional", label: "REGIONAL" },
      { id: "national", label: "NATIONAL" },
      { id: "international", label: "INTERNATIONAL" },
      ...topics.map((t) => ({ id: t.id, label: t.label })),
    ];
  }

  // The sources a category's news grid shows (up to 8): a topic's curated
  // entries, the reader's own local/regional picks (or the curated stations
  // for their area), or their national/international list.
  // Returns { widgets, reason, offerPicker } and has no side effects: the news
  // page decides whether to open the source picker; the widget link only reads.
  async function getCategorySources(scope, cfg, getGeo) {
    if (await App.isTopicScope(scope)) {
      const entries = await App.getTopicEntries(scope);
      return { widgets: entries.slice(0, 8), reason: entries.length ? "" : "no-sources" };
    }
    if (scope === "local" || scope === "regional") {
      const saved = cfg?.[scope === "local" ? "localSources" : "regionalSources"];
      if (Array.isArray(saved) && saved.length) return { widgets: saved.slice(0, 8), reason: "" };

      const geo = await getGeo();
      if (!geo) return { widgets: [], reason: "no-geo" };
      // Nothing saved, and the picker was never dismissed: worth offering it.
      const offerPicker = !cfg?.[scope === "local" ? "localSourcesSkipped" : "regionalSourcesSkipped"];
      // Until they pick, fall back to data/local-stations.json: city stations
      // plus statewide for local, statewide only for regional.
      try {
        const stations = await App.getStationsForGeo(geo, scope);
        if (stations.length) {
          return {
            widgets: stations.slice(0, 8).map((s) => ({ name: s.name, rss: s.rss, site: s.site || "", headlinesCount: 6 })),
            reason: "",
            offerPicker,
          };
        }
      } catch { /* fall through */ }
      // Nothing for this place: empty, so the page shows the picker hint
      // instead of a wall of empty cards.
      return { widgets: [], reason: "no-coverage", offerPicker };
    }
    // National / international: the reader's list, by each source's scope tag
    // (normalizeConfig assigns the tags; ["national"] is only a safety net).
    const all = Array.isArray(cfg?.widgets) ? cfg.widgets : [];
    const filtered = all.filter((w) => (Array.isArray(w?.scopes) && w.scopes.length ? w.scopes : ["national"]).includes(scope));
    return { widgets: filtered, reason: filtered.length ? "" : "no-match" };
  }

  App.getTopFeedsForScope = getTopFeedsForScope;
  App.getCategorySources = getCategorySources;
  App.getNewsCategories = getNewsCategories;
})();
