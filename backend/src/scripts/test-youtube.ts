import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { scrapeQueue } from '../queues/scrape.queue';
import { ScrapeJobDTO } from '../queues/dto';
import redis from '../config/redis';

async function testYoutube() {
  console.log('🚀 Triggering YouTube Feed Scrape Test');

  // 1. We need a scrape_jobs record
  const scrapeJobId = uuidv4();
  await db.query(
    `INSERT INTO scrape_jobs (id, platform, target_type, status, max_posts_limit)
     VALUES ($1, 'youtube', 'feed', 'pending', 15)`,
    [scrapeJobId]
  );

  // 2. Queue the job
  const jobPayload: ScrapeJobDTO = {
    jobId: uuidv4(),
    jobType: 'SCRAPE_FEED',
    platform: 'youtube',
    schemaVersion: 'v1',
    metadata: { trigger: 'manual', attempt: 1, initiatedBy: 'test_script' },
    createdAt: new Date().toISOString(),
    targetType: 'feed',
    scrapeJobDbId: scrapeJobId,
  };

  await scrapeQueue.add(jobPayload.jobType, jobPayload, { jobId: jobPayload.jobId });
  
  console.log('✅ Job queued. Check Docker API logs for processing details.');
  console.log('To view logs: docker logs -f sti-api');

  await db.end();
  await redis.quit();
  process.exit(0);
}

testYoutube().catch(console.error);
