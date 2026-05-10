-- V005__reassign_youtube_id.sql
-- Reassigns YouTube from ID 21 to ID 3 for cleaner indexing and consistency.
-- This script safely migrates all foreign key references.

BEGIN;

-- 1. Rename existing record to free up the unique constraints (name and slug)
UPDATE platforms 
SET name = 'youtube_temp', slug = 'youtube_temp' 
WHERE id = 21;

-- 2. Create the new record with ID 3 and the correct names
INSERT INTO platforms (id, name, slug, is_active, scrape_interval_min, config, created_at, updated_at)
SELECT 3, 'youtube', 'youtube', is_active, scrape_interval_min, config, created_at, updated_at
FROM platforms WHERE id = 21;

-- 3. Update all child tables to point to the new ID 3
UPDATE platform_accounts SET platform_id = 3 WHERE platform_id = 21;
UPDATE posts SET platform_id = 3 WHERE platform_id = 21;
UPDATE post_hashtags SET platform_id = 3 WHERE platform_id = 21;
UPDATE raw_payloads SET platform_id = 3 WHERE platform_id = 21;
UPDATE threshold_rules SET platform_id = 3 WHERE platform_id = 21;
UPDATE scrape_jobs SET platform_id = 3 WHERE platform_id = 21;

-- 4. Delete the old record
DELETE FROM platforms WHERE id = 21;

-- 5. Sync the SERIAL sequence for platforms table so it doesn't try to reuse 21 immediately 
SELECT setval('platforms_id_seq', (SELECT MAX(id) FROM platforms));

COMMIT;
