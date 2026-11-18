// Free-text source search for the Local / "News Across Your State" cards.
//
// The custom row used to accept only a pasted RSS URL. This adds a place —
// "Ann Arbor, MI", a ZIP, or a full street address — which resolves to
// coordinates and offers the local outlets we already curate for that spot
// (or the nearest covered city, if it isn't one we cover).
//
// It also searched Reddit for matching communities until Reddit ended its
// RSS feeds on 2026-11-13 (removed 2026-11-18; the safety filter that went
// with it is in git history if a Reddit-like source ever returns).
//
// Providers are declared in PROVIDERS below and run in parallel; adding a
// second search backend later means adding one entry, not rewiring callers.
//
// Depends only on window.App (common.js) — no new libraries.
(() => {
  "use strict";

  const MAX_PER_PROVIDER = 12;

  // ── Provider: local outlets for a place ─────────────────────────────────
  // Open-Meteo's geocoder is city-level and quick, so it handles "Toledo" and
  // "Ann Arbor, MI". It returns nothing for a street address, so fall back to
  // Nominatim, which does — and which common.js already relies on for reverse
  // geocoding, so it's not a new dependency.
  async function geocodeFreeform(query) {
    const viaCity = await window.App?.geocodeCityName?.(query);
    if (viaCity) return viaCity;

    const url = "https://nominatim.openstreetmap.org/search"
      + `?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&limit=1&countrycodes=us`;
    const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    const a = row.address || {};
    const city = a.city || a.town || a.village || a.hamlet || a.county || "";
    const state = a.state || "";
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { city, state, lat, lon, label: row.display_name || query };
  }

  async function searchPlaces(query) {
    const geo = await geocodeFreeform(query);
    if (!geo) return [];
    const state = window.App?.abbreviateState?.(geo.state) || geo.state;

    const pack = (entries, via) => entries.map(e => ({
      kind: "place",
      name: e.name,
      detail: via,
      rss: e.rss,
      site: e.site || "",
    }));

    // Ask specifically about hyperlocal coverage. getStationsForGeo always
    // folds in the statewide entries, so a plain length check says "covered"
    // for every city in a covered state — Ann Arbor would come back with the
    // four Michigan statewide feeds mislabelled as Ann Arbor's, and the
    // nearest-city fallback below would never run.
    const geoKey = { city: geo.city, state };
    if (await window.App.hasCitySources(geoKey)) {
      const direct = await window.App.getStationsForGeo(geoKey, "local");
      return pack(direct, [geo.city, state].filter(Boolean).join(", ")).slice(0, MAX_PER_PROVIDER);
    }

    // Not a city we cover — offer the closest ones we do, same fallback the
    // picker uses when the user's own city misses, plus the statewide feeds.
    //
    // getStationsForGeo folds statewide entries into every city's list, so
    // subtract them before labelling: otherwise Bridge Michigan gets tagged
    // "Jackson, MI — 33 mi away", reading as though it were a Jackson outlet.
    const statewide = await window.App.getStationsForGeo({ city: "", state }, "local");
    const statewideUrls = new Set(statewide.map(e => e.rss));

    const out = [];
    const near = await window.App.getNearestCities(geo.lat, geo.lon, 2);
    for (const n of near) {
      const entries = await window.App.getStationsForGeo({ city: n.city, state: n.state }, "local");
      out.push(...pack(
        entries.filter(e => !statewideUrls.has(e.rss)),
        `${n.displayCity}, ${n.state} — ${Math.round(n.distanceMi)} mi away`,
      ));
    }
    out.push(...pack(statewide, `${state} statewide`));

    const seen = new Set();
    return out.filter(e => !seen.has(e.rss) && seen.add(e.rss)).slice(0, MAX_PER_PROVIDER);
  }

  const PROVIDERS = [
    { id: "place", label: "Local outlets", run: searchPlaces },
  ];

  // Runs every provider in parallel. A provider that throws reports its own
  // error rather than sinking the whole search.
  async function searchSources(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    return Promise.all(PROVIDERS.map(async p => {
      try {
        return { id: p.id, label: p.label, items: await p.run(q) };
      } catch (err) {
        console.warn(`[source-search] ${p.id} failed:`, err?.message || err);
        return { id: p.id, label: p.label, items: [], error: err?.message || "search failed" };
      }
    }));
  }

  window.App = window.App || {};
  window.App.searchSources = searchSources;
  window.App.searchSourceProviders = PROVIDERS.map(p => ({ id: p.id, label: p.label }));
})();
