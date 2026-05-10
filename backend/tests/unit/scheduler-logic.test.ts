/**
 * Unit Tests: Scheduler Logic
 * Tests the quantum calculation and round-robin interval math in isolation.
 */
import { describe, it, expect } from 'vitest';

// ── Quantum calculation (extracted from scheduler.ts) ─────────────────────────

function calculateQuantum(slug: string, configuredInterval: number, numAccounts: number): number {
  if (slug === 'linkedin') {
    return configuredInterval; // LinkedIn always uses configured interval
  }
  if (numAccounts > 0) {
    return Math.max(Math.floor(15 / numAccounts), 2);
  }
  return configuredInterval; // fallback to configured
}

// ── Velocity breakout logic ───────────────────────────────────────────────────

function isBreakout(velocity: number, todayMentions: number, yesterdayMentions: number): boolean {
  return velocity >= 150
    && todayMentions >= 10
    && (todayMentions - yesterdayMentions) >= 5;
}

// ── Quantum calculation ────────────────────────────────────────────────────────

describe('Scheduler: Quantum Calculation', () => {
  it('LinkedIn always uses its configured interval regardless of accounts', () => {
    expect(calculateQuantum('linkedin', 30, 5)).toBe(30);
    expect(calculateQuantum('linkedin', 30, 0)).toBe(30);
  });

  it('Instagram with 1 account uses floor(15/1) = 15 min quantum', () => {
    expect(calculateQuantum('instagram', 15, 1)).toBe(15);
  });

  it('Instagram with 2 accounts uses floor(15/2) = 7 min quantum', () => {
    expect(calculateQuantum('instagram', 15, 2)).toBe(7);
  });

  it('Instagram with 10 accounts is floored to minimum 2 min quantum', () => {
    expect(calculateQuantum('instagram', 15, 10)).toBe(2);
  });

  it('YouTube with 0 accounts falls back to configured interval', () => {
    expect(calculateQuantum('youtube', 20, 0)).toBe(20);
  });

  it('quantum is always at least 2 minutes', () => {
    for (let accounts = 1; accounts <= 30; accounts++) {
      expect(calculateQuantum('instagram', 15, accounts)).toBeGreaterThanOrEqual(2);
    }
  });
});

// ── Breakout Detection (tuned thresholds) ─────────────────────────────────────

describe('Scheduler: Breakout Detection Logic (tuned thresholds)', () => {
  it('declares breakout for >150% growth with 10+ mentions and 5+ delta', () => {
    expect(isBreakout(200, 15, 8)).toBe(true);  // 200% growth, 15 today, 8 yesterday → delta 7
    expect(isBreakout(1000, 10, 0)).toBe(true);  // new tag with 10 mentions
  });

  it('does NOT declare breakout for velocity < 150', () => {
    expect(isBreakout(100, 15, 8)).toBe(false);  // only 100% growth
  });

  it('does NOT declare breakout for < 10 mentions today', () => {
    expect(isBreakout(500, 8, 0)).toBe(false);   // 8 mentions < 10 minimum
  });

  it('does NOT declare breakout for delta < 5 (slow grower)', () => {
    // 100 today vs 97 yesterday = 3.09% growth but only +3 delta
    expect(isBreakout(3.09, 100, 97)).toBe(false);  // fails velocity 150 threshold too
    // Check: high velocity, enough mentions, but small delta
    expect(isBreakout(200, 12, 10)).toBe(false);  // delta = 2 < 5
  });

  it('handles brand-new tags with exactly 10 mentions as breakout', () => {
    // velocity = 1000 (new tag), today = 10, yesterday = 0, delta = 10
    expect(isBreakout(1000, 10, 0)).toBe(true);
  });

  it('does NOT declare breakout for brand-new tag with only 9 mentions', () => {
    expect(isBreakout(1000, 9, 0)).toBe(false);
  });
});
