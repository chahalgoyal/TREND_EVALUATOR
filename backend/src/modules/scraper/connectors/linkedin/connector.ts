import { BrowserContext, Page } from 'playwright';
import { PlatformConnector, RawPostFragment } from '../interface';
import { linkedinConfig as cfg } from './config';
import { env } from '../../../../config/env';
import { logger } from '../../../../shared/logger';
import { AdaptiveThrottler } from '../../throttler/adaptive.throttler';

export class LinkedInConnector implements PlatformConnector {
  readonly platform = 'linkedin';
  private throttler = new AdaptiveThrottler({ baseDelay: 3000 });

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    try {
      logger.info('LinkedIn: Attempting login...');
      await page.goto(cfg.urls.login, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      if (await this.isLoggedIn(page)) {
        logger.info('LinkedIn: Already logged in from saved session');
        await page.close();
        return true;
      }

      await page.waitForSelector(cfg.selectors.usernameInput, { timeout: 10000 });
      await page.fill(cfg.selectors.usernameInput, env.linkedin.username);
      await page.waitForTimeout(500);
      await page.fill(cfg.selectors.passwordInput, env.linkedin.password);
      await page.waitForTimeout(500);

      await page.click(cfg.selectors.loginButton);
      await page.waitForTimeout(cfg.scraping.loginWait);

      const loggedIn = await this.isLoggedIn(page);
      if (loggedIn) {
        logger.info('LinkedIn: Login successful');
      } else {
        logger.error('LinkedIn: Login failed');
      }

      await page.close();
      return loggedIn;
    } catch (err) {
      logger.error({ err }, 'LinkedIn: Login error');
      await page.close();
      return false;
    }
  }

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      const indicators = [
        cfg.selectors.loggedInIndicator,
        '#global-nav',
        'a[href*="/in/"]',
        'nav.global-nav'
      ];
      for (const sel of indicators) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 })) return true;
        } catch { continue; }
      }
      
      const url = page.url();
      if (url.includes('/feed') || url.includes('/mynetwork')) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ── Scrape Feed ────────────────────────────────────────────────────────────
  async scrapeFeed(context: BrowserContext, maxPosts?: number): Promise<RawPostFragment[]> {
    const max = maxPosts ?? cfg.scraping.defaultMaxPosts;
    const page = await context.newPage();
    const fragments: RawPostFragment[] = [];
    const seenUrns = new Set<string>();

    // Intercept GraphQL responses
    const apiResponses: any[] = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('voyager/api') || url.includes('graphql')) {
        try {
          const json = await response.json();
          apiResponses.push(json);
        } catch { /* non-json */ }
      }
    });

    try {
      logger.info({ maxPosts: max }, 'LinkedIn: Scraping feed');
      await page.goto(cfg.urls.feed, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(cfg.scraping.postLoadWait);

      for (let scroll = 0; scroll < cfg.scraping.maxScrolls && fragments.length < max; scroll++) {
        // Expand truncated captions — click all "see more" buttons
        try {
          const seeMoreButtons = page.locator('button.feed-shared-inline-show-more-text, button:has-text("see more"), button:has-text("…more")');
          const count = await seeMoreButtons.count();
          for (let i = 0; i < count; i++) {
            try { await seeMoreButtons.nth(i).click({ timeout: 500 }); } catch { /* already expanded */ }
          }
          if (count > 0) await page.waitForTimeout(300);
        } catch { /* no see-more buttons found */ }

        const posts = await page.$$eval(cfg.selectors.postContainer, (elements) =>
          elements.map((el) => {
            const urn = el.getAttribute('data-urn') || el.getAttribute('data-id') || '';
            return { html: el.outerHTML, urn };
          })
        );

        for (const post of posts) {
          const postId = post.urn || `li_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          if (seenUrns.has(postId) || fragments.length >= max) continue;
          seenUrns.add(postId);

          fragments.push({
            platform: 'linkedin',
            postId,
            postHtml: post.html,
            source: 'feed',
            scrapedAt: new Date().toISOString(),
          });

          this.throttler.reportSuccess();
        }

        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await this.throttler.wait();
      }

      // If DOM scraping failed (0 posts) but we have API responses, use the API responses directly
      if (fragments.length === 0 && apiResponses.length > 0) {
        logger.info('LinkedIn: Falling back to API interception data (0 DOM posts found)');
        
        // We will create one single chunk containing all intercepted API data. 
        // The parser can extract individual posts from this JSON.
        fragments.push({
          platform: 'linkedin',
          postId: `li_api_${Date.now()}`, // Generated ID since it's a batch payload
          postHtml: '<div class="api-fallback">No DOM posts found. Relying on API JSON.</div>',
          postJson: { interceptedApis: apiResponses },
          source: 'feed',
          scrapedAt: new Date().toISOString(),
        });
      } else if (apiResponses.length > 0) {
        // Attach API data to the first fragment if we got DOM posts
        for (const frag of fragments) {
          if (!frag.postJson) frag.postJson = { interceptedApis: apiResponses };
        }
      }

      logger.info({ postsScraped: fragments.length }, 'LinkedIn: Feed scrape complete');
      await page.close();
      return fragments;
    } catch (err) {
      logger.error({ err }, 'LinkedIn: Feed scrape error');
      await page.close();
      return fragments;
    }
  }

  // ── Scrape by Keyword ──────────────────────────────────────────────────────
  async scrapeKeyword(context: BrowserContext, keyword: string, maxPosts?: number): Promise<RawPostFragment[]> {
    const max = maxPosts ?? cfg.scraping.defaultMaxPosts;
    const page = await context.newPage();
    const fragments: RawPostFragment[] = [];
    const seenUrns = new Set<string>();

    try {
      const url = `${cfg.urls.search}?keywords=${encodeURIComponent(keyword)}&origin=GLOBAL_SEARCH_HEADER`;
      logger.info({ keyword, maxPosts: max }, 'LinkedIn: Scraping keyword');

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(cfg.scraping.postLoadWait);

      for (let scroll = 0; scroll < cfg.scraping.maxScrolls && fragments.length < max; scroll++) {
        const posts = await page.$$eval(cfg.selectors.postContainer, (elements) =>
          elements.map((el) => ({
            html: el.outerHTML,
            urn: el.getAttribute('data-urn') || '',
          }))
        );

        for (const post of posts) {
          const postId = post.urn || `li_kw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          if (seenUrns.has(postId) || fragments.length >= max) continue;
          seenUrns.add(postId);

          fragments.push({
            platform: 'linkedin',
            postId,
            postHtml: post.html,
            source: 'keyword',
            scrapedAt: new Date().toISOString(),
          });
        }

        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await this.throttler.wait();
      }

      logger.info({ keyword, postsScraped: fragments.length }, 'LinkedIn: Keyword scrape complete');
      await page.close();
      return fragments;
    } catch (err) {
      logger.error({ err, keyword }, 'LinkedIn: Keyword scrape error');
      await page.close();
      return fragments;
    }
  }

  // ── Scrape Profile ─────────────────────────────────────────────────────────
  async scrapeProfile(context: BrowserContext, profileId: string, maxPosts?: number): Promise<RawPostFragment[]> {
    const max = maxPosts ?? cfg.scraping.defaultMaxPosts;
    const page = await context.newPage();
    const fragments: RawPostFragment[] = [];

    try {
      const url = `${cfg.urls.base}/in/${profileId}/recent-activity/all/`;
      logger.info({ profileId, maxPosts: max }, 'LinkedIn: Scraping profile');

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(cfg.scraping.postLoadWait);

      const posts = await page.$$eval(cfg.selectors.postContainer, (elements) =>
        elements.map((el) => ({
          html: el.outerHTML,
          urn: el.getAttribute('data-urn') || '',
        }))
      );

      for (const post of posts) {
        if (fragments.length >= max) break;
        fragments.push({
          platform: 'linkedin',
          postId: post.urn || `li_prof_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          postHtml: post.html,
          source: 'profile',
          scrapedAt: new Date().toISOString(),
        });
      }

      logger.info({ profileId, postsScraped: fragments.length }, 'LinkedIn: Profile scrape complete');
      await page.close();
      return fragments;
    } catch (err) {
      logger.error({ err, profileId }, 'LinkedIn: Profile scrape error');
      await page.close();
      return fragments;
    }
  }
}
