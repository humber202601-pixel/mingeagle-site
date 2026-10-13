-- Human-reviewed AI discovery observations only. No inferred AI rankings or traffic.
-- Never store third-party chat transcripts, personal data or raw tracking tokens.
CREATE TABLE IF NOT EXISTS ai_visibility_observations (
 id TEXT PRIMARY KEY,
 prompt_id TEXT NOT NULL,
 platform TEXT NOT NULL CHECK (platform IN ('CHATGPT','GEMINI','COPILOT','PERPLEXITY','CLAUDE')),
 test_mode TEXT NOT NULL CHECK (test_mode IN ('WEB_SEARCH','STANDARD')),
 status TEXT NOT NULL CHECK (status IN ('CITED','MENTIONED_NO_LINK','NOT_MENTIONED','UNAVAILABLE')),
 cited_url TEXT,
 method TEXT NOT NULL DEFAULT 'MANUAL_REVIEW' CHECK(method='MANUAL_REVIEW'),
 tested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((status='CITED' AND cited_url IS NOT NULL)
 OR (status!='CITED' AND cited_url IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_latest ON ai_visibility_observations(prompt_id,platform,tested_at DESC,id DESC);
