// The link between this site and the Android widget app (android-widget/).
//
// The app can't read the site's saved settings, so the site hands them over:
// a link back into the app with the settings packed inside it. Phone to
// phone — nothing here talks to a server.
//
// Pairing: the app opens a page with ?send=<its link scheme>&k=<its private
// code>. We remember both in this browser only (hn_widget_link_v1, kept out of
// cfg on purpose: it must never travel in a settings export). Every link we
// build carries the code, which is how the app knows a link is ours and can
// apply it without asking. A browser that was never paired does nothing here.
//
// Once paired, whenever the settings differ from what the widget was last
// sent, a small "Update phone widget" bar appears.
(function () {
  const App = window.App;
  const KEY = "hn_widget_link_v1";
  const SCHEMES = ["hnwidget", "hnwidgetdebug"]; // the real build and the beta build
  const CODE = /^[a-f0-9]{16,64}$/;

  const read = () => {
    try {
      const p = JSON.parse(localStorage.getItem(KEY));
      return p && SCHEMES.includes(p.scheme) && CODE.test(p.k) ? p : null;
    } catch { return null; }
  };
  const write = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private window */ } };

  const query = new URLSearchParams(location.search);
  if (SCHEMES.includes(query.get("send")) && CODE.test(query.get("k") || "")) {
    write({ ...(read() || {}), scheme: query.get("send"), k: query.get("k") });
  }

  // What the widget needs: place, each news category with its outlets already
  // chosen (so the app needs none of the site's picking logic), the watchlist.
  async function settings() {
    const cfg = App.cfg;
    const loc = await App.resolvePreferredLocation({ cfg, autoDetect: false }).catch(() => null);
    const state = loc?.state ? App.abbreviateState(loc.state).toUpperCase().replace(/^US-/, "") : ""; // GPS lookups say "US-MI"
    const place = loc?.city ? `${loc.city}${state ? `, ${state}` : ""}` : "";
    const getGeo = async () => (loc?.city ? { city: loc.city, state: loc.state || "" } : null);

    const cats = [];
    for (const c of await App.getNewsCategories()) {
      // Every source the news page shows for this category (up to 8); the
      // ticker's short list only if that is somehow empty, so a category never
      // arrives with nothing to fetch.
      let feeds = (await App.getCategorySources(c.id, cfg, getGeo)).widgets.slice(0, 8);
      if (!feeds.length) feeds = await App.getTopFeedsForScope(c.id, getGeo);
      let label = c.label; // local and regional say where they cover
      if (c.id === "local" && place) label += ` · ${place.toUpperCase()}`;
      if (c.id === "regional" && loc?.state) label += ` · ${(App.expandStateName(loc.state) || loc.state).toUpperCase()}`;
      cats.push({
        id: c.id,
        label,
        feeds: feeds.map((f) => ({
          // "NPR - National" and "WLNS 6 (Lansing/Jackson, CBS)" are both just the outlet.
          name: (f.name || new URL(f.rss).hostname.replace(/^www\./, "")).split(" - ")[0].replace(/\s*\(.*\)$/, ""),
          rss: f.rss,
        })),
      });
    }
    const out = {
      place, cats,
      cat: cfg.newsScope || cfg.newsTickerScope || "national",
      tempUnit: cfg.weatherTempUnit || "fahrenheit",
      symbols: (cfg.stocks || []).map((s) => String(s.symbol || s).split(":").pop().toUpperCase()),
    };
    if (loc && Number.isFinite(+loc.lat) && Number.isFinite(+loc.lon)) { out.lat = +loc.lat; out.lon = +loc.lon; }
    return out;
  }

  // URL-safe base64 of the UTF-8 JSON, so it survives being a link.
  const pack = (obj) => {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const fingerprint = (text) => { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0; return h.toString(36); };

  // { href, sig } for what the widget would be sent right now, or null when
  // unpaired. `sig` leaves out which category is showing: flipping tabs is
  // not a settings change, and must not raise the update bar.
  async function build() {
    const p = read();
    if (!p) return null;
    const s = await settings();
    const { cat, ...lasting } = s;
    return {
      href: `intent://setup?k=${p.k}&d=${pack(s)}#Intent;scheme=${p.scheme};end`,
      sig: fingerprint(JSON.stringify(lasting)),
    };
  }

  /** Point a link at the app, and note what was sent once it's tapped. */
  function attach(a, built, onSent) {
    a.href = built.href;
    a.onclick = () => { write({ ...read(), sent: built.sig }); onSent?.(); };
  }

  // ---- the "Update phone widget" bar --------------------------------------
  let bar = null, timer = 0;
  const hideBar = () => { bar?.remove(); bar = null; };

  async function check() {
    const built = await build().catch(() => null);
    // Settings has its own always-there send button; keep its link current.
    const settingsSend = document.getElementById("widgetAppSend");
    if (built && settingsSend) attach(settingsSend, built, hideBar);
    if (!built || built.sig === read()?.sent) return hideBar();
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "widgetLinkBar";
      bar.innerHTML = `<span>Your settings changed.</span><a data-analytics="widget-update">Update phone widget</a><button type="button" aria-label="Dismiss" data-analytics="widget-update-dismiss">✕</button>`;
      bar.querySelector("button").onclick = hideBar;
      document.body.appendChild(bar);
    }
    attach(bar.querySelector("a"), built, hideBar);
  }

  if (read()) {
    // Saves often come in bursts (a slider, several toggles); wait for a pause.
    window.addEventListener("hn:config-saved", () => { clearTimeout(timer); timer = setTimeout(check, 800); });
    // On load too — unless this is the pairing visit, where the Today page shows its own button.
    if (!query.has("send")) setTimeout(check, 1500);
  }

  // Is the app published on this site? Resolves to its version info, or null.
  // Production has no version file until the app is launched, which is what
  // keeps every mention of the widget out of sight there until then.
  let publishedOnce = null;
  const published = () => (publishedOnce ||= fetch("/assets/widget-app/version.json")
    .then((r) => (r.ok ? r.json() : null)).catch(() => null));

  // ---- Settings > System: the widget's own section -------------------------
  // Shown only where the app is published. Unpaired, it points at the download
  // page; paired, it also offers a send button for whenever you want one
  // (the bar above only appears when something has changed).
  const section = document.getElementById("widgetAppSection");
  if (section) published().then(async (version) => {
    if (!version) return;
    section.style.display = "";
    if (!read()) return;
    document.getElementById("widgetAppStatus").textContent =
      "This phone is paired with the widget app. When you change your location, news or watchlist, a bar offers to update the widget; you can also send your settings any time.";
    document.getElementById("widgetAppGet").textContent = "About the widget";
    const send = document.getElementById("widgetAppSend");
    attach(send, await build(), hideBar);
    send.style.display = "";
  }).catch(() => {});

  // (The one-time "the widget is here" card now lives in assets/whats-new.js,
  // which asks paired() and published() below.)

  App.widgetLink = { paired: read, build, attach, published };
})();
