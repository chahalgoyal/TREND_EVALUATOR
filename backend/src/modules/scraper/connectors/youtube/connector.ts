import { BrowserContext, Page } from 'playwright';
import { PlatformConnector, RawPostFragment } from '../interface';
import { youtubeConfig as cfg } from './config';
import { env } from '../../../../config/env';
import { logger } from '../../../../shared/logger';

/**
 * YouTubeConnector — API-based connector for YouTube Shorts.
 * 
 * Unlike Instagram connector that uses Playwright browser scraping,
 * this connector uses the YouTube Data API v3 (free tier: 10,000 units/day).
 * 
 * Quota costs:
 *   - search.list  = 100 units per call
 *   - videos.list  =   1 unit per call
 *   - channels.list =  1 unit per call
 * 
 * YouTube Shorts are identified via `videoDuration=short` filter.
 * No login/session/browser is needed — all data is public.
 */
export class YouTubeConnector implements PlatformConnector {
  readonly platform = 'youtube';
  readonly requiresBrowser = false;

  // ── Login (no-op for public API) ──────────────────────────────────────────
  async login(_context: BrowserContext): Promise<boolean> {
    logger.info('YouTube: No login required (API-based connector)');
    return true;
  }

  async isLoggedIn(_page: Page): Promise<boolean> {
    return true; // Always "logged in" — public API
  }

  // ── Scrape Feed (trending Shorts) ─────────────────────────────────────────
  async scrapeFeed(_context: BrowserContext, maxPosts?: number): Promise<RawPostFragment[]> {
    const max = maxPosts ?? cfg.scraping.defaultMaxResults;
    logger.info({ maxPosts: max }, 'YouTube: Fetching trending Shorts via mostPopular chart');

    try {
      const apiKey = (_context as any)?.apiKey;
      const trendingShorts = await this.getTrendingShorts(max, apiKey);

      if (trendingShorts.length === 0) {
        logger.warn('YouTube: No trending Shorts found');
        return [];
      }

      // Step 3: Build RawPostFragments
      const fragments = this.buildFragments(trendingShorts, 'feed');

      logger.info({ postsScraped: fragments.length }, 'YouTube: Feed scrape complete');
      return fragments;
    } catch (err) {
      logger.error({ err }, 'YouTube: Feed scrape error');
      return [];
    }
  }

  // ── Scrape by Keyword ─────────────────────────────────────────────────────
  async scrapeKeyword(_context: BrowserContext, keyword: string, maxPosts?: number): Promise<RawPostFragment[]> {
    const max = maxPosts ?? cfg.scraping.defaultMaxResults;
    logger.info({ keyword, maxPosts: max }, 'YouTube: Searching Shorts by keyword');

    try {
      const apiKey = (_context as any)?.apiKey;
      const searchResults = await this.searchShorts({
        q: keyword,
        maxResults: max,
        apiKey
      });

      if (searchResults.length === 0) {
        logger.warn({ keyword }, 'YouTube: No Shorts found for keyword');
        return [];
      }

      const videoIds = searchResults.map((r) => r.videoId);
      const enriched = await this.getVideoDetails(videoIds, apiKey);
      const fragments = this.buildFragments(enriched, 'keyword');

      logger.info({ keyword, postsScraped: fragments.length }, 'YouTube: Keyword scrape complete');
      return fragments;
    } catch (err) {
      logger.error({ err, keyword }, 'YouTube: Keyword scrape error');
      return [];
    }
  }

  // ── Scrape by Channel (profile) ───────────────────────────────────────────
  async scrapeProfile(_context: BrowserContext, channelId: string, maxPosts?: number): Promise<RawPostFragment[]> {
    const max = maxPosts ?? cfg.scraping.defaultMaxResults;
    logger.info({ channelId, maxPosts: max }, 'YouTube: Fetching Shorts from channel');

    try {
      const apiKey = (_context as any)?.apiKey;
      const searchResults = await this.searchShorts({
        channelId,
        maxResults: max,
        apiKey
      });

      if (searchResults.length === 0) {
        logger.warn({ channelId }, 'YouTube: No Shorts found for channel');
        return [];
      }

      const videoIds = searchResults.map((r) => r.videoId);
      const enriched = await this.getVideoDetails(videoIds, apiKey);
      const fragments = this.buildFragments(enriched, 'profile');

      logger.info({ channelId, postsScraped: fragments.length }, 'YouTube: Profile scrape complete');
      return fragments;
    } catch (err) {
      logger.error({ err, channelId }, 'YouTube: Profile scrape error');
      return [];
    }
  }

  // ── Private: YouTube Data API calls ───────────────────────────────────────

