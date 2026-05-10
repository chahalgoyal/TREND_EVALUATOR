# Quick Reference: Issues & Fixes

## 1️⃣ THRESHOLD LOGIC — OR vs AND

**Where:** `src/modules/threshold/threshold.worker.ts:35–60`

**Current Code:**
```typescript
let thresholdPassed = rules.length === 0;  // Default true if no rules

for (const rule of rules) {
  if (passes) {
    thresholdPassed = true;  // ← OR LOGIC
  }
}
```

**Problem:** Uses OR (any rule passes) but spec says AND (all must pass)

**Result:** Instagram posts with 200K likes but only 100 comments pass (should fail)

**Fix (3 lines):**
```typescript
let thresholdPassed = rules.length > 0; // Start true only if rules exist
let allRulesPassed = true;

for (const rule of rules) {
  const passes = evaluateRule(metricValue, rule.operator, Number(rule.threshold_value));
  if (!passes) {
    allRulesPassed = false;
    break; // Early exit
  }
}

thresholdPassed = allRulesPassed && rules.length > 0;
```

---

## 2️⃣ ACCOUNT DEACTIVATION CASCADE — Silent Platform Shutdown

**Where:** `src/modules/scraper/scraper.worker.ts:160–185`

**Current Code:**
```typescript
if (!loggedIn) {
  if (data.accountId) {
    await db.query(
      `UPDATE platform_accounts SET is_active = false WHERE id = $1`,
      [data.accountId]
    );
  }
  throw new Error(`Login failed for ${data.platform}`);
}
```

**Problem:** Any login failure → `is_active = false` → platform goes silent

**Result:** All Instagram accounts fail → scheduler finds no active accounts → no more scrapes

**Fix (Add Account Health Tracking):**

1. **Schema:**
```sql
ALTER TABLE platform_accounts ADD COLUMN
  failure_count INT DEFAULT 0,
  last_failure_reason TEXT,
  consecutive_failures INT DEFAULT 0,
  retry_after TIMESTAMPTZ;
```

2. **On Login Failure:**
```typescript
if (!loggedIn) {
  await db.query(`
    UPDATE platform_accounts 
    SET consecutive_failures = consecutive_failures + 1,
        last_failure_reason = $2,
        last_failure_at = NOW(),
        retry_after = NOW() + INTERVAL '1 hour',
        is_active = CASE WHEN consecutive_failures >= 3 THEN false ELSE is_active END
    WHERE id = $1
  `, [data.accountId, 'login_failed']);
  
  // Alert after 2 consecutive failures
  throw new Error(...);
}
```

3. **On Login Success (reset counter):**
```typescript
if (loggedIn) {
  await db.query(`
    UPDATE platform_accounts 
    SET consecutive_failures = 0, retry_after = NULL 
    WHERE id = $1
  `, [data.accountId]);
}
```

---

## 3️⃣ ENGAGEMENT CALCULATION EDGE CASES — Unstable Rankings

**Where:** `src/modules/intelligence/algorithms.ts`

**Three Problems:**

### Problem 1: Views = 0 inflates engagement
```typescript
if (views <= 0) {
  return Math.min((likes / 100000) * 100, 100);  // Always returns 100 if likes > 0
}
```

Result: Post with 0 views but 1 like = 100 engagement. Then scraped again with 10M views = 2 engagement. Ranking flips.

### Problem 2: Missing posted_at never decays
```typescript
if (!postedAt) return engagementRate;  // No decay = permanent high score
```

Result: Undated posts stay at top forever.

### Problem 3: Log of zero creates cliff
```typescript
const volumeScore = likes > 0 ? Math.log10(likes) * 10 : 0;
// log10(1) = 0, log10(10) = 1, log10(100) = 2
// Huge biases toward volume, ignores engagement quality
```

**Fixes:**

