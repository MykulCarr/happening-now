# Notes

## 2026-07-26 — Reconnected the repo to the Projects Dashboard

Picked the project back up after a gap. No code changes; this session was about
getting the folder and the dashboard telling the same story.

**What we found**

- The project was already tracked as `news-pages`, but the dashboard's
  registered path was the old `C:\TEMP\Sites\news-pages` clone. Two full clones
  of the repo existed on this machine, both on `ed96a1d` and both fully pushed.
  Because sync read the *other* folder, this one never had a `TODO.md`.
- Two of the three tracked to-dos were already done — Google Search Console and
  Bing verification/sitemap were both closed out in `docs/launch-signoff.md`
  (commit `ed96a1d`, 2026-06-17). `docs/web-presence-baseline.md` still claims
  they're outstanding, but it hasn't been touched since 2026-05-30, so the
  signoff is the newer statement.
- The repo had no `README.md`, `CLAUDE.md` or `NOTES.md`, so every session
  started cold and the dashboard's CLAUDE.md snapshot was empty.

**What we did**

- Made `C:\TEMP\Projects\happening-now` the canonical clone and repointed the
  dashboard registration to it.
- Marked the Search Console and Bing to-dos done; GA4 is the only one left, and
  it's explicitly optional per `web-presence-baseline.md` §4.
- Added `README.md`, `CLAUDE.md` and this file.

**Gotcha worth remembering:** repointing a project's path in `data.json` is not
enough on its own. `sync/.state.json` keeps the last-synced to-dos per project
id; if the new folder has no `TODO.md` yet, the next sync reads that as "all
items deleted locally" and wipes them from the dashboard. Clear the project's
key out of `.state.json` at the same time as the path change so the new folder
adopts the remote list instead.

**Next up**

- Decide whether GA4 is actually wanted — Cloudflare Web Analytics is already
  running, so it's only worth it for behavior/flow data.
- `docs/web-presence-baseline.md` line 14 is now stale; worth a one-line fix.
- The old `C:\TEMP\Sites\news-pages` clone is now orphaned. Nothing unpushed in
  it — safe to delete when convenient.
