/**
 * Unit Tests: Trend Intelligence Algorithms
 * Tests every function in algorithms.ts with edge cases and normal paths.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateEngagementRate,
  calculateTimeDecayScore,
  calculateVelocity,
  calculateFinalTrendScore,
} from '../../src/modules/intelligence/algorithms';

// ── calculateEngagementRate ───────────────────────────────────────────────────

describe('calculateEngagementRate', () => {
  it('returns 0 when all inputs are zero', () => {
    expect(calculateEngagementRate(0, 0, 0)).toBe(0);
  });

  it('uses log-scale for posts with 0 views (fixed edge case)', () => {
    const score = calculateEngagementRate(100000, 0, 0);
    // Old: would return 100. New: log10(100000)*10 = 50
    expect(score).toBe(50);
    expect(score).toBeLessThanOrEqual(70); // capped at 70
  });

  it('caps the no-view score at 70 for very high likes', () => {
    expect(calculateEngagementRate(10_000_000_000, 0, 0)).toBe(70);
  });

  it('does not return 100 for 0 views + 1 like (old cliff bug prevented)', () => {
    const score = calculateEngagementRate(1, 0, 0);
    expect(score).toBeLessThan(1); // log10(1)*10 = 0
  });

  it('calculates correctly when views are provided', () => {
    // rawScore = (1000*1) + (50*5) = 1250, rate = (1250/10000)*100 = 12.5
    expect(calculateEngagementRate(1000, 50, 10000)).toBe(12.5);
  });

  it('caps engagement at 100% when views < weighted score', () => {
    // Viral post: lots of likes and comments, low view count
    expect(calculateEngagementRate(5000, 5000, 100)).toBe(100);
  });

  it('returns 0 for 0 likes with real views', () => {
    expect(calculateEngagementRate(0, 0, 1_000_000)).toBe(0);
  });

  it('handles 1B views with high engagement', () => {
    const rate = calculateEngagementRate(10_000_000, 500_000, 1_000_000_000);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThanOrEqual(100);
  });
});

// ── calculateTimeDecayScore ───────────────────────────────────────────────────

describe('calculateTimeDecayScore', () => {
  it('applies conservative 24h decay when postedAt is undefined (fixed bug)', () => {
    const score = calculateTimeDecayScore(100, undefined);
    // Should decay, NOT return 100 (old: returned engagementRate unchanged)
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThan(0);
  });

  it('applies more decay to older posts', () => {
    const old = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago
    const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();   // 2 hours ago
    const oldScore = calculateTimeDecayScore(100, old);
    const recentScore = calculateTimeDecayScore(100, recent);
    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it('score approaches 0 for very old posts (30 days)', () => {
    const veryOld = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const score = calculateTimeDecayScore(100, veryOld);
    expect(score).toBeLessThan(1);
  });

  it('score is positive for fresh post (minutes old)', () => {
    const now = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
    const score = calculateTimeDecayScore(80, now);
    expect(score).toBeGreaterThan(0);
  });

  it('returns 4dp precision', () => {
    const score = calculateTimeDecayScore(50, new Date().toISOString());
    expect(score.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });
});

// ── calculateVelocity ─────────────────────────────────────────────────────────

describe('calculateVelocity', () => {
  it('returns 1000 for brand new hashtag with mentions', () => {
    expect(calculateVelocity(10, 0)).toBe(1000);
  });

  it('returns 0 for brand new hashtag with no mentions', () => {
    expect(calculateVelocity(0, 0)).toBe(0);
  });

  it('calculates 100% growth correctly', () => {
    expect(calculateVelocity(20, 10)).toBe(100);
  });

  it('calculates decline (negative velocity) correctly', () => {
    expect(calculateVelocity(5, 10)).toBe(-50);
  });

  it('calculates 200% growth correctly', () => {
    expect(calculateVelocity(30, 10)).toBe(200);
  });

  it('handles equal mentions (0% velocity)', () => {
    expect(calculateVelocity(15, 15)).toBe(0);
  });

  it('returns 2dp precision', () => {
    const vel = calculateVelocity(17, 10);
    expect(vel.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });
});

// ── calculateFinalTrendScore ──────────────────────────────────────────────────

describe('calculateFinalTrendScore', () => {
  it('returns 0 for 0 likes and 0 engagement', () => {
    expect(calculateFinalTrendScore(0, 0)).toBe(0);
  });

  it('returns higher score for higher likes', () => {
    const low = calculateFinalTrendScore(1000, 50);
    const high = calculateFinalTrendScore(10_000_000, 50);
    expect(high).toBeGreaterThan(low);
  });

  it('returns higher score for higher engagement quality', () => {
    const low = calculateFinalTrendScore(1_000_000, 5);
    const high = calculateFinalTrendScore(1_000_000, 80);
    expect(high).toBeGreaterThan(low);
  });

  it('volume score is capped at 100 (normalized - fixed bug)', () => {
    // 1B likes: log10(1B)=9, 9*11.11=99.99 → ~100
    const score = calculateFinalTrendScore(1_000_000_000, 0);
    expect(score).toBeLessThanOrEqual(100); // 100 * 0.4 + 0 * 0.6 = 40
    expect(score).toBeGreaterThan(35); // should still have volume contribution
  });

  it('returns 4dp precision', () => {
    const score = calculateFinalTrendScore(500000, 45);
    expect(score.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });

  it('gives sensible range for a typical viral post', () => {
    // 1M likes, decent engagement after some decay
    const score = calculateFinalTrendScore(1_000_000, 20);
    expect(score).toBeGreaterThan(10);
    expect(score).toBeLessThan(100);
  });
});
