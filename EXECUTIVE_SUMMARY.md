# Executive Summary: Social Trend Intelligence Backend — Risk Assessment

**Date:** May 8, 2026  
**Status:** PRODUCTION READY WITH KNOWN ISSUES  
**Risk Level:** MODERATE (2 critical, 3 high-priority issues identified)

---

## 🎯 System Overview

This is a **staged social media analytics pipeline**, not a traditional request/response API:

1. **Scheduler** → Every minute, checks which platforms are due and queues scrape jobs
2. **Scraper** → Collects raw HTML/JSON from Instagram, LinkedIn, YouTube
3. **Parser** → Normalizes platform-specific data into canonical schema
4. **Threshold** → Filters posts by engagement thresholds (likes, comments, views)
5. **Intelligence** → Computes trend scores, identifies breakouts
6. **APIs** → Expose posts, hashtags, trends for dashboard consumption

**Data Pipeline:** 4 BullMQ queues + PostgreSQL + Redis  
**Workers:** 4 concurrent pools (scrape, parse, threshold, intelligence)  
**Session Management:** Multi-account round-robin load balancing per platform

---

## ⚠️ Critical Issues Found (Fix Immediately)

### Issue 1: THRESHOLD LOGIC BUG — Posts Pass Incorrectly
**File:** `src/modules/threshold/threshold.worker.ts:35–60`

**Current:** Posts pass if **ANY rule passes** (OR logic)  
**Spec:** Posts should pass if **ALL rules pass** (AND logic)  
**Impact:** Instagram posts with 200K likes + 100 comments pass when they shouldn't

**Example Failure:**
- Platform: Instagram
- Rules: likes >= 50,000 AND comments >= 2,500
- Post A: 200K likes, 100 comments
- Current behavior: PASS (because likes rule passes)
- Expected behavior: FAIL (comments rule fails)
- Result: False viral signals in trending data

**Severity:** **CRITICAL** — Core business logic is inverted  
**Fix Effort:** **LOW** — 3 lines of code  
**Risk of Not Fixing:** Dashboard shows wrong trending posts; analytics unreliable

---

### Issue 2: ACCOUNT DEACTIVATION CASCADE — Platform Shutdown
**File:** `src/modules/scraper/scraper.worker.ts:160–185`

**Current:** Any login failure → account deactivated → removed from round-robin pool  
**Result:** If all accounts fail → **platform goes SILENT** (no more scrapes)  
**Impact:** No recovery; requires manual admin intervention to re-activate

**Failure Scenario:**
- Instagram account 1: Login fails (IP blocked, cookies expired, etc.)
- Marked `is_active = false`
- Instagram account 2: Also fails (same issue)
- Marked `is_active = false`
- Scheduler queries: `WHERE platform_id = X AND is_active = true`
- Result: Zero accounts returned → **no scheduled scrapes**
- System appears broken; no logs indicate why

**Severity:** **CRITICAL** — Can cause total platform unavailability  
**Fix Effort:** **MEDIUM** — Add failure tracking + recovery logic  
**Risk of Not Fixing:** Production outage with no visibility; silent data loss

---

### Issue 3: ENGAGEMENT CALCULATION EDGE CASES — Unstable Rankings
**File:** `src/modules/intelligence/algorithms.ts`

**Three Problems:**

1. **Views = 0 Inflates Engagement**
   - Post with 0 views + 1 like → engagement = 100
   - Same post later scraped with 10M views → engagement = 2
   - Ranking flips from top to bottom

2. **Missing Post Timestamp Never Decays**
   - Posts without `posted_at` stay at permanent high score
   - Undated posts outrank recent trending content

3. **Logarithm Zero Cliff**
   - Biases strongly toward raw volume, ignores engagement quality
   - Post with 1M views + 1% engagement > Post with 1K views + 50% engagement

**Impact:** Trend scores unstable; breakout detection inaccurate; admin sees wrong data

**Severity:** **HIGH** — Affects all user-facing trending metrics  
**Fix Effort:** **MEDIUM** — Algorithm changes  
**Risk of Not Fixing:** Analytics dashboard unreliable; false viral signals

---

## 🟡 High-Priority Issues (Fix This Month)

### Issue 4: PARSE FAILURE SILENT DISCARD
Posts can vanish without trace if raw payload expires before parsing.

**Current:** No error logging; posts disappear  
**Fix:** Add `parse_errors` table to record failures for forensics

---

### Issue 5: SCHEDULER RACE CONDITION
Two scheduler ticks can create duplicate scrape_jobs audit entries.

**Current:** Check-then-act is not atomic  
**Fix:** Add UNIQUE constraint to database

---

### Issue 6: HASHTAG INSERTION LOOP (N+1 Queries)
50 hashtags = 100 database queries in a transaction.

**Current:** Individual INSERT queries in loop  
**Fix:** Batch with PostgreSQL `unnest()`

---

## 🟢 Medium-Priority Issues (Fix When Possible)

