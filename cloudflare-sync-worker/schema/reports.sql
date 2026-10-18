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
