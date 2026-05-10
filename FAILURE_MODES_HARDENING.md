# Failure Modes & Hardening Opportunities — Social Trend Intelligence Backend

**Analysis Date:** May 8, 2026  
**Focus:** Production resilience, data consistency, algorithmic correctness

---

## 1. THRESHOLD EVALUATION LOGIC — SEMANTIC BUG

### Current Behavior (Line 35–60, `threshold.worker.ts`)
```typescript
let thresholdPassed = rules.length === 0;  // Default true if no rules

for (const rule of rules) {
  const metricValue = getMetricValue(post, rule.metric_name);
  const passes = evaluateRule(metricValue, rule.operator, Number(rule.threshold_value));
  
  if (passes) {
    thresholdPassed = true;  // ← THIS IS OR LOGIC
  }
}
```

### Issue
**The code implements OR logic (ANY rule passes → post passes), but:**
- SRS §3.8 comment says "ALL rules must pass for threshold_passed = true"
- Seed data sets multiple rules per platform (Instagram: likes AND comments)
- The default (`rules.length === 0`) suggests "no rules = accept all", which contradicts strict thresholding

### Impact
- **Data:** Posts with only high likes but low comments pass on Instagram when they shouldn't
- **Analytics:** Breakout hashtags inflated; false viral signals
- **Severity:** **HIGH** — Core filtering logic is inverted

### Fix (Minimal)
Replace the loop logic to require ALL rules to pass:
```typescript
let thresholdPassed = rules.length > 0; // Start true only if rules exist
let allRulesPassed = true;

for (const rule of rules) {
  const metricValue = getMetricValue(post, rule.metric_name);
  const passes = evaluateRule(metricValue, rule.operator, Number(rule.threshold_value));
  
  if (!passes) {
    allRulesPassed = false;
    jobLogger.debug({...}, 'Rule FAILED, post rejected');
    break; // Early exit; no need to check remaining
  }
}

thresholdPassed = allRulesPassed && rules.length > 0;
```

---

## 2. SCHEDULER ROUND-ROBIN RACE CONDITION

### Current Behavior (Lines 15–50, `scheduler.ts`)
```typescript
// Tick 1: Check if recently created
const recentJob = await db.query(
  `SELECT 1 FROM scrape_jobs
   WHERE platform_id = $1 AND trigger_type = 'scheduler'
   AND created_at > NOW() - ($2 || ' minutes')::INTERVAL
   LIMIT 1`
);

if (recentJob.rowCount && recentJob.rowCount > 0) {
  continue; // Already scheduled
}

// Tick 2: Create (UNPROTECTED WINDOW)
await db.query(
  `INSERT INTO scrape_jobs (id, platform_id, trigger_type, target_type, status)
   VALUES ($1, $2, 'scheduler', 'feed', 'queued')`
);
```

### Issue
**Race Condition Window (2-3ms typical, but unbounded under load):**
1. Scheduler tick A checks for recent job → none found
2. Scheduler tick B checks for recent job → none found
3. Tick A creates job
4. Tick B creates job (duplicate!)
5. Both run concurrently, causing duplication in `scrape_jobs` audit log

### Impact
- **Operational:** Duplicate scrape jobs logged, confusing audit trail
- **Resource:** Multiple browser instances acquired for same platform simultaneously
- **Metrics:** Inflated scrape counts in dashboards
- **Severity:** **MEDIUM** — Nonfatal, but operational noise

### Root Cause
Check-then-act is not atomic. The 2-minute quantum is a soft check, not a hard constraint.

### Fix (Add Uniqueness Constraint)
Add a unique constraint or use PostgreSQL advisory locks:

**Option A: Add DB Constraint (Simplest)**
```sql
ALTER TABLE scrape_jobs
ADD CONSTRAINT uq_platform_scheduler_quantum 
UNIQUE (platform_id, trigger_type) 
WHERE trigger_type = 'scheduler' AND status = 'queued';
```
This prevents duplicate `queued` scheduler jobs per platform. Handle `ON CONFLICT` in code:
```typescript
try {
  await db.query(`INSERT INTO scrape_jobs (...) VALUES (...)`, params);
} catch (err) {
  if (err.code === '23505') { // UNIQUE VIOLATION
    logger.debug('Scheduler job already queued for this platform');
    continue;
  }
  throw err;
}
```

