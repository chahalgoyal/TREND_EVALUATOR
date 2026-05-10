# Social Trend Intelligence (v2.0)

A professional, high-concurrency intelligence pipeline for tracking social media trends across Instagram and YouTube. Hardened for production-grade scale and stealth.

## 🚀 Core Features (v2)
- **Multi-Account Rotation**: Round-robin account management for Instagram to bypass rate limits.
- **Stealth Scrapes**: Randomized jitter (±5m) and headless browser pool with session-syncing.
- **Intelligence Layer**: Time-decay "Hotness" scoring and automated breakout detection.
- **YouTube Scaling**: Multi-API key rotation and normalized data processing.
- **Infrastructure**: Dockerized PostgreSQL (15) and Redis (7) with automated 7-day data retention.

## 🛠 Tech Stack
- **Backend**: Node.js, TypeScript, Express
- **Queue**: BullMQ + Redis (for high-concurrency workers)
- **Database**: PostgreSQL (Prisma-ready schema)
- **Scraper**: Playwright (Headless Chromium)

## 📦 Getting Started

### 1. Environment Setup
Create a `.env` file based on the provided template:
```bash
DB_HOST=localhost
DB_PORT=5433
# ... see template for full list
```

### 2. Launch with Docker
```bash
docker-compose up -d --build
```
This spins up the API, Workers, DB, and Redis automatically.

### 3. Add Accounts / API Keys
Use the universal session manager to add Instagram accounts or YouTube keys:
```bash
# Instagram (Manual Login)
npx tsx src/modules/scraper/save-session.ts instagram <username>

# YouTube (API Key)
npx tsx src/modules/scraper/save-session.ts youtube <key_name> <api_key>
```

## 🧠 System Architecture
1. **Scheduler**: Calculates least-recently-used accounts and enqueues jobs with jitter.
2. **Scraper**: Collects raw payloads (API interception) and stores them for 72 hours.
3. **Parser**: Normalizes raw data into a universal `NormalizedPostDTO`.
4. **Threshold**: Filters posts based on engagement rules (e.g., >50k likes).
5. **Intelligence**: Calculates trend scores and historical hashtag velocity.

## 🛡️ Hardening & Safety
- **Deadlock Prevention**: Deterministic hashtag sorting for concurrent DB writes.
- **Auto-Pruning**: Midnight maintenance task clears raw data older than 3 days and posts older than 7 days.
- **Headless Stealth**: Uses modern API interception instead of suspicious DOM scrolling.

---
*Maintained by the Social Intelligence Team*
