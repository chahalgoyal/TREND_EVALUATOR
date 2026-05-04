import { readFileSync } from 'fs';
import path from 'path';
import { db } from '../config/database';
import { logger } from '../shared/logger';

async function migrate() {
  logger.info('Running database migration...');
  const migrationsDir = path.join(__dirname, 'migrations');
  
  // Read all SQL files and sort them alphabetically (V001, V002, etc.)
  const files = require('fs').readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();

  try {
    for (const file of files) {
      logger.info(`Executing migration: ${file}`);
      const sql = readFileSync(path.join(migrationsDir, file), 'utf-8');
      try {
        await db.query(sql);
        logger.info(`✅ Migration ${file} complete`);
      } catch (err: any) {
        // 42P07 = Duplicate Table, which is fine for our IF NOT EXISTS structure
        if (err.code === '42P07') {
          logger.info(`✅ Migration ${file} already applied (tables exist)`);
        } else {
          throw err;
        }
      }
    }
  } finally {
    await db.end();
  }
}

migrate().catch((err) => {
  logger.error(err, 'Migration failed');
  process.exit(1);
});
