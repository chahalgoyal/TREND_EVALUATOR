import { serverFetch } from '$lib/api/server';
import type { TopHashtag, BreakoutHashtag } from '$lib/api/client';

export async function load() {
  const [hashtagsRes, breakoutsRes] = await Promise.allSettled([
    serverFetch<TopHashtag[]>('/trends/hashtags/top?limit=100&days=7'),
    serverFetch<BreakoutHashtag[]>('/trends/hashtags/breakouts'),
  ]);

  return {
    topHashtags: hashtagsRes.status === 'fulfilled' ? hashtagsRes.value : [],
    breakouts: breakoutsRes.status === 'fulfilled' ? breakoutsRes.value : [],
  };
}
