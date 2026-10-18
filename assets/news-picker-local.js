/* Where the picker's Local / State sources come from (assets/news-picker.js).
 *
 *   NewsPickerLocal.load(scope, geoOverride?) ->
 *     { geo, whereHtml, sources: [...], nearby: [{ label, distanceMi, geo }] }
 *
 * Sources are the outlets curated in data/local-stations.json for the
 * reader's city (or state, for "regional") plus Reddit communities. The ones
 * the old picker pre-ticked — every curated outlet, and the Reddit subs that
 * name the city or state — are marked `suggested`, which drives the picker's
 * "Add all suggested" button.
 *
 * `geoOverride` is a nearby city/state the reader tapped because we don't
 * cover theirs: outlets come from there, Reddit still from where they are.
 *
 * Bing news searches were dropped here on 2026-10-18 (they were the old
 * picker's third group).
 */
(function () {
  "use strict";
  const App = () => window.App;
  const esc = (s) => window.App.escapeHtml(String(s ?? ""));
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

  async function load(scope, geoOverride) {
    const { results = [], geo } = await App().discoverSourcesForScope(scope);
    if (!geo) return { geo: null };

    const g = geoOverride || geo;
    const stations = await App().getStationsForGeo(g, scope).catch(() => []);
    // "Covered" means outlets for the city itself; statewide feeds are folded
    // into every city's list, so a plain length check would say yes everywhere.
    const covered = scope === "local" ? await App().hasCitySources(g).catch(() => false) : stations.length > 0;

    let nearby = [];
    if (!covered && !geoOverride && Number.isFinite(geo.lat) && Number.isFinite(geo.lon)) {
      const near = scope === "local"
        ? await App().getNearestCities(geo.lat, geo.lon, 3).catch(() => [])
        : await App().getNearestStates(geo.lat, geo.lon, 3).catch(() => []);
      nearby = near.map((n) => ({
        label: scope === "local" ? `${n.displayCity}, ${n.state}` : n.displayState,
        distanceMi: n.distanceMi,
        geo: scope === "local"
          ? { city: n.city, displayCity: n.displayCity, state: n.state, lat: n.lat, lon: n.lon }
          : { city: geo.city, state: n.state, lat: n.lat, lon: n.lon },
      }));
    }

    const picks = App().defaultPickedSubs(results, geo);
    const sources = [
      ...stations.map((s) => ({
        name: s.name, rss: s.rss, site: s.site || "",
        kind: ["tv", "paper", "community", "radio"].includes(s.type) ? s.type : "community",
        blurb: host(s.site || s.rss), suggested: true,
      })),
      ...results.map((r) => ({
        name: `r/${r.displayName}`, rss: r.rss, site: "https://www.reddit.com",
        kind: "reddit", blurb: r.description || "", suggested: picks.has(r.displayName),
      })),
    ];

    const place = scope === "local"
      ? [geo.city, geo.state].filter(Boolean).join(", ")
      : (App().expandStateName(geo.state) || geo.state);
    const borrowed = geoOverride
      ? ` · showing ${esc(scope === "local" ? `${g.displayCity || g.city}, ${g.state}` : (App().expandStateName(g.state) || g.state))}`
      : (!covered ? " · no outlets here yet" : "");
    return { geo, whereHtml: `Near <strong>${esc(place)}</strong>${borrowed}`, sources, nearby };
  }

  window.NewsPickerLocal = { load };
})();
