import { chromium, Browser, BrowserContext } from 'playwright';
import { env } from '../../../config/env';
import { logger } from '../../../shared/logger';

/**
 * How many scrape jobs a browser processes before it is recycled.
 * Each Instagram feed scrape opens ~25 pages sequentially.
 * Chromium leaks ~10-20MB of V8 heap per cycle even after pages are closed.
 * Recycling every 8 jobs (~2 hours at 15-min intervals) keeps memory stable.
 */
const RECYCLE_AFTER_JOBS = 8;

/**
 * BrowserPool — manages reusable Playwright browser instances.
 * Workers borrow a browser, create an isolated context per job,
 * then return the browser to the pool.
 *
 * Each browser is automatically recycled (closed + relaunched) after
 * RECYCLE_AFTER_JOBS uses to flush Chromium's accumulated V8 heap.
 * This prevents the slow memory leak that kills the server after ~12 hours.
 */
export class BrowserPool {
  private browsers: Browser[] = [];
  private available: Browser[] = [];
  private maxSize: number;

  // Track how many jobs each browser has processed
  private jobCount: WeakMap<Browser, number> = new WeakMap();

  constructor(maxSize?: number) {
    this.maxSize = maxSize ?? env.scraper.browserPoolSize;
  }

  async initialize(): Promise<void> {
    logger.info({ poolSize: this.maxSize }, 'Initializing browser pool');
    for (let i = 0; i < this.maxSize; i++) {
      const browser = await this.launchBrowser();
      this.browsers.push(browser);
      this.available.push(browser);
    }
    logger.info(`Browser pool ready: ${this.browsers.length} instances`);
  }

  private async launchBrowser(): Promise<Browser> {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        // Limit Chromium's own memory usage aggressively
        '--js-flags=--max-old-space-size=512',
        '--memory-pressure-off',
        '--disable-extensions',
        '--disable-background-networking',
      ],
    });
    this.jobCount.set(browser, 0);
    return browser;
  }

  /**
   * Borrow a browser from the pool. Blocks if none available.
   */
  async acquire(): Promise<Browser> {
    if (this.available.length > 0) {
      return this.available.pop()!;
    }

    // Wait for one to become available
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (this.available.length > 0) {
          clearInterval(interval);
          resolve(this.available.pop()!);
        }
      }, 500);
    });
  }

  /**
   * Return a browser to the pool.
   * Automatically recycles the browser after RECYCLE_AFTER_JOBS uses
   * to flush accumulated Chromium V8 heap memory.
   */
  release(browser: Browser): void {
    if (!browser.isConnected()) {
      // Browser crashed — replace it immediately
      logger.warn('Browser disconnected, replacing in pool');
      this.replaceBrowser(browser);
      return;
    }

    // Increment job counter for this browser
    const uses = (this.jobCount.get(browser) ?? 0) + 1;
    this.jobCount.set(browser, uses);

    if (uses >= RECYCLE_AFTER_JOBS) {
      // Recycle: close the old Chromium process and launch a fresh one.
      // This flushes all V8 heap, cached resources, and response handler refs.
      logger.info(
        { uses, recycleThreshold: RECYCLE_AFTER_JOBS },
        'BrowserPool: recycling browser to flush Chromium memory'
      );
      this.replaceBrowser(browser);
    } else {
      this.available.push(browser);
      logger.debug({ uses, recycleThreshold: RECYCLE_AFTER_JOBS }, 'BrowserPool: browser returned to pool');
    }
  }

  /**
   * Close a browser and launch a fresh replacement into the pool.
   */
  private replaceBrowser(browser: Browser): void {
    const idx = this.browsers.indexOf(browser);
    if (idx !== -1) this.browsers.splice(idx, 1);

    // Close asynchronously — don't block the release caller
    browser.close().catch((err) => {
      logger.warn({ err }, 'BrowserPool: error closing browser during recycle (ignored)');
    });

    // Launch replacement and put it back in the pool
    this.launchBrowser().then((b) => {
      this.browsers.push(b);
      this.available.push(b);
      logger.info('BrowserPool: fresh browser ready after recycle');
    }).catch((err) => {
      logger.error({ err }, 'BrowserPool: failed to launch replacement browser');
    });
  }

  /**
   * Create an isolated browser context for a single job.
   * Optionally loads saved session cookies.
   */
  async createContext(browser: Browser, cookies?: any[]): Promise<BrowserContext> {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    if (cookies && cookies.length > 0) {
      await context.addCookies(cookies);
    }

    return context;
  }

  /**
   * Shutdown all browsers.
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down browser pool');
    for (const browser of this.browsers) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    this.browsers = [];
    this.available = [];
  }
}

// Singleton
export const browserPool = new BrowserPool();


