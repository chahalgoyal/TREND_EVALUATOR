// API client for the STI backend
// All fetch functions return typed data from the backend endpoints

const BASE_URL = import.meta.env.PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    limit: number;
    count: number;
    nextCursor?: string;
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ── Health ──────────────────────────────────────────────────
export interface HealthData {
  status: 'healthy' | 'degraded';
  services: {
    database: string;
    redis: string;
    queues: string;
  };
  timestamp: string;
}

export async function fetchHealth(): Promise<HealthData> {
  const res = await apiFetch<HealthData>('/health');
  return res.data;
}

// ── Trending Posts ──────────────────────────────────────────
export interface TrendingPost {
  post_id: string;
  platform: string;
  author_username: string | null;
  caption: string | null;
  likes: number;
  comments: number;
  views: number;
  engagement_rate: number;
  total_trend_score: number;
  posted_at: string | null;
}

export async function fetchTrendingPosts(platform?: string, limit = 20): Promise<TrendingPost[]> {
  const params = new URLSearchParams();
  if (platform) params.set('platform', platform);
  params.set('limit', String(limit));
  const res = await apiFetch<TrendingPost[]>(`/trends/posts?${params}`);
  return res.data;
}

// ── Top Hashtags ────────────────────────────────────────────
export interface TopHashtag {
  tag: string;
  total_mentions: number;
  peak_velocity: number;
  active_days: number;
}

export async function fetchTopHashtags(limit = 50, days = 7): Promise<TopHashtag[]> {
  const params = new URLSearchParams({ limit: String(limit), days: String(days) });
  const res = await apiFetch<TopHashtag[]>(`/trends/hashtags/top?${params}`);
  return res.data;
}

// ── Breakout Hashtags ───────────────────────────────────────
export interface BreakoutHashtag {
  tag: string;
  mentions_count: number;
  velocity_percentage: number;
  is_breakout: boolean;
}

export async function fetchBreakoutHashtags(): Promise<BreakoutHashtag[]> {
  const res = await apiFetch<BreakoutHashtag[]>('/trends/hashtags/breakouts');
  return res.data;
}

// ── Hashtag History ─────────────────────────────────────────
export interface HashtagHistoryPoint {
  date: string;
  mentions: number;
  velocity: number;
}

export async function fetchHashtagHistory(tag: string): Promise<HashtagHistoryPoint[]> {
  // Uses local SvelteKit API proxy to bypass CORS
  const res = await fetch(`/api/hashtags/${encodeURIComponent(tag)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}
