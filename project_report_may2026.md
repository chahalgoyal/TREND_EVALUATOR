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

## Phase 4: Containerization & Local Orchestration
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

## Phase 5: Scaling, Account Rotation, & Pipeline Stabilization
### The Challenges
Relying on a single `.env` API key or a single `session.json` file created severe bottlenecks. Platforms would rate-limit the IP or block the single account, bringing the whole pipeline to a halt. Furthermore, database disk usage was growing unboundedly due to raw payload storage.

### Implementation Details
*   **Database-Driven Session Management:** We completely migrated session management (cookies for Playwright, API keys for YouTube) from the local filesystem into a highly secure `platform_accounts` PostgreSQL table.
*   **LRU Round-Robin Scheduler:** We modified the core `scheduler.ts` cron job. Instead of blindly using a hardcoded key, the scheduler now queries the database for the Least Recently Used (`ORDER BY last_used_at ASC`) active account. This allows us to load multiple accounts (Instagram, LinkedIn, YouTube) and automatically cycle through them evenly, significantly reducing the risk of rate limits.
*   **Claim Check Pattern & Automated Data Cleanup:** To prevent Redis from crashing due to memory bloat, large JSON/HTML payloads are never passed directly through the queue. They are saved to `raw_payloads` and only a UUID is passed. A midnight cron task purges payloads older than 24 hours (`RAW_PAYLOAD_TTL_HOURS`), ensuring the database disk footprint remains stable permanently.

---

## Phase 6: Production Cloud Deployment & Architecture Resilience (Current)
### The Vision
Transition the system from local Docker development to a fully autonomous, live production environment running 24/7 on a remote cloud server.

### The Challenges & Engineered Solutions
*   **The Headless Auth Barrier:** Cloud datacenters (like Azure) are instantly flagged by Instagram/LinkedIn, triggering CAPTCHAs, 2FA prompts, and immediate blocks for headless browsers.
    *   *Solution (Local-to-Cloud Auth Bridge):* Accounts are logged in securely on a local PC browser using Playwright's UI. The authenticated session state is serialized to JSON and securely transmitted via `scp` to the Azure server. A custom `migrate-sessions.ts` script dynamically ingests these states directly into the PostgreSQL account pool, allowing the cloud scraper to bypass login entirely.
*   **Chromium Memory Leaks & VM Freezing (OOM):** The 4GB Azure Virtual Machine repeatedly crashed and froze. Investigation revealed that when platforms served heavy anti-bot payloads or ran for prolonged periods, Chromium accumulated slow V8 memory leaks (~15MB per cycle) over days, leading to Linux Out-Of-Memory deadlocks.
    *   *First-Response Solution (Timeout Screenshot Radar):* Wrapped the navigation logic in a strict try-catch block. If a node times out, the system automatically captures a full-page debug screenshot (`postPage.screenshot()`), saves it to a persistent mapped volume, instantly pings the developer via Discord, gracefully destroys the browser context, and safely rotates to the next account.
    *   *Root-Cause Solution (Dynamic Browser Recycling Pool):* Re-engineered the `BrowserPool` logic to implement a strict **job-based recycling counter**. Every Chromium browser instance is now automatically terminated and replaced with a fresh process after exactly **8 jobs** (~2 hours of active runtime), fully flushing the V8 heap memory and preventing OOM deadlocks entirely while maintaining concurrency.
*   **Stubborn Docker Volume Permissions:** Updating cloud session states became impossible because Docker aggressively locked the Linux `session-store` folder with `root` privileges, rejecting SSH/SCP transfers.
    *   *Solution:* Standardized a safe teardown DevOps workflow. By running `docker compose down`, the kernel releases strict volume locks, allowing the local PC to push new state files before bringing the container stack back up.

### Deployment Specs
*   **Cloud Platform:** Microsoft Azure (Central India Region)
*   **Infrastructure:** Ubuntu 24.04 LTS, Standard_B2als_v2 (2 vCPUs, 4GB RAM)
*   **Monitoring:** Discord Webhooks (Real-time telemetry and alerting)
*   **Live Access:** The system connects via SSH tunneling for secure database management via pgAdmin/DBeaver.

---

## Phase 7: Full-Stack Intelligence — SvelteKit Frontend Dashboard
### The Vision
Raw tables and logs are fine for machine monitoring, but a truly scalable business engine requires immediate, executive-level visualization. We needed a fast, responsive, and stunning frontend to surface the extracted intelligence.

### Implementation Details
*   **Modern SvelteKit & Svelte 5 Runes:** Scaffolded a blazing-fast SvelteKit application utilizing the latest **Svelte 5 reactive runes (`$state`, `$derived`, `$props`)** for hyper-efficient UI updates and minimal boilerplate.
*   **Node.js Proxy / CORS Bypass Bridge:** The Azure Express backend did not expose CORS endpoints for public web browser clients. To safely fetch live data without opening security holes, we built a Node.js server-side proxy directly inside SvelteKit (`+page.server.ts`). All live metrics, analytics, and hashtag tracking lists are securely resolved on the Svelte backend before delivering rendered HTML to the client.
*   **Interactive Visualization Engine:** Integrated `Chart.js` to deliver responsive, rich dashboards:
    *   *Hashtag Velocity Charts:* Multi-dataset line charts showing the real-time "Breakout" scores of competing hashtags over time.
    *   *Engagement Breakdown:* Horizontal bar charts displaying precise distribution counts of high-performing metrics.
*   **Universal Type Safety:** Standardized strict TypeScript types across the entire frontend codebase, resolving legacy standard Font-Weight limits and ensuring perfect compatibility with downstream modules.

---

## Conclusion
What started as a superficial idea for extracting tags has matured into a resilient, fully realized, and highly available full-stack enterprise dashboard.

By aggressively decoupling the architecture (Scrape -> Parse -> Threshold -> Intelligence), enforcing strict database constraints, engineering browser-level memory recycling, containerizing the environment, and bridging it seamlessly into a beautiful SvelteKit visual dashboard, the Social Trend Intelligence system is now fully equipped to run autonomously and beautifully in production.

