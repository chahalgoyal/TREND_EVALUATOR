/**
 * Session Migrator Script
 * 
 * Reads the existing session cookies from `session-store/` and inserts them 
 * into the PostgreSQL `platform_accounts` table to activate the Round-Robin 
 * multi-account scheduler.
 * 
 * Usage: npx tsx src/database/migrate-sessions.ts
 */
import { existsSync, readFileSync } from 'fs';
import { db } from '../config/database';
import { env } from '../config/env';

async function migrateSessions() {
  console.log('🚀 Starting Session Migration to DB...\n');

  const platforms = [
    { slug: 'instagram', username: env.instagram.username || 'ig_user_1' },
    { slug: 'linkedin', username: env.linkedin.username || 'li_user_1' }
  ];

  for (const p of platforms) {
    const path = `./session-store/${p.slug}_state.json`;
    
    if (existsSync(path)) {
      console.log(`[${p.slug}] Found local session file at ${path}`);
      
      try {
        const sessionData = JSON.parse(readFileSync(path, 'utf-8'));
        
        // Get platform ID
        const platRes = await db.query(`SELECT id FROM platforms WHERE slug = $1`, [p.slug]);
        if (platRes.rowCount === 0) {
          console.error(`❌ Platform '${p.slug}' not found in database.`);
          continue;
        }
        const platformId = platRes.rows[0].id;

        // Insert or Update the account
        await db.query(`
          INSERT INTO platform_accounts (platform_id, username, session_data, is_active)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (platform_id, username) 
          DO UPDATE SET session_data = EXCLUDED.session_data, is_active = true, updated_at = NOW()
        `, [platformId, p.username, JSON.stringify(sessionData)]);

        console.log(`✅ Successfully injected ${p.slug} account (${p.username}) into the DB.`);
      } catch (err: any) {
        console.error(`❌ Failed to parse or insert ${p.slug} session:`, err.message);
      }
    } else {
      console.log(`[${p.slug}] No session file found at ${path}. Skipping.`);
    }
  }

  console.log('\n🎯 Migration complete! The Round-Robin scheduler will now use DB accounts.');
  await db.end();
  process.exit(0);
}

migrateSessions().catch(console.error);
