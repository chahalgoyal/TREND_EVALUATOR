import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DB_HOST: z.string(),
  DB_PORT: z.string().default('5432'),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),

  // Redis
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.string().default('6379'),

  // API Keys
  API_KEY_STANDARD: z.string().min(10),
  API_KEY_ADMIN: z.string().min(10),

  // Instagram
  INSTAGRAM_USERNAME: z.string(),
  INSTAGRAM_PASSWORD: z.string(),

  // LinkedIn
  LINKEDIN_USERNAME: z.string(),
  LINKEDIN_PASSWORD: z.string(),

  // YouTube
  YOUTUBE_API_KEY: z.string().min(10),

  // Scraper
  BROWSER_POOL_SIZE: z.string().default('2'),
  SESSION_STORE_PATH: z.string().default('./session-store'),
  RAW_PAYLOAD_TTL_HOURS: z.string().default('72'),

  // Worker Concurrency
  SCRAPE_WORKER_CONCURRENCY: z.string().default('3'),
  PARSE_WORKER_CONCURRENCY: z.string().default('10'),
  THRESHOLD_WORKER_CONCURRENCY: z.string().default('20'),

  // Cache
  CACHE_TTL_SECONDS: z.string().default('30'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,

  db: {
    host: parsed.data.DB_HOST,
    port: parseInt(parsed.data.DB_PORT, 10),
    user: parsed.data.DB_USER,
    password: parsed.data.DB_PASSWORD,
    database: parsed.data.DB_NAME,
  },

  redis: {
    host: parsed.data.REDIS_HOST,
    port: parseInt(parsed.data.REDIS_PORT, 10),
  },

  apiKeys: {
    standard: parsed.data.API_KEY_STANDARD,
    admin: parsed.data.API_KEY_ADMIN,
  },

  instagram: {
    username: parsed.data.INSTAGRAM_USERNAME,
    password: parsed.data.INSTAGRAM_PASSWORD,
  },

  linkedin: {
    username: parsed.data.LINKEDIN_USERNAME,
    password: parsed.data.LINKEDIN_PASSWORD,
  },

  youtube: {
    apiKey: parsed.data.YOUTUBE_API_KEY,
  },

  scraper: {
    browserPoolSize: parseInt(parsed.data.BROWSER_POOL_SIZE, 10),
    sessionStorePath: parsed.data.SESSION_STORE_PATH,
    rawPayloadTtlHours: parseInt(parsed.data.RAW_PAYLOAD_TTL_HOURS, 10),
  },

  workers: {
    scrapeWorkerConcurrency: parseInt(parsed.data.SCRAPE_WORKER_CONCURRENCY, 10),
    parseWorkerConcurrency: parseInt(parsed.data.PARSE_WORKER_CONCURRENCY, 10),
    thresholdWorkerConcurrency: parseInt(parsed.data.THRESHOLD_WORKER_CONCURRENCY, 10),
  },

  cache: {
    ttlSeconds: parseInt(parsed.data.CACHE_TTL_SECONDS, 10),
  },
};