- **Hashtag Analytics Concurrency** — Velocity calculated from stale state
- **Browser Pool Leak** — Unresponsive browsers returned to pool
- **Dual Cleanup Paths** — Redundant raw payload cleanup logic
- **No Idempotency Keys** — Insurance for future webhook integrations

---

## 📊 Risk Matrix

```
      IMPACT
        ▲
        │
      H │  1 (Logic)    3 (Calc)      4 (Parse)    5 (Scheduler)
        │  2 (Cascade)
      M │                                     6 (Hashtag)
        │                                7 (Concurrency)  8 (Browser)
      L │                         9 (Cleanup)   10 (Idempotency)
        │
        └─────────────────────────────────────────────────►  LIKELIHOOD
          LOW      MEDIUM      HIGH      VERY HIGH
```

---

## 💾 Data Integrity Assessment

### Currently Safe
✅ All write operations use PostgreSQL `ON CONFLICT` (idempotent)  
✅ Posts stored regardless of threshold (separation of concerns)  
✅ Raw payloads preserved as fallback buffer  
✅ Transactions protect hashtag/post relationships  
✅ Soft deletes (`deleted_at`) protect against accidental data loss

### At Risk
⚠️ Posts can be silently lost if raw payloads expire before parsing  
⚠️ Threshold logic can skip posts incorrectly (false negatives in trending data)  
⚠️ Engagement scores unstable due to edge case handling  
⚠️ Account deactivation can stop platform entirely (operational risk, not data loss)

---

## 🛠️ Recommendations

### Immediate Actions (This Sprint)
1. **Fix threshold AND logic** — Prevents wrong posts from being marked viral
2. **Implement account health tracking** — Prevents platform blackout
3. **Stabilize engagement calculation** — Ensures accurate trending metrics

### Short-Term (Next Sprint)
4. Add parse error logging for forensics
5. Add UNIQUE constraint to scheduler
6. Batch hashtag queries

### Medium-Term (Next Month)
7. Add transaction isolation for hashtag velocity
8. Add browser health checks
9. Refactor cleanup logic

### Long-Term (Before Webhook Integration)
10. Implement idempotency key tracking

---

## ✅ Production Readiness Assessment

| Category | Status | Notes |
|----------|--------|-------|
| **Data Pipeline** | ⚠️ CONDITIONALLY READY | Safe if critical fixes applied; otherwise unstable |
| **Session Management** | ⚠️ READY WITH CAUTION | Round-robin works but cascade failure risk |
| **API Layer** | ✅ READY | Clean Express routing; proper error handling |
| **Database** | ✅ READY | Schema well-designed; migration system in place |
| **Monitoring** | ⚠️ PARTIAL | Good logging; no alerts for account failures |
| **Error Recovery** | ⚠️ PARTIAL | BullMQ retries work; but cascading failures unhandled |

---

## 🎓 What Works Well

- ✅ **Layered architecture:** Staging (raw) → normalization (parser) → filtering (threshold) → analytics (intelligence)
- ✅ **Queue-based resilience:** BullMQ handles retries with exponential backoff
- ✅ **Session rotation:** Round-robin account load balancing prevents single-account blocking
- ✅ **Browser pooling:** Reuses expensive browser instances efficiently
- ✅ **Soft deletes:** Preserves historical data while marking as deleted
- ✅ **Concurrent workers:** Separate pools for each stage allow independent scaling

---

## 🚨 What Needs Attention

- ❌ **Threshold logic inverted:** AND spec violated by OR implementation
- ❌ **Cascading failures:** One account failure can cascade to platform shutdown
- ❌ **Silent data loss:** Parse failures disappear without forensic trail
- ❌ **Engagement instability:** Edge cases cause ranking flips
- ❌ **Race conditions:** Scheduler and hashtag velocity have timing windows

---

## 📝 Deployment Recommendation

**DO NOT** push to production without fixing issues #1–#3.

**CAN** deploy to staging immediately to test fixes.

**SHOULD** implement monitoring alerts for:
- Account deactivation events
- Platform scrape gaps (0 jobs for X minutes)
- Parse error rate spike
- Threshold rule evaluation logs

---

## 📚 Detailed Documentation

Three comprehensive guides have been created:

1. **FAILURE_MODES_HARDENING.md** (2000+ lines)
   - Full analysis of each issue
   - Root cause analysis
   - Code examples for fixes
   - Impact assessments

2. **QUICK_FIXES.md** (500+ lines)
   - Condensed guide for each issue
   - Side-by-side current/fixed code
   - Priority matrix
   - Quick-win opportunities

3. **DATA_FLOW_DIAGRAM.md** (500+ lines)
   - ASCII diagram of entire pipeline
   - Failure points annotated on flow
   - Storage model overview
   - Query patterns explained

All three documents available in project root for developer reference.

---

## ✋ Bottom Line

**The system is architecturally sound but has implementation bugs that affect:**
- **Trending accuracy** (engagement calculation)
- **Operational stability** (account cascade)
- **Data completeness** (parse failures)

**Severity:** Moderate with 2 critical + 3 high-priority issues

**Fix Effort:** Low-to-medium (3 line threshold fix is quick win)

**Time to Production:** ~2 weeks if fixed methodically

