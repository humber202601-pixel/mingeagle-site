-- Anonymous sitewide daily Google Search Console Search Analytics snapshot.
-- GSC dates are property-local (America/Los_Angeles), unlike UTC Cloudflare RUM days.
-- No search terms, users, device IDs, or URL histories stored in this table.
CREATE TABLE IF NOT EXISTS gsc_search_daily (
  date_pacific TEXT PRIMARY KEY CHECK(date_pacific GLOB '20[0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  property TEXT NOT NULL CHECK(property='sc-domain:mingeagle.com'),
  clicks INTEGER NOT NULL CHECK(clicks>=0),
  impressions INTEGER NOT NULL CHECK(impressions>=0),
  ctr REAL NOT NULL CHECK(ctr>=0 AND ctr<=1),
  average_position REAL NOT NULL CHECK(average_position>=0),
  source TEXT NOT NULL CHECK(source='GOOGLE_SEARCH_CONSOLE_API'),
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(clicks<=impressions)
);
