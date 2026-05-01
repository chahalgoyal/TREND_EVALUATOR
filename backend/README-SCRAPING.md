# Scraping Guide & Manual Triggering

This document explains how the scraping mechanism works in the Social Trend Intelligence system, how to maintain the browser sessions, and how to trigger scrapes manually or programmatically.

## How the Scraper Works

The system uses a **Playwright Browser Pool** running Chromium. Since Instagram and LinkedIn have aggressive anti-bot protections (CAPTCHAs, 2FA, varying DOM structures, cookie consent dialogs), we use a two-step strategy:

1. **Manual Session Saving:** A script opens a visible browser window where a human logs in and resolves any challenges. The browser state and cookies are saved locally to `session-store/`.
2. **Automated Scraping:** The BullMQ workers (`scrapeWorker`) load this saved session state. This allows the headless/automated browsers to bypass login screens and go directly to the feeds.

---

## Step 1: Saving a Session (Required)

Before the automated pipeline can scrape, you **must** authenticate the platforms. Saved sessions usually last for 24-48 hours depending on the platform's security policies.

### Instagram
Run the following command:
```bash
npm run save-session:instagram
```
1. A visible Chrome window will open.
2. Log in with your Instagram credentials.
3. Handle any 2FA or cookie consent dialogs.
4. Click "Not Now" if asked to save login info or turn on notifications.
5. Wait until the Instagram feed is fully loaded.
6. Return to the terminal and **press Enter**.
7. The session is saved to `session-store/instagram_state.json`.

### LinkedIn
Run the following command:
```bash
npm run save-session:linkedin
```
1. A visible Chrome window will open.
2. Log in with your LinkedIn credentials.
3. Solve any CAPTCHAs.
4. Wait until the LinkedIn feed is loaded.
5. Return to the terminal and **press Enter**.
6. The session is saved to `session-store/linkedin_state.json`.

---

## Step 2: Triggering Scrapes

Once sessions are saved, the system can scrape automatically. 

### Automated (Scheduler)
The system has a built-in scheduler (using `node-cron`) that automatically queues scrape jobs based on the intervals defined in the `platforms` table in the database. As long as the server (`npm run dev` or `npm start`) is running, it will scrape automatically.

### Manual API Trigger
You can force an immediate scrape for a specific platform using the REST API. This is useful for testing or on-demand analytics.

**Endpoint:** `POST /api/v1/scraper/run`

**Headers Required:**
- `Content-Type: application/json`
- `x-api-key: sti_adm_9e2f4a7b1c8d3e6f2a5b9c4d7e1f3a6b` (Admin API key required)

**Body:**
```json
{
  "platform": "instagram",  // or "linkedin"
  "targetType": "feed",     // or "keyword", "profile"
  "targetValue": ""         // optional, used for keyword/profile targeting
}
```

**Example using cURL:**
```bash
curl -X POST http://localhost:3000/api/v1/scraper/run \
  -H "x-api-key: sti_adm_9e2f4a7b1c8d3e6f2a5b9c4d7e1f3a6b" \
  -H "Content-Type: application/json" \
  -d '{"platform":"instagram","targetType":"feed"}'
```

**Example using PowerShell:**
```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/v1/scraper/run" -Headers @{"x-api-key"="sti_adm_9e2f4a7b1c8d3e6f2a5b9c4d7e1f3a6b"; "Content-Type"="application/json"} -Body '{"platform":"instagram","targetType":"feed"}'
```

---

## Checking Scrape Status

Scraping is asynchronous. The API will return a `jobId`. You can monitor the progress of all scrapes via:

**Endpoint:** `GET /api/v1/scraper/jobs`

**Example using cURL:**
```bash
curl http://localhost:3000/api/v1/scraper/jobs \
  -H "x-api-key: sti_adm_9e2f4a7b1c8d3e6f2a5b9c4d7e1f3a6b"
```

---

## Troubleshooting Guide for AI / Maintainers

If scraping suddenly stops yielding data or fails with `TimeoutError` or `Login failed`:

1. **Session Expiry:** The cookies have expired. Run the `save-session` commands again to refresh them.
2. **Selector Changes:** Social media platforms frequently change their DOM (HTML classes, IDs). 
   - **Fix:** Inspect the actual HTML returned by the platform. Update the parsing logic in `src/modules/parser/platforms/instagram/selectors.ts` or `src/modules/scraper/connectors/instagram/connector.ts`.
3. **Anti-Bot Blocks:** If the headless browser is detected, Playwright will get blocked.
   - **Fix:** Using `storageState` from a manual login usually mitigates this. If it persists, stealth plugins (like `playwright-extra` with `puppeteer-extra-plugin-stealth`) may need to be integrated into the `BrowserPool`.
4. **Queue Build-up:** If jobs are failing, they might build up in Redis.
   - **Fix:** Flush Redis using: `npx tsx -e "const Redis = require('ioredis'); const r = new Redis(); r.flushall().then(() => { console.log('Redis flushed'); r.quit(); });"`
