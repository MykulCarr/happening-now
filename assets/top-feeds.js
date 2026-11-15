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

  App.getTopFeedsForScope = getTopFeedsForScope;
})();