**Option B: Advisory Lock (Stricter)**
```typescript
const lockId = hashCode(platform.id); // Deterministic hash of platform ID
const lockRes = await db.query(
  `SELECT pg_advisory_lock($1)`,
  [lockId]
);

try {
  // Now we're in a lock; check again
  const check = await db.query(...check query);
  if (check.rowCount === 0) {
    await db.query(...insert...);
  }
} finally {
  await db.query(`SELECT pg_advisory_unlock($1)`, [lockId]);
}
```

---

## 3. ACCOUNT LIFECYCLE MANAGEMENT — CASCADING FAILURES

### Current Behavior (Lines 160–185, `scraper.worker.ts`)
```typescript
if (!loggedIn) {
  sessionManager.invalidate(data.platform);
  if (data.accountId) {
    await db.query(
      `UPDATE platform_accounts SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [data.accountId]
    );
    jobLogger.warn({...}, 'DB account deactivated due to login failure');
  }
  throw new Error(`Login failed for ${data.platform}`);
}
```

### Issues

**1. Cascading Deactivation**
- When account fails login, it's marked `is_active = false` permanently
- Scheduler queries only active accounts: `WHERE is_active = true`
- If all accounts fail → no more scheduled scrapes for that platform
- No alerting mechanism or recovery path
- **Result:** Silent platform shutdown

**2. Lost Account Context**
- Why did the account fail? (IP block? password change? 2FA? cookies expired?)
- No reason field in `platform_accounts` — deactivation reason not stored
- Admin blind to cause of outage

**3. Session Rotation Skew**
- When account fails after session refresh, old session_data is lost
- If we retry with different session, might work (transient block)
- But on deactivation, that chance is gone

### Impact
- **Availability:** Platform goes silent if all accounts fail simultaneously
- **Observability:** No visibility into why accounts deactivated
- **Recovery:** Manual re-activation required; no self-healing
- **Severity:** **HIGH** — Can cause total platform unavailability

### Fix (Add Account Failure Tracking)

**Schema Addition:**
```sql
ALTER TABLE platform_accounts
ADD COLUMN failure_count INT DEFAULT 0,
ADD COLUMN last_failure_reason TEXT,
ADD COLUMN last_failure_at TIMESTAMPTZ,
ADD COLUMN consecutive_failures INT DEFAULT 0,
ADD COLUMN retry_after TIMESTAMPTZ;
```

**Updated Worker Logic:**
```typescript
if (!loggedIn) {
  // Increment failure count
  await db.query(
    `UPDATE platform_accounts 
     SET consecutive_failures = consecutive_failures + 1,
         last_failure_reason = $2,
         last_failure_at = NOW(),
         retry_after = NOW() + INTERVAL '1 hour',
         is_active = CASE 
           WHEN consecutive_failures >= 3 THEN false 
           ELSE is_active 
         END
     WHERE id = $1`,
    [data.accountId, 'login_failed']
  );

  // Alert after 2 consecutive failures
  const updated = await db.query(
    `SELECT consecutive_failures FROM platform_accounts WHERE id = $1`,
    [data.accountId]
  );
  
  if (updated.rows[0].consecutive_failures >= 2) {
    logger.warn({...accountId}, 'Account failure threshold reached');
    // Notify admin / trigger alert
  }

  throw new Error(`Login failed for ${data.platform}`);
}
```

**Scheduler Reset on Success:**
```typescript
// In scraper.worker after successful login:
if (data.accountId) {
  await db.query(
    `UPDATE platform_accounts 
     SET consecutive_failures = 0, retry_after = NULL 
     WHERE id = $1`,
    [data.accountId]
  );
}
```

---

## 4. ENGAGEMENT METRIC CALCULATION — ZERO/NULL EDGE CASES

### Issue 1: Views-Less Engagement (Line 30, `algorithms.ts`)
```typescript
export function calculateEngagementRate(likes: number, comments: number, views: number): number {
  if (views <= 0) {
    // If we don't have views, we cap engagement rate based on raw likes
    return Math.min((likes / 100000) * 100, 100);
  }
  // ...
}
```

**Problem:**
- If Instagram post has `views = 0` but `likes = 200K`, returns 100 (perfect engagement)
- If same post later gets `views = 10M`, re-scraped and recalculated, returns 2 (catastrophic drop)
- Time decay uses this score, so post ranking can flip wildly

### Issue 2: Time Decay on Missing Posted Date (Line 49, `algorithms.ts`)
```typescript
export function calculateTimeDecayScore(engagementRate: number, postedAt?: string): number {
  if (!postedAt) return engagementRate; // No decay if we don't know the age
  // ...
}
```

**Problem:**
- YouTube API provides `publishedAt`, Instagram scraped posts may not have `posted_at`
- Posts without timestamp never age out — permanently high score
- Breakout calculation compares today vs yesterday, but undated posts ignored

### Issue 3: Logarithm on Zero (Line 66, `algorithms.ts`)
```typescript
const volumeScore = likes > 0 ? Math.log10(likes) * 10 : 0;
```

**Problem:**
- Safe from NaN (checks `likes > 0`), but:
- Post with 1 like → log10(1) = 0 → volumeScore = 0
- Post with 10 likes → log10(10) = 1 → volumeScore = 10
- Post with 100 likes → log10(100) = 2 → volumeScore = 20
- This creates strong bias toward high volume, regardless of engagement quality
- Engagement rate is capped at 100; volume can grow unbounded

**Recommendation:** Use `Math.log10(Math.max(likes, 1))` + 1 to avoid the zero cliff

### Impact
- **Metrics:** Unstable post rankings as engagement data is backfilled
- **Bugs:** First-view posts rank artificially high; refreshed data can flip them
- **Severity:** **MEDIUM-HIGH** — Affects breakout detection and trending accuracy

### Fix (Stabilize Engagement Calculation)
```typescript
export function calculateEngagementRate(likes: number, comments: number, views: number): number {
  // If views is 0 but likes > 0, assume views = likes (conservative fallback)
  const safeViews = Math.max(views, likes, 1);
  
  const rawScore = (likes * 1) + (comments * 5);
  let rate = (rawScore / safeViews) * 100;
  
  // Clamp to [0, 100]
  rate = Math.min(Math.max(rate, 0), 100);
  
  return Number(rate.toFixed(4));
}

