-- Cloudflare RUM AI referrer landing-page category aggregates; no raw URL paths,
-- querystrings, browser identifiers, IPs, customers, or session IDs.
-- Page-level Visits are deliberately absent: Cloudflare visits are not additive
-- when grouped by requestPath, so only sampled page-load events are stored.
CREATE TABLE IF NOT EXISTS ai_referral_pages_daily (
 date_utc TEXT NOT NULL CHECK(date_utc GLOB '20[0-9][0-9]-[01][0-9]-[0-3][0-9]'),
 platform TEXT NOT NULL CHECK(platform IN ('CHATGPT','PERPLEXITY','CLAUDE','GEMINI','COPILOT')),
 page_bucket TEXT NOT NULL CHECK(page_bucket IN (
  'HOME','KIDS_QUIET_GUIDE','APARTMENT_GUIDE','SCHOOL_EQUIPMENT_GUIDE',
  'CAMP_GUIDE','BULK_GUIDE','WHOLESALE_CATALOG','TEAM_CUSTOM',
  'FOR_COACHES','FOR_SCHOOLS','WHOLESALE','PRODUCTS','PRODUCT_DETAIL','OTHER_PAGE'
 )),
 site_tag TEXT NOT NULL CHECK(site_tag='c229a4f21594480eb5a1381a1b1e67f0'),
 host TEXT NOT NULL CHECK(host='mingeagle.com'),
 sampled_pageviews INTEGER NOT NULL CHECK(sampled_pageviews>0),
 source TEXT NOT NULL CHECK(source='CLOUDFLARE_RUM_GRAPHQL'),
 fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(date_utc,platform,page_bucket)
);
CREATE INDEX IF NOT EXISTS idx_ai_referral_pages_daily_date
 ON ai_referral_pages_daily(date_utc DESC);
