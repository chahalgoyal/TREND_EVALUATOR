-- V003__accounts_layer.sql
-- Adds the platform_accounts table to securely store session cookies in the DB instead of the filesystem.
-- This is the foundational step for the multi-account "Round Robin" load balancer.

CREATE TABLE IF NOT EXISTS platform_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id INT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  username VARCHAR(255) NOT NULL,
  session_data JSONB NOT NULL, -- Stores the raw cookie/state JSON
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ, -- Used to select the "least recently used" account for the scraper
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform_id, username)
);

CREATE INDEX IF NOT EXISTS idx_platform_accounts_active ON platform_accounts(platform_id, is_active);
CREATE INDEX IF NOT EXISTS idx_platform_accounts_last_used ON platform_accounts(last_used_at ASC NULLS FIRST);