export function calculateTimeDecayScore(engagementRate: number, postedAt?: string): number {
  if (!postedAt) {
    // Unknown age: apply a mild decay penalty
    // This prevents undated posts from permanently topping rankings
    return engagementRate * 0.8;
  }

  const postedDate = new Date(postedAt);
  const now = new Date();
  const ageInHours = Math.max((now.getTime() - postedDate.getTime()) / (1000 * 60 * 60), 0);

  const gravity = 1.8;
  const score = engagementRate / Math.pow(ageInHours + 2, gravity);
  
  return Number(score.toFixed(4));
}

export function calculateFinalTrendScore(likes: number, decayedEngagementScore: number): number {
  // Use log with +1 offset to avoid zero cliff
  const volumeScore = likes > 0 ? (Math.log10(likes + 1) * 10) : 0;
  
  const finalScore = (volumeScore * 0.4) + (decayedEngagementScore * 0.6);
  return Number(finalScore.toFixed(4));
}
```

---

## 5. HASHTAG ANALYTICS CONCURRENCY — UPSERT TIMING WINDOW

### Current Behavior (Lines 47–70, `intelligence.worker.ts`)
```typescript
// For each hashtag of this post:
await db.query(`
  INSERT INTO hashtag_analytics (hashtag_id, date_bucket, mentions_count)
  VALUES ($1, CURRENT_DATE, 1)
  ON CONFLICT (hashtag_id, date_bucket) DO UPDATE SET 
    mentions_count = hashtag_analytics.mentions_count + 1
`);

// Then immediately query to calculate velocity:
const statsRes = await db.query(`
  SELECT 
    SUM(CASE WHEN date_bucket = CURRENT_DATE THEN mentions_count ELSE 0 END) as today_count,
    SUM(CASE WHEN date_bucket = CURRENT_DATE - INTERVAL '1 day' THEN mentions_count ELSE 0 END) as yesterday_count
  FROM hashtag_analytics 
  WHERE hashtag_id = $1 AND date_bucket >= CURRENT_DATE - INTERVAL '1 day'
`);
```

### Issue
**Race Condition in Velocity Calculation:**
1. Worker A processes post with hashtag `#trending`
2. A upserts `mentions_count` → 5
3. A calculates velocity → today=5, yesterday=10 → velocity = -50% (declining)
4. Worker B simultaneously processes another post with `#trending`
5. B upserts `mentions_count` → 6
6. **A's velocity is now stale:** should be (6-10)=-40%, not -50%
7. If A and B run concurrently → velocity calculation uses intermediate state

