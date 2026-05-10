# API Testing Guide

You can manually verify these endpoints using any API client (like **Postman**, **Thunder Client** in VS Code, or simply pasting the `GET` URLs into your browser). 

All endpoints run on: `http://localhost:3000`

---

## 1. The Global Hotlist
**Endpoint:** `GET /api/v1/trends/posts`
**Description:** Returns the top 20 trending posts across all platforms, sorted by their mathematical trend score.

**Expected Output:**
```json
{
  "success": true,
  "data": [
    {
      "post_id": "2205",
      "platform": "instagram",
      "author_username": null,
      "caption": "It's finally happening! We've begun work on the next game...",
      "likes": 715300,
      "comments": 14100,
      "views": "0",
      "engagement_rate": "100.0000",
      "total_trend_score": "83.8340",
      "posted_at": null
    },
    // ... up to 19 more posts
  ]
}
```

---

## 2. Breakout Radar (Trending Hashtags)
**Endpoint:** `GET /api/v1/trends/hashtags/breakouts`
**Description:** Returns the fastest growing hashtags for the current day, sorted by their growth velocity.

**Expected Output:**
```json
{
  "success": true,
  "data": [
    {
      "tag": "cyberpunk",
      "mentions_count": 42,
      "velocity_percentage": "150.50",
      "is_breakout": true
    }
  ]
}
```
*(Note: If no hashtags have spiked today, the `data` array might be empty `[]`. This is normal and means no active breakouts are happening right now).*

---

## 3. System Stats (Admin Only)
**Endpoint:** `GET /api/v1/admin/stats`
**Headers Required:**
- `x-api-key`: `your_secure_admin_key_here` *(Check your .env file for the exact key)*

**Expected Output:**
```json
{
  "success": true,
  "data": {
    "postsScrapedToday": 1450,
    "viralPostsToday": 12
  }
}
```

---

## 4. Account Management (Admin Only)
**Endpoint:** `GET /api/v1/admin/accounts`
**Headers Required:**
- `x-api-key`: `your_secure_admin_key_here`

**Expected Output:**
```json
{
  "success": true,
  "data": [] 
}
```
*(Note: This will return an empty array until we inject your accounts into the database).*

---

### Troubleshooting
- If you get `{"success":false,"error":{"code":"AUTH_ERROR","message":"Missing x-api-key header"}}`, it means you forgot to add the header in Postman for the Admin routes.
- If the browser refuses to connect, ensure your Docker container `sti-api` is running (`docker ps`).
