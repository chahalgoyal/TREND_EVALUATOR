import { BrowserContext, Page } from 'playwright';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { PlatformConnector, RawPostFragment } from '../interface';
import { instagramConfig as cfg } from './config';
import { env } from '../../../../config/env';
import { logger } from '../../../../shared/logger';
import { AdaptiveThrottler } from '../../throttler/adaptive.throttler';

export class InstagramConnector implements PlatformConnector {
  readonly platform = 'instagram';
  private throttler = new AdaptiveThrottler();

  // ── Attempt to load saved session state ────────────────────────────────────
  private loadSavedState(): any | null {
    const statePath = path.resolve('session-store/instagram_state.json');
    const cookiePath = path.resolve('session-store/instagram_cookies.json');

    // Prefer full state file (includes localStorage)
    if (existsSync(statePath)) {
      try {
        const raw = readFileSync(statePath, 'utf-8');
        const state = JSON.parse(raw);
        logger.info('Instagram: Loaded saved browser state');
        return { type: 'state', data: state };
      } catch { /* fall through */ }
    }

    // Fallback to cookies
    if (existsSync(cookiePath)) {
      try {
        const raw = readFileSync(cookiePath, 'utf-8');
        const data = JSON.parse(raw);
        // Check freshness — 24h max for saved sessions
        const savedAt = data.savedAt ? new Date(data.savedAt).getTime() : 0;
        if (Date.now() - savedAt < 24 * 60 * 60 * 1000) {
          logger.info({ cookieCount: data.cookies?.length }, 'Instagram: Loaded saved cookies');
          return { type: 'cookies', data: data.cookies };
        } else {
          logger.warn('Instagram: Saved cookies expired');
        }
      } catch { /* fall through */ }
    }

    return null;
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(context: BrowserContext): Promise<boolean> {
    // Strategy 1: Check if we're already logged in (from saved cookies loaded into context)
    const testPage = await context.newPage();
    try {
      await testPage.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await testPage.waitForTimeout(3000);

      // Check for logged-in indicators
      const isLoggedIn = await this.isLoggedIn(testPage);
      if (isLoggedIn) {
        logger.info('Instagram: Already logged in (saved session active)');
        await testPage.close();
        return true;
      }

      // Check the current URL — if redirected to login page, we need to login
      const currentUrl = testPage.url();
      logger.info({ url: currentUrl }, 'Instagram: Not logged in, attempting automated login');
      await testPage.close();
    } catch (err) {
      logger.warn({ err }, 'Instagram: Session check failed');
      await testPage.close();
    }

    // Strategy 2: Automated login
    const page = await context.newPage();
    try {
      await page.goto(cfg.urls.login, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Handle cookie consent dialog (EU/India)
      try {
        const consentButton = page.locator('button:has-text("Allow"), button:has-text("Accept"), button:has-text("allow essential")').first();
        if (await consentButton.isVisible({ timeout: 2000 })) {
          await consentButton.click();
          await page.waitForTimeout(1000);
          logger.info('Instagram: Dismissed cookie consent');
        }
      } catch { /* no consent dialog */ }

      // Wait for login form — try multiple selectors
      const usernameSelectors = [
        'input[name="username"]',
        'input[aria-label="Phone number, username, or email"]',
        'input[type="text"]',
      ];

      let usernameInput = null;
      for (const sel of usernameSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 5000 });
          usernameInput = sel;
          break;
        } catch { continue; }
      }

      if (!usernameInput) {
        logger.error('Instagram: Could not find username input');
        await page.close();
        return false;
      }

      // Fill credentials with human-like delays
      await page.click(usernameInput);
      await page.waitForTimeout(300);
      await page.fill(usernameInput, env.instagram.username);
      await page.waitForTimeout(500);

      // Password
      const passwordSelectors = ['input[name="password"]', 'input[type="password"]'];
      for (const sel of passwordSelectors) {
        try {
          await page.fill(sel, env.instagram.password);
          break;
        } catch { continue; }
      }

      await page.waitForTimeout(500);

      // Click login button
      const loginSelectors = [
        'button[type="submit"]',
        'button:has-text("Log in")',
        'button:has-text("Log In")',
      ];
      for (const sel of loginSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 2000 })) {
            await btn.click();
            break;
          }
        } catch { continue; }
      }

      await page.waitForTimeout(cfg.scraping.loginWait);

      // Handle "Save your login info?" dialog
      try {
        const notNow = page.locator('button:has-text("Not Now"), button:has-text("Not now"), div[role="button"]:has-text("Not Now")').first();
        if (await notNow.isVisible({ timeout: 3000 })) {
          await notNow.click();
          await page.waitForTimeout(1000);
        }
      } catch { /* no dialog */ }

      // Handle "Turn on notifications" dialog
      try {
        const notNow2 = page.locator('button:has-text("Not Now"), button:has-text("Not now")').first();
        if (await notNow2.isVisible({ timeout: 3000 })) {
          await notNow2.click();
          await page.waitForTimeout(1000);
        }
      } catch { /* no dialog */ }

      const loggedIn = await this.isLoggedIn(page);
      if (loggedIn) {
        logger.info('Instagram: Automated login successful');
      } else {
        logger.error('Instagram: Automated login failed — run save-session.ts to login manually');
      }

      await page.close();
      return loggedIn;
    } catch (err) {
      logger.error({ err }, 'Instagram: Login error');
      await page.close();
      return false;
    }
  }

  // ── Login check ────────────────────────────────────────────────────────────
  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      // Multiple indicators for logged-in state
      const indicators = [
        'svg[aria-label="Home"]',
        'a[href="/direct/inbox/"]',
        'span[aria-label="Profile"]',
        'a[href*="/direct/"]',
        'nav a[href="/"]',
      ];

      for (const sel of indicators) {
        try {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 })) {
            return true;
          }
        } catch { continue; }
      }

      // Also check URL — if we're on the feed, we're logged in
      const url = page.url();
      if (url === 'https://www.instagram.com/' || url.startsWith('https://www.instagram.com/?')) {
        // Check that we're not on the login page
        const loginForm = page.locator('input[name="username"]').first();
        try {
          if (await loginForm.isVisible({ timeout: 1000 })) {
            return false; // We're on login page
          }
        } catch { /* no login form visible = likely logged in */ }
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
    const seenPostIds = new Set<string>();

    // Intercept API responses for enrichment
    const apiResponses: any[] = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (
        url.includes('/api/v1/feed/') ||
        url.includes('/api/v1/media/') ||
        url.includes('graphql') ||
        url.includes('/api/v1/discover/')
      ) {
        try {
          const json = await response.json();
          apiResponses.push(json);
        } catch { /* non-json response */ }
      }
    });

    try {
      logger.info({ maxPosts: max }, 'Instagram: Scraping feed');
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(cfg.scraping.postLoadWait);

      for (let scroll = 0; scroll < cfg.scraping.maxScrolls && fragments.length < max; scroll++) {
        // Expand truncated captions — click all "more" buttons so full text (with hashtags) is in the DOM
        try {
          const moreButtons = page.locator('span[role="link"]:has-text("more"), button:has-text("more")');
          const count = await moreButtons.count();
          for (let i = 0; i < count; i++) {
            try { await moreButtons.nth(i).click({ timeout: 500 }); } catch { /* already expanded */ }
          }
          if (count > 0) await page.waitForTimeout(300);
        } catch { /* no more buttons found */ }

        // Find all post links
        const postLinks = await page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (links) =>
          links.map((a) => {
            const href = a.getAttribute('href') || '';
            const match = href.match(/\/(p|reel)\/([^/]+)/);
            return { href, postId: match ? match[2] : '' };
          }).filter((l) => l.postId)
        );

        for (const link of postLinks) {
          if (seenPostIds.has(link.postId) || fragments.length >= max) continue;
          seenPostIds.add(link.postId);

          // Try to extract the containing article
          let articleHtml = '';
          try {
            articleHtml = await page.$eval(
              `article:has(a[href*="${link.postId}"])`,
              (el) => el.outerHTML
            );
          } catch {
            // Fallback — try a broader selector
            try {
              articleHtml = await page.$eval(
                `div:has(> a[href*="${link.postId}"])`,
                (el) => el.outerHTML
              );
            } catch {
              articleHtml = `<a href="${link.href}" data-post-id="${link.postId}"></a>`;
            }
          }

          fragments.push({
            platform: 'instagram',
            postId: link.postId,
            postHtml: articleHtml,
            postJson: apiResponses.length > 0 ? { interceptedApis: [...apiResponses] } : undefined,
            source: 'feed',
            scrapedAt: new Date().toISOString(),
          });

          this.throttler.reportSuccess();
        }

        // Scroll down
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await this.throttler.wait();
        await page.waitForTimeout(cfg.scraping.scrollDelay);
      }

      logger.info({ postsScraped: fragments.length }, 'Instagram: Feed scrape complete');
      await page.close();
      return fragments;
    } catch (err) {
      logger.error({ err }, 'Instagram: Feed scrape error');
      await page.close();
      return fragments;
    }
  }

  // ── Scrape by Keyword/Hashtag ──────────────────────────────────────────────
  async scrapeKeyword(context: BrowserContext, keyword: string, maxPosts?: number): Promise<RawPostFragment[]> {
    const max = maxPosts ?? cfg.scraping.defaultMaxPosts;
    const page = await context.newPage();
    const fragments: RawPostFragment[] = [];
    const seenPostIds = new Set<string>();

    try {
      const cleanKeyword = keyword.replace(/^#/, '').toLowerCase();
      const url = `${cfg.urls.explore}${cleanKeyword}/`;
      logger.info({ keyword: cleanKeyword, maxPosts: max }, 'Instagram: Scraping keyword');

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(cfg.scraping.postLoadWait);

      for (let scroll = 0; scroll < cfg.scraping.maxScrolls && fragments.length < max; scroll++) {
        const postLinks = await page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (links) =>
          links.map((a) => {
            const href = a.getAttribute('href') || '';
            const match = href.match(/\/(p|reel)\/([^/]+)/);
            return { href, postId: match ? match[2] : '' };
          }).filter((l) => l.postId)
        );

        for (const link of postLinks) {
          if (seenPostIds.has(link.postId) || fragments.length >= max) continue;
          seenPostIds.add(link.postId);

          fragments.push({
            platform: 'instagram',
            postId: link.postId,
            postHtml: `<a href="${link.href}" data-post-id="${link.postId}"></a>`,
            source: 'keyword',
            scrapedAt: new Date().toISOString(),
          });
        }

        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await this.throttler.wait();
      }

      logger.info({ keyword: cleanKeyword, postsScraped: fragments.length }, 'Instagram: Keyword scrape complete');
      await page.close();
      return fragments;
    } catch (err) {
      logger.error({ err, keyword }, 'Instagram: Keyword scrape error');
      await page.close();
      return fragments;
    }
  }

  // ── Scrape Profile ─────────────────────────────────────────────────────────
  async scrapeProfile(context: BrowserContext, profileId: string, maxPosts?: number): Promise<RawPostFragment[]> {
    const max = maxPosts ?? cfg.scraping.defaultMaxPosts;
    const page = await context.newPage();
    const fragments: RawPostFragment[] = [];
    const seenPostIds = new Set<string>();

    try {
      const url = `${cfg.urls.base}/${profileId}/`;
      logger.info({ profileId, maxPosts: max }, 'Instagram: Scraping profile');

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(cfg.scraping.postLoadWait);

      for (let scroll = 0; scroll < cfg.scraping.maxScrolls && fragments.length < max; scroll++) {
        const postLinks = await page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (links) =>
          links.map((a) => {
            const href = a.getAttribute('href') || '';
            const match = href.match(/\/(p|reel)\/([^/]+)/);
            return { href, postId: match ? match[2] : '' };
          }).filter((l) => l.postId)
        );

        for (const link of postLinks) {
          if (seenPostIds.has(link.postId) || fragments.length >= max) continue;
          seenPostIds.add(link.postId);

          fragments.push({
            platform: 'instagram',
            postId: link.postId,
            postHtml: `<a href="${link.href}" data-post-id="${link.postId}"></a>`,
            source: 'profile',
            scrapedAt: new Date().toISOString(),
          });
        }

        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await this.throttler.wait();
      }

      logger.info({ profileId, postsScraped: fragments.length }, 'Instagram: Profile scrape complete');
      await page.close();
      return fragments;
    } catch (err) {
      logger.error({ err, profileId }, 'Instagram: Profile scrape error');
      await page.close();
      return fragments;
    }
  }
}
