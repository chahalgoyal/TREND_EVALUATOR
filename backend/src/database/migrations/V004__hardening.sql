-- V004__hardening.sql

-- Issue #2: Prevent duplicate scheduler jobs
CREATE UNIQUE INDEX IF NOT EXISTS idx_scrape_jobs_platform_queued
  ON scrape_jobs (platform_id, trigger_type)
  WHERE status = 'queued' AND trigger_type = 'scheduler';

-- Issue #3: Account health tracking  
ALTER TABLE platform_accounts 
  ADD COLUMN IF NOT EXISTS consecutive_failures INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS retry_after TIMESTAMPTZ;
