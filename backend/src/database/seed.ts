import { readFileSync } from 'fs';
import path from 'path';
import { db } from '../config/database';
import { logger } from '../shared/logger';

async function seed() {
  logger.info('Running database seed...');
  const sql = readFileSync(
    path.join(__dirname, 'seeds', 'seed.sql'),
    'utf-8'
  );
  await db.query(sql);
  logger.info('✅ Seed complete');
  await db.end();
}

seed().catch((err) => {
  logger.error(err, 'Seed failed');
  process.exit(1);
});
