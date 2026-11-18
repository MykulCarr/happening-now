# Settings sync by sync code

Status: **launch steps 2-4 done 2026-11-18** (wording approved by Mike, the
`$unreleased` gate removed, `sw.js` caches the script). Steps 1 and 5, the
production table and the deploy, go together. Written 2026-11-16.

## What it is for

Settings live in each browser separately. Someone who uses the site in
Firefox, in the installed app (Chrome) and on a second device has three
unrelated sets. "Sync to a File" only works in Chromium and only on one
machine; a backup file or transfer link is a one-off copy. Sync keeps every
connected browser the same, automatically, in any browser.

## How it works

1. **Start syncing** makes a random 160-bit code in the browser, shown as 32
   characters in groups of four (`K7QF-9XJ2-...`, Crockford base32: no I, L,
   O or U to misread).
2. From the code the browser derives, with HKDF-SHA-256 and a fixed salt:
   - `id` — where the server files the settings;
   - `auth` — the password for reading, writing and deleting them;
   - `key` — an AES-256-GCM key. **It never leaves the browser.**
3. The settings are encrypted with `key` and a fresh random 12-byte IV, then
   sent with `id` and `auth` to `POST /v1/sync`.
4. A second browser given the same code derives the same three values, fetches
   the encrypted copy, decrypts it, and (after asking) replaces its settings.
5. From then on: a change is sent about 2.5 seconds after it is made; each
   page open, and each return to a tab, asks whether there is a newer revision
   and applies it, reloading the page once if settings changed.

It is whole-settings and newest-wins. It does not merge two different sets.

Left out on purpose: `newsScope`, `newsTickerScope` and `marketGroup` (which
tab you are on). They change with every tap and say where you are, not what
you prefer. They stay per browser and never trigger a send.

## What the server stores

One row per code in the D1 table `sync` (`cloudflare-sync-worker/schema/sync.sql`):

| Column | Holds |
| --- | --- |
| `id` | 64 hex characters derived from the code |
| `auth_hash` | SHA-256 of `auth`. The auth itself is never stored |
| `rev` | a counter, +1 per save |
| `iv`, `data` | the AES-GCM nonce and the encrypted settings, base64 |
| `created`, `day` | UTC dates (first use, last save). No times |
| `writes` | saves made on `day`, for the daily cap |

Not stored: IP address, User-Agent, any time finer than the day, anything
readable. A copy of this table is useless without a sync code.

`id` and `auth` travel in the request **body**. Worker request logs
(`observability` is on) keep URLs, and the URL is always just `/v1/sync`.

## What the server can and cannot do

- It **cannot** read the settings: it never has the key.
- It **can** see that some browser saved roughly 9 KB on a given day, and, as
  with every request to any site, the network sees the sender's IP address.
- It could, if malicious or compromised, delete a row or serve an old one. It
  cannot forge settings: AES-GCM rejects anything not made with the key.

## Limits

| Limit | Value | Why |
| --- | --- | --- |
| Request origin | our own origins only | another site's page cannot call it |
| Ciphertext size | 60,000 base64 characters | real settings are about 9,000 |
| New codes per day, all visitors | 100 | stops a script filling the table |
| Saves per code per day | 300 | a runaway loop cannot burn the write quota |
| Idle codes | deleted after 180 days | pruned whenever a new code is created |

Wrong `auth` and unknown `id` get the identical "Not found" answer, so an id
alone reveals nothing, not even whether it exists.

## Behaviour worth knowing

- **Reset pauses sync.** Resetting one browser's settings must not wipe every
  other device, so sync pauses there and Settings offers two buttons: send the
  reset settings to the other devices, or bring the synced ones back.
- **Stop in this browser** forgets the code locally; the server copy and the
  other devices carry on.
- **Delete my synced copy** removes the row. Other devices find it gone on
  their next check, say "sync has ended", keep their settings and send nothing
  more.
- **Server unreachable:** the change is marked as waiting and sent the next
  time a page opens.
- **A sync link** (`/settings#sync=<code>`) is the code in a link. Like a
  transfer link, the first script in `settings.html` removes it from the
  address before any analytics script runs.
- The code is kept in `localStorage` (`hn_cloudsync_v1`), outside `cfg`: a
  backup file or transfer link must never carry it.

## Privacy policy wording (to add at launch)

Add to `privacy.html`, after "Data Stored On Your Device", and update the
"Last updated" date in the same commit:

> **Syncing Your Settings**
>
> Sync is off unless you turn it on. If you do, your browser creates a sync
> code and uses it to encrypt your settings before sending them to us. We
> store only that encrypted copy. The code is the key and it stays on your
> devices: we never receive it, so we cannot read your synced settings, and
> neither can anyone who obtained our database. Alongside the encrypted copy
> we keep a random-looking identifier derived from your code, a counter, and
> the dates it was first and last saved. We do not record your IP address,
> your browser, or the time of day.
>
> Anyone who has your sync code can read your settings, so treat it like a
> password. You can stop syncing in one browser, or delete your synced copy
> from our server, in Settings at any time. A synced copy that goes unused for
> 180 days is deleted automatically.

Two existing paragraphs need a matching touch (checked against the policy as
it stood on 2026-11-16; neither currently says anything untrue, but both
would be incomplete):

- "Data Stored On Your Device" describes settings kept in the browser. Add
  that they stay there unless you turn on sync.
- "Data Retention" lists the 90-day deletion of reports and usage counts. Add
  the 180-day deletion of an unused synced copy.

`CLAUDE.md`'s "Privacy posture" section must be updated in the same commit:
this becomes the second browser-to-us write, alongside "Report a problem".

## Launching

1. Create the table on the production database:
   `npx wrangler d1 execute hn-reports --remote --file schema/sync.sql`
   (run from `cloudflare-sync-worker/`), then check it with
   `--command "SELECT COUNT(*) FROM sync"`.
2. Add the privacy policy wording above and update `CLAUDE.md`.
3. In `scripts/stage-public-assets.ps1`, remove `"assets/cloud-sync.js"` from
   `$unreleased`. That one edit lets the script, the Settings section and the
   About page's sync text into production builds.
4. Add `'/assets/cloud-sync.js'` to `ASSETS_TO_CACHE` in `sw.js`.
5. `deploy-beta`, try it, then `deploy-prod`.

Until step 3, production builds contain no sync script, no page that loads
it, and no sync wording in any page. The Worker route `/v1/sync` does deploy
with the Worker; without the table it answers 503 and nothing calls it.

## Testing

- `npm run test:sync` forces every branch of the Worker module against a
  stand-in database (41 checks).
- End to end, without touching production: create the table in the local
  database (`npx wrangler d1 execute hn-reports --local --file schema/sync.sql`),
  run `npx wrangler dev --local --port 8787 --var ALLOWED_ORIGINS:http://localhost:8091`,
  serve the site on 8091, and drive two separate browser profiles whose calls
  to `/v1/sync` are answered by the local Worker. The cases run on 2026-11-16:
  start, join by link, join by typed code, change on either side, tab switch
  (not sent), reset then restore, reset then keep, stop, delete, deleted
  elsewhere, server unreachable then recovered, unknown code, malformed code.

## Not done

- Not run in real Firefox or Safari, on a real phone, or across two real
  devices: the tests used two Chrome profiles on one machine.
- The Android widget does not use sync; it still takes settings from the site
  through its own link.
- No merge: two devices changed while both offline keep whichever saves last.
