// /v1/markets/calendar: upcoming US economic releases, from the agencies'
// own published schedules. Nothing here is typed in by hand.
//
//   - BEA (GDP, personal income and outlays, which carries PCE inflation, and
//     the trade balance) publishes an iCalendar file.
//   - The Federal Reserve publishes FOMC meeting dates only as a web page, so
//     that page is read and its date cells parsed. If its layout changes the
//     parse finds nothing and the card simply shows BEA alone.
//
// BLS (CPI, the jobs report) is missing on purpose: on 2026-11-18 its
// calendar file answered an honest client with "Access Denied", and getting
// past that by pretending to be a browser is not something we do.
//
// .mjs so plain node can import it for scripts/test-calendar.mjs.
import { FEED_READER_UA } from "./upstream-headers.mjs";

export const BEA_ICS_URL = "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics";
export const FOMC_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

const WINDOW_DAYS = 45;
const MAX_EVENTS = 8;
// Both schedules change a few times a year, so a day-old copy is fine.
const UPSTREAM_TTL = 6 * 60 * 60;

// BEA lists ~30 kinds of release; these three are the ones markets watch.
const BEA_KEEP = [
  // "GDP (Advance Estimate)..." or "Gross Domestic Product, 3rd Quarter...",
  // not "GDP by County" or "Gross Domestic Product by State".
  { test: /^(GDP \(|Gross Domestic Product,)/, note: "GDP" },
  { test: /^Personal Income and Outlays/, note: "includes PCE inflation" },
  { test: /^U\.S\. International Trade in Goods and Services/, note: "trade balance" },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

// "YYYY-MM-DD" and "HH:MM" in New York time, which is how both agencies
// state their schedules.
function easternParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function parseBeaIcs(text) {
  // Long lines are folded onto the next line with a leading space.
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const events = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const summary = (block.match(/^SUMMARY:(.*)$/m) || [])[1];
    const start = (block.match(/^DTSTART[^:]*:(\d{8}T\d{6})Z?\s*$/m) || [])[1];
    if (!summary || !start) continue;
    const title = summary.replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
    const kind = BEA_KEEP.find((k) => k.test.test(title));
    if (!kind) continue;
    // Every time in the file is UTC, including the newer entries written
    // without the trailing Z: 133000 is the 8:30 a.m. Eastern release slot in
    // winter, 123000 in summer. Read as New York time they would say 1:30 p.m.
    const iso = `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}T` +
      `${start.slice(9, 11)}:${start.slice(11, 13)}:00Z`;
    const at = new Date(iso);
    if (isNaN(at)) continue;
    events.push({ ...easternParts(at), title, note: kind.note, source: "BEA", url: "https://www.bea.gov/news/schedule" });
  }
  return events;
}

export function parseFomcPage(html) {
  const events = [];
  const sections = html.split(/(\d{4}) FOMC Meetings/);
  for (let i = 1; i < sections.length; i += 2) {
    const year = Number(sections[i]);
    const body = sections[i + 1];
    const months = [...body.matchAll(/fomc-meeting__month[^>]*>\s*(?:<strong>)?([^<]+)/g)].map((m) => m[1].trim());
    const dates = [...body.matchAll(/fomc-meeting__date[^>]*>\s*([^<]+)/g)].map((m) => m[1].trim());
    months.forEach((monthText, n) => {
      // "27-28", "17-18*" (* = with economic projections), "30-1" across a
      // month end as "Apr/May". Anything else ("22 (notation vote)") is not
      // a scheduled meeting.
      const d = (dates[n] || "").match(/^(\d{1,2})-(\d{1,2})(\*?)$/);
      if (!d) return;
      const lastMonth = monthText.split("/").pop();
      const m = MONTHS.findIndex((name) => name.startsWith(lastMonth));
      if (m < 0) return;
      const day = d[2].padStart(2, "0");
      events.push({
        date: `${year}-${String(m + 1).padStart(2, "0")}-${day}`,
        time: null,
        title: "FOMC rate decision",
        note: d[3] ? `meeting ${monthText} ${d[1]}-${d[2]}, with economic projections` : `meeting ${monthText} ${d[1]}-${d[2]}`,
        source: "Federal Reserve",
        url: FOMC_URL,
      });
    });
  }
  return events;
}

// Events from today (New York) through the window, soonest first.
export function upcoming(events, now = new Date()) {
  const today = easternParts(now).date;
  const until = easternParts(new Date(now.getTime() + WINDOW_DAYS * 86400000)).date;
  return events
    .filter((e) => e.date >= today && e.date <= until)
    .sort((a, b) => (a.date + (a.time || "99")).localeCompare(b.date + (b.time || "99")))
    .slice(0, MAX_EVENTS);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": FEED_READER_UA },
    cf: { cacheEverything: true, cacheTtl: UPSTREAM_TTL },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

export async function getEconomicCalendar() {
  const [bea, fomc] = await Promise.allSettled([
    fetchText(BEA_ICS_URL).then(parseBeaIcs),
    fetchText(FOMC_URL).then(parseFomcPage),
  ]);
  const all = [...(bea.value || []), ...(fomc.value || [])];
  return {
    ok: all.length > 0,
    events: upcoming(all),
    // Which sources answered, so the card can say plainly what it is missing.
    sources: {
      bea: bea.status === "fulfilled" && bea.value.length > 0,
      fomc: fomc.status === "fulfilled" && fomc.value.length > 0,
    },
  };
}
