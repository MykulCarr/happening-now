-- Settings sync (src/sync.mjs). Apply with:
--   npx wrangler d1 execute hn-reports --remote --file schema/sync.sql
--   npx wrangler d1 execute hn-reports-beta --remote --env beta --file schema/sync.sql
--
-- One row per sync code. Deliberately nothing about the reader: no IP, no
-- User-Agent, no time finer than the day. `data` is their settings encrypted
-- in their own browser; the key is derived from the sync code and never sent
-- here, so this table cannot be read by us or by anyone who obtains it.
CREATE TABLE IF NOT EXISTS sync (
  id        TEXT PRIMARY KEY,   -- derived from the sync code; random-looking, 64 hex
  auth_hash TEXT NOT NULL,      -- SHA-256 of the write password derived from the code
  rev       INTEGER NOT NULL,   -- bumps on every save; browsers compare it to skip a download
  iv        TEXT NOT NULL,      -- AES-GCM nonce for this save, base64
  data      TEXT NOT NULL,      -- the encrypted settings, base64
  created   TEXT NOT NULL,      -- YYYY-MM-DD, UTC: the day the code was first used
  day       TEXT NOT NULL,      -- YYYY-MM-DD, UTC: the day of the last save
  writes    INTEGER NOT NULL    -- saves on `day`, for the daily cap
);
CREATE INDEX IF NOT EXISTS sync_day ON sync (day);
CREATE INDEX IF NOT EXISTS sync_created ON sync (created);
