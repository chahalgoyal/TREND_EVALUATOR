# Social Trend Intelligence - Admin Management Report

This report outlines how administrators can monitor, manage, and troubleshoot the Social Trend Intelligence data pipeline. The system runs autonomously but requires occasional oversight to ensure data integrity and platform connectivity.

## 1. System Health & Monitoring

The system exposes several REST API endpoints designed specifically for admin oversight. All endpoints require the `x-api-key` header to be set to the Admin API key (`sti_adm_...`).

### Checking Global Health
You can instantly verify if the PostgreSQL database, Redis queues, and API are functioning by checking the health endpoint:
```bash
GET http://localhost:3000/api/v1/health
```
**Expected Output:** `"status": "healthy"` with all services showing as `"connected"` or `"running"`.

### Monitoring Scraper Jobs
To see a history of what the scraper has been doing, any errors it encountered, and how many posts it extracted per run, query the audit log:
```bash
GET http://localhost:3000/api/v1/scraper/jobs
```
This is your primary tool for noticing if a platform has blocked the scraper or if selectors are broken. Look for `"status": "failed"` or runs where `"posts_scraped": 0`.

## 2. Managing Platform Sessions (Crucial)

Because Instagram and LinkedIn have strict anti-bot protections, the system relies on **Saved Sessions (Cookies)**. These cookies *will* eventually expire.

**When to intervene:**
If you see repeated `Login error` or `Session invalidated` messages in the scraper jobs API, the platform has expired your cookies.

**How to resolve:**
An admin must manually log in to refresh the cookies:
1. Open a terminal in the backend directory.
2. Run `npm run save-session:instagram` (or `linkedin`).
3. Follow the on-screen browser prompts to log in.
4. Press Enter in the terminal to save the new session state to the hard drive.
*The automated background scheduler will immediately pick up the new cookies on its next run.*

## 3. Data Integrity & Verification

You can query the extracted and normalized data directly through the API to ensure the parsers are functioning correctly.

* **View Extracted Posts:** `GET http://localhost:3000/api/v1/posts`
* **View Trending Hashtags:** `GET http://localhost:3000/api/v1/hashtags`

If you see posts appearing but their `likes` or `comments` are strictly `0`, it indicates that the platform changed its HTML structure or the JSON payload structure changed. A developer will need to update the `Parser Worker` to target the new structure.

## 4. Operational Maintenance

* **Queue Backlogs:** If jobs are failing and backing up in Redis, they can consume memory. An admin can clear the queue entirely by stopping the server and running:
  `npx tsx -e "const Redis = require('ioredis'); const r = new Redis(); r.flushall().then(() => r.quit());"`
* **Raw Payload Cleanup:** The system temporarily stores massive HTML/JSON strings in the `raw_payloads` table. The repository has a `cleanupExpired()` function to enforce a 72-hour TTL to prevent database bloat. This should be added to the scheduler in production.