```typescript
// Fix engagement to handle 0 views
export function calculateEngagementRate(likes: number, comments: number, views: number): number {
  const safeViews = Math.max(views, Math.max(likes, 1)); // Fallback to likes or 1
  const rawScore = (likes * 1) + (comments * 5);
  let rate = (rawScore / safeViews) * 100;
  return Number(Math.min(Math.max(rate, 0), 100).toFixed(4));
}

// Fix missing timestamp with mild decay
export function calculateTimeDecayScore(engagementRate: number, postedAt?: string): number {
  if (!postedAt) {
    return engagementRate * 0.8;  // Mild penalty for unknown age
  }
  // ... rest of calculation
}

// Fix log cliff with +1 offset
export function calculateFinalTrendScore(likes: number, decayedEngagementScore: number): number {
  const volumeScore = likes > 0 ? Math.log10(likes + 1) * 10 : 0;  // ← +1 offset
  return Number(((volumeScore * 0.4) + (decayedEngagementScore * 0.6)).toFixed(4));
}
```

---

## 4️⃣ SCHEDULER RACE CONDITION — Duplicate Scrape Jobs

**Where:** `src/modules/scraper/triggers/scheduler.ts:15–60`

**Problem:** Check-then-act is not atomic → two ticks create duplicate jobs

```
Tick A: Check recent jobs (none) ✓
Tick B: Check recent jobs (none) ✓
Tick A: Insert job ✓
Tick B: Insert job ✓  ← DUPLICATE
```

**Fix (Add UNIQUE Constraint):**

```sql
ALTER TABLE scrape_jobs
ADD CONSTRAINT uq_platform_scheduler_queued 
UNIQUE (platform_id, trigger_type) 
WHERE trigger_type = 'scheduler' AND status = 'queued';
```

Then in code:
```typescript
try {
  await db.query(`INSERT INTO scrape_jobs (...) VALUES (...)`, params);
} catch (err) {
  if (err.code === '23505') { // UNIQUE VIOLATION
    logger.debug('Scheduler job already queued');
    continue;
  }
  throw err;
}
```

---

## 5️⃣ PARSE FAILURE SILENT DISCARD — Posts Vanish

**Where:** `src/modules/parser/parser.worker.ts:10–30`

**Problem:** If raw_payloads expires before parse job runs → post silently lost

```typescript
const rawPayload = await rawStorageRepository.getById(data.rawPayloadId);

if (!rawPayload) {
  jobLogger.error('Raw payload not found');
  return; // Silent exit, no retry
}
```

**Result:** 72 hours later, admin notices fewer posts but can't debug why.

**Fix (Add Error Logging):**

```sql
CREATE TABLE parse_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_payload_id UUID REFERENCES raw_payloads(id) ON DELETE CASCADE,
  error_message TEXT,
  error_stack TEXT,
  platform VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parse_errors_created ON parse_errors(created_at DESC);
```

```typescript
if (!rawPayload) {
  await db.query(
    `INSERT INTO parse_errors (raw_payload_id, error_message, platform)
     VALUES ($1, $2, $3)`,
    [data.rawPayloadId, 'Raw payload expired or not found', data.platform]
  );
  jobLogger.error('Raw payload not found');
  return;
}

try {
  // ...parse logic...
} catch (err: any) {
  await db.query(
    `INSERT INTO parse_errors (raw_payload_id, error_message, error_stack, platform)
     VALUES ($1, $2, $3, $4)`,
    [data.rawPayloadId, err.message, err.stack, data.platform]
  );
  throw err;
}
```

---

## 6️⃣ HASHTAG ANALYTICS CONCURRENCY — Velocity Inaccuracy

**Where:** `src/modules/intelligence/intelligence.worker.ts:40–70`

**Problem:** Velocity calculated from intermediate state under concurrent updates

Worker A and B both process posts with hashtag `#trending`:
- A: Upserts mentions → 5
- A: Queries velocity (reads 5)
- B: Upserts mentions → 6
- A: Writes velocity based on 5 (should be 6)

