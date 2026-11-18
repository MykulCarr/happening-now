// Did a stylesheet change alter how anything looks? Same page, same DOM, two
// sets of stylesheets: every element's computed style (and its ::before /
// ::after) with the CSS on disk, then with each of our stylesheets replaced by
// its text at an earlier commit, compared property by property. Transitions,
// animations and timers are frozen so only the CSS can differ.
//
//   python scripts/dev-server.py 8091        (in another terminal)
//   node scripts/css-compare.mjs [--ref <commit>] [page ...]
//
// --ref defaults to HEAD: "what I have changed but not committed". Pages:
// index weather markets settings widget about android sources privacy terms
// feedback admin (default all), each in dark / middle / light at 390 and
// 1440px, plus dark at 640, 860 and 1050 (every media-query band). Exits
// non-zero on any difference. Written for the 2026-11-17 split of styles.css
// into per-page files; run it whenever a rule moves between files.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = "http://localhost:8091";
const ALL = { index: "/", weather: "/weather", markets: "/markets", settings: "/settings", widget: "/widget?w=all",
  about: "/about", android: "/android", sources: "/sources", privacy: "/privacy", terms: "/terms", feedback: "/feedback", admin: "/admin" };
const args = process.argv.slice(2);
const refAt = args.indexOf("--ref");
const REF = refAt >= 0 ? args.splice(refAt, 2)[1] : "HEAD";
const REPO = join(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..");
// Every assets/*.css as it was at REF ("" if it did not exist then). Pasted
// inline, relative url()s would resolve from the page rather than from
// assets/ as in the real file, so they are made absolute first.
const OLD = {};
for (const f of readdirSync(join(REPO, "assets")).filter((n) => n.endsWith(".css"))) {
  let text = "";
  try { text = execFileSync("git", ["show", `${REF}:assets/${f}`], { cwd: REPO, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] }); } catch { /* new since REF */ }
  OLD[`assets/${f}`] = text.replace(/url\((['"]?)(?!data:|https?:|\/|#)/g, "url($1/assets/");
}
const wanted = args;
const PAGES = wanted.length ? Object.fromEntries(wanted.map((p) => [p, ALL[p]])) : ALL;
const STATES = [
  ...["dark", "middle", "light"].flatMap((theme) => [390, 1440].map((width) => ({ theme, width }))),
  ...[640, 860, 1050].map((width) => ({ theme: "dark", width })),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 400);
const proc = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-web-security",
  `--remote-debugging-port=${port}`, "--no-first-run", `--user-data-dir=${mkdtempSync(join(tmpdir(), "d-"))}`, "about:blank"], { stdio: "ignore" });
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.method === "Page.javascriptDialogOpening") ws.send(JSON.stringify({ id: ++id, method: "Page.handleJavaScriptDialog", params: { accept: true } })); pending.get(d.id)?.(d); pending.delete(d.id); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable"); await send("Network.enable");
await send("Network.setBypassServiceWorker", { bypass: true });
await send("Network.setCacheDisabled", { cacheDisabled: true });

// In the page: snapshot, swap, snapshot, compare. Returns the differences.
const compare = async (oldFiles) => {
  clearInterval(window.__jasTopClockTimer); // the ticking clock changes widths between snapshots
  for (let t = setInterval(() => {}, 1e6); t > 0; t--) clearInterval(t);
  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}";
  document.head.appendChild(freeze);
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await frame();
  const els = [...document.querySelectorAll("*")];
  const snap = () => els.map((el) => {
    const out = [];
    for (const pseudo of [null, "::before", "::after"]) {
      const cs = getComputedStyle(el, pseudo);
      if (pseudo && (cs.content === "none" || cs.content === "normal")) { out.push(""); continue; }
      let s = ""; for (let i = 0; i < cs.length; i++) s += cs[i] + ":" + cs.getPropertyValue(cs[i]) + ";";
      out.push(s);
    }
    return out;
  });
  const inlineBefore = els.map((el) => el.getAttribute("style"));
  const a = snap();
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
  // Each of our stylesheets is replaced, in place, by its old text.
  for (const l of links) {
    const href = (l.getAttribute("href") || "").replace(/^\//, "").replace(/\?.*$/, "");
    if (!(href in oldFiles)) continue;
    const old = document.createElement("style");
    old.textContent = oldFiles[href];
    l.parentNode.insertBefore(old, l);
    l.disabled = true;
  }
  await frame();
  const b = snap();
  const diffs = [];
  els.forEach((el, k) => {
    // Script moved it between snapshots (the scrolling ticker): not the CSS.
    if (el.getAttribute("style") !== inlineBefore[k]) return;
    for (let j = 0; j < 3; j++) {
      if (a[k][j] === b[k][j]) continue;
      const pa = Object.fromEntries(a[k][j].split(";").filter(Boolean).map((x) => [x.slice(0, x.indexOf(":")), x.slice(x.indexOf(":") + 1)]));
      const pb = Object.fromEntries(b[k][j].split(";").filter(Boolean).map((x) => [x.slice(0, x.indexOf(":")), x.slice(x.indexOf(":") + 1)]));
      const props = [...new Set([...Object.keys(pa), ...Object.keys(pb)])].filter((p) => pa[p] !== pb[p]);
      const name = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : "");
      diffs.push(name + ["", "::before", "::after"][j] + " " + props.slice(0, 4).map((p) => `${p}: new=${pa[p]} old=${pb[p]}`).join(" | "));
    }
  });
  return { elements: els.length, diffs: diffs.slice(0, 12), count: diffs.length };
};

let total = 0;
for (const [name, path] of Object.entries(PAGES)) {
  for (const { theme, width } of STATES) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await send("Page.navigate", { url: ORIGIN + "/about" });
    await sleep(600);
    await send("Runtime.evaluate", { expression: `localStorage.setItem("jas_cfg_v3", JSON.stringify(Object.assign(JSON.parse(localStorage.getItem("jas_cfg_v3")||"{}"), {theme:"${theme}", zipCode:"49201", stocks:[{symbol:"NVDA"},{symbol:"AAPL"}]})))` });
    await send("Page.navigate", { url: ORIGIN + path });
    await sleep(6500);
    const r = await send("Runtime.evaluate", { expression: `(${compare})(${JSON.stringify(OLD)})`, returnByValue: true, awaitPromise: true });
    const v = r.result?.result?.value;
    if (!v) { console.log(`${name} ${theme} ${width}: ERROR ${JSON.stringify(r.result?.exceptionDetails || r).slice(0, 200)}`); total++; continue; }
    total += v.count;
    console.log(`${name} ${theme} ${width}: ${v.elements} elements, ${v.count} differ`);
    for (const d of v.diffs) console.log("    " + d.slice(0, 300));
  }
}
console.log(total ? `\n${total} difference(s) against ${REF}` : `\nNo differences against ${REF}`);
await send("Browser.close").catch(() => {});
proc.kill();
process.exit(total ? 1 : 0);
