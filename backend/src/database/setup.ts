/**
 * Full database setup — creates DB if not exists, runs migration, seeds data.
 * Usage: npx tsx src/database/setup.ts
 */
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { env } from '../config/env';

async function setup() {
  console.log('🔧 Setting up database...');

  // Connect to default 'postgres' DB to create our project DB
  const adminPool = new Pool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: 'postgres', // connect to default DB first
  });

  try {
    // Check if DB exists
    const checkResult = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [env.db.database]
    );

    if (checkResult.rowCount === 0) {
      console.log(`  Creating database "${env.db.database}"...`);
      await adminPool.query(`CREATE DATABASE "${env.db.database}"`);
      console.log(`  ✅ Database created`);
    } else {
      console.log(`  ✅ Database "${env.db.database}" already exists`);
    }
  } finally {
    await adminPool.end();
  }

  // Now connect to the actual project DB and run migration + seed
  const projectPool = new Pool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });

  try {
    console.log('  Running migration V001...');
    const migration = readFileSync(
      path.join(__dirname, 'migrations', 'V001__initial_schema.sql'),
      'utf-8'
    );
    await projectPool.query(migration);
    console.log('  ✅ Migration complete');

    console.log('  Running seed data...');
    const seed = readFileSync(
      path.join(__dirname, 'seeds', 'seed.sql'),
      'utf-8'
    );
    await projectPool.query(seed);
    console.log('  ✅ Seed complete');

    // Verify
    const platforms = await projectPool.query('SELECT slug FROM platforms');
    const rules = await projectPool.query('SELECT * FROM threshold_rules');
    console.log(`\n🎉 Setup done!`);
    console.log(`   Platforms: ${platforms.rows.map((r: any) => r.slug).join(', ')}`);
    console.log(`   Threshold rules: ${rules.rowCount}`);
  } finally {
    await projectPool.end();
  }
}

setup().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
