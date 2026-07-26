// Free-text source search for the Local / "News Across Your State" cards.
//
// The custom row used to accept only a pasted RSS URL. This widens it to two
// more ways in, behind one input:
//
//   • a place — "Ann Arbor, MI", a ZIP, or a full street address — which
//     resolves to coordinates and offers the local outlets we already curate
//     for that spot (or the nearest covered city, if it isn't one we cover)
//   • a keyword, which searches Reddit for matching communities
//
// Providers are declared in PROVIDERS below and run in parallel; adding a
// third search backend later means adding one entry, not rewiring callers.
//
// Depends only on window.App (common.js) — no new libraries.
(() => {
  "use strict";

  // Same first-party worker route fetchRssItems uses.
  const PROXY = "/v1/rss/raw?url=";

  // Reddit's JSON search (/subreddits/search.json) returns 403 to anonymous
  // AND Cloudflare-Worker-origin requests, which is why live discovery was
  // dropped in fdbf508. The .rss variant of that same search is NOT blocked,
  // so keyword discovery works again as long as we stay on the RSS endpoint
  // and parse Atom. Re-verify this before assuming it still holds.
  const REDDIT_SEARCH = "https://www.reddit.com/subreddits/search.rss?q=";

  // Search results go straight in front of the user, so the editorial filter
  // the old live-search path had needs to come back with it — a bare query
  // like "detroit" surfaces r/detroitThotz otherwise.
  const BLOCKED = /(nsfw|gonewild|porn|thot|onlyfans|hookup|r4r|dating|personals|sugard|escort|nude|fuck|dirty|kink|milf|gw\b)/i;

  const MAX_PER_PROVIDER = 12;

  const proxied = url => `${PROXY}${encodeURIComponent(url)}`;

  async function fetchXml(url) {
    const res = await fetch(proxied(url), { cache: "no-store" });
    if (!res.ok) throw new Error(`proxy returned ${res.status}`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("feed did not parse as XML");
    return doc;
  }

  // ── Provider: Reddit communities ────────────────────────────────────────
  async function searchReddit(query) {
    const doc = await fetchXml(REDDIT_SEARCH + encodeURIComponent(query));
    const out = [];
    const seen = new Set();
    for (const entry of doc.querySelectorAll("entry")) {
      const href = entry.querySelector("link")?.getAttribute("href") || "";
      const match = href.match(/\/r\/([A-Za-z0-9_]+)\/?$/);
      if (!match) continue;
      const name = match[1];
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      const title = (entry.querySelector("title")?.textContent || "").trim();
      if (BLOCKED.test(name) || BLOCKED.test(title)) continue;
      seen.add(key);
      out.push({
        kind: "reddit",
        name: `r/${name}`,
        detail: title.slice(0, 90),
        rss: `https://www.reddit.com/r/${name}/.rss`,
        site: `https://www.reddit.com/r/${name}/`,
      });
      if (out.length >= MAX_PER_PROVIDER) break;
    }
    return out;
  }

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
    { id: "reddit", label: "Reddit communities", run: searchReddit },
  ];

  // Runs every provider in parallel. A provider that throws reports its own
  // error rather than sinking the whole search — Reddit blocking us again
  // shouldn't take the address lookup down with it.
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
