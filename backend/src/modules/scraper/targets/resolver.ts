import { ScrapeJobDTO } from '../../../queues/dto';

/**
 * Target Resolver — determines the scraping method from job payload.
 */
export function resolveTarget(job: ScrapeJobDTO) {
  return {
    targetType: job.targetType,
    targetValue: job.targetValue,
    method: job.targetType === 'feed' ? 'scrapeFeed'
          : job.targetType === 'keyword' ? 'scrapeKeyword'
          : 'scrapeProfile' as const,
  };
}
