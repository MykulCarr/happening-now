-- Reader "Report a problem" submissions. Apply with:
--   npx wrangler d1 execute hn-reports --remote --file schema/reports.sql
--
-- Deliberately nothing about the reader: no IP, no User-Agent, no time finer
-- than the day. A row says "someone hit <reason> on <article> from <feed>".
CREATE TABLE IF NOT EXISTS reports (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  day     TEXT NOT NULL,      -- YYYY-MM-DD, UTC
  feed    TEXT NOT NULL,      -- the RSS URL the headline came from
  article TEXT NOT NULL,      -- the headline's link
  reason  TEXT NOT NULL       -- one of REASONS in src/reports.mjs
);
CREATE INDEX IF NOT EXISTS reports_day ON reports (day);

-- "Is HAPPENING NOW useful to you?" on /feedback. One tap, no text, no
-- identity: the answer and which parts of the site they use, by day.
CREATE TABLE IF NOT EXISTS pulse (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  day     TEXT NOT NULL,      -- YYYY-MM-DD, UTC
  useful  TEXT NOT NULL,      -- yes | somewhat | no
  uses    TEXT NOT NULL       -- comma-joined subset of news,weather,stocks (fixed words only)
);
CREATE INDEX IF NOT EXISTS pulse_day ON pulse (day);

-- The usage / salts / visitors tables that used to follow here were retired
-- on 2026-10-25 when usage counting moved to site-analytics
-- (analytics.happening-now.net). History is in backups/ on OEMMEO.
