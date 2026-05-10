# System Data Flow & Failure Points Map

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                          SOCIAL TREND INTELLIGENCE PIPELINE                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  SCHEDULING LAYER (Cron)                                                     │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                             │
│  Every Minute:                                    Every Hour:              Daily (Midnight):              │
│  ┌──────────────────────┐                       ┌──────────────────┐     ┌──────────────────┐          │
│  │  startScheduler()    │                       │ Trend            │     │ Cleanup Task     │          │
│  │                      │                       │ Recalculator     │     │                  │          │
│  │ • Check active       │◄──────[ISSUE #2]─────► • Decay old      │     │ • Delete expired │          │
│  │   platforms          │    Race Condition     │   scores        │     │   raw_payloads   │          │
│  │ • Count accounts     │                       │ • Recalc gravity │     │ • TTL = 72h      │          │
│  │ • Dynamic quantum    │                       │ • Re-rank        │     │                  │          │
│  │ • Pick LRU account   │                       └──────────────────┘     └──────────────────┘          │
│  │ • Create scrape_job  │                                                                              │
│  │ • Queue scrapeQueue  │                                                                              │
│  └──────┬──────────────┘                                                                               │
│         │                                                                                                │
│    [ISSUE #3]                                                                                          │
│    Account Cascade:                                                                                    │
│    If no active accounts                                                                              │
│    → Platform goes                                                                                    │
│       SILENT                                                                                          │
│         │                                                                                                │
│         └──────────────────────────────────────────────────────────────────────────────────────────────┘
│                                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

                                              ▼
                    ┌────────────────────────────────────────────────────────────┐
                    │              scrapeQueue (BullMQ)                          │
                    │         Concurrency: SCRAPE_WORKER_CONCURRENCY = 3        │
                    └────────────────────────────────────────────────────────────┘

                                              ▼
        ┌────────────────────────────────────────────────────────────────────────────────┐
        │         Scraper Worker (src/modules/scraper/scraper.worker.ts)                │
        ├────────────────────────────────────────────────────────────────────────────────┤
        │                                                                                │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 1. Acquire Browser from Pool (or API key for YouTube)                │  │
        │  │    [ISSUE #9] Browser may be hung but "connected"                    │  │
        │  │    [FIX] Add health check on release                                 │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 2. Select Connector (Instagram/LinkedIn/YouTube)                      │  │
        │  │    Priority 1: DB Account (round-robin LRU)                           │  │
        │  │    Priority 2: Filesystem session                                     │  │
        │  │    [ISSUE #3] If DB account fails login → deactivate immediately    │  │
        │  │    [FIX] Track consecutive_failures; only deactivate after 3 fails   │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 3. Login & Scrape (Feed/Keyword/Profile)                             │  │
        │  │    • Adaptive throttle (1–8s with jitter)                            │  │
        │  │    • Extract RawPostFragments (HTML + intercepted JSON)              │  │
        │  │    [FIX] Log warning if 0 posts extracted (selector broken?)         │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 4. Store Raw Payloads                                                 │  │
        │  │    • INSERT into raw_payloads with parse_status='pending'             │  │
        │  │    • Set expires_at = NOW() + 72 hours                               │  │
        │  │    • For each fragment → queue parseQueue job                        │  │
        │  │    [ISSUE #7] If parse job doesn't run before TTL → data lost       │  │
        │  │    [FIX] Add parse_errors table for forensics                        │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 5. Update Session                                                     │  │
        │  │    • Save new cookies/state to DB (refresh session_data)             │  │
        │  │    • Reset consecutive_failures if login succeeded                   │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 6. Update Audit Log                                                   │  │
        │  │    • UPDATE scrape_jobs SET status='completed|failed'                │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 7. Release Browser (or skip for API)                                 │  │
        │  │    [ISSUE #9] Check if still responsive before returning             │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                                                                                │
        └────────────────────────────────────────────────────────────────────────────────┘

                                              ▼
                    ┌────────────────────────────────────────────────────────────┐
                    │              parseQueue (BullMQ)                           │
                    │         Concurrency: PARSE_WORKER_CONCURRENCY = 10        │
                    └────────────────────────────────────────────────────────────┘

                                              ▼
        ┌────────────────────────────────────────────────────────────────────────────────┐
        │         Parser Worker (src/modules/parser/parser.worker.ts)                   │
        ├────────────────────────────────────────────────────────────────────────────────┤
        │                                                                                │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 1. Load Raw Payload from DB                                          │  │
        │  │    [ISSUE #7] If expired or missing → silent exit, post lost        │  │
        │  │    [FIX] Log to parse_errors table for forensics                     │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 2. Extract Data (Normalizer)                                         │  │
        │  │    • Platform-specific selectors & regex                             │  │
        │  │    • Hashtag extraction (lowercase, deduplicated)                    │  │
        │  │    • Engagement parsing ("123K" → 123000)                           │  │
        │  │    • Author data extraction                                          │  │
        │  │    • API JSON deep search for untruncated captions                  │  │
        │  │    OUTPUT: NormalizedPostDTO                                         │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 3. Update Raw Payload Status                                         │  │
        │  │    • parse_status = 'success' or 'failed'                            │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 4. Queue Threshold Job                                               │  │
        │  │    • Push ThresholdJobDTO to thresholdQueue                          │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                                                                                │
        └────────────────────────────────────────────────────────────────────────────────┘

                                              ▼
                    ┌────────────────────────────────────────────────────────────┐
                    │              thresholdQueue (BullMQ)                       │
                    │         Concurrency: THRESHOLD_WORKER_CONCURRENCY = 20    │
                    └────────────────────────────────────────────────────────────┘

                                              ▼
        ┌────────────────────────────────────────────────────────────────────────────────┐
        │      Threshold Worker (src/modules/threshold/threshold.worker.ts)              │
        ├────────────────────────────────────────────────────────────────────────────────┤
        │                                                                                │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 1. Load Threshold Rules for Platform                                │  │
        │  │    • Fetch active threshold_rules from DB                            │  │
        │  │    Example: Instagram requires likes >= 50000 AND comments >= 2500  │  │
        │  │    [ISSUE #1] CODE IS OR (ANY passes) NOT AND (ALL pass)!          │  │
        │  │    [FIX] Change to all-rules-must-pass logic                        │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 2. Evaluate Each Rule (With Bug #1)                                 │  │
        │  │    if ANY rule passes → threshold_passed = true                     │  │
        │  │    Expected: ALL rules must pass                                    │  │
        │  │    Result: Instagram posts with high likes + low comments slip through  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 3. UPSERT Post (Transaction)                                        │  │
        │  │    • INSERT or UPDATE posts table                                    │  │
        │  │    • Use ON CONFLICT (post_id, platform_id)                         │  │
        │  │    • threshold_passed is a FLAG, not a gate (post stored either way)│  │
        │  │    • Get RETURNING id for post_db_id                                │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 4. UPSERT Hashtags & Links                                          │  │
        │  │    [ISSUE #8] N+1 queries in loop: FOR each tag:                   │  │
        │  │       INSERT INTO hashtags... (1 query)                             │  │
        │  │       INSERT INTO post_hashtags... (1 query)                        │  │
        │  │    Result: 50 hashtags = 100 queries in transaction!               │  │
        │  │    [FIX] Batch with unnest: 2 queries total                        │  │
        │  │                                                                        │  │
        │  │    Current:                                                         │  │
        │  │    for tag in post.hashtags:                                        │  │
        │  │      INSERT hashtags (1 query)                                      │  │
        │  │      INSERT post_hashtags (1 query)                                 │  │
        │  │                                                                        │  │
        │  │    Fixed:                                                           │  │
        │  │    INSERT hashtags FROM unnest (1 query)                            │  │
        │  │    INSERT post_hashtags WHERE tag = ANY (1 query)                   │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 5. Queue Intelligence Job (if threshold_passed)                     │  │
        │  │    • Push IntelligenceJobDTO to intelligenceQueue                    │  │
        │  │    • Only posts that pass threshold get scored                       │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                                                                                │
        └────────────────────────────────────────────────────────────────────────────────┘

                                              ▼
                    ┌────────────────────────────────────────────────────────────┐
                    │              intelligenceQueue (BullMQ)                    │
                    │         Concurrency: Default (1?)                         │
                    └────────────────────────────────────────────────────────────┘

                                              ▼
        ┌────────────────────────────────────────────────────────────────────────────────┐
        │     Intelligence Worker (src/modules/intelligence/intelligence.worker.ts)      │
        ├────────────────────────────────────────────────────────────────────────────────┤
        │                                                                                │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 1. Calculate Post Scores                                             │  │
        │  │    • engagementRate = (likes * 1 + comments * 5) / views * 100      │  │
        │  │      [ISSUE #4a] If views = 0 → inflated to 100                    │  │
        │  │      [FIX] Use Math.max(views, likes, 1)                            │  │
        │  │    • timeDecayScore = engagementRate / (ageInHours + 2)^1.8        │  │
        │  │      [ISSUE #4b] If posted_at missing → no decay (score stays high)│  │
        │  │      [FIX] Apply 0.8 penalty for unknown age                        │  │
        │  │    • volumeScore = log10(likes) * 10                               │  │
        │  │      [ISSUE #4c] log10(1) = 0 → cliff at zero                     │  │
        │  │      [FIX] Use log10(likes + 1) to smooth                          │  │
        │  │    • finalTrendScore = (volumeScore * 0.4) + (timeDecayScore * 0.6)│  │
        │  │    • UPSERT into post_scores                                        │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                         ▼                                                     │
        │  ┌────────────────────────────────────────────────────────────────────────┐  │
        │  │ 2. Update Hashtag Analytics                                          │  │
        │  │    For each hashtag:                                                │  │
        │  │    • UPSERT into hashtag_analytics (mentions_count++)               │  │
        │  │      [ISSUE #5] Concurrent updates cause stale velocity reads      │  │
        │  │      [FIX] Use SERIALIZABLE transaction isolation                   │  │
        │  │    • Query velocity = (today - yesterday) / yesterday * 100         │  │
        │  │    • Flag breakout if velocity >= 500% AND mentions >= 5            │  │
        │  │    • UPDATE hashtag_analytics with velocity_percentage, is_breakout │  │
        │  └────────────────────────────────────────────────────────────────────────┘  │
        │                                                                                │
        └────────────────────────────────────────────────────────────────────────────────┘

                                              ▼
        ┌────────────────────────────────────────────────────────────────────────────────┐
        │                         DATA STORAGE (PostgreSQL)                              │
        ├────────────────────────────────────────────────────────────────────────────────┤
        │                                                                                │
        │  Core Tables:                                                                │
        │  ┌─────────────────────────────────┬────────────────────────────────────┐   │
        │  │ platforms                       │ scrape_jobs (audit log)            │   │
        │  │ • name, slug, scrape_interval   │ • id, platform_id, status         │   │
        │  │ • is_active, config             │ • trigger_type (scheduler|manual) │   │
        │  │                                 │ • target_type (feed|keyword|...)  │   │
        │  │ raw_payloads (TTL buffer)       │ • posts_scraped, error_message    │   │
        │  │ • id (UUID), payload_html/json  │ • started_at, completed_at        │   │
        │  │ • parse_status, expires_at      │                                    │   │
        │  │                                 │ platform_accounts (round-robin)   │   │
        │  │ posts (canonical)               │ • id, username, session_data      │   │
        │  │ • id (bigserial), post_id       │ • is_active, last_used_at        │   │
        │  │ • likes, comments, shares       │ • [NEW] consecutive_failures      │   │
        │  │ • views, author_*, caption      │ • [NEW] retry_after              │   │
        │  │ • source_type, threshold_passed │                                    │   │
        │  │ • posted_at, scraped_at         │ parse_errors [NEW]               │   │
        │  │ • deleted_at (soft delete)      │ • raw_payload_id, error_message  │   │
        │  │                                 │ • error_stack, platform          │   │
        │  │ hashtags (normalized)           │                                    │   │
        │  │ • tag (unique, lowercase)       │ post_scores (computed)            │   │
        │  │ • post_count, first_seen_at     │ • engagement_rate, time_decay    │   │
        │  │ • last_seen_at                  │ • total_trend_score              │   │
        │  │                                 │                                    │   │
        │  │ post_hashtags (many-to-many)    │ hashtag_analytics (daily)         │   │
        │  │ • post_id, hashtag_id           │ • hashtag_id, date_bucket        │   │
        │  │ • platform_id, associated_at    │ • mentions_count, velocity_%     │   │
        │  │                                 │ • is_breakout                     │   │
        │  └─────────────────────────────────┴────────────────────────────────────┘   │
        │                                                                                │
        └────────────────────────────────────────────────────────────────────────────────┘

                                              ▼
        ┌────────────────────────────────────────────────────────────────────────────────┐
        │                         READ APIs (Express Routes)                             │
        ├────────────────────────────────────────────────────────────────────────────────┤
        │                                                                                │
        │  GET /api/v1/posts                    GET /api/v1/hashtags                   │
        │  • Join: posts + platforms             • Joins: hashtags + post_hashtags    │
        │  • Optional filters: hashtag, likes    • Order: post_count or last_seen_at  │
        │  • Returns: posts with hashtag list    • Pagination: cursor-based            │
        │                                                                                │
        │  GET /api/v1/trends/posts             GET /api/v1/trends/hashtags/breakouts │
        │  • Joins: posts + post_scores          • Joins: hashtag_analytics + hashtags│
        │  • Order: total_trend_score DESC       • WHERE is_breakout = true            │
        │  • REQUIRES threshold_passed = true    • WHERE velocity >= 500%              │
        │                                                                                │
        │  [ISSUE #4] If engagement calc is broken → rankings wrong                   │
        │  [ISSUE #5] If velocity is stale → breakouts missed or false-trigger        │
        │                                                                                │
        └────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                              FAILURE POINTS SUMMARY                                          │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  [1] Threshold Logic (OR vs AND)       ← CRITICAL: Posts pass incorrectly                  │
│  [2] Scheduler Race                    ← Duplicate jobs logged                             │
│  [3] Account Deactivation Cascade      ← CRITICAL: Platform goes silent                    │
│  [4] Engagement Calculation            ← HIGH: Unstable rankings                           │
│  [5] Hashtag Analytics Concurrency     ← Velocity inaccuracy                               │
│  [6] Parse Failure Silent Discard      ← MEDIUM: Posts lost without trace                  │
│  [7] Hashtag Loop N+1 Queries          ← Performance degradation                           │
│  [8] Browser Pool Leak                 ← Slow system degradation                           │
│  [9] Dual Cleanup Paths                ← Code confusion                                    │
│  [10] No Idempotency Keys              ← Future issue with webhooks                        │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

