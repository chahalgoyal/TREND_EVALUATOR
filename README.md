# TREND EVALUATOR 📈

Trend Evaluator is an automated intelligence pipeline designed to scrape, parse, and evaluate social media posts from platforms like Instagram and LinkedIn. It identifies viral content based on configurable engagement thresholds.

## 🚀 Key Features & Functionalities

### 1. Robust Architecture
*   **Fully Dockerized Environment:** Runs seamlessly via `docker-compose` with isolated containers for the API, PostgreSQL database, and Redis.
*   **Automated Database Management:** Includes a `db-setup` container that handles all schema migrations and initial seed data automatically on startup.
*   **Job Queue System:** Uses **BullMQ + Redis** to handle high-concurrency tasks in the background without blocking the main API.

### 2. Multi-Platform Scraping
*   **Instagram & LinkedIn Support:** Actively scrapes feeds from both platforms.
*   **Headless Browser Automation:** Uses Microsoft Playwright to navigate, log in, and scrape feeds automatically.
*   **Session Management:** Saves login cookies (`session-store`) to prevent repeated logins and avoid platform rate limits/bans.
*   **API Interception:** Features an advanced fallback for LinkedIn that intercepts raw network API responses instead of relying solely on brittle HTML/DOM scraping.

### 3. Intelligence & Parsing Pipeline
*   **Worker Queues:** Tasks are split into three dedicated workers:
    *   **Scrape Worker:** Navigates the web and pulls raw payload data.
    *   **Parse Worker:** Extracts captions, counts likes/comments, and extracts all relevant hashtags.
    *   **Threshold Worker:** Evaluates engagement metrics against predefined platform rules.
*   **Dynamic Threshold Logic:** Determines if a post is "viral" by checking if it meets **either** the like threshold **OR** the comment threshold (e.g., 50k likes or 2,500 comments for Instagram).

### 4. Scheduler
*   **Automated Intervals:** Runs completely hands-free with a built-in scheduler.
    *   Instagram: Scrapes every 15 minutes.
    *   LinkedIn: Scrapes every 30 minutes.

---

## 🛠️ Tech Stack
*   **Backend:** Node.js, TypeScript, Express
*   **Database:** PostgreSQL (15-alpine)
*   **Cache/Queue:** Redis (7-alpine) / Memurai (Windows fallback)
*   **Automation:** Playwright
*   **Queue Management:** BullMQ

## 🚀 Quick Start (Docker)

1. Ensure Docker Desktop is running.
2. Navigate to the backend folder:
   ```bash
   cd backend
   ```
3. Start the application:
   ```bash
   docker compose up -d --build
   ```
4. Access the API Health Check:
   ```
   http://localhost:3000/health
   ```
