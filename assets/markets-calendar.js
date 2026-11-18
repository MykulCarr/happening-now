// Markets page: the Economic Calendar card. Upcoming US releases from the
// agencies' own schedules (BEA's calendar file and the Fed's FOMC page),
// gathered by /v1/markets/calendar. Brought back 2026-11-18 with real data;
// the card that was here before listed five invented events.
// Standalone: it needs nothing from stocks.js, so it shares no state.
(() => {
  "use strict";
  const { API_ORIGIN, escapeHtml, isSectionHidden } = window.App;
  const container = document.getElementById("economicCalendar");
  if (!container || isSectionHidden("stocks", "econCalendar")) return;

  // "2026-12-09" -> "Wed, Dec 9" without the visitor's time zone moving it a day.
  function dayLabel(ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      timeZone: "UTC", weekday: "short", month: "short", day: "numeric",
    });
  }

  // "08:30" -> "8:30 a.m. ET". Both agencies publish in Eastern time.
  function timeLabel(hhmm) {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."} ET`;
  }

  function render(data) {
    const events = data?.events || [];
    if (!events.length) {
      container.innerHTML = `<div class="hint">No releases found in the next few weeks.</div>`;
      return;
    }
    const rows = events.map((e) => `
      <a class="econEvent" href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">
        <span class="econWhen">${escapeHtml(dayLabel(e.date))}${e.time ? `<span class="econTime">${timeLabel(e.time)}</span>` : ""}</span>
        <span class="econWhat">${escapeHtml(e.title)}<span class="econNote">${escapeHtml(e.source)} · ${escapeHtml(e.note)}</span></span>
      </a>`).join("");
    // Say plainly what is missing rather than letting a short list look complete.
    const missing = [];
    if (!data.sources?.bea) missing.push("BEA");
    if (!data.sources?.fomc) missing.push("Federal Reserve");
    const gap = missing.length ? ` ${missing.join(" and ")} could not be reached just now.` : "";
    container.innerHTML = `${rows}<div class="hint econFoot">From the BEA release schedule and the Fed's FOMC calendar. CPI and jobs reports (BLS) are not included.${gap}</div>`;
  }

  fetch(`${API_ORIGIN}/v1/markets/calendar`)
    .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
    .then(render)
    .catch(() => {
      container.innerHTML = `<div class="hint">The calendar could not be loaded. It will try again next visit.</div>`;
    });
})();
