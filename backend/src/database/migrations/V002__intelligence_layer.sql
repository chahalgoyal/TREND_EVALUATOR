-- V002__intelligence_layer.sql
-- Adds tables for the algorithmic trend intelligence layer.
-- This migration is completely non-destructive to existing data.

-- 1. Post Scores Table
-- Stores the calculated algorithmic scores for each post.
CREATE TABLE IF NOT EXISTS post_scores (
  post_id BIGINT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  engagement_rate NUMERIC(10, 4) NOT NULL DEFAULT 0, -- Likes + Comments / Views (or proxy)
  time_decay_score NUMERIC(15, 4) NOT NULL DEFAULT 0, -- Gravity-adjusted hotness score
  total_trend_score NUMERIC(15, 4) NOT NULL DEFAULT 0, -- Combined final score for sorting
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_scores_total_trend ON post_scores(total_trend_score DESC);

-- 2. Hashtag Analytics Table
-- Stores daily aggregated data to calculate velocity (growth rate).
CREATE TABLE IF NOT EXISTS hashtag_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hashtag_id BIGINT NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  date_bucket DATE NOT NULL DEFAULT CURRENT_DATE, -- Groups mentions by day
  mentions_count INT NOT NULL DEFAULT 0,
  velocity_percentage NUMERIC(10, 2) NOT NULL DEFAULT 0, -- % growth compared to previous day
  is_breakout BOOLEAN NOT NULL DEFAULT false, -- True if velocity > 500%
  UNIQUE(hashtag_id, date_bucket)
);

CREATE INDEX IF NOT EXISTS idx_hashtag_analytics_date ON hashtag_analytics(date_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_hashtag_analytics_breakout ON hashtag_analytics(is_breakout);

-- 3. Hashtag Co-occurrence Table (Optional but useful for clustering)
-- Tracks which hashtags are used together in the same post
CREATE TABLE IF NOT EXISTS hashtag_cooccurrence (
  hashtag_a_id BIGINT NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  hashtag_b_id BIGINT NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  co_count INT NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hashtag_a_id, hashtag_b_id)
);
