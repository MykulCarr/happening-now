/* /admin: reader reports, "is it useful?" answers and the feed sweep, on
 * demand instead of waiting for the digest email. Read-only.
 *
 * Data comes from /v1/admin/summary, which needs a Cloudflare Access login.
 * Same-origin only: on localhost there is no Access session, so this page
 * only works on happening-now.net.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => window.App.escapeHtml(String(s ?? ""));
  let names = null;   // rss URL -> source name, from the three catalogs

  async function loadNames() {
    if (names) return names;
    names = new Map();
    const get = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [news, topics, local] = await Promise.all([get("/data/news-sources.json"), get("/data/topic-sources.json"), get("/data/local-stations.json")]);
    for (const s of news?.sources || []) names.set(s.rss, s.name);
    for (const t of Object.values(topics?.topics || {})) for (const e of t.entries || []) names.set(e.rss, e.name);
    for (const st of Object.values(local?.states || {})) for (const n of Object.values(st)) for (const e of n.entries || []) names.set(e.rss, e.name);
    return names;
  }
  const nameOf = (rss) => names?.get(rss) || (() => { try { return new URL(rss).hostname.replace(/^www\./, ""); } catch { return rss; } })();

  function renderReports(r) {
    if (!r) return `<p class="hint adBad">Couldn't read reports.</p>`;
    if (!r.rows.length) return `<p class="hint">No reports. Either everything is fine or nobody has tapped ⚑ yet.</p>`;
    return `<p class="hint">${r.total} report${r.total === 1 ? "" : "s"}${r.capped.length ? ` · <span class="adBad">daily cap hit on ${esc(r.capped.join(", "))}</span>` : ""}</p>
      <div class="adList">${r.rows.map((x) => `
        <div class="adRow">
          <div class="adCount">${x.n}×</div>
          <div class="adMain">
            <div><strong>${esc(x.label)}</strong> · ${esc(nameOf(x.feed))}</div>
            ${x.articles.map((a) => `<a class="adLink" href="${esc(a)}" target="_blank" rel="noopener">${esc(a)}</a>`).join("")}
          </div>
        </div>`).join("")}</div>`;
  }

  function bar(label, n, total) {
    const pct = total ? Math.round((n / total) * 100) : 0;
    return `<div class="adBar"><span class="adBarLabel">${esc(label)}</span>
      <span class="adBarTrack"><span class="adBarFill" style="width:${pct}%"></span></span>
      <span class="adBarNum">${n}</span></div>`;
  }
  function renderPulse(p) {
    if (!p) return `<p class="hint adBad">Couldn't read answers.</p>`;
    if (!p.total) return `<p class="hint">No answers yet.</p>`;
    return `<p class="hint">${p.total} answer${p.total === 1 ? "" : "s"}</p>
      ${bar("Yes", p.useful.yes, p.total)}${bar("Somewhat", p.useful.somewhat, p.total)}${bar("Not really", p.useful.no, p.total)}
      <p class="fbLabel">Use most</p>
      ${bar("News", p.uses.news, p.total)}${bar("Weather", p.uses.weather, p.total)}${bar("Stocks", p.uses.stocks, p.total)}`;
  }

  function renderSweep(s, through) {
    if (!s) return `<p class="hint">No sweep state yet. The daily check hasn't run since it was reset.</p>`;
    const phase = s.phase === "verify"
      ? `Verifying: re-checking ${s.pending} suspect feed${s.pending === 1 ? "" : "s"} through the site (${s.cursor}/${s.pending}), ${s.confirmed} confirmed so far`
      : `Scanning: ${s.cursor} feeds checked this round, ${s.pending} suspect so far`;
    return `<p class="hint">${esc(phase)}. The digest email goes out when the round finishes.</p>
      ${s.findings?.length ? `<div class="adList">${s.findings.map((f) => `
        <div class="adRow"><div class="adMain"><div><strong>${esc(f.name)}</strong> · ${esc(f.state === "news" || f.state === "topic" ? f.place : `${f.state}/${f.place}`)}</div>
          <div class="hint">${esc(f.problem || "")}</div><a class="adLink" href="${esc(f.rss)}" target="_blank" rel="noopener">${esc(f.rss)}</a></div></div>`).join("")}</div>` : ""}
      <p class="hint">Reports emailed through: ${esc(through || "never")}</p>`;
  }

  async function load() {
    $("adSignedIn").textContent = "Loading…";
    try {
      const [res] = await Promise.all([fetch("/v1/admin/summary", { credentials: "same-origin", cache: "no-store" }), loadNames()]);
      if (res.status === 401) throw new Error("Not signed in. Reload the page to log in through Cloudflare Access.");
      if (!res.ok) throw new Error(`Couldn't load (HTTP ${res.status}).`);
      const d = await res.json();
      $("adSignedIn").textContent = `Signed in as ${d.signedInAs || "admin"} · ${new Date().toLocaleString()}`;
      $("adReports").innerHTML = renderReports(d.reports);
      $("adPulse").innerHTML = renderPulse(d.pulse);
      $("adSweep").innerHTML = renderSweep(d.sweep, d.reportsThrough);
    } catch (e) {
      $("adSignedIn").textContent = e.message;
      for (const id of ["adReports", "adPulse", "adSweep"]) $(id).innerHTML = "";
    }
  }
  $("adRefresh").addEventListener("click", load);
  load();
})();
