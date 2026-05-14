import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { db } from '../config/database';
import { env } from '../config/env';

async function migrateSessions() {
  console.log('🚀 Starting Dynamic Session Migration to DB...\n');

  const storePath = './session-store';
  if (!existsSync(storePath)) {
    console.error(`❌ Session store directory not found at ${storePath}`);
    process.exit(1);
  }

  const files = readdirSync(storePath);
  let migratedCount = 0;

  // 1. Discover platform accounts by scanning files with pattern: <platform>_<username>_state.json
  const accountsToMigrate: { platform: string; username: string; filePath: string }[] = [];

  for (const file of files) {
    const match = file.match(/^(instagram|linkedin|youtube)_(.+)_state\.json$/);
    if (match) {
      accountsToMigrate.push({
        platform: match[1],
        username: match[2],
        filePath: path.join(storePath, file)
      });
    }
  }

  // 2. Fallback checks for legacy file format: <platform>_state.json
  const fallbackConfigs = [
    { platform: 'instagram', username: env.instagram.username, file: 'instagram_state.json' },
    { platform: 'linkedin', username: env.linkedin.username, file: 'linkedin_state.json' }
  ];

  for (const fb of fallbackConfigs) {
    const fbPath = path.join(storePath, fb.file);
    if (existsSync(fbPath) && fb.username) {
      // Only add legacy fallback if we haven't already queued this username
      const exists = accountsToMigrate.some(a => a.platform === fb.platform && a.username === fb.username);
      if (!exists) {
        accountsToMigrate.push({
          platform: fb.platform,
          username: fb.username,
          filePath: fbPath
        });
      }
    }
  }

  console.log(`🔍 Found ${accountsToMigrate.length} total sessions to evaluate...\n`);

  for (const account of accountsToMigrate) {
    try {
      const sessionData = JSON.parse(readFileSync(account.filePath, 'utf-8'));
      
      // Resolve Platform Database ID
      const platRes = await db.query(`SELECT id FROM platforms WHERE slug = $1`, [account.platform]);
      if (platRes.rowCount === 0) {
        console.error(`❌ Database mismatch: Platform '${account.platform}' not registered.`);
        continue;
      }
      const platformId = platRes.rows[0].id;

      // Atomic Upsert into platform_accounts
      await db.query(`
        INSERT INTO platform_accounts (platform_id, username, session_data, is_active, consecutive_failures, retry_after, updated_at)
        VALUES ($1, $2, $3, true, 0, NULL, NOW())
        ON CONFLICT (platform_id, username) 
        DO UPDATE SET 
          session_data = EXCLUDED.session_data, 
          is_active = true, 
          consecutive_failures = 0,
          retry_after = NULL,
          updated_at = NOW()
      `, [platformId, account.username, JSON.stringify(sessionData)]);

      console.log(`✅ Migrated: [${account.platform}] Account "${account.username}" is now ACTIVE in DB.`);
      migratedCount++;
    } catch (err: any) {
      console.error(`❌ Failed to migrate ${account.filePath}:`, err.message);
    }
  }

  console.log(`\n🎯 Migration Complete! Successfully pushed ${migratedCount} accounts to the DB.`);
  await db.end();
  process.exit(0);
}

migrateSessions().catch(console.error);
