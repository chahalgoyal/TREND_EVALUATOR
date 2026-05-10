/**
 * Integration Tests: All REST API Endpoints
 * Tests every route registered in the backend against the live running Docker instance.
 * Requires the server to be running at http://localhost:3000
 */
import { describe, it, expect, beforeAll } from 'vitest';

const BASE = 'http://localhost:3000';
const ADMIN_KEY = 'sti_adm_9e2f4a7b1c8d3e6f2a5b9c4d7e1f3a6b';
const STD_KEY = 'sti_std_7f3a9b2c4d1e8f5a6b3c9d2e7f4a1b8c';

async function get(path: string, key?: string): Promise<Response> {
  const headers: Record<string, string> = key ? { 'x-api-key': key } : {};
  return fetch(`${BASE}${path}`, { headers });
}

async function post(path: string, body: object, key: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function patch(path: string, body: object, key: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function del(path: string, key: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { 'x-api-key': key },
  });
}

// ── Health Checks ─────────────────────────────────────────────────────────────

describe('Health Endpoints', () => {
  it('GET /health returns 200 with ok status', async () => {
    const res = await get('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /api/v1/health returns deep health with services', async () => {
    const res = await get('/api/v1/health', STD_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.services.database).toBe('connected');
    expect(body.data.services.redis).toBe('connected');
  });
});

// ── Authentication ────────────────────────────────────────────────────────────

describe('Authentication Middleware', () => {
  it('returns 401 when no API key is provided', async () => {
    const res = await get('/api/v1/posts');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTH_ERROR');
  });

  it('returns 401 for an invalid API key', async () => {
    const res = await get('/api/v1/posts', 'totally-wrong-key');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTH_ERROR');
  });

  it('returns 403 when standard key is used on admin route', async () => {
    const res = await get('/api/v1/admin/stats', STD_KEY);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for completely unknown routes', async () => {
    const res = await get('/api/v1/does-not-exist', STD_KEY);
    expect(res.status).toBe(404);
  });
});

// ── Platforms ─────────────────────────────────────────────────────────────────

describe('Platforms Endpoints', () => {
  it('GET /api/v1/platforms returns all 3 platforms', async () => {
    const res = await get('/api/v1/platforms', STD_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3);
    const slugs = body.data.map((p: any) => p.slug);
    expect(slugs).toContain('instagram');
    expect(slugs).toContain('linkedin');
    expect(slugs).toContain('youtube');
  });

  it('GET /api/v1/platforms/:slug returns platform by slug', async () => {
    const res = await get('/api/v1/platforms/instagram', STD_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe('instagram');
    expect(body.data.id).toBeDefined();
  });

  it('GET /api/v1/platforms/:slug returns 404 for unknown platform', async () => {
    const res = await get('/api/v1/platforms/tiktok', STD_KEY);
    expect(res.status).toBe(404);
  });
});

// ── Posts ─────────────────────────────────────────────────────────────────────

describe('Posts Endpoints', () => {
  let firstPostId: string;

  it('GET /api/v1/posts returns paginated posts', async () => {
    const res = await get('/api/v1/posts', STD_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    firstPostId = body.data[0].id;
    // Each post should have required fields
    const post = body.data[0];
    expect(post.id).toBeDefined();
    expect(post.platform_id).toBeDefined();
    expect(post.likes).toBeTypeOf('number');
    expect(post.comments).toBeTypeOf('number');
  });

  it('GET /api/v1/posts returns platform_slug field', async () => {
    const res = await get('/api/v1/posts', STD_KEY);
    const body = await res.json();
    const post = body.data[0];
    expect(['instagram', 'linkedin', 'youtube']).toContain(post.platform_slug);
  });

  it('GET /api/v1/posts returns hashtags array on each post', async () => {
    const res = await get('/api/v1/posts', STD_KEY);
    const body = await res.json();
    const postWithTags = body.data.find((p: any) => p.hashtags && p.hashtags.length > 0);
    expect(postWithTags).toBeDefined();
    expect(Array.isArray(postWithTags.hashtags)).toBe(true);
  });

  it('GET /api/v1/posts?limit=5 respects limit', async () => {
    const res = await get('/api/v1/posts?limit=5', STD_KEY);
    const body = await res.json();
    expect(body.data.length).toBeLessThanOrEqual(5);
  });

  it('GET /api/v1/posts/:id returns a single post', async () => {
    const res = await get(`/api/v1/posts/${firstPostId}`, STD_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(firstPostId);
  });

  it('GET /api/v1/posts/:id returns 404 for nonexistent post', async () => {
    const res = await get('/api/v1/posts/999999999', STD_KEY);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

// ── Hashtags ──────────────────────────────────────────────────────────────────

describe('Hashtags Endpoints', () => {
  it('GET /api/v1/hashtags returns top hashtags', async () => {
    const res = await get('/api/v1/hashtags', STD_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    const tag = body.data[0];
    expect(tag.tag).toBeDefined();
    expect(tag.post_count).toBeTypeOf('number');
  });

  it('GET /api/v1/hashtags sorted by post_count descending', async () => {
    const res = await get('/api/v1/hashtags', STD_KEY);
    const body = await res.json();
    const counts = body.data.map((t: any) => t.post_count);
    for (let i = 0; i < counts.length - 1; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1]);
    }
  });

  it('GET /api/v1/hashtags/:tag returns hashtag details', async () => {
    const res = await get('/api/v1/hashtags/shorts', STD_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.tag).toBe('shorts');
    expect(body.data.post_count).toBeGreaterThan(0);
    expect(body.data.platform_breakdown).toBeDefined();
  });

  it('GET /api/v1/hashtags/:tag returns 404 for unknown tag', async () => {
    const res = await get('/api/v1/hashtags/thistagdoesnotexist12345', STD_KEY);
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/hashtags/:tag/posts returns posts for tag', async () => {
    const res = await get('/api/v1/hashtags/shorts/posts', STD_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });
});

// ── Trends ────────────────────────────────────────────────────────────────────

describe('Trends Endpoints', () => {
  it('GET /api/v1/trends/posts returns top posts by score', async () => {
    const res = await get('/api/v1/trends/posts');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    const post = body.data[0];
    expect(post.total_trend_score).toBeDefined();
    expect(post.engagement_rate).toBeDefined();
  });

  it('GET /api/v1/trends/posts sorted by total_trend_score descending', async () => {
    const res = await get('/api/v1/trends/posts');
    const body = await res.json();
    const scores = body.data.map((p: any) => parseFloat(p.total_trend_score));
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
    }
  });

  it('GET /api/v1/trends/posts?platform=youtube filters correctly', async () => {
    const res = await get('/api/v1/trends/posts?platform=youtube');
    const body = await res.json();
    for (const post of body.data) {
      expect(post.platform).toBe('youtube');
    }
  });

  it('GET /api/v1/trends/posts?platform=instagram filters correctly', async () => {
    const res = await get('/api/v1/trends/posts?platform=instagram');
    const body = await res.json();
    for (const post of body.data) {
      expect(post.platform).toBe('instagram');
    }
  });

  it('GET /api/v1/trends/hashtags/breakouts returns breakout list', async () => {
    const res = await get('/api/v1/trends/hashtags/breakouts');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    // All returned items should have mentions >= 5 (noise filter)
    for (const tag of body.data) {
      expect(tag.mentions_count).toBeGreaterThanOrEqual(5);
    }
  });

  it('GET /api/v1/trends/hashtags/breakouts breakouts have velocity and is_breakout field', async () => {
    const res = await get('/api/v1/trends/hashtags/breakouts');
    const body = await res.json();
    const item = body.data[0];
    expect(item.velocity_percentage).toBeDefined();
    expect(item.is_breakout).toBeTypeOf('boolean');
  });

  it('GET /api/v1/trends/hashtags/top returns aggregated deduplicated tags', async () => {
    const res = await get('/api/v1/trends/hashtags/top');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    const item = body.data[0];
    expect(item.total_mentions).toBeTypeOf('number');
    expect(item.active_days).toBeTypeOf('number');
  });

  it('GET /api/v1/trends/hashtags/top each tag appears only once', async () => {
    const res = await get('/api/v1/trends/hashtags/top');
    const body = await res.json();
    const tags = body.data.map((t: any) => t.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('GET /api/v1/trends/hashtags/:tag/history returns time-series data', async () => {
    const res = await get('/api/v1/trends/hashtags/shorts/history');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length > 0) {
      const day = body.data[0];
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day.mentions).toBeTypeOf('number');
      expect(day.velocity).toBeDefined();
    }
  });

  it('GET /api/v1/trends/hashtags/:tag/history returns 404 for unknown tag', async () => {
    const res = await get('/api/v1/trends/hashtags/nonexistenttag12345/history');
    expect(res.status).toBe(404);
  });
});

// ── Scraper Endpoints ─────────────────────────────────────────────────────────

describe('Scraper Endpoints', () => {
  let createdJobId: string;

  it('POST /api/v1/scraper/run queues a scrape job', async () => {
    const res = await post('/api/v1/scraper/run', { platform: 'youtube', targetType: 'feed' }, ADMIN_KEY);
    expect([200, 202]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.jobId).toBeDefined();
    expect(body.data.scrapeJobId).toBeDefined();
    expect(body.data.status).toBe('queued');
    createdJobId = body.data.jobId;
  });

  it('POST /api/v1/scraper/run requires admin key', async () => {
    const res = await post('/api/v1/scraper/run', { platform: 'youtube', targetType: 'feed' }, STD_KEY);
    expect(res.status).toBe(403);
  });

  it('GET /api/v1/scraper/jobs returns recent jobs', async () => {
    const res = await get('/api/v1/scraper/jobs', STD_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toBeDefined();
  });

  it('GET /api/v1/scraper/jobs each job has required fields', async () => {
    const res = await get('/api/v1/scraper/jobs', STD_KEY);
    const body = await res.json();
    const job = body.data[0];
    expect(job.id).toBeDefined();
    expect(job.status).toBeDefined();
    expect(job.platform_slug).toBeDefined();
    expect(['queued', 'running', 'completed', 'failed']).toContain(job.status);
  });
});

// ── Admin Endpoints ───────────────────────────────────────────────────────────

describe('Admin Endpoints', () => {
  let createdRuleId: number;

  it('GET /api/v1/admin/stats returns system stats', async () => {
    const res = await get('/api/v1/admin/stats', ADMIN_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.postsScrapedToday).toBeTypeOf('number');
    expect(body.data.viralPostsToday).toBeTypeOf('number');
  });

  it('GET /api/v1/admin/accounts returns platform accounts', async () => {
    const res = await get('/api/v1/admin/accounts', ADMIN_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    const account = body.data[0];
    expect(account.platform).toBeDefined();
    expect(account.username).toBeDefined();
    expect(account.is_active).toBeTypeOf('boolean');
  });

  it('GET /api/v1/admin/threshold-rules returns all rules', async () => {
    const res = await get('/api/v1/admin/threshold-rules', ADMIN_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(6);
    const rule = body.data[0];
    expect(rule.metric_name).toBeDefined();
    expect(rule.threshold_value).toBeDefined();
    expect(rule.operator).toBeDefined();
  });

  it('POST /api/v1/admin/threshold-rules creates a new rule', async () => {
    const res = await post(
      '/api/v1/admin/threshold-rules',
      { platform_id: 1, metric_name: 'shares', operator: 'gte', threshold_value: 99999 },
      ADMIN_KEY
    );
    // Accept 200 or 201 depending on controller implementation
    expect([200, 201]).toContain(res.status);
    const body = await res.json();
    expect(body.data.id).toBeDefined();
    createdRuleId = body.data.id;
  });

  it('PATCH /api/v1/admin/threshold-rules/:id updates a rule', async () => {
    const res = await patch(
      `/api/v1/admin/threshold-rules/${createdRuleId}`,
      { threshold_value: 88888 },
      ADMIN_KEY
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.threshold_value).toBe('88888');
  });

  it('DELETE /api/v1/admin/threshold-rules/:id deletes a rule', async () => {
    const res = await del(`/api/v1/admin/threshold-rules/${createdRuleId}`, ADMIN_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(createdRuleId);
  });
});
