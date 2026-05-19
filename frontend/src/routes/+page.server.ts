import { serverFetch } from '$lib/api/server';
import type { HealthData, TrendingPost, TopHashtag, BreakoutHashtag } from '$lib/api/client';

export async function load() {
  const [health, posts, hashtags, breakouts] = await Promise.allSettled([
    serverFetch<HealthData>('/health'),
    serverFetch<TrendingPost[]>('/trends/posts?limit=20'),
    serverFetch<TopHashtag[]>('/trends/hashtags/top?limit=10&days=7'),
    serverFetch<BreakoutHashtag[]>('/trends/hashtags/breakouts'),
  ]);

  return {
    health: health.status === 'fulfilled' ? health.value : null,
    trendingPosts: posts.status === 'fulfilled' ? posts.value : [],
    topHashtags: hashtags.status === 'fulfilled' ? hashtags.value : [],
    breakouts: breakouts.status === 'fulfilled' ? breakouts.value : [],
  };
}
