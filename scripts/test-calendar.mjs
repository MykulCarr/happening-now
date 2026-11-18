// npm run test:calendar — the economic calendar's parsers against small
// copies of the real BEA and Federal Reserve formats (as served 2026-11-18).
import { parseBeaIcs, parseFomcPage, upcoming } from "../cloudflare-sync-worker/src/calendar.mjs";

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

const ics = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "SUMMARY:Gross Domestic Product\\, 4th Quarter and Year 2024 (Advance Estima",
  " te)",
  "DTSTART;VALUE=DATE-TIME:20250130T133000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:Personal Income and Outlays\\, October 2026",
  "DTSTART:20261125T133000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:U.S. International Trade in Goods and Services\\, May 2026",
  "DTSTART:20260707T123000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:Outdoor Recreation Economic Statistics",
  "DTSTART:20261120T133000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:Gross Domestic Product by State and Personal Income by State",
  "DTSTART:20261223T133000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:GDP by County and Personal Income by County\\, 2025",
  "DTSTART:20261202T133000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const bea = parseBeaIcs(ics);
check("keeps the three market releases, drops the rest", bea.length === 3);
check("unfolds a long title and unescapes commas",
  bea[0]?.title === "Gross Domestic Product, 4th Quarter and Year 2024 (Advance Estimate)");
check("a time without Z is UTC: 13:30 in November is 08:30 Eastern",
  bea[1]?.date === "2026-11-25" && bea[1]?.time === "08:30");
check("summer 12:30Z is also 08:30 Eastern", bea[2]?.time === "08:30");
check("PCE note on personal income", bea[1]?.note === "includes PCE inflation");

const page = `
<h4><a id="1">2026 FOMC Meetings</a></h4>
<div class="fomc-meeting__month col-xs-5"><strong>October</strong></div>
<div class="fomc-meeting__date col-xs-4">27-28</div>
<div class="fomc-meeting__month col-xs-5"><strong>December</strong></div>
<div class="fomc-meeting__date col-xs-4">8-9*</div>
<h4><a id="2">2025 FOMC Meetings</a></h4>
<div class="fomc-meeting__month col-xs-5"><strong>August</strong></div>
<div class="fomc-meeting__date col-xs-4">22 (notation vote)</div>
<div class="fomc-meeting__month col-xs-5"><strong>Apr/May</strong></div>
<div class="fomc-meeting__date col-xs-4">30-1</div>
`;
const fomc = parseFomcPage(page);
check("skips the notation vote", fomc.length === 3);
check("decision is on the meeting's last day", fomc[1]?.date === "2026-12-09");
check("asterisk means economic projections", /projections/.test(fomc[1]?.note || ""));
check("a meeting across a month end lands in the later month", fomc[2]?.date === "2025-05-01");
check("a page with no meetings parses to nothing", parseFomcPage("<html></html>").length === 0);

const now = new Date("2026-11-18T15:00:00Z");
const list = upcoming([...bea, ...fomc], now);
check("upcoming drops past events and sorts soonest first",
  list.map((e) => e.date).join() === "2026-11-25,2026-12-09");
check("an event later today still shows", upcoming([{ date: "2026-11-18", time: "08:30" }], now).length === 1);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
