/**
 * Session Saver — Opens a HEADED browser for manual login.
 * 
 * Usage:
 *   npx tsx src/modules/scraper/save-session.ts instagram
 *   npx tsx src/modules/scraper/save-session.ts linkedin
 * 
 * Flow:
 *   1. Opens a visible browser window
 *   2. Navigates to the platform login page
 *   3. YOU log in manually (handle CAPTCHA, 2FA, etc.)
 *   4. Press Enter in the terminal when you're logged in
 *   5. Cookies are saved to session-store/
 *   6. All future automated scrapes use these saved cookies
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import readline from 'readline';

const PLATFORMS: Record<string, { loginUrl: string; feedUrl: string }> = {
  instagram: {
    loginUrl: 'https://www.instagram.com/accounts/login/',
    feedUrl: 'https://www.instagram.com/',
  },
  linkedin: {
    loginUrl: 'https://www.linkedin.com/login',
    feedUrl: 'https://www.linkedin.com/feed/',
  },
};

async function saveSession() {
  const platform = process.argv[2]?.toLowerCase();
  if (!platform || !PLATFORMS[platform]) {
    console.error('Usage: npx tsx src/modules/scraper/save-session.ts <instagram|linkedin>');
    process.exit(1);
  }

  const config = PLATFORMS[platform];
  const storePath = path.resolve('session-store');
  if (!existsSync(storePath)) mkdirSync(storePath, { recursive: true });

  console.log(`\n🌐 Opening ${platform} login page in a visible browser...`);
  console.log('   Log in manually. Handle any CAPTCHA or 2FA prompts.');
  console.log('   When you see the feed/home page, come back here and press Enter.\n');

  const browser = await chromium.launch({
    headless: false, // VISIBLE browser
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  const page = await context.newPage();

  // Navigate to login
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Take a diagnostic screenshot
  const screenshotPath = path.join(storePath, `${platform}_login_page.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot saved: ${screenshotPath}`);

  // Wait for user to login manually
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question('✅ Press Enter after you have logged in successfully...', () => {
      rl.close();
      resolve();
    });
  });

  // Verify — take a screenshot of the logged-in state
  const feedScreenshot = path.join(storePath, `${platform}_logged_in.png`);
  await page.screenshot({ path: feedScreenshot, fullPage: false });
  console.log(`📸 Logged-in screenshot saved: ${feedScreenshot}`);

  // Save cookies
  const cookies = await context.cookies();
  const storageState = await context.storageState();

  const cookieData = {
    platform,
    savedAt: new Date().toISOString(),
    cookies,
  };

  const cookiePath = path.join(storePath, `${platform}_cookies.json`);
  writeFileSync(cookiePath, JSON.stringify(cookieData, null, 2));
  console.log(`🍪 Saved ${cookies.length} cookies to ${cookiePath}`);

  // Also save full storage state (includes localStorage)
  const statePath = path.join(storePath, `${platform}_state.json`);
  writeFileSync(statePath, JSON.stringify(storageState, null, 2));
  console.log(`💾 Saved full browser state to ${statePath}`);

  // Now do a quick test — navigate to the feed and see if we can find posts
  console.log(`\n🔍 Testing: navigating to ${platform} feed to check for posts...`);
  await page.goto(config.feedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  const feedTestScreenshot = path.join(storePath, `${platform}_feed_test.png`);
  await page.screenshot({ path: feedTestScreenshot, fullPage: false });
  console.log(`📸 Feed screenshot saved: ${feedTestScreenshot}`);

  // Check what's on the page
  if (platform === 'instagram') {
    const postLinks = await page.$$('a[href*="/p/"], a[href*="/reel/"]');
    console.log(`   Found ${postLinks.length} post/reel links on the feed`);

    const articles = await page.$$('article');
    console.log(`   Found ${articles.length} article elements`);
  } else {
    const posts = await page.$$('.feed-shared-update-v2, .occludable-update, div[data-urn]');
    console.log(`   Found ${posts.length} feed post elements`);
  }

  await browser.close();

  console.log(`\n✅ Session saved! Future scrape runs will use these cookies.`);
  console.log(`   Cookies expire after 4 hours — re-run this script to refresh.\n`);
}

saveSession().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
