-- Aggregated Cloudflare RUM daily snapshot only. No user IDs, IPs, URLs or PII.
-- A missing date row means "not observed/synced", never zero traffic.
CREATE TABLE IF NOT EXISTS web_analytics_daily (
  date_utc TEXT PRIMARY KEY CHECK(date_utc GLOB '20[0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  site_tag TEXT NOT NULL CHECK(site_tag='c229a4f21594480eb5a1381a1b1e67f0'),
  host TEXT NOT NULL CHECK(host='mingeagle.com'),
  provider_visits INTEGER NOT NULL CHECK(provider_visits>=0),
  sampled_pageviews INTEGER NOT NULL CHECK(sampled_pageviews>=0),
  source TEXT NOT NULL CHECK(source='CLOUDFLARE_RUM_GRAPHQL'),
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_web_analytics_daily_date ON web_analytics_daily(date_utc DESC);