**Another Race Condition (Date Boundary):**
- If job runs at 11:59 PM and completes at 12:01 AM:
- Upsert → `CURRENT_DATE` changes mid-transaction
- Velocity calculated against previous day's data
- `is_breakout` flag may be computed against wrong temporal baseline

### Impact
- **Metrics:** Velocity percentages can be off by significant margin under high concurrency
- **Alerts:** Breakout detection (velocity >= 500%) may miss or false-trigger
- **Severity:** **MEDIUM** — Analytics inaccuracy, not data loss

### Fix (Add Transaction Isolation)
```typescript
// In intelligence.worker.ts, wrap the entire flow in a transaction:
const client = await db.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

  // Upsert all hashtag_analytics first
  for (const tag of data.hashtags) {
    const hashtagRes = await client.query(
      `SELECT id FROM hashtags WHERE tag = $1`,
      [tag]
    );
    if (!hashtagRes.rows[0]) continue;
    const hashtagId = hashtagRes.rows[0].id;

    await client.query(`
      INSERT INTO hashtag_analytics (hashtag_id, date_bucket, mentions_count)
      VALUES ($1, CURRENT_DATE, 1)
      ON CONFLICT (hashtag_id, date_bucket) DO UPDATE SET 
        mentions_count = hashtag_analytics.mentions_count + 1
    `, [hashtagId]);
  }

  // NOW calculate velocities (all within same transaction snapshot)
  for (const tag of data.hashtags) {
    const hashtagRes = await client.query(
      `SELECT id FROM hashtags WHERE tag = $1`,
      [tag]
    );
    if (!hashtagRes.rows[0]) continue;
    const hashtagId = hashtagRes.rows[0].id;

    const statsRes = await client.query(`
      SELECT 
        SUM(CASE WHEN date_bucket = CURRENT_DATE THEN mentions_count ELSE 0 END)::int as today_count,
        SUM(CASE WHEN date_bucket = CURRENT_DATE - INTERVAL '1 day' THEN mentions_count ELSE 0 END)::int as yesterday_count
      FROM hashtag_analytics 
      WHERE hashtag_id = $1 AND date_bucket >= CURRENT_DATE - INTERVAL '1 day'
    `, [hashtagId]);

    const todayMentions = statsRes.rows[0].today_count || 0;
    const yesterdayMentions = statsRes.rows[0].yesterday_count || 0;

    const velocity = calculateVelocity(todayMentions, yesterdayMentions);
    const isBreakout = velocity >= 500 && todayMentions >= 5;

    await client.query(`
      UPDATE hashtag_analytics 
      SET velocity_percentage = $1, is_breakout = $2
      WHERE hashtag_id = $3 AND date_bucket = CURRENT_DATE
    `, [velocity, isBreakout, hashtagId]);
  }

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

---

## 6. RAW PAYLOAD CLEANUP DUAL-PATH INCONSISTENCY

### Current Behavior
**Path 1: Repository Helper (Manual)**
```typescript
// rawStorage.repository.ts
async cleanupExpired(): Promise<number> {
  const result = await db.query(
    `DELETE FROM raw_payloads WHERE expires_at < NOW()`
  );
  return result.rowCount ?? 0;
}
```
Called manually (not integrated into startup).

**Path 2: Cron Scheduler**
```typescript
// scheduler.ts, runs daily at midnight
const result = await db.query(
  `DELETE FROM raw_payloads WHERE created_at < NOW() - ($1 || ' hours')::INTERVAL`,
  [ttlHours]
);
```

### Issues
1. **Different Conditions:** Path 1 uses `expires_at`, Path 2 uses `created_at`
   - `expires_at` is set at creation: `NOW() + INTERVAL '72 hours'`
   - If database clock drifts, or TTL changes, they can diverge
   
2. **Not Called:** Path 1 never runs — just defines the helper
   - Dead code path = wasted function
   
3. **Race Between Paths:** If both ran simultaneously (doesn't, but if they did):
   - Could have two DELETE transactions competing
   - Not dangerous (DELETE is idempotent), but inefficient

### Impact
- **Code Quality:** Confusing double-path maintenance burden
- **Severity:** **LOW** — Acceptable for low-priority temp storage
- **Recommendation:** **Document intentionally** that Path 1 is for manual cleanup only; rely on cron for automatic cleanup

### Fix (Clarify Intent)
```typescript
// rawStorage.repository.ts — add comment
/**
 * Manual cleanup helper (called ad-hoc by admins if needed).
 * For automatic cleanup, see scheduler.ts (runs daily at midnight).
 * Do NOT call this during normal operation — let the scheduler handle it.
 */
