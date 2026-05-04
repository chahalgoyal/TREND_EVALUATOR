-- seed.sql — Run after migration. Seeds platforms and default threshold rules.

-- platforms
INSERT INTO platforms (name, slug, scrape_interval_min)
VALUES
  ('instagram', 'instagram', 15),
  ('linkedin',  'linkedin',  30),
  ('youtube',   'youtube',   20)
ON CONFLICT (slug) DO NOTHING;

-- threshold_rules (SRS §3.8 seed data)
-- Instagram: 50k likes, 2500 comments
-- LinkedIn:  2500 reactions, 50 comments
-- YouTube:   100k views, 5k likes
INSERT INTO threshold_rules (platform_id, metric_name, operator, threshold_value)
SELECT p.id, 'likes',    'gte', 50000 FROM platforms p WHERE p.slug = 'instagram'
ON CONFLICT DO NOTHING;

INSERT INTO threshold_rules (platform_id, metric_name, operator, threshold_value)
SELECT p.id, 'comments', 'gte', 2500   FROM platforms p WHERE p.slug = 'instagram'
ON CONFLICT DO NOTHING;

INSERT INTO threshold_rules (platform_id, metric_name, operator, threshold_value)
SELECT p.id, 'likes',    'gte', 2500   FROM platforms p WHERE p.slug = 'linkedin'
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
