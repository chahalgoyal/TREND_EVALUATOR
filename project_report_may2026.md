# Comprehensive Project Report: Social Trend Intelligence Backend

**Date:** May 2026
**Status:** Development-Ready & Containerized
**Stack:** Node.js, TypeScript, PostgreSQL 15, Redis, BullMQ, Playwright, Docker

---

## Executive Summary
The **Social Trend Intelligence** system was conceived as a highly decoupled, data-pipeline architecture designed to ingest social media content, extract engagement metrics, evaluate them against trending thresholds, and calculate deep statistical trends. 

This report chronicles the complete evolutionary journey of the project—from the initial Software Requirements Specification (SRS) and architecture design to the implementation of robust scraping logic, Docker containerization, and enterprise-grade multi-account scheduling.

---

## Phase 1: Architectural Foundation & Scraper Core
### The Vision
The original goal was to build a backend system that could scroll through platforms like Instagram and LinkedIn, extract hashtags and engagement metrics (likes, comments, shares), and store only the data that met a "trending" threshold. The architecture chosen was a **Modular Monolith** using **BullMQ** to isolate tasks into a pipeline.

### Implementation Details
*   **The Three-Queue Pipeline:** We architected a strictly decoupled pipeline: `scrapeQueue` -> `parseQueue` -> `thresholdQueue`. This ensured that scraping failures didn't crash parsing logic, and raw HTML payloads were temporarily stored for replayability.
*   **Playwright Automation:** We integrated Playwright to run headless Chromium instances. This was crucial because modern platforms render dynamically via JavaScript, rendering static HTTP scraping useless.
*   **Regex-Based Parsing:** Initially, the system relied on flaky CSS selectors which constantly broke when platforms updated their UI. We completely overhauled the parser to use robust Regex-based text parsing, dramatically increasing the accuracy of extracting numbers (e.g., "1.5M likes" -> `1500000`).

---

## Phase 2: Deep Extraction & Pipeline Robustness
### The Challenges
As the scraper ran autonomously, we discovered that social media platforms were actively fighting back by truncating text and hiding metrics.

### Implementation Details
*   **"Click-More" Fallback Logic:** We noticed captions were ending in "...". We implemented deep API interception and a DOM fallback mechanism (`page.click('.more-button')`) to ensure the scraper expanded and captured the *entire* caption and all hidden hashtags before extracting the DOM.
*   **Database Constraints:** Concurrent workers were causing duplicate posts to be saved. We enforced runtime guarantees by adding `UNIQUE(post_id, platform_id)` constraints directly into PostgreSQL, making the database the ultimate source of truth for deduplication.
*   **Zombie Process Prevention:** Scrape jobs were occasionally hanging indefinitely. We implemented strict 15-second `AbortController` timeouts on network requests and page navigations to ensure workers failed fast and returned to the queue.

---

## Phase 3: Trend Intelligence & Threshold Logic
### The Vision
Data is useless without meaning. We needed to filter out the noise and mathematically define what makes a post "trending."

### Implementation Details
*   **OR-Based Thresholds:** Initially, the system required a post to hit massive targets in *all* metrics (AND logic). We re-architected the threshold worker to use **OR-based evaluation** (e.g., if a post hits the Like target OR the Comment target, it passes) and halved the requirements to reflect realistic viral behavior.
*   **Mathematical Trend Algorithms:** We built pure mathematical models without relying on external AI:
    *   *Engagement Rate:* `((Likes + Comments * 5) / Views)`
    *   *Time-Decay Score (Gravity):* Modeled after HackerNews, penalizing older posts so fresh trends surface faster.
    *   *Velocity Calculation:* Tracking day-over-day growth percentages for specific hashtags to identify "Breakout" trends.

---

## Phase 4: Containerization & Deployment
### The Vision
The system needed to run entirely autonomously in the background without tying up a local terminal or relying on the host machine's specific Node version.

### Implementation Details
*   **Docker Desktop Integration:** We transitioned the entire stack to Docker.
*   **Docker Compose Orchestration:** We wrote a robust `docker-compose.yml` that networks four distinct containers:
    1.  `sti-postgres`: The persistent database.
    2.  `sti-redis`: The queue memory backend.
    3.  `sti-api`: The unified API and worker container running our TypeScript code.
    4.  `sti-db-setup`: A transient container that automatically runs migrations and seeds the DB on first startup.

---

## Phase 5: Scaling, Account Rotation, & Pipeline Stabilization (Current)
### The Challenges
Relying on a single `.env` API key or a single `session.json` file created severe bottlenecks. Platforms would rate-limit the IP or block the single account, bringing the whole pipeline to a halt. Furthermore, database disk usage was growing unboundedly due to raw payload storage.

### Implementation Details
*   **Database-Driven Session Management:** We completely migrated session management (cookies for Playwright, API keys for YouTube) from the local filesystem into a highly secure `platform_accounts` PostgreSQL table.
*   **LRU Round-Robin Scheduler:** We modified the core `scheduler.ts` cron job. Instead of blindly using a hardcoded key, the scheduler now queries the database for the Least Recently Used (`ORDER BY last_used_at ASC`) active account. This allows us to load 10 different Instagram accounts or 5 YouTube API keys, and the system will automatically cycle through them evenly, entirely bypassing rate limits.
*   **Automated Data Cleanup:** Implemented a midnight cron task that automatically purges `raw_payloads` older than 72 hours (`RAW_PAYLOAD_TTL_HOURS`), ensuring the database disk footprint remains stable permanently.
*   **Velocity Bug Eradication:** We identified a severe timezone/SQL-interval bug where the hashtag velocity was permanently returning `-100.00%`. We rewrote the SQL interval logic using standard `CURRENT_DATE - 1`, deployed the fix by rebuilding the Docker image, and ran a massive SQL backfill query that repaired 834 historically broken rows in production.

---

## Conclusion
What started as a superficial idea for extracting tags has matured into a resilient, scalable, and autonomous data pipeline. 

By aggressively decoupling the architecture (Scrape -> Parse -> Threshold -> Intelligence), enforcing strict database constraints, containerizing the environment, and implementing enterprise-grade account rotation, the Social Trend Intelligence system is now fully equipped to run autonomously in production.
