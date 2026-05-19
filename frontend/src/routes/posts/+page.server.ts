import { serverFetch } from '$lib/api/server';
import type { TrendingPost } from '$lib/api/client';

export async function load() {
  const postsRes = await serverFetch<TrendingPost[]>('/trends/posts?limit=50').catch(() => []);

  return {
    posts: postsRes,
  };
}
