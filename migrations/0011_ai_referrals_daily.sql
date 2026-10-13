-- Browser-observed Cloudflare Web Analytics referrers, aggregated by UTC date
-- and verified AI provider only. No IP addresses, user IDs, raw referrer URLs,
-- querystrings, prompt text, or customer records are stored.
-- ALL_AI=0 means the provider returned traffic for that completed UTC day,
-- with no attributable AI referrer. An absent date means unmeasured.
CREATE TABLE IF NOT EXISTS ai_referrals_daily (
 date_utc TEXT NOT NULL CHECK(date_utc GLOB '20[0-9][0-9]-[01][0-9]-[0-3][0-9]'),
 platform TEXT NOT NULL CHECK(platform IN
  ('ALL_AI','CHATGPT','PERPLEXITY','CLAUDE','GEMINI','COPILOT')),
 site_tag TEXT NOT NULL CHECK(site_tag='c229a4f21594480eb5a1381a1b1e67f0'),
 host TEXT NOT NULL CHECK(host='mingeagle.com'),
 provider_visits INTEGER NOT NULL CHECK(provider_visits>=0),
 sampled_pageviews INTEGER NOT NULL CHECK(sampled_pageviews>=0),
 source TEXT NOT NULL CHECK(source='CLOUDFLARE_RUM_GRAPHQL'),
 fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(date_utc,platform)
);
CREATE INDEX IF NOT EXISTS idx_ai_referrals_daily_date
 ON ai_referrals_daily(date_utc DESC);
