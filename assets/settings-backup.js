// Backup and transfer that work in every browser, Firefox and Safari included.
//
// "Sync to a File" (settings-sync.js) needs a browser that lets a page write
// back to a file the user picked. Only Chromium does; Mozilla has said Firefox
// will not. So this file offers what every browser can do:
//
//   • Save backup file  — downloads the settings as a dated .json file.
//   • Load backup file  — reads one back, after asking.
//   • Transfer link     — the settings packed into a link, for moving them to
//                         another browser or device.
//
// Nothing here talks to a server. A transfer link keeps the settings after
// the "#", the part of an address browsers never send; and settings.html
// lifts it out of the address before any analytics script can read it (see
// the first <script> in its <head>, which leaves it in window.__hnImport).
//
// What was last backed up is remembered in hn_backup_v1, outside cfg like the
// other per-browser keys: it describes this browser, and must not travel.
(() => {
  "use strict";
  const App = window.App;
  const KEY = "hn_backup_v1";
  const $ = (id) => document.getElementById(id);
  const ui = {
    status: $("backupStatus"), save: $("backupSaveBtn"), load: $("backupLoadBtn"), file: $("backupFile"),
    make: $("transferMakeBtn"), box: $("transferBox"), link: $("transferLink"), copy: $("transferCopyBtn"), share: $("transferShareBtn"),
  };
  if (!ui.save) return; // only Settings has this section

  const settings = () => App.normalizeConfig(App.cfg);
  const fingerprint = (text) => { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0; return h.toString(36); };
  const remembered = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

  // ---- status line ----------------------------------------------------------
  function showStatus(message) {
    const last = remembered();
    const changed = last.sig && last.sig !== fingerprint(JSON.stringify(settings()));
    const when = last.at ? new Date(last.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
    ui.status.textContent = message
      || (!last.at ? "No backup saved from this browser yet."
        : changed ? `Your settings have changed since your last backup (${when}).`
          : `Backed up ${when}. Nothing has changed since.`);
    ui.status.className = `syncStatusPanel is-${message ? "ok" : changed || !last.at ? "warn" : "ok"}`;
  }
  window.addEventListener("hn:config-saved", () => showStatus());

  // ---- checking and applying settings that came from outside ---------------
  // A backup file or a transfer link is outside input. normalizeConfig keeps
  // only what the site understands; this just refuses things that are plainly
  // not a settings file, and nothing is applied without the reader saying yes.
  function describe(cfg) {
    const place = cfg.zipCode ? `ZIP ${cfg.zipCode}` : Number.isFinite(cfg.deviceLat) ? "a saved GPS location" : "no saved location";
    return `${(cfg.widgets || []).length} news sources, ${(cfg.stocks || []).length} watchlist stocks, ${place}`;
  }
  function apply(raw, from) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !(Array.isArray(raw.widgets) || Array.isArray(raw.stocks))) {
      showStatus(`That ${from} doesn't contain Happening Now settings.`);
      return;
    }
    const incoming = App.normalizeConfig(raw);
    if (!confirm(`Replace this browser's settings with the ones from that ${from}?\n\n${describe(incoming)}\n\nOnly continue if the ${from} is one you made yourself.`)) return;
    App.saveConfig(incoming);
    location.reload(); // every control on the page re-reads the new settings
  }

  // ---- A: backup file --------------------------------------------------------
  ui.save.addEventListener("click", () => {
    const text = JSON.stringify(settings(), null, 2);
    const a = document.createElement("a");
    // Dated, because browsers that can't overwrite save a new file each time.
    a.download = `happening-now-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), sig: fingerprint(JSON.stringify(settings())) })); } catch { /* private window */ }
    showStatus();
  });

  ui.load.addEventListener("click", () => ui.file.click());
  ui.file.addEventListener("change", async () => {
    const file = ui.file.files[0];
    ui.file.value = ""; // so picking the same file again still fires
    if (!file) return;
    try { apply(JSON.parse(await file.text()), "file"); }
    catch { showStatus("That file isn't valid JSON."); }
  });

  // ---- D: transfer link ------------------------------------------------------
  // Packed as "z" + deflated JSON where the browser can compress (all current
  // ones), else "j" + plain JSON; both base64url, so the link survives being
  // pasted or shared.
  const toBase64Url = (bytes) => {
    let s = "";
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const through = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

  async function pack(cfg) {
    const bytes = new TextEncoder().encode(JSON.stringify(cfg));
    if (typeof CompressionStream === "function") {
      try { return "z" + toBase64Url(await through(bytes, new CompressionStream("deflate-raw"))); } catch { /* fall through */ }
    }
    return "j" + toBase64Url(bytes);
  }
  async function unpack(packed) {
    let bytes = fromBase64Url(packed.slice(1));
    if (packed[0] === "z") bytes = await through(bytes, new DecompressionStream("deflate-raw"));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  ui.make.addEventListener("click", async () => {
    ui.link.value = `${location.origin}/settings#import=${await pack(settings())}`;
    ui.box.style.display = "";
    ui.share.style.display = typeof navigator.share === "function" ? "" : "none";
    ui.link.select();
  });
  ui.copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(ui.link.value); showStatus("Link copied. Open it in the other browser."); }
    catch { ui.link.select(); showStatus("Couldn't copy automatically. The link is selected: copy it by hand."); }
  });
  ui.share.addEventListener("click", () => {
    navigator.share({ title: "My Happening Now settings", url: ui.link.value }).catch(() => { /* cancelled */ });
  });

  // Arriving by a transfer link.
  if (window.__hnImport) {
    const packed = window.__hnImport;
    window.__hnImport = null;
    unpack(packed).then((cfg) => apply(cfg, "link")).catch(() => showStatus("That transfer link is damaged or incomplete."));
  }

  showStatus();
})();
