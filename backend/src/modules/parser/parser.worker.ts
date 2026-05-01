import { Worker, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import redis from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../shared/logger';
import { ParseJobDTO, ThresholdJobDTO } from '../../queues/dto';
import { thresholdQueue } from '../../queues/threshold.queue';
import { rawStorageRepository } from '../scraper/raw-storage/rawStorage.repository';
import { normalizePost } from './normalizer';

/**
 * Parser Worker — processes parseQueue jobs.
 * 
 * Flow (SRS §6.2):
 * 1. Load raw payload from DB
 * 2. Run extraction strategy chain
 * 3. Normalize to NormalizedPostDTO
 * 4. Update raw_payload.parse_status
 * 5. Push ThresholdJobDTO to thresholdQueue
 */
async function processParseJob(job: Job<ParseJobDTO>): Promise<void> {
  const data = job.data;
  const jobLogger = logger.child({ jobId: data.jobId, platform: data.platform, rawPayloadId: data.rawPayloadId });

  jobLogger.info('Parse job started');

  // Load raw payload
  const rawPayload = await rawStorageRepository.getById(data.rawPayloadId);
  if (!rawPayload) {
    jobLogger.error('Raw payload not found — may have expired');
    return; // Don't retry — data is gone
  }

  try {
    // Normalize the post
    const normalizedPost = normalizePost({
      platform: data.platform,
      platformPostId: rawPayload.job_id, // Use a derived ID for now
      html: rawPayload.payload_html ?? undefined,
      json: rawPayload.payload_json ?? undefined,
      sourceType: data.sourceType,
      rawPayloadId: data.rawPayloadId,
      scrapedAt: rawPayload.created_at,
    });

    // Extract post ID from HTML — try multiple patterns
    const html = rawPayload.payload_html || '';
    
    // Instagram: data-post-id attribute
    const dataPostIdMatch = html.match(/data-post-id="([^"]+)"/);
    if (dataPostIdMatch) {
      normalizedPost.platformPostId = dataPostIdMatch[1];
    }
    
    // Instagram: /p/ or /reel/ URL pattern
    if (!dataPostIdMatch) {
      const postIdMatch = html.match(/\/(p|reel)\/([^/"]+)/);
      if (postIdMatch) {
        normalizedPost.platformPostId = postIdMatch[2];
      }
    }

    // LinkedIn: data-urn attribute
    const urnMatch = html.match(/data-urn="([^"]+)"/);
    if (urnMatch) {
      normalizedPost.platformPostId = urnMatch[1];
    }

    // Update raw payload status
    await rawStorageRepository.updateStatus(data.rawPayloadId, 'success');

    // Push to thresholdQueue
    const thresholdJob: ThresholdJobDTO = {
      jobId: uuidv4(),
      jobType: 'EVALUATE_THRESHOLD',
      platform: data.platform,
      schemaVersion: 'v1',
      metadata: {
        trigger: data.metadata.trigger,
        attempt: 1,
        initiatedBy: data.metadata.initiatedBy,
      },
      createdAt: new Date().toISOString(),
      postDTO: normalizedPost,
      rawPayloadId: data.rawPayloadId,
    };

    await thresholdQueue.add(thresholdJob.jobType, thresholdJob, { jobId: thresholdJob.jobId });

    jobLogger.info({
      hashtags: normalizedPost.hashtags.length,
      likes: normalizedPost.likes,
      comments: normalizedPost.comments,
    }, 'Parse job completed');

  } catch (err: any) {
    await rawStorageRepository.updateStatus(data.rawPayloadId, 'failed');
    jobLogger.error({ err: err.message }, 'Parse job failed');
    throw err;
  }
}

let parseWorker: Worker<ParseJobDTO> | null = null;

export function startParseWorker(): Worker<ParseJobDTO> {
  parseWorker = new Worker<ParseJobDTO>(
    'parseQueue',
    processParseJob,
    {
      connection: redis,
      concurrency: env.workers.parseWorkerConcurrency,
    }
  );

  parseWorker.on('completed', (job) => {
    logger.info({ jobId: job.data.jobId }, 'parseQueue: Job completed');
  });

  parseWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.data.jobId, err: err.message }, 'parseQueue: Job failed');
  });

  logger.info({ concurrency: env.workers.parseWorkerConcurrency }, 'Parse worker started');
  return parseWorker;
}

export { parseWorker };
