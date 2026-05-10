-- V006: Widen engagement columns from INTEGER to BIGINT
--
-- Root cause: Instagram API responses occasionally contain values >2.1B in
-- fields parsed as like_count or comment_count (e.g. microsecond timestamps
-- misidentified as engagement counts). PostgreSQL INTEGER maxes at 2,147,483,647.
-- BIGINT supports up to 9,223,372,036,854,775,807 — safe for any realistic value.
--
-- The normalizer-level sanity cap (100M) prevents garbage data from entering,
-- but BIGINT ensures the column itself never causes an overflow crash.

ALTER TABLE posts
  ALTER COLUMN likes    TYPE BIGINT,
  ALTER COLUMN comments TYPE BIGINT,
  ALTER COLUMN shares   TYPE BIGINT,
  ALTER COLUMN views    TYPE BIGINT;
