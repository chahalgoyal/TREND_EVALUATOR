import { readFileSync } from 'fs';
import path from 'path';
import { db } from '../config/database';
import { logger } from '../shared/logger';

async function migrate() {
  logger.info('Running database migration...');
  const sql = readFileSync(
    path.join(__dirname, 'migrations', 'V001__initial_schema.sql'),
    'utf-8'
  );
  try {
    await db.query(sql);
    logger.info('✅ Migration complete');
  } catch (err: any) {
    if (err.code === '42P07') {
      logger.info('✅ Database already migrated (tables exist)');
    } else {
      throw err;
    }
  } finally {
    await db.end();
  }
}

migrate().catch((err) => {
  logger.error(err, 'Migration failed');
  process.exit(1);
});
