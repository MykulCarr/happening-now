// Keeps a copy of your settings in a real file on disk, and keeps that file up
// to date as the settings change.
//
// How it works: the File System Access API lets the user pick a file once and
// hands back a handle the page can write to again later. The handle is kept in
// IndexedDB (localStorage stores strings only). Three things are worth knowing
// before changing anything here:
//
//   • Chromium only. Firefox and Safari — which is every browser on iOS — have
//     no showSaveFilePicker, so the UI falls back to pointing at the
//     Export / Import JSON box instead of pretending to sync.
//   • Writing needs permission, and asking for permission needs a click. So a
//     background save can only write if permission is already granted; when it
//     isn't, the UI shows "Reconnect" rather than silently doing nothing.
//   • Clearing site data wipes IndexedDB too, so the handle goes with it. The
//     file itself survives and can be re-picked, but it can't be found again
//     automatically — that's the same rule that stops any page writing to your
//     disk unasked.
//
// Loaded on every page so a change made anywhere (the news source picker, the
// location picker) reaches the file, but it only draws UI on Settings.
(() => {
  "use strict";

  const PREFS_KEY = "hn_sync_prefs_v1";
  const DB_NAME = "hn-sync";
  const STORE = "handles";
  const HANDLE_KEY = "configFile";
  const SUGGESTED_NAME = "happening-now-settings.json";
  const WRITE_DEBOUNCE_MS = 1200;

  const supported = typeof window.showSaveFilePicker === "function"
    && typeof indexedDB !== "undefined";

  // Read before anything writes: no stored config means a fresh browser, or one
  // whose data was cleared. That's the moment auto-restore is for.
  const startedEmpty = (() => {
    try { return localStorage.getItem(window.App?.LS_KEY || "") === null; }
    catch { return false; }
  })();

  const DEFAULT_PREFS = { autoWrite: true, autoRestore: true, paused: false, fileName: "", lastSync: 0 };
  let prefs = readPrefs();

  function readPrefs() {
    try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY)) || {}) }; }
    catch { return { ...DEFAULT_PREFS }; }
  }

  function writePrefs(patch) {
    prefs = { ...prefs, ...patch };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { }
    return prefs;
  }

  // ── IndexedDB: one store, one key, holding the file handle ───────────────
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idb(mode, run) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  const idbGet = key => idb("readonly", store => store.get(key));
  const idbSet = (key, val) => idb("readwrite", store => store.put(val, key));
  const idbDel = key => idb("readwrite", store => store.delete(key));

  // ── Handle + permission ─────────────────────────────────────────────────
  let handle = null;
  let handleLoaded = false;

  async function getHandle() {
    if (handleLoaded) return handle;
    handleLoaded = true;
    if (!supported) return (handle = null);
    try { handle = await idbGet(HANDLE_KEY); } catch { handle = null; }
    return handle || null;
  }

  async function permissionOf(h, { request = false } = {}) {
    if (!h || typeof h.queryPermission !== "function") return "prompt";
    const opts = { mode: "readwrite" };
    try {
      let state = await h.queryPermission(opts);
      if (state !== "granted" && request) state = await h.requestPermission(opts);
      return state;
    } catch { return "prompt"; }
  }

  async function state() {
    const h = await getHandle();
    return {
      supported,
      connected: !!h,
      fileName: h?.name || prefs.fileName || "",
      permission: h ? await permissionOf(h) : "none",
      paused: !!prefs.paused,
      autoWrite: !!prefs.autoWrite,
      autoRestore: !!prefs.autoRestore,
      lastSync: prefs.lastSync || 0,
    };
  }

  // ── Reading and writing the file ────────────────────────────────────────
  async function writeConfigTo(h) {
    const cfg = window.App?.normalizeConfig?.(window.App.cfg) || window.App?.cfg || {};
    const stream = await h.createWritable();
    await stream.write(JSON.stringify(cfg, null, 2));
    await stream.close();
    writePrefs({ lastSync: Date.now(), fileName: h.name });
  }

  async function readConfigFrom(h) {
    const text = await (await h.getFile()).text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("That file doesn't contain settings JSON.");
    }
    return parsed;
  }

  // ── Actions (each is driven by a button, so a permission prompt is fine) ──
  async function choose() {
    if (!supported) throw new Error("This browser can't write to a file. Use Export JSON instead.");
    const picked = await window.showSaveFilePicker({
      suggestedName: SUGGESTED_NAME,
      types: [{ description: "Settings JSON", accept: { "application/json": [".json"] } }],
    });
    try { await idbSet(HANDLE_KEY, picked); } catch { /* handle still usable this session */ }
    handle = picked;
    handleLoaded = true;
    writePrefs({ fileName: picked.name, paused: false });
    await writeConfigTo(picked);
    return picked.name;
  }

  async function syncNow() {
    const h = await getHandle();
    if (!h) throw new Error("No sync file chosen yet.");
    if (await permissionOf(h, { request: true }) !== "granted") {
      throw new Error("Couldn't get permission to write that file — click Sync now again to allow it.");
    }
    await writeConfigTo(h);
    writePrefs({ paused: false });
  }

  async function restore() {
    const h = await getHandle();
    if (!h) throw new Error("No sync file chosen yet.");
    if (await permissionOf(h, { request: true }) !== "granted") {
      throw new Error("Couldn't get permission to read that file — click Restore from file again to allow it.");
    }
    const parsed = await readConfigFrom(h);
    window.App.saveConfig(parsed);
    writePrefs({ paused: false });
  }

  async function stop() {
    try { await idbDel(HANDLE_KEY); } catch { }
    handle = null;
    handleLoaded = true;
    writePrefs({ fileName: "", paused: false, lastSync: 0 });
  }

  // ── Auto-write: every config save anywhere in the app lands here ─────────
  // Settings fires hn:config-reset when a reset is staged, but nothing is
  // written until Save Changes — so remember it and pause on the save that
  // follows. Writing defaults out would overwrite the very backup the user
  // would want to restore from; pausing leaves both ways out on the buttons.
  let resetStaged = false;
  let writeTimer = 0;

  window.addEventListener("hn:config-reset", () => { resetStaged = true; });

  window.addEventListener("hn:config-saved", () => {
    if (!supported || !prefs.autoWrite) return;
    if (resetStaged) {
      resetStaged = false;
      writePrefs({ paused: true });
      renderUi();
      return;
    }
    if (prefs.paused) return;
    window.clearTimeout(writeTimer);
    writeTimer = window.setTimeout(autoWrite, WRITE_DEBOUNCE_MS);
  });

  async function autoWrite() {
    const h = await getHandle();
    if (!h) return;
    // Can't call requestPermission here — it needs a user gesture and this runs
    // off a background save. The UI surfaces a Reconnect button instead.
    if (await permissionOf(h) !== "granted") { renderUi(); return; }
    try { await writeConfigTo(h); } catch (err) {
      console.warn("[sync] write failed:", err?.message || err);
    }
    renderUi();
  }

  // ── Auto-restore after a clear ──────────────────────────────────────────
  async function maybeAutoRestore() {
    if (!supported || !startedEmpty || !prefs.autoRestore) return;
    const h = await getHandle();
    if (!h) return;
    if (await permissionOf(h) !== "granted") { renderUi(); return; }
    try {
      window.App.saveConfig(await readConfigFrom(h));
      location.reload();
    } catch (err) {
      console.warn("[sync] auto-restore failed:", err?.message || err);
    }
  }

  window.SettingsSync = { state, choose, syncNow, restore, stop, setPref: writePrefs, supported };

  // ── Settings UI (absent on the other pages) ─────────────────────────────
  const ui = {
    status: document.getElementById("syncStatus"),
    choose: document.getElementById("syncChooseBtn"),
    now: document.getElementById("syncNowBtn"),
    restore: document.getElementById("syncRestoreBtn"),
    stop: document.getElementById("syncStopBtn"),
    autoWrite: document.getElementById("syncAutoWriteToggle"),
    autoRestore: document.getElementById("syncAutoRestoreToggle"),
  };

  const hasUi = !!(ui.status && ui.choose);

  function setNote(msg, kind = "default") {
    if (!ui.status) return;
    ui.status.textContent = msg;
    ui.status.className = `syncStatusPanel is-${kind}`;
  }

  async function renderUi() {
    if (!hasUi) return;
    const s = await state();

    if (!s.supported) {
      setNote("This browser can't write directly to a file. Use Export / Import JSON above to back up by hand.", "muted");
      [ui.choose, ui.now, ui.restore, ui.stop].forEach(b => { if (b) b.disabled = true; });
      return;
    }

    ui.choose.textContent = s.connected ? "Change file…" : "Choose sync file…";
    [ui.now, ui.restore, ui.stop].forEach(b => { if (b) b.disabled = !s.connected; });
    if (ui.autoWrite) ui.autoWrite.checked = s.autoWrite;
    if (ui.autoRestore) ui.autoRestore.checked = s.autoRestore;

    if (!s.connected) {
      setNote("Not set up. Choose a file and your settings are written to it, then kept up to date as they change.");
      return;
    }
    if (s.paused) {
      setNote(`Paused after a reset — ${s.fileName} still holds your previous settings. Restore from file to bring them back, or Sync now to overwrite them.`, "warn");
      return;
    }
    if (s.permission !== "granted") {
      setNote(`Reconnect needed — click Sync now to let this browser write to ${s.fileName} again.`, "warn");
      return;
    }
    const when = s.lastSync ? new Date(s.lastSync).toLocaleString() : "not yet";
    setNote(`Syncing to ${s.fileName}. Last written: ${when}.`, "ok");
  }

  async function run(action, busyLabel) {
    setNote(busyLabel);
    try {
      await action();
      await renderUi();
    } catch (err) {
      // AbortError just means the user closed the file picker.
      if (err?.name === "AbortError") { await renderUi(); return; }
      setNote(err?.message || "That didn't work.", "warn");
    }
  }

  if (hasUi) {
    ui.choose.addEventListener("click", () => run(choose, "Waiting for you to pick a file…"));
    ui.now?.addEventListener("click", () => run(syncNow, "Writing…"));
    ui.stop?.addEventListener("click", () => run(stop, "Stopping…"));
    ui.restore?.addEventListener("click", () => run(async () => {
      if (!confirm("Replace your current settings with the contents of the sync file?")) return;
      await restore();
      location.reload();
    }, "Reading…"));
    ui.autoWrite?.addEventListener("change", () => {
      writePrefs({ autoWrite: ui.autoWrite.checked });
      renderUi();
    });
    ui.autoRestore?.addEventListener("change", () => {
      writePrefs({ autoRestore: ui.autoRestore.checked });
      renderUi();
    });
    renderUi();
  }

  maybeAutoRestore();
})();
