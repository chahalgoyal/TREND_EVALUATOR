import { chromium, Browser, BrowserContext } from 'playwright';
import { env } from '../../../config/env';
import { logger } from '../../../shared/logger';

/**
 * BrowserPool — manages reusable Playwright browser instances.
 * Workers borrow a browser, create an isolated context per job,
 * then return the browser to the pool.
 */
export class BrowserPool {
  private browsers: Browser[] = [];
  private available: Browser[] = [];
  private maxSize: number;
  private launching = false;

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
    return chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });
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
   */
  release(browser: Browser): void {
    if (browser.isConnected()) {
      this.available.push(browser);
    } else {
      // Browser crashed — replace it
      logger.warn('Browser disconnected, replacing in pool');
      const idx = this.browsers.indexOf(browser);
      if (idx !== -1) this.browsers.splice(idx, 1);
      this.launchBrowser().then((b) => {
        this.browsers.push(b);
        this.available.push(b);
      });
    }
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
