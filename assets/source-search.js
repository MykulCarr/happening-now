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

  // Same first-party worker route fetchRssItems uses. Taken from App rather
  // than written out again so it carries the API_ORIGIN prefix — a literal
  // "/v1/..." here 404s on a local dev server, which has no /v1 routes.
  const PROXY = window.App.RSS_PROXY_BASE;

  // Reddit's JSON search (/subreddits/search.json) returns 403 to anonymous
  // AND Cloudflare-Worker-origin requests, which is why live discovery was
  // dropped in fdbf508. The .rss variant of that same search is NOT blocked,
  // so keyword discovery works again as long as we stay on the RSS endpoint
  // and parse Atom. Re-verify this before assuming it still holds.
  const REDDIT_SEARCH = "https://www.reddit.com/subreddits/search.rss?q=";

  // ── Result safety + relevance filter ────────────────────────────────────
  // These results get published into a public-facing news dashboard, so the
  // filter is deliberately aggressive: dropping a legitimate sub is a much
  // cheaper mistake than surfacing an explicit or illegal one, and anything
  // wrongly dropped is still addable by pasting its RSS URL directly.
  //
  // It has to be done here. Reddit gives us nothing server-side: the Atom
  // search output carries no over_18 marker, and `include_over_18=off` is
  // silently ignored on the .rss endpoint (both verified 2026-07-26).
  //
  // Sub names are camelCase ("DetroitButts"), so matching has to be on
  // substrings — but naive substrings wreck real place names (Butte MT,
  // Cumberland, Dickinson ND, Analy, Essex). splitWords() breaks camelCase
  // and separators into spaces first so every pattern below can anchor on
  // \b and stay precise.
  const splitWords = s => String(s || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-./]+/g, " ")
    .toLowerCase();

  const BLOCKED = new RegExp([
    // sexual / adult
    // Patterns run AFTER splitWords, so "OnlyFansGirls" arrives as
    // "only fans girls" — every glued-together term needs an optional space.
    "nsfw|nsfl|porn|hentai|rule ?34|gone ?wild|\\bgw\\b|only ?fans?",
    // \b on butt/tit/ass is load-bearing: without it this blocks Butte MT,
    // Titusville and Assateague.
    "\\bnude|naked|\\btits?\\b|boobs?|\\bass\\b|asses|\\bbutts?\\b|booty|thigh|cleavage",
    "lingerie|bikini|\\bcock\\b|\\bdick\\b|pussy|\\bcum\\b|blowjob|\\banal\\b|creampie",
    "orgasm|masturb|\\bmilf\\b|cougar|thots?|escorts?|hooker|camgirl|sext|strip ?club",
    "fetish|kink|bdsm|femdom|hookups?|dating|personals|casual ?encounters",
    "sugar ?(baby|daddy|mommy)|swinger",
    // Personals shorthand. \bnsa\b ("no strings attached") also catches the
    // National Security Agency, which is a legitimate news topic — accepted
    // deliberately, because r/PhoenixNsa got through without it and a missed
    // hookup sub costs more here than a missed NSA feed someone can paste.
    "\\br4r\\b|\\bfwb\\b|\\bnsa\\b|\\bdtf\\b|\\b[mfwt]4[mfwt]\\b",
    // illegal trade / illicit
    "dark ?(net|web)|silk ?road|black ?market|counterfeit|stolen|carding|fullz",
    // Replica-goods trade. Not \breps\b — that would block "state reps".
    "rep ?sneakers|replica ?(shoe|sneaker|watch|bag|jersey)|knock ?off",
    "piracy|pirated|warez|torrents?|crackwatch|free ?(movies|streams)",
    "drug ?(source|market)|research ?chemicals|\\brcs?ources\\b|plug ?matching",
    "heroin|\\bmeth\\b|cocaine|fentanyl|opiates|shrooms|\\blsd\\b",
    "guns? ?for ?sale|weapons? ?deal|ghost ?guns?|3d ?guns?|silencers?",
    // graphic violence / gore
    "\\bgore\\b|watch ?people ?die|beheading|death ?video|fight ?porn|combat ?footage",
    // hate / harassment
    "nazi|white ?(pride|power)|racial ?slur|incel|black ?pill|fem ?cel|hate ?crime",
    // not-news noise that keeps showing up in place queries
    "circle ?jerk|shit ?post|copypasta|cringe|\\bfuck|sucks?\\b|roommates?\\b",
  ].join("|"), "i");

  // Rejected outright even when it's genuinely local. This picker feeds a news
  // dashboard, so restaurant listings, deal-hunting and fandom subs are noise
  // however close to home they are — "detroit" pulls r/Pizza in on a
  // description match, and r/AnnArborFreebees is just classifieds.
  // Careful with anything that doubles as a place name: \bcook\b would take
  // out Cook County, which is why this says "cooking|recipes" instead.
  const OFF_TOPIC = new RegExp([
    "\\bfood\\b|foodie|restaurant|dining|\\beats\\b|menu|pizza|\\bbbq\\b|brunch|recipes?|cooking",
    "deals?\\b|coupons?|discount|freeb(ie|ee)s?|for ?sale|marketplace|classified|buy ?sell|swap ?shop",
    "flea ?market|garage ?sale|advertis|promo ?code|referral",
    "gaming|gamers?\\b|minecraft|pokemon|\\banime\\b|manga|cosplay|fandom|comics?\\b",
    "\\bdnd\\b|dungeons|board ?games?|\\btcg\\b|warhammer|speedrun",
    "tattoos?\\b|sneakers?\\b|streetwear|crypto|\\bnft\\b|dropship",
    // Music-scene and nightlife fandom. Deliberately NOT "concerts" or
    // "events" — a local events sub is exactly the "happenings" side of what
    // this picker is for.
    "\\bedm\\b|\\bdj\\b|\\brave\\b|nightclub|nightlife|clubbing",
  ].join("|"), "i");

  // All-lowercase glued names ("chicagofood", "detroitdeals") never hit a
  // camelCase boundary, so splitWords leaves them as a single token and the
  // \b-anchored OFF_TOPIC above cannot see inside them. This second pass
  // matches those terms as bare substrings of the raw name. Deliberately kept
  // to unambiguous nouns — "eats" or "deals" unanchored would start chewing
  // through ordinary words.
  const OFF_TOPIC_GLUED = new RegExp([
    "food|restaurant|dining|pizza|recipe|brunch",
    "coupon|freeb|forsale|marketplace|classified|discount",
    "gaming|minecraft|pokemon|anime|manga|cosplay|fandom",
    "tattoo|sneaker|streetwear|crypto|nightlife",
  ].join("|"), "i");

  // What we actually want: news, civic life, community, science and human
  // interest. Ranked to the top of the list.
  const NEWS_SIGNAL = new RegExp([
    "\\bnews|newspaper|times|post|herald|gazette|journal|tribune|chronicle",
    "dispatch|observer|sentinel|bulletin|press\\b|daily|weekly|report|media",
    "politic|government|civic|council|mayor|election|legislat|court|policy",
    "\\blocal\\b|\\bcity\\b|county|metro|region|statewide|neighborhood|residents?\\b",
    "weather|traffic|transit|crime|schools?\\b|educat|health|hospital|housing",
    "community|events?\\b|happening|discussion|\\bask\\b|history|culture|arts?\\b",
    "science|scientific|research|environment|climate|space|nature|technology",
    "human ?interest|profile|feature|investigat|documentar",
  ].join("|"), "i");

  // Sport is wanted, but a place query returns a wall of it — "detroit" alone
  // brings four team subs plus r/nba, r/nfl, r/hockey and r/baseball. Kept,
  // ranked last, and capped (MAX_SPORTS) so it can't crowd out the news.
  const SPORTS = new RegExp([
    "\\bsports?\\b|football|basketball|baseball|hockey|soccer|athletics?\\b",
    "\\bnfl\\b|\\bnba\\b|\\bmlb\\b|\\bnhl\\b|\\bmls\\b|\\bncaa\\b|college ?(foot|basket)ball",
    "playoffs?|\\bdraft\\b|fantasy ?(foot|basket)ball|tailgate|\\bfans?\\b of",
  ].join("|"), "i");

  const hayFor = (name, title, description) =>
    `${splitWords(name)} ${splitWords(title)} ${splitWords(description)}`;

  const isAllowed = (name, title, description, queryTokens) => {
    const haystack = hayFor(name, title, description);
    // Safety is judged across all three fields — a sub can look innocuous in
    // the name and give itself away in the sidebar, or the reverse.
    if (BLOCKED.test(haystack)) return false;
    // Topic, though, is judged on the NAME alone. A sub *named* chicagofood is
    // a food sub; r/Detroit — whose sidebar reads "News, Events, Food,
    // Discussion, and More about Detroit" — plainly is not. Matching OFF_TOPIC
    // against the description would throw away the single best result for
    // almost every city in the list.
    if (OFF_TOPIC.test(splitWords(name)) || OFF_TOPIC_GLUED.test(String(name || ""))) return false;
    const named = queryTokens.some(tok => haystack.includes(tok));
    return named || NEWS_SIGNAL.test(haystack);
  };

  // 0 = news/community/science, 1 = other on-topic, 2 = sport.
  // Sport is tested first on purpose: team subs almost all describe themselves
  // as a "community", which would otherwise promote them to 0 and defeat the
  // cap that keeps them from crowding out the news.
  const rankOf = haystack =>
    SPORTS.test(haystack) ? 2 : NEWS_SIGNAL.test(haystack) ? 0 : 1;

  // Tokens short enough to collide with everything ("mi", "us") are useless as
  // a relevance signal, so only words of 4+ characters count.
  const queryTokensOf = q => splitWords(q).split(/\s+/).filter(t => t.length >= 4);

  const MAX_PER_PROVIDER = 12;
  const MAX_SPORTS = 3;

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
    const tokens = queryTokensOf(query);
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
      // The sidebar blurb lives in <content> as escaped HTML. It's the most
      // telling field of the three about what a sub actually is, and the
      // first cut of this filter ignored it entirely.
      const description = (entry.querySelector("content")?.textContent || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!isAllowed(name, title, description, tokens)) continue;
      seen.add(key);
      out.push({
        kind: "reddit",
        name: `r/${name}`,
        detail: (title.replace(/^r\/\S+:\s*/, "") || description).slice(0, 90),
        rss: `https://www.reddit.com/r/${name}/.rss`,
        site: `https://www.reddit.com/r/${name}/`,
        _rank: rankOf(hayFor(name, title, description)),
      });
    }
    let sportsShown = 0;
    return out
      .sort((a, b) => a._rank - b._rank)
      .filter(item => item._rank !== 2 || ++sportsShown <= MAX_SPORTS)
      .slice(0, MAX_PER_PROVIDER)
      .map(({ _rank, ...item }) => item);
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
