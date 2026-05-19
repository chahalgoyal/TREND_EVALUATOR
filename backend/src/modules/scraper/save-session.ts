import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import readline from 'readline';
import { Pool } from 'pg';
import { env } from '../../config/env';

const PLATFORMS: Record<string, { loginUrl?: string; feedUrl?: string; isApi?: boolean }> = {
  instagram: {
    loginUrl: 'https://www.instagram.com/accounts/login/',
    feedUrl: 'https://www.instagram.com/explore/',
  },

  youtube: {
    isApi: true
  }
};

async function saveSession() {
  const platform = process.argv[2]?.toLowerCase();
  const username = process.argv[3]; 
  const apiKey = process.argv[4]; // Only for YouTube

  if (!platform || !PLATFORMS[platform]) {
    console.error('Usage:');
    console.error('  Instagram:          npx tsx src/modules/scraper/save-session.ts instagram <username>');
    console.error('  YouTube:            npx tsx src/modules/scraper/save-session.ts youtube <key_name> <api_key>');
    process.exit(1);
  }

  const config = PLATFORMS[platform];
  const storePath = path.resolve('session-store');
  if (!existsSync(storePath)) mkdirSync(storePath, { recursive: true });

  let sessionData: any;

  if (config.isApi) {
    // ── API-based (YouTube) ──
    if (!username || !apiKey) {
      console.error('Usage for YouTube: npx tsx src/modules/scraper/save-session.ts youtube <key_name> <api_key>');
      process.exit(1);
    }
    console.log(`\n📺 YouTube API Key Mode: ${username}`);
    sessionData = { apiKey };
  } else {
    // ── Browser-based (Instagram) ──
    if (!username) {
      console.error(`Usage for ${platform}: npx tsx src/modules/scraper/save-session.ts ${platform} <username>`);
      process.exit(1);
    }
    console.log(`\n🌐 Opening ${platform} login page in a visible browser...`);
    console.log(`👤 Target Account: ${username}`);
    console.log('   Log in manually. When you see the feed page, return here and press Enter.\n');

    const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
    });

    const page = await context.newPage();
    await page.goto(config.loginUrl!, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => {
      rl.question('✅ Press Enter after you have logged in successfully...', () => {
        rl.close();
        resolve();
      });
    });

    sessionData = await context.storageState();
    const stateFileName = `${platform}_${username}_state.json`;
    writeFileSync(path.join(storePath, stateFileName), JSON.stringify(sessionData, null, 2));
    await browser.close();
  }

  // ── Sync to Database ──
  console.log(`\n🗄️ Syncing session for "${username}" to database...`);
  const pool = new Pool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });

  try {
    const platRes = await pool.query('SELECT id FROM platforms WHERE slug = $1', [platform]);
    const platformId = platRes.rows[0]?.id;
    if (!platformId) throw new Error(`Platform "${platform}" not found in database.`);

    await pool.query(
      `INSERT INTO platform_accounts (platform_id, username, session_data, is_active, updated_at)
       VALUES ($1, $2, $3, true, NOW())
       ON CONFLICT (platform_id, username) DO UPDATE SET
         session_data = EXCLUDED.session_data, is_active = true, consecutive_failures = 0, retry_after = NULL, updated_at = NOW()`,
      [platformId, username, JSON.stringify(sessionData)]
    );
    console.log(`✅ Database synced successfully. Account "${username}" is now ACTIVE.`);
  } catch (err: any) {
    console.error(`❌ Database sync failed: ${err.message}`);
  } finally {
    await pool.end();
  }
}

saveSession().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