async cleanupExpired(): Promise<number> {
  const result = await db.query(
    `DELETE FROM raw_payloads WHERE expires_at < NOW()`
  );
  return result.rowCount ?? 0;
}

// scheduler.ts — clarify which TTL is authoritative
```

---

## 7. PARSE FAILURE → SILENT DISCARD

### Current Behavior (Lines 10–25, `parser.worker.ts`)
```typescript
async function processParseJob(job: Job<ParseJobDTO>): Promise<void> {
  const rawPayload = await rawStorageRepository.getById(data.rawPayloadId);
  
  if (!rawPayload) {
    jobLogger.error('Raw payload not found — may have expired');
    return; // Early exit, no retry
  }

  try {
    const normalizedPost = normalizePost({...});
    await rawStorageRepository.updateStatus(data.rawPayloadId, 'success');
    // ... forward to thresholdQueue
  } catch (err: any) {
    await rawStorageRepository.updateStatus(data.rawPayloadId, 'failed');
    jobLogger.error({...}, 'Parse job failed');
    throw err; // Retry
  }
}
```

### Issues
1. **Early Exit if Raw Payload Missing**
   - If `raw_payloads` row expires before parse job runs → job returns silently
   - No alert; no trace; post is lost
   - Only detectable by comparing `scrape_jobs.posts_scraped` vs final posts stored

2. **Failed Parse → No Visibility**
   - `raw_payloads.parse_status = 'failed'`
   - But no visibility into WHY it failed (markup changed? extraction logic broke?)
   - No sample error payload stored for forensics

### Impact
- **Data Loss:** Posts can silently vanish if parse fails and TTL expires before admin review
- **Observability:** No way to debug why posts stopped being captured
- **Severity:** **MEDIUM** — Nonfatal, but silent data loss is hard to catch

### Fix (Add Parse Error Logging)
```sql
-- Add error tracking table
CREATE TABLE IF NOT EXISTS parse_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_payload_id UUID NOT NULL REFERENCES raw_payloads(id) ON DELETE CASCADE,
  error_message TEXT,
  error_stack TEXT,
  platform VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parse_errors_created ON parse_errors(created_at DESC);
