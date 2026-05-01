import { BrowserContext, Page } from 'playwright';

/**
 * PlatformConnector interface — every social platform must implement this.
 * SRS §2.3: Abstracts login, feed scrolling, keyword search, API interception,
 * and output normalization behind a common contract.
 */
export interface PlatformConnector {
  /** Platform slug — 'instagram' | 'linkedin' */
  readonly platform: string;

  /**
   * Login to the platform. Returns true if login succeeded.
   * Must handle already-logged-in sessions gracefully.
   */
  login(context: BrowserContext): Promise<boolean>;

  /**
   * Detect if the current page shows the user is logged in.
   */
  isLoggedIn(page: Page): Promise<boolean>;

  /**
   * Scrape posts from the feed.
   * Returns an array of raw post fragments (one per post).
   */
  scrapeFeed(context: BrowserContext, maxPosts?: number): Promise<RawPostFragment[]>;

  /**
   * Scrape posts by keyword/hashtag search.
   */
  scrapeKeyword(context: BrowserContext, keyword: string, maxPosts?: number): Promise<RawPostFragment[]>;

  /**
   * Scrape posts from a specific profile.
   */
  scrapeProfile(context: BrowserContext, profileId: string, maxPosts?: number): Promise<RawPostFragment[]>;
}

/**
 * Raw post fragment — the output of the scraper for a single post.
 * This is what gets stored in raw_payloads and sent to parseQueue.
 */
export interface RawPostFragment {
  platform: string;
  postId: string;
  postHtml?: string;        // raw HTML fragment of the post
  postJson?: object;        // intercepted API/GraphQL response data
  source: 'feed' | 'keyword' | 'profile';
  scrapedAt: string;        // ISO 8601
}