  /**
   * Helper to parse ISO 8601 duration (e.g., PT1M5S) into seconds.
   */
  private parseIsoDurationToSeconds(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Fetches actual trending videos using videos.list with chart=mostPopular.
   * Filters client-side to only return videos <= 60 seconds (Shorts).
   * Paginates automatically until maxResults Shorts are found or we run out of trending pages.
   * Cost: 1 quota unit per page.
   */
  private async getTrendingShorts(maxResults: number, apiKeyOverride?: string): Promise<any[]> {
    const apiKey = apiKeyOverride || env.youtube.apiKey;
    const shorts: any[] = [];
    let pageToken = '';

    while (shorts.length < maxResults) {
      const url = new URL(`${cfg.api.baseUrl}${cfg.api.endpoints.videos}`);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('part', 'snippet,statistics,contentDetails');
      url.searchParams.set('chart', 'mostPopular');
      url.searchParams.set('regionCode', cfg.shorts.regionCode);
      url.searchParams.set('maxResults', '50'); // Always fetch max to minimize pagination calls
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      logger.debug({ pageToken }, 'YouTube API: videos.list (mostPopular)');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let response: Response;
      try {
        response = await fetch(url.toString(), { signal: controller.signal });
      } catch (err: any) {
        logger.error({ err: err.message }, 'YouTube API: getTrendingShorts fetch failed');
        break;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error({ status: response.status, body: errorBody }, 'YouTube API: getTrendingShorts failed');
        break;
      }

      const data = await response.json() as any;
      const items = data.items || [];
      if (items.length === 0) break;

      // Filter for Shorts (duration <= 60 seconds)
      for (const item of items) {
        const durationStr = item.contentDetails?.duration || '';
        const durationSec = this.parseIsoDurationToSeconds(durationStr);
        
        if (durationSec > 0 && durationSec <= 60) {
          shorts.push(item);
          if (shorts.length >= maxResults) break;
        }
      }

      pageToken = data.nextPageToken || '';
      if (!pageToken) break; // Reached end of trending list
    }

    return shorts;
  }

  /**
   * Search for YouTube Shorts using the search.list endpoint.
   * Cost: 100 quota units per call.
   */
  private async searchShorts(params: {
    q?: string;
    channelId?: string;
    chart?: string;
    maxResults: number;
    apiKey?: string;
  }): Promise<Array<{ videoId: string; title: string; channelId: string; channelTitle: string }>> {
    const url = new URL(`${cfg.api.baseUrl}${cfg.api.endpoints.search}`);
    const apiKey = params.apiKey || env.youtube.apiKey;
    url.searchParams.set('key', apiKey);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', cfg.shorts.type);
    url.searchParams.set('videoDuration', cfg.shorts.videoDuration);
    url.searchParams.set('order', params.q ? 'relevance' : cfg.shorts.order);
    url.searchParams.set('maxResults', String(Math.min(params.maxResults, cfg.scraping.maxResultsPerPage)));
    url.searchParams.set('regionCode', cfg.shorts.regionCode);
    url.searchParams.set('relevanceLanguage', cfg.shorts.relevanceLanguage);

    if (params.q) url.searchParams.set('q', params.q);
    if (params.channelId) url.searchParams.set('channelId', params.channelId);

    logger.debug({ url: url.toString() }, 'YouTube API: search.list');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    let response: Response;
    try {
      response = await fetch(url.toString(), { signal: controller.signal });
    } catch (err: any) {
      logger.error({ err: err.message }, 'YouTube API: search.list fetch timed out or failed');
      throw new Error(`YouTube search API error: fetch failed (${err.message})`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, body: errorBody }, 'YouTube API: search.list failed');
      throw new Error(`YouTube search API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const items = data.items || [];

    return items
      .filter((item: any) => item.id?.videoId)
      .map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet?.title || '',
        channelId: item.snippet?.channelId || '',
        channelTitle: item.snippet?.channelTitle || '',
      }));
  }

  /**
   * Get full video details (statistics, content details) using videos.list endpoint.
   * Cost: 1 quota unit per call (regardless of how many video IDs).
   * Max 50 video IDs per call.
   */
  private async getVideoDetails(videoIds: string[], apiKeyOverride?: string): Promise<any[]> {
    if (videoIds.length === 0) return [];
    const apiKey = apiKeyOverride || env.youtube.apiKey;

    // Batch into chunks of 50 (API limit)
    const results: any[] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const url = new URL(`${cfg.api.baseUrl}${cfg.api.endpoints.videos}`);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('part', 'snippet,statistics,contentDetails');
      url.searchParams.set('id', batch.join(','));

      logger.debug({ videoCount: batch.length }, 'YouTube API: videos.list');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      let response: Response;
      try {
        response = await fetch(url.toString(), { signal: controller.signal });
      } catch (err: any) {
        logger.error({ err: err.message }, 'YouTube API: videos.list fetch timed out or failed');
        continue; // Skip this batch, don't fail entire scrape
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error({ status: response.status, body: errorBody }, 'YouTube API: videos.list failed');
        continue; // Skip this batch, don't fail entire scrape
      }

      const data = await response.json() as any;
      results.push(...(data.items || []));
    }

    return results;
  }

  /**
   * Build RawPostFragment[] from enriched video data.
   */
  private buildFragments(
    videos: any[],
    source: 'feed' | 'keyword' | 'profile',
  ): RawPostFragment[] {
    return videos.map((video) => ({
      platform: 'youtube',
      postId: video.id,
      postJson: {
        videoId: video.id,
        title: video.snippet?.title || '',
        description: video.snippet?.description || '',
        channelId: video.snippet?.channelId || '',
        channelTitle: video.snippet?.channelTitle || '',
        publishedAt: video.snippet?.publishedAt || '',
        tags: video.snippet?.tags || [],
        categoryId: video.snippet?.categoryId || '',
        thumbnails: video.snippet?.thumbnails || {},
        statistics: {
          viewCount: video.statistics?.viewCount || '0',
          likeCount: video.statistics?.likeCount || '0',
          commentCount: video.statistics?.commentCount || '0',
        },
        contentDetails: {
          duration: video.contentDetails?.duration || '',
          definition: video.contentDetails?.definition || '',
        },
      },
      source,
      scrapedAt: new Date().toISOString(),
    }));
  }
}
