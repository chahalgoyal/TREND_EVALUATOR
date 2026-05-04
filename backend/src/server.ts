import app from './app';
import { env } from './config/env';
import { db, checkDbConnection } from './config/database';
import { redis, checkRedisConnection } from './config/redis';
import { logger } from './shared/logger';

// Import all queues to register them with BullMQ
import './queues/scrape.queue';
import './queues/parse.queue';
import './queues/threshold.queue';
import './queues/intelligence.queue';

// Workers
import { startScrapeWorker } from './modules/scraper/scraper.worker';
import { startParseWorker } from './modules/parser/parser.worker';
import { startThresholdWorker } from './modules/threshold/threshold.worker';
import { startIntelligenceWorker } from './modules/intelligence/intelligence.worker';
import { startScheduler } from './modules/scraper/triggers/scheduler';
import { startTrendRecalculator } from './modules/intelligence/recalculator';
import { browserPool } from './modules/scraper/browser-pool/pool';

async function bootstrap() {
  logger.info('🚀 Starting Social Trend Intelligence Backend...');

  // Check DB
  const dbOk = await checkDbConnection();
  if (!dbOk) {
    logger.fatal('❌ Cannot connect to PostgreSQL. Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME in .env');
    process.exit(1);
  }
  logger.info('✅ PostgreSQL connected');

  // Check Redis (lazyConnect — first command triggers connection)
  const redisOk = await checkRedisConnection();
  if (!redisOk) {
    logger.fatal('❌ Cannot connect to Redis/Memurai. Make sure Memurai is running on port 6379');
    process.exit(1);
  }
  logger.info('✅ Redis (Memurai) connected');

  // Initialize browser pool
  try {
    await browserPool.initialize();
    logger.info('✅ Browser pool initialized');
  } catch (err) {
    logger.warn({ err }, '⚠️  Browser pool init failed — scraping disabled, API still works');
  }

  // Start workers
  startScrapeWorker();
  startParseWorker();
  startThresholdWorker();
  startIntelligenceWorker();
  logger.info('✅ All queue workers started');

  // Start scheduler (only in non-test environments)
  if (env.nodeEnv !== 'test') {
    startScheduler();
    startTrendRecalculator();
    logger.info('✅ Schedulers started');
  }

  // Start HTTP server
  const server = app.listen(env.port, () => {
    logger.info(`✅ API server listening on http://localhost:${env.port}`);
    logger.info(`   Health:     GET http://localhost:${env.port}/health`);
    logger.info(`   Deep check: GET http://localhost:${env.port}/api/v1/health`);
    logger.info(`   Posts:      GET http://localhost:${env.port}/api/v1/posts`);
    logger.info(`   Platforms:  GET http://localhost:${env.port}/api/v1/platforms`);
    logger.info(`   Trigger:    POST http://localhost:${env.port}/api/v1/scraper/run`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await browserPool.shutdown();
      await db.end();
      await redis.quit();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap();
