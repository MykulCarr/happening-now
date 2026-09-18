// Forces every ops reminder to fire, and proves each one stays quiet when it
// should. This exists because of the failure the reminder pattern is prone to:
// a check that only ever reports "nothing due" looks exactly like a working
// one. Every branch below is therefore provoked on demand, not just observed.
//
//   node scripts/test-reminders.mjs
import {
  dueReminders, parseSecurityExpires, buildReminderEmail,
  isoWeekKey, monthKey, quarterKey, SECURITY_WARN_DAYS, REMIND_AGAIN_DAYS,
} from "../cloudflare-sync-worker/src/reminders.mjs";

let failures = 0;
const ok = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures += 1;
};

const DAY = 86400000;
const at = iso => new Date(iso);
const ids = due => due.map(d => d.id).sort().join(",");
const stateFor = now => ({
  opsWeekly: isoWeekKey(now), opsMonthly: monthKey(now), opsQuarterly: quarterKey(now),
});

// --- period keys
ok("ISO week of 2026-01-01 is 2026-W01", isoWeekKey(at("2026-01-01T13:00:00Z")) === "2026-W01");
ok("ISO week rolls on Monday", isoWeekKey(at("2026-09-14T13:00:00Z")) !== isoWeekKey(at("2026-09-13T13:00:00Z")));
ok("same week, different days share a key", isoWeekKey(at("2026-09-15T13:00:00Z")) === isoWeekKey(at("2026-09-18T13:00:00Z")));
ok("month key", monthKey(at("2026-09-18T13:00:00Z")) === "2026-09");
ok("quarter key", quarterKey(at("2026-09-18T13:00:00Z")) === "2026-Q3");
ok("quarter rolls in October", quarterKey(at("2026-10-01T13:00:00Z")) === "2026-Q4");

// --- forced fire: a cold start owes all three check-ins
const cold = at("2026-09-18T13:00:00Z");
ok("cold start fires all three check-ins",
  ids(dueReminders({ now: cold, state: {} })) === "opsMonthly,opsQuarterly,opsWeekly");

// --- and stays quiet once stamped
ok("already-stamped state fires nothing",
  dueReminders({ now: cold, state: stateFor(cold) }).length === 0);

// --- each period independently provoked
const nextWeek = at("2026-09-22T13:00:00Z");   // same month/quarter, new ISO week
ok("new week fires weekly only",
  ids(dueReminders({ now: nextWeek, state: stateFor(cold) })) === "opsWeekly");

const nextMonth = at("2026-10-05T13:00:00Z");  // new week, month AND quarter
ok("new quarter fires all three",
  ids(dueReminders({ now: nextMonth, state: stateFor(cold) })) === "opsMonthly,opsQuarterly,opsWeekly");

const midQuarter = at("2026-11-02T13:00:00Z"); // new week + month, same quarter
ok("new month inside a quarter fires weekly+monthly",
  ids(dueReminders({ now: midQuarter, state: stateFor(nextMonth) })) === "opsMonthly,opsWeekly");

// --- security.txt expiry, forced through every branch
const base = stateFor(cold);
const expiring = days => new Date(cold.getTime() + days * DAY);

ok("expiry far out is silent",
  dueReminders({ now: cold, state: base, securityExpires: expiring(200) }).length === 0);
ok("expiry inside the window fires",
  ids(dueReminders({ now: cold, state: base, securityExpires: expiring(SECURITY_WARN_DAYS - 1) })) === "securityTxt");
ok("expiry exactly at the boundary fires",
  ids(dueReminders({ now: cold, state: base, securityExpires: expiring(SECURITY_WARN_DAYS) })) === "securityTxt");
ok("a missing expiry never fires",
  dueReminders({ now: cold, state: base, securityExpires: null }).length === 0);

const expired = dueReminders({ now: cold, state: base, securityExpires: expiring(-3) });
ok("an already-expired file fires", expired.length === 1);
ok("and says EXPIRED, with the day count", /EXPIRED 3 day\(s\) ago/.test(expired[0].label));
ok("a pending expiry counts down instead",
  /expires in 10 day\(s\)/.test(dueReminders({ now: cold, state: base, securityExpires: expiring(10) })[0].label));

// --- the re-nag window
const justSent = { ...base, securityTxt: new Date(cold.getTime() - 2 * DAY).toISOString() };
ok("re-nag is suppressed inside the repeat window",
  dueReminders({ now: cold, state: justSent, securityExpires: expiring(10) }).length === 0);
const longAgo = { ...base, securityTxt: new Date(cold.getTime() - (REMIND_AGAIN_DAYS + 1) * DAY).toISOString() };
ok("re-nag resumes after the repeat window",
  ids(dueReminders({ now: cold, state: longAgo, securityExpires: expiring(10) })) === "securityTxt");

// --- parsing the real file's shape
ok("parses the live Expires line",
  parseSecurityExpires("Contact: mailto:x@y\nExpires: 2027-09-12T00:00:00.000Z\n")?.toISOString() === "2027-09-12T00:00:00.000Z");
ok("un-stamped placeholder parses as nothing", parseSecurityExpires("Expires: __EXPIRES__") === null);
ok("absent Expires parses as nothing", parseSecurityExpires("Contact: mailto:x@y") === null);
ok("empty input parses as nothing", parseSecurityExpires("") === null);

// --- the email itself
const mail = buildReminderEmail(dueReminders({ now: cold, state: {} }));
ok("email names the due count", /3 item\(s\) due/.test(mail.html));
ok("email subject carries the count", mail.subject === "Happening Now: 3 ops item(s) due");
ok("email escapes HTML in labels",
  /&lt;script&gt;/.test(buildReminderEmail([{ id: "x", label: "<script>", detail: "d" }]).html));

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
