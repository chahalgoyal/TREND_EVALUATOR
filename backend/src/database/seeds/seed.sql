-- seed.sql — Run after migration. Seeds platforms and default threshold rules.

-- platforms
INSERT INTO platforms (name, slug, scrape_interval_min, is_active)
VALUES
  ('instagram', 'instagram', 15, true),
  ('linkedin',  'linkedin',  30, false),
  ('youtube',   'youtube',   20, true)
ON CONFLICT (slug) DO UPDATE SET is_active = EXCLUDED.is_active;

-- threshold_rules (SRS §3.8 seed data)
TRUNCATE TABLE threshold_rules RESTART IDENTITY CASCADE;

-- Instagram: 50k likes, 2500 comments
-- LinkedIn:  250 likes, 50 comments
-- YouTube:   100k views, 5k likes
INSERT INTO threshold_rules (platform_id, metric_name, operator, threshold_value)
SELECT p.id, 'likes',    'gte', 50000 FROM platforms p WHERE p.slug = 'instagram'
ON CONFLICT DO NOTHING;

INSERT INTO threshold_rules (platform_id, metric_name, operator, threshold_value)
SELECT p.id, 'comments', 'gte', 2500   FROM platforms p WHERE p.slug = 'instagram'
ON CONFLICT DO NOTHING;

INSERT INTO threshold_rules (platform_id, metric_name, operator, threshold_value)
SELECT p.id, 'likes',    'gte', 250    FROM platforms p WHERE p.slug = 'linkedin'
ON CONFLICT DO NOTHING;

INSERT INTO threshold_rules (platform_id, metric_name, operator, threshold_value)
SELECT p.id, 'comments', 'gte', 50    FROM platforms p WHERE p.slug = 'linkedin'
ON CONFLICT DO NOTHING;

INSERT INTO threshold_rules (platform_id, metric_name, operator, threshold_value)
SELECT p.id, 'views',    'gte', 100000 FROM platforms p WHERE p.slug = 'youtube'
ON CONFLICT DO NOTHING;

INSERT INTO threshold_rules (platform_id, metric_name, operator, threshold_value)
SELECT p.id, 'likes',    'gte', 5000   FROM platforms p WHERE p.slug = 'youtube'
ON CONFLICT DO NOTHING;
