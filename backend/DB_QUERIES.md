# Social Trend Intelligence - Database Monitoring Queries

This file contains copy-pasteable SQL commands you can run against your PostgreSQL database (`social_trend_intelligence`) to monitor the health and output of the scraper pipeline.

## 1. Top Trending Posts (Passed Thresholds)
View the posts that actually passed the minimum engagement thresholds, ordered by most likes.

```sql
SELECT 
    p.platform_id, 
    p.post_id, 
    p.likes, 
    p.comments, 
    p.author_username, 
    p.scraped_at 
FROM posts p
WHERE p.threshold_passed = true
ORDER BY p.likes DESC 
LIMIT 20;
```

## 2. All Recent Posts (Scraper Output)
View the raw output of the parser for the 10 most recently scraped posts, regardless of if they passed the threshold.

```sql
SELECT 
    plat.slug AS platform,
    p.post_id, 
    p.likes, 
    p.comments, 
    p.threshold_passed,
    p.scraped_at
FROM posts p
JOIN platforms plat ON p.platform_id = plat.id
ORDER BY p.scraped_at DESC 
LIMIT 10;
```

## 3. Top Hashtags by Post Count
View which hashtags are appearing in the most posts (this indicates broader conversation volume).

```sql
SELECT 
    h.tag, 
    COUNT(hp.post_id) as appearance_count
FROM hashtags h
JOIN hashtag_posts hp ON h.id = hp.hashtag_id
GROUP BY h.id, h.tag
ORDER BY appearance_count DESC
LIMIT 15;
```

## 4. Top Hashtags by Total Engagement (Likes)
View which hashtags have the highest combined engagement across all posts they appear in (this indicates viral intensity).

```sql
SELECT 
    h.tag, 
    SUM(p.likes) as total_likes,
    SUM(p.comments) as total_comments,
    COUNT(p.id) as post_count
FROM hashtags h
JOIN hashtag_posts hp ON h.id = hp.hashtag_id
JOIN posts p ON hp.post_id = p.id
GROUP BY h.id, h.tag
ORDER BY total_likes DESC
LIMIT 15;
```

## 5. Raw Payload Ingestion Health
Check if the scraper workers are actually writing raw HTML/JSON to the database.

```sql
SELECT 
    plat.slug AS platform, 
    COUNT(rp.id) as total_payloads, 
    MAX(rp.created_at) as last_payload_received
FROM raw_payloads rp
JOIN platforms plat ON rp.platform_id = plat.id
GROUP BY plat.slug;
```

## 6. Threshold Configuration
View the current active threshold rules for each platform.

```sql
SELECT 
    p.slug AS platform, 
    tr.metric_name, 
    tr.operator, 
    tr.threshold_value
FROM threshold_rules tr
JOIN platforms p ON tr.platform_id = p.id;
```