**Fix (Use SERIALIZABLE Isolation):**

```typescript
const client = await db.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

  // Upsert all hashtags first
  for (const tag of data.hashtags) {
    const hashtagRes = await client.query(
      `SELECT id FROM hashtags WHERE tag = $1`, [tag]
    );
    if (!hashtagRes.rows[0]) continue;
    const hashtagId = hashtagRes.rows[0].id;

    await client.query(`
      INSERT INTO hashtag_analytics (hashtag_id, date_bucket, mentions_count)
      VALUES ($1, CURRENT_DATE, 1)
      ON CONFLICT (hashtag_id, date_bucket) DO UPDATE SET mentions_count = mentions_count + 1
    `, [hashtagId]);
  }

  // NOW calculate velocities (all in same transaction snapshot)
  for (const tag of data.hashtags) {
    // ...velocity calculation within transaction...
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

## 7️⃣ HASHTAG INSERTION LOOP — N+1 Queries

**Where:** `src/modules/threshold/threshold.worker.ts:115–140`

**Problem:** If post has 50 hashtags, 50 INSERT queries in a transaction

```typescript
for (const tag of post.hashtags) {
  await client.query(...INSERT INTO hashtags...);  // Query 1
  await client.query(...INSERT INTO post_hashtags...);  // Query 2
}
// 100+ queries for 50 hashtags!
```

**Fix (Batch with unnest):**

```typescript
if (post.hashtags.length > 0) {
  const validTags = post.hashtags
    .filter(t => t && t.length > 0 && t.length <= 150)
    .slice(0, 100); // Cap at 100

  if (validTags.length > 0) {
    // Upsert all hashtags in ONE query
    await client.query(`
      INSERT INTO hashtags (tag, post_count, first_seen_at, last_seen_at)
      SELECT tag, 1, NOW(), NOW()
      FROM unnest($1::text[]) AS tag
      ON CONFLICT (tag) DO UPDATE SET
        post_count = hashtags.post_count + 1,
        last_seen_at = NOW()
    `, [validTags]);

    // Join in ONE query
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

## 8️⃣ BROWSER POOL LEAK — Unresponsive Browsers

**Where:** `src/modules/scraper/browser-pool/pool.ts`

**Problem:** Browsers in bad state put back in pool

```typescript
release(browser: Browser): void {
  if (browser.isConnected()) {
    this.available.push(browser);  // ← May be hung but "connected"
  }
}
```

**Fix (Add Health Check):**

```typescript
async release(browser: Browser): void {
  try {
    if (!browser.isConnected()) {
      this.replaceBrowser(browser);
      return;
    }

    // Health check: get browser version (timeout after 2s)
    await Promise.race([
      browser.version(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 2000)
      ),
    ]);

    this.available.push(browser);
  } catch (err) {
    logger.warn('Browser health check failed, replacing');
    this.replaceBrowser(browser);
  }
}

private async replaceBrowser(browser: Browser): Promise<void> {
  const idx = this.browsers.indexOf(browser);
  if (idx !== -1) this.browsers.splice(idx, 1);
  try { await browser.close(); } catch { }
  
  const newBrowser = await this.launchBrowser();
  this.browsers.push(newBrowser);
  this.available.push(newBrowser);
}
```

---

## 📊 Priority Matrix

```
SEVERITY ↑
    |
  H | [1] [3]         [7]
    | [2]     [6]  [5]
  M |     [4]    [8]  [9]
    |        [10]
  L |________________________________→ EFFORT
    LOW          MED          HIGH
```

**Quick Wins (Low Effort, High Impact):**
1. Fix threshold OR→AND (3 lines)
2. Add UNIQUE constraint to scheduler (1 line SQL)
3. Batch hashtag queries (10 lines)

**Critical Path (Medium Effort, High Impact):**
- Account health tracking (medium complexity)
- Engagement calc fixes (medium complexity)
- Parse error logging (easy-medium)