```

```typescript
// parser.worker.ts
catch (err: any) {
  // Store the error for forensics
  await db.query(
    `INSERT INTO parse_errors (raw_payload_id, error_message, error_stack, platform)
     VALUES ($1, $2, $3, $4)`,
    [data.rawPayloadId, err.message, err.stack, data.platform]
  );

  await rawStorageRepository.updateStatus(data.rawPayloadId, 'failed');
  jobLogger.error({...}, 'Parse job failed');
  throw err;
}
```

---

## 8. THRESHOLD TRANSACTION — HASHTAG INSERTION LOOP UNBOUNDED

### Current Behavior (Lines 115–140, `threshold.worker.ts`)
```typescript
if (post.hashtags.length > 0) {
  for (const tag of post.hashtags) {
    const hashtagResult = await client.query(
      `INSERT INTO hashtags (tag, post_count, first_seen_at, last_seen_at)
       VALUES ($1, 1, NOW(), NOW())
       ON CONFLICT (tag)
       DO UPDATE SET
         post_count   = hashtags.post_count + 1,
         last_seen_at = NOW()
       RETURNING id`,
      [tag]
    );
    const hashtagId = hashtagResult.rows[0].id;

    await client.query(
      `INSERT INTO post_hashtags (post_id, hashtag_id, platform_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (post_id, hashtag_id) DO NOTHING`,
      [postDbId, hashtagId, platformId]
    );
  }
}
```

### Issues
1. **N+1 Queries in Transaction**
   - If post has 50 hashtags (not uncommon), 50 INSERT queries inside a transaction
   - Each query acquires locks, increasing contention
   - Under high concurrency (100+ concurrent threshold workers), connection pool exhaustion risk

2. **No Hashtag Validation**
   - Instagram posts can have ###### or unicode hashtags
   - No sanitization; could store malformed tags
   - Hashtag length not validated (schema allows TEXT)

3. **Transaction Timeout Risk**
   - Long-running transaction holds locks on posts, hashtags, post_hashtags
   - If one INSERT fails mid-loop, entire transaction rolls back (safe, but wasteful)

### Impact
- **Performance:** Degrades under high volume
- **Stability:** Connection pool contention on heavy loads
- **Severity:** **MEDIUM** — Recovers via retry, but slow under load

### Fix (Batch Hashtag Operations)
```typescript
if (post.hashtags.length > 0) {
  // 1. Upsert all hashtags in a single query (if DB supports it) or batch
  const validTags = post.hashtags
    .filter(t => t && t.length > 0 && t.length <= 150)
    .slice(0, 100); // Cap at 100 hashtags per post

  if (validTags.length > 0) {
    // Batch insert using VALUES (...), (...), (...)
    const values = validTags.map((t, i) => `($${i + 1})`).join(',');
    const placeholders = validTags;

    await client.query(`
      INSERT INTO hashtags (tag, post_count, first_seen_at, last_seen_at)
      VALUES ${values.replace(/\$/g, () => {
        let counter = 0;
        return `($${++counter})`;
      })}
      ON CONFLICT (tag) DO UPDATE SET
        post_count = hashtags.post_count + 1,
        last_seen_at = NOW()
    `, validTags);

    // 2. Join in a second batch query
    const joinValues = validTags
      .map((_, i) => `($1, (SELECT id FROM hashtags WHERE tag = $${i + 2}), $${validTags.length + 2})`)
      .join(',');

    await client.query(`
      INSERT INTO post_hashtags (post_id, hashtag_id, platform_id)
      SELECT * FROM (VALUES ${joinValues}) AS t
      ON CONFLICT (post_id, hashtag_id) DO NOTHING
    `, [postDbId, ...validTags, platformId]);
  }
}
```

Alternatively, use a simpler approach with unnest:
```typescript
if (post.hashtags.length > 0) {
  const validTags = post.hashtags
    .filter(t => t && t.length > 0 && t.length <= 150)
    .slice(0, 100);

  if (validTags.length > 0) {
    // Upsert all hashtags
    await client.query(`
      INSERT INTO hashtags (tag, post_count, first_seen_at, last_seen_at)
      SELECT tag, 1, NOW(), NOW()
      FROM unnest($1::text[]) AS tag
      ON CONFLICT (tag) DO UPDATE SET
        post_count = hashtags.post_count + 1,
        last_seen_at = NOW()
    `, [validTags]);

    // Join posts to hashtags
    await client.query(`
      INSERT INTO post_hashtags (post_id, hashtag_id, platform_id)
      SELECT $1, h.id, $2
      FROM hashtags h
      WHERE h.tag = ANY($3::text[])
      ON CONFLICT (post_id, hashtag_id) DO NOTHING
    `, [postDbId, platformId, validTags]);
  }
}
```

---

## 9. BROWSER POOL LEAK UNDER FAILURE

### Current Behavior (Lines 265–290, `scraper.worker.ts`)
```typescript
const browser = await browserPool.acquire();

try {
  // ... scraping logic ...
} catch (err: any) {
  jobLogger.error({...}, 'Scrape job failed');
  await db.query(...update scrape_jobs to failed...);
  throw err; // Let BullMQ handle retry
} finally {
  browserPool.release(browser);
}
```

### Issue
**The `finally` block always releases, but:**
1. If `browserPool.acquire()` throws before entering try block → no release (minor)
2. If BullMQ worker crashes mid-finally → browser not released (minor)
3. **More likely:** Browser is in bad state after crash (may have unclosed contexts)
   - `browserPool.release()` just checks `isConnected()` and puts it back
   - If Playwright crashed or hung, browser is "connected" but unresponsive
   - Next worker borrowing it will timeout/hang

### Impact
- **Resource:** Slowly degrades browser pool; eventual hang
- **Severity:** **MEDIUM** — Rare, but degrades under sustained errors

### Fix (Add Health Check)
```typescript
// browser-pool/pool.ts
async release(browser: Browser): void {
  try {
    if (!browser.isConnected()) {
      logger.warn('Browser disconnected, replacing in pool');
      this.replaceBrowser(browser);
      return;
    }

    // Health check: try to get browser version (lightweight operation)
    const version = await Promise.race([
      browser.version(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('browser health check timeout')), 2000)
      ),
    ]);

    logger.debug({ version }, 'Browser health check passed');
    this.available.push(browser);
  } catch (err) {
    logger.warn({ err }, 'Browser health check failed, replacing in pool');
    this.replaceBrowser(browser);
  }
}

