/**
 * YouTube Shorts — scraper configuration.
 * Uses YouTube Data API v3 (REST) instead of Playwright browser scraping.
 */
export const youtubeConfig = {
  api: {
    baseUrl: 'https://www.googleapis.com/youtube/v3',
    endpoints: {
      search: '/search',
      videos: '/videos',
      channels: '/channels',
    },
  },
  /** Default params for finding Shorts specifically */
  shorts: {
    videoDuration: 'short',     // YouTube API filter: only short-form videos
    type: 'video',
    order: 'viewCount',         // Sort by popularity for trend detection
    regionCode: 'IN',           // Default region — India
    relevanceLanguage: 'en',
  },
  scraping: {
    defaultMaxResults: 15,      // Results per search query
    maxResultsPerPage: 50,      // YouTube API max per page
    scrapeIntervalMin: 20,      // How often the scheduler triggers
  },
};
