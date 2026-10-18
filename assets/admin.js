/* /admin: three summary tiles that fit one screen; tapping a tile opens its
 * detail view below. Rows in a detail view are one line each and expand on
 * tap. The open view lives in the URL hash (#reports, #pulse, #sweep) so
 * refresh and Back keep your place. Read-only.
 *
 * Data comes from /v1/admin/summary, which needs a Cloudflare Access login.
 * Same-origin only: on localhost there is no Access session, so this page
 * only works on happening-now.net.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => window.App.escapeHtml(String(s ?? ""));
  const VIEWS = { reports: "Reader reports · last 30 days", pulse: "Is it useful? · last 30 days", sweep: "Feed sweep" };
  let data = null;
  let names = null;          // rss URL -> source name, from the three catalogs
  let reasonFilter = "all";

  async function loadNames() {
    if (names) return;
    names = new Map();
    const get = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [news, topics, local] = await Promise.all([get("/data/news-sources.json"), get("/data/topic-sources.json"), get("/data/local-stations.json")]);
    for (const s of news?.sources || []) names.set(s.rss, s.name);
    for (const t of Object.values(topics?.topics || {})) for (const e of t.entries || []) names.set(e.rss, e.name);
    for (const st of Object.values(local?.states || {})) for (const n of Object.values(st)) for (const e of n.entries || []) names.set(e.rss, e.name);
  }
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const nameOf = (rss) => names?.get(rss) || host(rss);
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  // ── tiles ──
  function renderTiles() {
    const r = data?.reports, p = data?.pulse, s = data?.sweep;
    $("tReports").textContent = r ? r.total : "!";
    $("tReportsSub").textContent = !r ? "couldn't read" : r.rows[0] ? `top: ${r.rows[0].label.toLowerCase()}` : "none";
    $("tPulse").textContent = !p ? "!" : p.total ? `${Math.round((p.useful.yes / p.total) * 100)}%` : "–";
    $("tPulseSub").textContent = !p ? "couldn't read" : p.total ? plural(p.total, "answer") : "no answers";
    $("tSweep").textContent = s ? (s.phase === "verify" ? `${s.cursor}/${s.pending}` : String(s.cursor)) : "–";
    $("tSweepSub").textContent = !s ? "not started" : s.phase === "verify" ? "verifying" : `${plural(s.pending, "suspect")}`;
  }

  // ── detail views ──
  // One expandable row: a summary line, and a body revealed on tap.
  const row = (summary, body) => `
    <details class="adRow">
      <summary>${summary}</summary>
      <div class="adRowBody">${body}</div>
    </details>`;
  const links = (urls) => urls.map((a) => `<a class="adLink" href="${esc(a)}" target="_blank" rel="noopener">${esc(a)}</a>`).join("");

  function viewReports() {
    const r = data?.reports;
    if (!r) return `<p class="hint adBad">Couldn't read reports.</p>`;
    if (!r.rows.length) return `<p class="hint">No reports in the last 30 days.</p>`;
    const reasons = [...new Map(r.rows.map((x) => [x.reason, x.label])).entries()];
    const chips = `<div class="adChips">${[["all", "All"], ...reasons].map(([k, l]) =>
      `<button type="button" class="npChip${k === reasonFilter ? " active" : ""}" data-reason="${esc(k)}">${esc(l)}</button>`).join("")}</div>`;
    const shown = r.rows.filter((x) => reasonFilter === "all" || x.reason === reasonFilter);
    return `${chips}
      ${r.capped.length ? `<p class="hint adBad">Daily cap hit on ${esc(r.capped.join(", "))}: some reports were dropped.</p>` : ""}
      <div class="adList">${shown.map((x) => row(
        `<span class="adCount">${x.n}×</span><span class="adName">${esc(nameOf(x.feed))}</span><span class="adTag">${esc(x.label)}</span>`,
        `<p class="adSmall">Example${x.articles.length === 1 ? "" : "s"}:</p>${links(x.articles)}
         <p class="adSmall">Feed:</p>${links([x.feed])}`)).join("")}</div>`;
  }

  function bar(label, n, total) {
    const pct = total ? Math.round((n / total) * 100) : 0;
    return `<div class="adBar"><span>${esc(label)}</span><span class="adBarTrack"><span class="adBarFill" style="width:${pct}%"></span></span><span class="adBarNum">${n}</span></div>`;
  }
  function viewPulse() {
    const p = data?.pulse;
    if (!p) return `<p class="hint adBad">Couldn't read answers.</p>`;
    if (!p.total) return `<p class="hint">No answers in the last 30 days.</p>`;
    return `<p class="hint">${plural(p.total, "answer")}</p>
      ${bar("Yes", p.useful.yes, p.total)}${bar("Somewhat", p.useful.somewhat, p.total)}${bar("Not really", p.useful.no, p.total)}
      <p class="adSmall adGap">Use most (people can pick more than one)</p>
      ${bar("News", p.uses.news, p.total)}${bar("Weather", p.uses.weather, p.total)}${bar("Stocks", p.uses.stocks, p.total)}`;
  }

  function viewSweep() {
    const s = data?.sweep;
    if (!s) return `<p class="hint">No sweep state yet: the daily check hasn't run since the last digest.</p>`;
    const verifying = s.phase === "verify";
    const done = verifying ? s.cursor : s.cursor, of = verifying ? s.pending : null;
    const line = verifying
      ? `Re-checking ${plural(s.pending, "suspect feed")} through the site: ${s.cursor}/${s.pending} done, ${s.confirmed} confirmed broken so far.`
      : `${done} feeds checked this round, ${plural(s.pending, "suspect")} so far. Suspects get a second check before anything is emailed.`;
    return `<p class="hint">${esc(line)}</p>
      ${of ? `<div class="adBar"><span>Progress</span><span class="adBarTrack"><span class="adBarFill" style="width:${Math.round((done / of) * 100)}%"></span></span><span class="adBarNum">${done}</span></div>` : ""}
      ${s.findings?.length ? `<div class="adList">${s.findings.map((f) => row(
        `<span class="adName">${esc(f.name)}</span><span class="adTag">${esc(f.problem || "suspect")}</span>`,
        `<p class="adSmall">${esc(f.state === "news" || f.state === "topic" ? `${f.state} · ${f.place}` : `${f.state} / ${f.place}`)}</p>${links([f.rss])}`)).join("")}</div>` : ""}
      <p class="adSmall adGap">Reports last emailed through ${esc(data.reportsThrough || "never")}. The digest goes out when a round finishes.</p>`;
  }

  const RENDER = { reports: viewReports, pulse: viewPulse, sweep: viewSweep };

  function show(view) {
    const open = RENDER[view] && data ? view : "";
    document.querySelectorAll(".adTile").forEach((t) => {
      const on = t.dataset.view === open;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    $("adDetail").hidden = !open;
    if (!open) return;
    $("adDetailTitle").textContent = VIEWS[open];
    $("adDetailBody").innerHTML = RENDER[open]();
  }
  const currentView = () => location.hash.slice(1);

  document.querySelectorAll(".adTile").forEach((t) => t.addEventListener("click", () => {
    const next = currentView() === t.dataset.view ? "" : t.dataset.view;
    history.pushState(null, "", next ? `#${next}` : location.pathname);
    show(next);
  }));
  $("adClose").addEventListener("click", () => { history.pushState(null, "", location.pathname); show(""); });
  window.addEventListener("popstate", () => show(currentView()));
  $("adDetailBody").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-reason]");
    if (!chip) return;
    reasonFilter = chip.dataset.reason;
    show("reports");
  });

  async function load() {
    $("adSignedIn").textContent = "Loading…";
    try {
      const [res] = await Promise.all([fetch("/v1/admin/summary", { credentials: "same-origin", cache: "no-store" }), loadNames()]);
      if (res.status === 401) throw new Error("Not signed in. Reload to log in.");
      if (!res.ok) throw new Error(`Couldn't load (HTTP ${res.status}).`);
      data = await res.json();
      $("adSignedIn").textContent = `${data.signedInAs || "admin"} · ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      renderTiles();
      show(currentView());
    } catch (e) {
      $("adSignedIn").textContent = e.message;
    }
  }
  $("adRefresh").addEventListener("click", load);
  load();
})();
