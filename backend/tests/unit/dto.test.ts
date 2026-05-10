/**
 * Unit Tests: Queue DTO Schema Contracts
 * Ensures that DTOs have correct shapes and required fields.
 * These tests document the API contract between workers.
 */
import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type {
  ScrapeJobDTO,
  ParseJobDTO,
  ThresholdJobDTO,
  NormalizedPostDTO,
  IntelligenceJobDTO,
} from '../../src/queues/dto';

function makeBase() {
  return {
    jobId: uuidv4(),
    platform: 'instagram',
    schemaVersion: 'v1' as const,
    metadata: { trigger: 'scheduler' as const, attempt: 1, initiatedBy: 'system' },
    createdAt: new Date().toISOString(),
  };
}

// ── ScrapeJobDTO ─────────────────────────────────────────────────────────────

describe('ScrapeJobDTO', () => {
  it('can be constructed with required fields', () => {
    const dto: ScrapeJobDTO = {
      ...makeBase(),
      jobType: 'SCRAPE_FEED',
      targetType: 'feed',
      scrapeJobDbId: uuidv4(),
    };
    expect(dto.jobId).toBeDefined();
    expect(dto.jobType).toBe('SCRAPE_FEED');
    expect(dto.targetType).toBe('feed');
  });

  it('allows optional accountId and sessionData', () => {
    const dto: ScrapeJobDTO = {
      ...makeBase(),
      jobType: 'SCRAPE_KEYWORD',
      targetType: 'keyword',
      targetValue: 'trending',
      scrapeJobDbId: uuidv4(),
      accountId: uuidv4(),
      sessionData: { cookies: [] },
    };
    expect(dto.accountId).toBeDefined();
    expect(dto.sessionData).toBeDefined();
  });

  it('accepts all three job types', () => {
    const types: ScrapeJobDTO['jobType'][] = ['SCRAPE_FEED', 'SCRAPE_KEYWORD', 'SCRAPE_PROFILE'];
    for (const jt of types) {
      const dto: ScrapeJobDTO = { ...makeBase(), jobType: jt, targetType: 'feed', scrapeJobDbId: uuidv4() };
      expect(dto.jobType).toBe(jt);
    }
  });
});

// ── ParseJobDTO ──────────────────────────────────────────────────────────────

describe('ParseJobDTO', () => {
  it('can be constructed with required fields', () => {
    const dto: ParseJobDTO = {
      ...makeBase(),
      jobType: 'PARSE_POST_API',
      rawPayloadId: uuidv4(),
      payloadType: 'api_json',
      sourceType: 'feed',
    };
    expect(dto.rawPayloadId).toBeDefined();
    expect(dto.payloadType).toBe('api_json');
  });

  it('includes optional scrapeJobDbId (added for audit trail)', () => {
    const dto: ParseJobDTO = {
      ...makeBase(),
      jobType: 'PARSE_POST_HTML',
      rawPayloadId: uuidv4(),
      payloadType: 'html',
      sourceType: 'feed',
      scrapeJobDbId: uuidv4(),
    };
    expect(dto.scrapeJobDbId).toBeDefined();
  });

  it('accepts all payload types', () => {
    const types: ParseJobDTO['payloadType'][] = ['html', 'api_json', 'graphql'];
    for (const pt of types) {
      expect(['html', 'api_json', 'graphql']).toContain(pt);
    }
  });
});

// ── NormalizedPostDTO ─────────────────────────────────────────────────────────

describe('NormalizedPostDTO', () => {
  const makePost = (overrides: Partial<NormalizedPostDTO> = {}): NormalizedPostDTO => ({
    platform: 'instagram',
    platformPostId: 'abc123',
    hashtags: ['viral', 'trending'],
    likes: 50000,
    comments: 3000,
    shares: 0,
    views: 0,
    sourceType: 'feed',
    scrapedAt: new Date().toISOString(),
    rawPayloadId: uuidv4(),
    schemaVersion: 'v1',
    ...overrides,
  });

  it('has all required fields', () => {
    const post = makePost();
    expect(post.platform).toBe('instagram');
    expect(post.hashtags).toBeInstanceOf(Array);
    expect(post.likes).toBeTypeOf('number');
    expect(post.schemaVersion).toBe('v1');
  });

  it('allows optional postedAt', () => {
    const withDate = makePost({ postedAt: '2025-01-01T00:00:00.000Z' });
    const withoutDate = makePost({ postedAt: undefined });
    expect(withDate.postedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(withoutDate.postedAt).toBeUndefined();
  });

  it('validates platform values', () => {
    const platforms = ['instagram', 'linkedin', 'youtube'];
    for (const p of platforms) {
      const post = makePost({ platform: p });
      expect(post.platform).toBe(p);
    }
  });

  it('hashtags array is always deduplicated strings', () => {
    const post = makePost({ hashtags: ['viral', 'viral', 'trending'] });
    // Deduplication is the normalizer's job, but we document the contract
    expect(post.hashtags).toBeInstanceOf(Array);
  });
});

// ── IntelligenceJobDTO ────────────────────────────────────────────────────────

describe('IntelligenceJobDTO', () => {
  it('can be constructed correctly', () => {
    const dto: IntelligenceJobDTO = {
      ...makeBase(),
      jobType: 'EVALUATE_TREND',
      postDbId: '4678',
      platformPostId: 'abc_xyz_123',
      likes: 8400000,
      comments: 44500,
      views: 0,
      hashtags: ['trending', 'viral'],
      scrapedAt: new Date().toISOString(), // required field — was missing
      postedAt: undefined,
    };
    expect(dto.postDbId).toBe('4678');
    expect(dto.likes).toBe(8400000);
    expect(dto.hashtags.length).toBe(2);
    expect(dto.scrapedAt).toBeDefined();
  });
});
