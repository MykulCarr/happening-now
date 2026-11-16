// Sync settings across browsers and devices with a sync code.
//
// Turning sync on makes a random code on this device. Three things are derived
// from it, all here in the browser (HKDF-SHA-256):
//
//   id    where the server files the settings        (sent)
//   auth  the password for reading and writing them  (sent; the server keeps a hash)
//   key   an AES-256-GCM key                          (never leaves the browser)
//
// The settings are encrypted with `key` before they are sent, so the server
// (cloudflare-sync-worker/src/sync.mjs) only ever holds a scrambled copy it
// cannot read. Anyone with the code can read the settings; nobody without it
// can, us included. Type the code into another browser and it follows along.
//
// How it stays in step: a change here is sent a few seconds later; each time a
// page opens, it asks whether there is something newer and applies it. It is
// whole-settings and newest-wins, not a merge.
//
// Three settings are left out on purpose: which news tab, ticker scope and
// market group you are on. Those say where you are, not what you prefer, and
// change with every tap.
//
// The code and sync bookkeeping live in hn_cloudsync_v1, outside cfg like the
// other per-browser keys: a backup file or transfer link must never carry it.
//
// Loaded on every page so a change made anywhere is sent, but it only draws
// its controls on Settings.
(() => {
  "use strict";
  const App = window.App;
  if (!App || !window.crypto?.subtle) return; // needs https (or localhost)

  const KEY = "hn_cloudsync_v1";
  const ENDPOINT = `${App.API_ORIGIN}/v1/sync`;
  const SALT = new TextEncoder().encode("happening-now settings sync v1");
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O or U to misread
  const VIEW_STATE = ["newsScope", "newsTickerScope", "marketGroup"];

  // ---- what this browser remembers --------------------------------------------
  // { code, rev, sig, at, dirty, paused, error }  — or { ended: true } once.
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window */ } };
  const patch = (p) => write({ ...read(), ...p });

  // ---- the code ----------------------------------------------------------------
  // 20 random bytes shown as 32 characters in groups of four.
  function encodeCode(bytes) {
    let bits = 0, value = 0, out = "";
    for (const b of bytes) {
      value = (value << 8) | b; bits += 8;
      while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; value &= (1 << bits) - 1; }
    }
    return out.match(/.{4}/g).join("-");
  }
  // Forgiving about how it was typed: case, spaces and dashes don't matter,
  // and the look-alikes I, L and O are read as 1, 1 and 0.
  function decodeCode(text) {
    const clean = String(text || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
    if (clean.length !== 32) return null;
    const bytes = new Uint8Array(20);
    let bits = 0, value = 0, n = 0;
    for (const ch of clean) {
      const v = ALPHABET.indexOf(ch);
      if (v < 0) return null;
      value = (value << 5) | v; bits += 5;
      if (bits >= 8) { bytes[n++] = (value >>> (bits - 8)) & 255; bits -= 8; value &= (1 << bits) - 1; }
    }
    return bytes;
  }

  let derived = null; // kept for the page's life: deriving is the slow part
  async function keys(code) {
    if (derived?.code === code) return derived;
    const bytes = decodeCode(code);
    if (!bytes) throw new Error("That isn't a valid sync code. It has 32 letters and numbers.");
    const material = await crypto.subtle.importKey("raw", bytes, "HKDF", false, ["deriveBits", "deriveKey"]);
    const using = (info) => ({ name: "HKDF", hash: "SHA-256", salt: SALT, info: new TextEncoder().encode(info) });
    const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
    derived = {
      code,
      id: hex(await crypto.subtle.deriveBits(using("id"), material, 256)),
      auth: hex(await crypto.subtle.deriveBits(using("auth"), material, 256)),
      key: await crypto.subtle.deriveKey(using("key"), material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
    };
    return derived;
  }

  // ---- sealing and opening -----------------------------------------------------
  const toBase64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
  const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

  async function seal(k, cfg) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // a fresh one every save, as AES-GCM requires
    const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k.key, new TextEncoder().encode(JSON.stringify({ v: 1, cfg })));
    return { iv: toBase64(iv), data: toBase64(new Uint8Array(sealed)) };
  }
  async function unseal(k, iv, data) {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, k.key, fromBase64(data));
    return JSON.parse(new TextDecoder().decode(plain)).cfg;
  }

  // The settings worth syncing: everything except where-you-are-right-now.
  const lasting = (cfg) => { const c = { ...App.normalizeConfig(cfg) }; for (const k of VIEW_STATE) delete c[k]; return c; };
  const fingerprint = (cfg) => { const t = JSON.stringify(lasting(cfg)); let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36); };
  // Settings from elsewhere, keeping this browser's own view state.
  const withLocalView = (cfg) => { const c = { ...cfg }; for (const k of VIEW_STATE) if (k in App.cfg) c[k] = App.cfg[k]; return c; };

  // text/plain keeps this a "simple" request with no CORS preflight; the
  // Worker parses the JSON itself. The id and auth go in the body, never the
  // address, because servers log addresses.
  async function call(body) {
    const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body), cache: "no-store" });
    let json = {};
    try { json = await res.json(); } catch { /* not JSON: treat as a failure */ }
    return { ...json, status: res.status };
  }

  // ---- send and fetch ------------------------------------------------------------
  let applying = false; // true while settings from elsewhere are being saved here

  async function push() {
    const s = read();
    if (!s.code || s.paused) return;
    const k = await keys(s.code);
    const r = await call({ op: "put", id: k.id, auth: k.auth, ...(await seal(k, lasting(App.cfg))) });
    if (r.status === 200) patch({ rev: r.rev, sig: fingerprint(App.cfg), at: Date.now(), dirty: false, error: "" });
    else patch({ dirty: true, error: r.error || "Couldn't reach the sync service." });
  }

  // Returns "applied" when newer settings were saved into this browser.
  async function pull() {
    const s = read();
    if (!s.code || s.paused) return "off";
    const k = await keys(s.code);
    const r = await call({ op: "get", id: k.id, auth: k.auth, since: s.rev || 0 });
    if (r.status === 404) { write({ ended: true }); return "ended"; } // deleted from another device, or unused for six months
    if (r.status !== 200) { patch({ error: r.error || "Couldn't reach the sync service." }); return "error"; }
    if (r.same) { patch({ at: Date.now(), error: "" }); return "same"; }
    const incoming = withLocalView(await unseal(k, r.iv, r.data));
    const changed = fingerprint(incoming) !== fingerprint(App.cfg);
    patch({ rev: r.rev, sig: fingerprint(incoming), at: Date.now(), dirty: false, error: "" });
    if (!changed) return "same";
    applying = true;
    App.saveConfig(incoming);
    applying = false;
    return "applied";
  }

  // On opening a page (and on coming back to it): send anything unsent,
  // otherwise look for something newer. Newer settings mean a reload, since
  // every control on the page was drawn from the old ones.
  async function catchUp() {
    const s = read();
    if (!s.code || s.paused) return;
    if (!s.dirty && Date.now() - (s.at || 0) < 15000) return; // just checked, e.g. moving between pages
    try {
      if (s.dirty) await push(); // edits made while offline win
      else if ((await pull()) === "applied") return location.reload();
    } catch { patch({ error: "Couldn't sync just now." }); }
    render();
  }

  let timer = 0;
  window.addEventListener("hn:config-saved", () => {
    const s = read();
    if (!s.code || s.paused || applying) return;
    if (fingerprint(App.cfg) === s.sig) return; // only the view state moved
    patch({ dirty: true });
    clearTimeout(timer);
    timer = setTimeout(() => push().catch(() => {}).then(render), 2500); // settings often change in bursts
  });
  // A reset must not wipe every other device. Sync pauses, and Settings asks
  // which way to go: send the reset settings, or bring the synced ones back.
  window.addEventListener("hn:config-reset", () => { if (read().code) { clearTimeout(timer); patch({ paused: true, dirty: false }); render(); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") catchUp(); });

  // ---- turning it on and off ------------------------------------------------------
  async function start() {
    write({ code: encodeCode(crypto.getRandomValues(new Uint8Array(20))), rev: 0 });
    await push();
    const s = read();
    if (s.dirty) { write({}); throw new Error(s.error || "Couldn't start syncing."); }
  }

  async function connect(text) {
    const bytes = decodeCode(text);
    if (!bytes) throw new Error("That isn't a valid sync code. It has 32 letters and numbers.");
    const code = encodeCode(bytes);
    const k = await keys(code);
    const r = await call({ op: "get", id: k.id, auth: k.auth, since: 0 });
    if (r.status === 404) throw new Error("No synced settings were found for that code.");
    if (r.status !== 200) throw new Error(r.error || "Couldn't reach the sync service.");
    const incoming = withLocalView(await unseal(k, r.iv, r.data));
    const sources = (incoming.widgets || []).length, stocks = (incoming.stocks || []).length;
    if (!confirm(`Replace this browser's settings with your synced ones?\n\n${sources} news sources, ${stocks} watchlist stocks.\n\nFrom then on this browser stays in step with your other devices.`)) return false;
    write({ code, rev: r.rev, sig: fingerprint(incoming), at: Date.now() });
    applying = true;
    App.saveConfig(incoming);
    applying = false;
    return true;
  }

  const stop = () => write({}); // this browser only; the synced copy stays for the others
  async function remove() {
    const s = read();
    if (!s.code) return;
    const k = await keys(s.code);
    const r = await call({ op: "delete", id: k.id, auth: k.auth });
    if (r.status !== 200) throw new Error(r.error || "Couldn't reach the sync service.");
    write({});
  }

  App.cloudSync = { enabled: () => Boolean(read().code) };

  // ---- Settings controls ------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const section = $("cloudSyncSection");

  function render() {
    if (!section) return;
    const s = read();
    const state = s.code ? (s.paused ? "paused" : "on") : "off";
    section.dataset.state = state;
    for (const el of section.querySelectorAll("[data-when]")) el.style.display = el.dataset.when.split(" ").includes(state) ? "" : "none";
    const when = s.at ? new Date(s.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
    const [text, kind] =
      s.ended ? ["Sync has ended for this browser: your synced copy was deleted from another device, or went unused for six months. Your settings here are untouched.", "warn"]
        : state === "off" ? ["Not syncing. Settings stay in this browser only.", "muted"]
          : state === "paused" ? ["Paused: this browser's settings were reset. Choose which settings to keep.", "warn"]
            : s.error ? [`Syncing, but the last attempt failed (${String(s.error).replace(/\.+$/, "")}). It will try again when a page next opens.`, "warn"]
              : s.dirty ? ["Syncing. A change is waiting to be sent.", "ok"]
                : [`Syncing. Last checked ${when}.`, "ok"];
    $("cloudSyncStatus").textContent = text;
    $("cloudSyncStatus").className = `syncStatusPanel is-${kind}`;
    if (s.code) {
      $("cloudSyncCode").value = s.code;
      $("cloudSyncLink").value = `${location.origin}/settings#sync=${s.code}`;
    }
  }

  if (section) {
    section.style.display = ""; // hidden in the markup, so it never shows where this script isn't shipped
    const say = (message) => { $("cloudSyncStatus").textContent = message; $("cloudSyncStatus").className = "syncStatusPanel is-warn"; };
    const busy = async (button, work) => {
      button.disabled = true;
      try { await work(); } catch (e) { render(); say(e.message || "Something went wrong."); return; } finally { button.disabled = false; }
      render();
    };
    const copy = async (input) => { try { await navigator.clipboard.writeText(input.value); } catch { input.select(); } };

    $("cloudSyncStartBtn").addEventListener("click", (e) => busy(e.target, async () => { await start(); $("cloudSyncReveal").style.display = ""; }));
    $("cloudSyncHaveBtn").addEventListener("click", () => { $("cloudSyncEnter").style.display = ""; $("cloudSyncCodeIn").focus(); });
    $("cloudSyncConnectBtn").addEventListener("click", (e) => busy(e.target, async () => { if (await connect($("cloudSyncCodeIn").value)) location.reload(); }));
    $("cloudSyncShowBtn").addEventListener("click", () => { const box = $("cloudSyncReveal"); box.style.display = box.style.display === "none" ? "" : "none"; });
    $("cloudSyncCopyCodeBtn").addEventListener("click", () => copy($("cloudSyncCode")));
    $("cloudSyncCopyLinkBtn").addEventListener("click", () => copy($("cloudSyncLink")));
    $("cloudSyncNowBtn").addEventListener("click", (e) => busy(e.target, async () => {
      patch({ at: 0 });
      if (read().dirty) await push(); else if ((await pull()) === "applied") location.reload();
    }));
    $("cloudSyncStopBtn").addEventListener("click", () => {
      if (!confirm("Stop syncing in this browser?\n\nYour settings stay here, and your other devices keep syncing. Keep your sync code if you may want to reconnect.")) return;
      stop(); render();
    });
    $("cloudSyncDeleteBtn").addEventListener("click", (e) => {
      if (!confirm("Delete your synced copy from the server and stop syncing?\n\nSettings stay in each browser, but your devices will no longer follow each other, and the sync code stops working.")) return;
      busy(e.target, remove);
    });
    // After a reset: keep the reset settings everywhere, or bring the synced ones back.
    $("cloudSyncKeepBtn").addEventListener("click", (e) => busy(e.target, async () => { patch({ paused: false }); await push(); }));
    $("cloudSyncRestoreBtn").addEventListener("click", (e) => busy(e.target, async () => {
      patch({ paused: false, rev: 0, at: 0, dirty: false });
      if ((await pull()) === "applied") location.reload();
    }));

    // Arriving by a sync link: settings.html's first script lifted the code
    // out of the address before anything else could read it.
    if (window.__hnSync) {
      const code = window.__hnSync;
      window.__hnSync = null;
      if (!read().code) busy($("cloudSyncConnectBtn"), async () => { if (await connect(code)) location.reload(); });
    }
  }

  render();
  catchUp();
})();
