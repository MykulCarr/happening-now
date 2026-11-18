// Refuses made-up data in anything that ships.
//
//   node scripts/check-real-data.mjs          exit 1 on any finding
//   node scripts/check-real-data.mjs --warn   report, exit 0 (beta deploys)
//
// Why: for seven months the Markets movers cards drew their charts from
// random numbers and an Economic Calendar showed five invented events, both
// presented as real. The code said "MOCK ... replace with real API in
// production" and nobody did. This makes that impossible to miss:
// deploy-prod.ps1 runs it first and stops on any finding.
//
// Two kinds of finding:
//   1. PLACEHOLDER-DATA markers. If a placeholder is ever unavoidable while
//      building something (on beta), mark it with a comment containing
//      PLACEHOLDER-DATA and what would make it real. Beta shows it; it can
//      never reach production until the marker is gone.
//   2. Signs of unmarked fake data: Math.random, and the words mock, fake,
//      dummy, lorem ipsum, sample/demo data, "replace with real". A line that
//      genuinely needs one (randomness for an id, say) carries
//      `real-data-ok: <why>` on the same line.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const warnOnly = process.argv.includes("--warn");

// What ships: the pages, their scripts and styles, the data, the Worker,
// and the Android app's code. Not docs, scripts, tests or the design mockups.
const SCAN = ["assets", "data", "cloudflare-sync-worker/src", "android-widget/app/src/main"];
const SKIP_DIRS = new Set(["widget-app", "node_modules"]);
const EXTENSIONS = /\.(html|js|mjs|css|json|kt|xml)$/;
// Android's widget-picker previews are sample content by design: they are
// the thumbnail shown when choosing a widget, never shown as live data.
const ALLOWED_FILES = [/res[\\/]layout[\\/]preview_[a-z]+\.xml$/];

const SIGNS = [
  [/\bMath\.random\b/, "Math.random"],
  [/\b(mock|fake|dummy)(ed|s)?\b(?!-?up)/i, "mock/fake/dummy"],
  [/lorem ipsum/i, "lorem ipsum"],
  [/\b(sample|demo) (data|prices?|events?|values?)\b/i, "sample/demo data"],
  [/replace with (a )?real/i, "replace with real"],
];

function files() {
  const out = readdirSync(root).filter((f) => f.endsWith(".html")).map((f) => join(root, f));
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p); }
      else if (EXTENSIONS.test(name)) out.push(p);
    }
  };
  for (const d of SCAN) { try { walk(join(root, d)); } catch { /* folder absent */ } }
  return out;
}

const findings = [];
for (const file of files()) {
  if (ALLOWED_FILES.some((re) => re.test(file))) continue;
  const rel = relative(root, file).replaceAll("\\", "/");
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (line.includes("PLACEHOLDER-DATA") && !rel.endsWith("check-real-data.mjs")) {
      findings.push(`${rel}:${i + 1}  PLACEHOLDER-DATA  ${line.trim().slice(0, 120)}`);
      return;
    }
    if (line.includes("real-data-ok:")) return;
    for (const [re, label] of SIGNS) {
      if (re.test(line)) { findings.push(`${rel}:${i + 1}  ${label}  ${line.trim().slice(0, 120)}`); break; }
    }
  });
}

if (!findings.length) {
  console.log("check-real-data: no placeholder or made-up data found.");
  process.exit(0);
}
console.log(`check-real-data: ${findings.length} finding(s). Make it real, remove it, or (if it is not data) mark the line real-data-ok: <why>.`);
for (const f of findings) console.log("  " + f);
process.exit(warnOnly ? 0 : 1);
