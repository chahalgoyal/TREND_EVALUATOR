-- V001__initial_schema.sql
-- Run once on first deployment. All subsequent changes must be separate versioned migration files.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── platforms ────────────────────────────────────────────────────────────────
CREATE TABLE platforms (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  scrape_interval_min INTEGER,
  config              JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_platforms_name UNIQUE (name),
  CONSTRAINT uq_platforms_slug UNIQUE (slug)
);

-- ── posts ────────────────────────────────────────────────────────────────────
CREATE TABLE posts (
  id                BIGSERIAL PRIMARY KEY,
  platform_id       INTEGER NOT NULL REFERENCES platforms(id),
  post_id           TEXT NOT NULL,
  author_id         TEXT,
  author_username   TEXT,
  caption           TEXT,
  content_html      TEXT,
  content_json      JSONB,
  likes             INTEGER NOT NULL DEFAULT 0,
  comments          INTEGER NOT NULL DEFAULT 0,
  shares            INTEGER NOT NULL DEFAULT 0,
  views             BIGINT NOT NULL DEFAULT 0,
  source_type       TEXT NOT NULL CHECK (source_type IN ('feed','keyword','profile')),
  threshold_passed  BOOLEAN NOT NULL DEFAULT false,
  raw_payload_id    UUID,
  posted_at         TIMESTAMPTZ,
  scraped_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT uq_posts_platform_postid UNIQUE (post_id, platform_id)
);

CREATE INDEX idx_posts_platform_scraped
  ON posts(platform_id, scraped_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_platform_likes
  ON posts(platform_id, likes DESC)
  WHERE deleted_at IS NULL AND threshold_passed = true;

CREATE INDEX idx_posts_scraped_at ON posts(scraped_at DESC);

CREATE INDEX idx_posts_raw_payload ON posts(raw_payload_id)
  WHERE raw_payload_id IS NOT NULL;

-- ── hashtags ─────────────────────────────────────────────────────────────────
CREATE TABLE hashtags (
  id            BIGSERIAL PRIMARY KEY,
  tag           TEXT NOT NULL,
  post_count    INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_hashtags_tag UNIQUE (tag),
  CONSTRAINT chk_hashtag_lowercase CHECK (tag = lower(tag))
);

-- ── post_hashtags ─────────────────────────────────────────────────────────────
CREATE TABLE post_hashtags (
  post_id       BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id    BIGINT NOT NULL REFERENCES hashtags(id),
  platform_id   INTEGER NOT NULL REFERENCES platforms(id),
  associated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, hashtag_id)
);

CREATE INDEX idx_ph_hashtag_id ON post_hashtags(hashtag_id);
CREATE INDEX idx_ph_hashtag_platform ON post_hashtags(hashtag_id, platform_id);
CREATE INDEX idx_ph_associated_at ON post_hashtags(associated_at DESC);

-- ── raw_payloads ──────────────────────────────────────────────────────────────
CREATE TABLE raw_payloads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id  INTEGER NOT NULL REFERENCES platforms(id),
  job_id       TEXT NOT NULL,
  source_type  TEXT NOT NULL CHECK (source_type IN ('feed','keyword','profile')),
  payload_html TEXT,
  payload_json JSONB,
  parse_status TEXT NOT NULL DEFAULT 'pending'
               CHECK (parse_status IN ('pending','success','failed','retrying')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '72 hours'
);

CREATE INDEX idx_raw_expires ON raw_payloads(expires_at);
CREATE INDEX idx_raw_status ON raw_payloads(platform_id, parse_status);

-- ── threshold_rules ──────────────────────────────────────────────────────────
CREATE TABLE threshold_rules (
  id              SERIAL PRIMARY KEY,
  platform_id     INTEGER NOT NULL REFERENCES platforms(id),
  metric_name     TEXT NOT NULL CHECK (metric_name IN ('likes','comments','shares','views')),
  operator        TEXT NOT NULL DEFAULT 'gte'
                  CHECK (operator IN ('gte','gt','lte','lt')),
  threshold_value BIGINT NOT NULL CHECK (threshold_value >= 0),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_threshold_platform_metric UNIQUE (platform_id, metric_name)
);

-- ── scrape_jobs ──────────────────────────────────────────────────────────────
CREATE TABLE scrape_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id   INTEGER NOT NULL REFERENCES platforms(id),
  trigger_type  TEXT NOT NULL CHECK (trigger_type IN ('scheduler','manual','event')),
  target_type   TEXT NOT NULL CHECK (target_type IN ('feed','keyword','profile')),
  target_value  TEXT,
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','completed','failed')),
  posts_scraped INTEGER,
  error_message TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scrape_jobs_platform_status ON scrape_jobs(platform_id, status);
CREATE INDEX idx_scrape_jobs_created ON scrape_jobs(created_at DESC);
