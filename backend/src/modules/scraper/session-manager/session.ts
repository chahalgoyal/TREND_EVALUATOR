import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { BrowserContext } from 'playwright';
import { env } from '../../../config/env';
import { logger } from '../../../shared/logger';

/**
 * SessionManager — hybrid session persistence.
 * Saves/loads cookies per platform for session reuse.
 * Forces refresh after expiry or when login is detected as invalid.
 */
export class SessionManager {
  private storePath: string;

  constructor() {
    this.storePath = path.resolve(env.scraper.sessionStorePath);
    if (!existsSync(this.storePath)) {
      mkdirSync(this.storePath, { recursive: true });
    }
  }

  private cookiePath(platform: string): string {
    return path.join(this.storePath, `${platform}_cookies.json`);
  }

  /**
   * Load saved cookies for a platform (if they exist and aren't too old).
   */
  loadCookies(platform: string): any[] | null {
    const filePath = this.cookiePath(platform);
    if (!existsSync(filePath)) return null;

    try {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      // Check freshness — reject if older than 4 hours
      const savedAt = data.savedAt ? new Date(data.savedAt).getTime() : 0;
      const maxAge = 4 * 60 * 60 * 1000; // 4 hours
      if (Date.now() - savedAt > maxAge) {
        logger.info({ platform }, 'Session cookies expired, need fresh login');
        return null;
      }

      logger.info({ platform, cookieCount: data.cookies?.length }, 'Loaded saved session');
      return data.cookies;
    } catch (err) {
      logger.warn({ platform, err }, 'Failed to load session cookies');
      return null;
    }
  }

  /**
   * Save cookies from a browser context after successful login.
   */
  async saveCookies(platform: string, context: BrowserContext): Promise<void> {
    try {
      const cookies = await context.cookies();
      const data = {
        platform,
        savedAt: new Date().toISOString(),
        cookies,
      };
      writeFileSync(this.cookiePath(platform), JSON.stringify(data, null, 2));
      logger.info({ platform, cookieCount: cookies.length }, 'Session cookies saved');
    } catch (err) {
      logger.error({ platform, err }, 'Failed to save session cookies');
    }
  }

  /**
   * Invalidate saved session (force re-login on next run).
   */
  invalidate(platform: string): void {
    const filePath = this.cookiePath(platform);
    if (existsSync(filePath)) {
      writeFileSync(filePath, '{}');
      logger.info({ platform }, 'Session invalidated');
    }
  }
}

export const sessionManager = new SessionManager();