private async replaceBrowser(browser: Browser): Promise<void> {
  const idx = this.browsers.indexOf(browser);
  if (idx !== -1) {
    this.browsers.splice(idx, 1);
  }
  try {
    await browser.close();
  } catch { /* ignore */ }

  const newBrowser = await this.launchBrowser();
  this.browsers.push(newBrowser);
  this.available.push(newBrowser);
}
```

---

## 10. NO IDEMPOTENCY KEYS FOR QUEUE JOBS

### Issue
**If a job fails and retries, it replays the entire operation:**
- Parser retries → re-normalizes → re-upserts post and hashtags (safe due to ON CONFLICT)
- Threshold retries → re-upserts post and hashtags (safe due to ON CONFLICT)
- Intelligence retries → re-upserts post_scores and hashtag_analytics (safe due to ON CONFLICT)

**Currently safe due to PostgreSQL upserts, BUT:**
1. If a job partially succeeds then crashes (e.g., posts inserted but intelligence not queued)
   - Retry will re-insert posts (idempotent via ON CONFLICT)
   - But intelligence job was never enqueued, so it won't trigger

2. External side effects (e.g., webhook notifications, cache invalidation) would fire twice

### Impact
- **Low risk** today (all writes are idempotent via ON CONFLICT)
- **Future risk:** If webhooks or caching layers are added, replays cause bugs

### Fix (Add Idempotency Keys)
```typescript
// queues/dto.ts
export interface BaseJobDTO {
  jobId: string;
  idempotencyKey: string; // ← ADD THIS
  // ...
}

// In parsers, threshold workers:
const idempotencyKey = `parse_${data.rawPayloadId}`;

// Before inserting, check if already processed:
const existing = await db.query(
  `SELECT id FROM processed_jobs WHERE idempotency_key = $1`,
  [idempotencyKey]
);

if (existing.rows[0]) {
  jobLogger.info('Job already processed, skipping');
  return;
}

// ... do work ...

// After success, record
await db.query(
  `INSERT INTO processed_jobs (idempotency_key, completed_at) VALUES ($1, NOW())`,
  [idempotencyKey]
);
```

---

## Summary Table: Failure Modes

| # | Issue | Severity | Fix Difficulty | Data Loss Risk | Operational Impact |
|---|-------|----------|-----------------|----------------|--------------------|
| 1 | Threshold OR instead of AND | **HIGH** | Low | No | Wrong posts flagged as viral |
| 2 | Scheduler race condition | MEDIUM | Medium | No | Duplicate audit entries |
| 3 | Account deactivation cascade | **HIGH** | Medium | No | Platform goes silent |
| 4 | Engagement calculation edge cases | MEDIUM-HIGH | Medium | No | Unstable rankings |
| 5 | Hashtag analytics concurrency | MEDIUM | Medium | No | Velocity inaccuracy |
| 6 | Dual cleanup paths | LOW | Low | No | Code confusion |
| 7 | Parse failure silent discard | MEDIUM | Medium | Yes | Posts vanish silently |
| 8 | Hashtag insertion loop | MEDIUM | Medium | No | Perf degradation |
| 9 | Browser pool leak | MEDIUM | Low | No | Slow system hang |
| 10 | No idempotency keys | LOW (now), MEDIUM (future) | Low | No | Future issue if webhooks added |

---

## Recommended Priority Order

1. **Fix #1 (Threshold Logic)** — Critical correctness bug; easy fix
2. **Fix #3 (Account Cascade)** — Can stop entire platform; medium effort but important
3. **Fix #4 (Engagement Calc)** — Affects all trend scoring; affects user-facing metrics
4. **Fix #2 (Scheduler Race)** — Add UNIQUE constraint; operational cleanliness
5. **Fix #7 (Parse Failures)** — Add error logging; helps with observability
6. **Fix #5 (Hashtag Concurrency)** — Add SERIALIZABLE transaction; analytics accuracy
7. **Fix #8 (Hashtag Insertion)** — Batch queries; performance
8. **Fix #9 (Browser Pool)** — Health check; long-term stability
9. **Fix #10 (Idempotency)** — Insurance for future; low priority now

