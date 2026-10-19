/* /admin: the two analytics views — "Usage" (our own anonymous counters,
 * /v1/usage) and "Cloudflare" (Web Analytics + zone traffic,
 * /v1/admin/cloudflare). admin.js owns the page; this file only renders.
 *
 * Exposes window.HNAdminAnalytics.create(ctx), where ctx gives back the
 * shared bits: esc, row, getData, rerender(view), currentView.
 */
(function () {
  "use strict";

  function create({ esc, row, getData, rerender, currentView }) {
    const state = { usage: { days: "days7", tab: "visitors" }, cloudflare: { days: 7, tab: "visitors" } };
    const cf = {};          // days -> response, once it has arrived
    const cfPending = {};   // days -> the one in-flight request

    // ── formatting ──
    const fmtN = (n) => Number(n || 0).toLocaleString();
    const fmtBytes = (b) => { const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; b = Number(b || 0); while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; } return `${b.toFixed(i ? 1 : 0)} ${u[i]}`; };
    const regionNames = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
    function countryName(cc) {
      if (cc === "XX" || cc === "(none)") return "Unknown";
      try { return regionNames?.of(cc) || cc; } catch { return cc; }
    }
    const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    // "news:science" -> "News › science"
    const placeName = (p) => p === "start" ? "Arrived" : p.split(":").map((x, i) => (i ? x : capital(x))).join(" › ");
    const FRIENDLY = {
      ChromeMobile: "Chrome (phone)", ChromeDerivative: "Chrome-based", MobileSafari: "Safari (iPhone/iPad)",
      SamsungInternet: "Samsung Internet", FirefoxMobile: "Firefox (phone)", MacOSX: "macOS", iOS: "iOS",
      desktop: "Desktop", mobile: "Phone", tablet: "Tablet", Unknown: "Unknown",
    };
    const friendly = (k) => FRIENDLY[k] || k;
    function referrerName(k) {
      if (k === "(none)") return "Direct / app";
      const h = k.replace(/^www\./, "");
      if (h === location.hostname.replace(/^beta\./, "")) return "Within the site";
      if (/cloudflareaccess\.com$/.test(h)) return "Admin login";
      return h;
    }

    // ── building blocks ──
    // A labelled bar: count, and its share of `total` when there is one.
    function bar(label, n, max, total) {
      const pct = max ? Math.round((n / max) * 100) : 0;
      const share = total ? `<span class="adBarPct">${Math.round((n / total) * 100)}%</span>` : "";
      return `<div class="adBar adBarWide" title="${esc(label)}: ${fmtN(n)}"><span>${esc(label)}</span>
        <span class="adBarTrack"><span class="adBarFill" style="width:${pct}%"></span></span>
        <span class="adBarNum">${fmtN(n)}${share}</span></div>`;
    }
    // [[key, n], ...] -> bars, largest first. Shares are of the whole list.
    function bars(pairs, label = (k) => k, limit = 12) {
      const total = pairs.reduce((s, [, n]) => s + n, 0);
      const top = pairs.slice(0, limit), max = top[0]?.[1] || 0;
      return top.map(([k, n]) => bar(label(k), n, max, total)).join("");
    }
    function totals(rows, key) {
      const m = new Map();
      for (const r of rows) m.set(key(r), (m.get(key(r)) || 0) + r.n);
      return [...m.entries()].sort((x, y) => y[1] - x[1]);
    }
    // Each section is a panel; a tab's panels sit in a grid that is one column
    // on a phone and two on a desktop. `wide` spans the full row.
    const section = (title, body, note = "", wide = false) => body ? `<section class="adPanel${wide ? " adSpan" : ""}">
      ${title ? `<h3 class="adSection">${esc(title)}</h3>` : ""}${note ? `<p class="adSmall">${esc(note)}</p>` : ""}${body}</section>` : "";
    const grid = (html) => `<div class="adGrid">${html}</div>`;
    const stat = (label, value, sub = "") => `<div class="adStat"><span class="adStatNum">${esc(value)}</span><span class="adSmall">${esc(label)}</span>${sub ? `<span class="adStatSub">${esc(sub)}</span>` : ""}</div>`;
    const chips = (view, key, options) => `<div class="adChips" role="group">${options.map(([k, l]) =>
      `<button type="button" class="npChip${k === state[view][key] ? " active" : ""}" data-an="${view}" data-an-key="${key}" data-an-val="${k}">${esc(l)}</button>`).join("")}</div>`;
    const empty = (msg) => `<p class="hint">${esc(msg)}</p>`;

    // Visits per day: one series, so no legend; the title names it. Each
    // column shows its value on hover/focus; the peak is labelled directly.
    function dayChart(days, title) {
      if (!days.length) return "";
      const max = Math.max(1, ...days.map((d) => d.n));
      const peak = days.reduce((a, b) => (b.n > a.n ? b : a));
      const wd = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString([], { weekday: "short", timeZone: "UTC" });
      const label = (iso) => days.length <= 8 ? wd(iso) : iso.slice(8);
      const every = days.length <= 8 ? 1 : 5;
      return section(title, `
        <div class="adCols" role="img" aria-label="${esc(title)}: ${days.map((d) => `${d.day} ${d.n}`).join(", ")}">
          ${days.map((d, i) => `<div class="adCol" tabindex="0" title="${esc(d.day)}: ${fmtN(d.n)}">
            <span class="adColTip">${esc(d.day.slice(5))} · ${fmtN(d.n)}</span>
            ${d === peak ? `<span class="adColPeak">${fmtN(d.n)}</span>` : ""}
            <span class="adColArea"><span class="adColBar" style="height:${Math.max(2, Math.round((d.n / max) * 100))}%"></span></span>
            <span class="adColLabel">${i % every === 0 || days.length <= 8 ? esc(label(d.day)) : ""}</span>
          </div>`).join("")}
        </div>`, "", true);
    }

    // ── Usage view ──
    const TIME_ORDER = ["0-10s", "10-30s", "30-60s", "1-3m", "3-10m", "10m+"];
    const TIME_LABEL = { "0-10s": "Under 10 sec", "10-30s": "10–30 sec", "30-60s": "30–60 sec", "1-3m": "1–3 min", "3-10m": "3–10 min", "10m+": "Over 10 min" };
    function timeView(rows) {
      if (!rows.length) return empty("No time-on-page counts yet.");
      const pages = totals(rows, (r) => r.a);
      return `<p class="adSmall">Each time a page is on screen counts once, until it leaves the screen. "Typical" is the middle look: half were shorter, half longer.</p>
        <div class="adList">${pages.map(([page, n]) => {
          const by = TIME_ORDER.map((b) => [b, rows.filter((r) => r.a === page && r.b === b).reduce((s, r) => s + r.n, 0)]);
          let seen = 0, typical = TIME_ORDER[0];
          for (const [b, c] of by) { seen += c; if (seen >= n / 2) { typical = b; break; } }
          const max = Math.max(...by.map(([, c]) => c));
          return row(`<span class="adName">${esc(capital(page))}</span><span class="adTag">typical ${esc(TIME_LABEL[typical])}</span><span class="adCount adCountEnd">${fmtN(n)}</span>`,
            by.map(([b, c]) => bar(TIME_LABEL[b], c, max, n)).join(""));
        }).join("")}</div>`;
    }
    // Journeys and visit length, from the daily visitor hash (visitors.mjs).
    const LENGTH_ORDER = ["0-10s", "10-60s", "1-3m", "3-10m", "10-30m", "30m+"];
    const LENGTH_LABEL = { "0-10s": "Under 10 sec", "10-60s": "10–60 sec", "1-3m": "1–3 min", "3-10m": "3–10 min", "10-30m": "10–30 min", "30m+": "Over 30 min" };
    function typicalLength(v) {
      let seen = 0;
      for (const b of LENGTH_ORDER) { seen += v.lengths.find((x) => x.b === b)?.n || 0; if (seen >= v.visitors / 2) return LENGTH_LABEL[b]; }
      return "–";
    }
    function visitorsView(v) {
      if (!v || !v.visitors) return section("", empty("No visitor data yet: it started with this release."), "", true);
      const max = Math.max(...v.lengths.map((x) => x.n));
      return dayChart(v.byDay.map((d) => ({ day: d.day, n: d.n })), "Unique visitors per day")
        + section("How long visits last", LENGTH_ORDER.map((b) => bar(LENGTH_LABEL[b], v.lengths.find((x) => x.b === b)?.n || 0, max, v.visitors)).join(""),
            "Time the site was actually on screen, added up across a visit.")
        + section("Most common journeys", v.paths.length ? `<div class="adList">${v.paths.map((p) => row(
            `<span class="adName">${esc(p.path.split(">").map(placeName).join(" → "))}</span><span class="adCount adCountEnd">${fmtN(p.n)}</span>`,
            `<p class="adSmall">${esc(p.path.split(">").length)} steps · ${esc(p.path)}</p>`)).join("")}</div>` : "",
            "A visit is one visitor's steps within a single day. Visitors can't be followed from one day to the next.");
    }

    function viewUsage() {
      const st = state.usage;
      const u = getData()?.usage?.[st.days];
      const head = chips("usage", "days", [["days7", "7 days"], ["days30", "30 days"]]);
      if (!u) return `${head}<p class="hint adBad">Couldn't read usage.</p>`;
      const arrivals = u.nav.filter((x) => x.a === "start");
      const moves = u.nav.filter((x) => x.a !== "start");
      const nArrivals = arrivals.reduce((s, x) => s + x.n, 0);
      const v = u.visitors;
      const strip = `<div class="adStats">
        ${stat("Unique visitors", v ? fmtN(v.visitors) : "–", "counted per day")}
        ${stat("Pages per visitor", v?.visitors ? (v.pages / v.visitors).toFixed(1) : "–")}
        ${stat("Typical visit", v?.visitors ? typicalLength(v) : "–")}
        ${stat("Headlines opened", fmtN(u.source.reduce((s, x) => s + x.n, 0)))}
      </div>`;
      const tabs = chips("usage", "tab", [["visitors", "Visitors"], ["moves", "Movement"], ["sources", "Sources"], ["controls", "Buttons"], ["time", "Time on page"], ["where", "Countries"]]);
      let body = "";
      if (st.tab === "visitors") {
        body = visitorsView(v);
      } else if (st.tab === "moves") {
        body = section("Where visits start", bars(totals(arrivals, (r) => r.b), placeName))
          + section("Pages and tabs opened", bars(totals(u.nav, (r) => r.b), placeName, 20))
          + section("Most common moves", moves.length ? `<div class="adList">${moves.slice(0, 25).map((m) => row(
              `<span class="adName">${esc(placeName(m.a))} → ${esc(placeName(m.b))}</span><span class="adCount adCountEnd">${fmtN(m.n)}</span>`,
              `<p class="adSmall">${esc(m.a)} → ${esc(m.b)}</p>`)).join("")}</div>` : "",
            "Single steps only: nobody is followed, so these never join up into journeys.", true);
      } else if (st.tab === "sources") {
        const sources = totals(u.source, (r) => r.a);
        body = sources.length ? section("Sources opened", `<div class="adList">${sources.slice(0, 40).map(([site, n]) => row(
            `<span class="adName">${esc(site)}</span><span class="adCount adCountEnd">${fmtN(n)}</span>`,
            bars(totals(u.source.filter((r) => r.a === site), (r) => r.b), (p) => `from ${placeName(p)}`))).join("")}</div>`,
          "The website of each headline opened, never the article. Tap one to see where on the site it was clicked.", true) : empty("No headlines opened yet.");
      } else if (st.tab === "controls") {
        const pages = totals(u.tap, (r) => r.a);
        body = pages.length ? pages.map(([page]) => section(capital(page),
          bars(totals(u.tap.filter((r) => r.a === page), (r) => r.b), (b) => b.replace(/-/g, " "), 30))).join("") : empty("No buttons used yet.");
      } else if (st.tab === "time") {
        body = section("", timeView(u.time || []), "", true);
      } else {
        body = section("Visits by country", bars(totals(u.country, (r) => r.a), countryName, 30), "From Cloudflare's lookup of each visit's connection; the IP address itself is never stored.");
      }
      return `${head}
        ${u.capped.length ? `<p class="hint adBad">Daily cap hit on ${esc(u.capped.join(", "))}: some counts were dropped.</p>` : ""}
        ${nArrivals || u.source.length ? `${strip}${tabs}${grid(body)}` : empty("Nothing counted yet.")}`;
    }

    // ── Cloudflare view ──
    function loadCf(days) {
      cfPending[days] ||= fetch(`/v1/admin/cloudflare?days=${days}`, { credentials: "same-origin", cache: "no-store" })
        .then(async (res) => (res.ok ? (await res.json()).cloudflare : { error: `HTTP ${res.status}` }))
        .catch((e) => ({ error: e.message }))
        .then((c) => (cf[days] = c));
      return cfPending[days];
    }
    const errLine = (part) => `<p class="hint adBad">Cloudflare said: ${esc(part.error)}</p>`;
    function rumBars(title, part, label = friendly) {
      if (!part) return "";
      if (part.error) return section(title, errLine(part));
      if (!part.data.length) return "";
      return section(title, bars(part.data.map((r) => [r.k, r.views]), label));
    }
    // Core Web Vitals at the 75th percentile, graded by Google's thresholds.
    function vitals(part) {
      if (part?.error) return errLine(part);
      const q = part?.data?.quantiles;
      if (!q) return empty("No page-speed samples yet.");
      const grade = (v, good, poor) => v == null ? "" : v <= good ? "✓ good" : v <= poor ? "▲ needs work" : "✕ poor";
      const ms = (us) => us == null ? "–" : us >= 1e6 ? `${(us / 1e6).toFixed(1)} s` : `${Math.round(us / 1000)} ms`;   // Cloudflare reports microseconds
      return `<p class="adSmall">75% of page loads are this fast or faster. Grades are Google's Core Web Vitals thresholds.</p>
        <div class="adStats">
          ${stat("Main content shows", ms(q.largestContentfulPaintP75), grade(q.largestContentfulPaintP75 / 1000, 2500, 4000))}
          ${stat("Response to a tap", ms(q.interactionToNextPaintP75), grade(q.interactionToNextPaintP75 / 1000, 200, 500))}
          ${stat("Layout jumping", q.cumulativeLayoutShiftP75 == null ? "–" : Number(q.cumulativeLayoutShiftP75).toFixed(2), grade(q.cumulativeLayoutShiftP75, 0.1, 0.25))}
        </div>`;
    }
    function viewCloudflare() {
      const st = state.cloudflare;
      const head = chips("cloudflare", "days", [[7, "7 days"], [30, "30 days"]]);
      const c = cf[st.days];
      if (!c) {
        const wanted = st.days;
        loadCf(wanted).then(() => currentView() === "cloudflare" && state.cloudflare.days === wanted && rerender("cloudflare"));
        return `${head}${empty("Asking Cloudflare…")}`;
      }
      if (c.error) return `${head}${errLine(c)}`;
      const days = c.byDay?.data || [];
      const visits = days.reduce((s, d) => s + d.visits, 0), views = days.reduce((s, d) => s + d.views, 0);
      const t = c.traffic?.data;
      const strip = `<div class="adStats">
        ${stat("Visits", fmtN(visits))}
        ${stat("Page views", fmtN(views))}
        ${stat("Pages per visit", visits ? (views / visits).toFixed(1) : "–")}
        ${stat("Busiest day", days.length ? fmtN(Math.max(...days.map((d) => d.visits))) : "–")}
      </div>`;
      const tabs = chips("cloudflare", "tab", [["visitors", "Visitors"], ["pages", "Pages"], ["tech", "Devices"], ["speed", "Speed"], ["traffic", "All traffic"]]);
      let body = "";
      if (st.tab === "visitors") {
        body = (c.byDay?.error ? errLine(c.byDay) : dayChart(days.map((d) => ({ day: d.day, n: d.visits })), "Visits per day"))
          + rumBars("Where visitors came from", c.referrers, referrerName)
          + rumBars("Countries", c.countries, countryName);
      } else if (st.tab === "pages") {
        body = rumBars("Most viewed pages", c.pages);
      } else if (st.tab === "tech") {
        body = rumBars("Device", c.devices) + rumBars("Browser", c.browsers) + rumBars("Operating system", c.os);
      } else if (st.tab === "speed") {
        body = section("Page speed", vitals(c.vitals), "", true);
      } else {
        body = c.traffic?.error ? section("All traffic", errLine(c.traffic), "", true) : !t ? "" :
          section("All traffic", `<div class="adStats">
            ${stat("Requests", fmtN(t.requests))}
            ${stat("Served from cache", t.requests ? `${Math.round((t.cached / t.requests) * 100)}%` : "–")}
            ${stat("Data served", fmtBytes(t.bytes))}
            ${stat("Threats blocked", fmtN(t.threats))}
          </div>`, "Every request Cloudflare served for the whole domain, bots and FlightTrack included, so it runs far higher than visits.", true)
          + dayChart(t.uniquesByDay.map((d) => ({ day: d.day, n: d.requests })), "Requests per day")
          + section("Response codes", bars(t.statuses.map((x) => [x.k, x.n])))
          + section("Requests by country", bars(t.countries.map((x) => [x.k, x.n]), countryName));
      }
      return `${head}${strip}${tabs}${grid(body)}`;
    }

    // Chips inside either view. Returns true when it handled the click.
    function onClick(e) {
      const chip = e.target.closest("[data-an]");
      if (!chip) return false;
      const { an: view, anKey: key, anVal: val } = chip.dataset;
      state[view][key] = view === "cloudflare" && key === "days" ? Number(val) : val;
      rerender(view);
      return true;
    }

    // Tiles: usage from the summary we already have; Cloudflare fetched in the background.
    function fillTiles($) {
      const u = getData()?.usage?.days7;
      $("tUsage").textContent = u ? fmtN(u.visitors?.visitors ?? u.nav.filter((x) => x.a === "start").reduce((t, x) => t + x.n, 0)) : "!";
      $("tUsageSub").textContent = !u ? "couldn't read" : u.country[0] ? `top: ${countryName(u.country[0].a)}` : "none yet";
      loadCf(7).then((c) => {
        const bad = c?.error || c?.byDay?.error;
        $("tCf").textContent = bad ? "!" : fmtN(c.byDay.data.reduce((s, x) => s + x.visits, 0));
        $("tCfSub").textContent = bad ? "couldn't read" : "visits";
        if (currentView() === "cloudflare") rerender("cloudflare");
      });
    }

    return { viewUsage, viewCloudflare, onClick, fillTiles };
  }

  window.HNAdminAnalytics = { create };
})();
