/**
 * Unit Tests: Threshold Worker Business Logic
 * Tests the rule evaluation logic isolated from database and queue dependencies.
 */
import { describe, it, expect } from 'vitest';

// ── Pure rule evaluation (extracted from threshold.worker.ts) ─────────────────

type Operator = 'gte' | 'gt' | 'lte' | 'lt';

function evaluateRule(value: number, operator: Operator, threshold: number): boolean {
  switch (operator) {
    case 'gte': return value >= threshold;
    case 'gt':  return value > threshold;
    case 'lte': return value <= threshold;
    case 'lt':  return value < threshold;
    default:    return false;
  }
}

// Simulates the OR logic currently in place (user's intentional choice)
function evaluateThresholdOR(
  rules: Array<{ metric_name: string; operator: Operator; threshold_value: number }>,
  post: Record<string, number>
): boolean {
  if (rules.length === 0) return true;
  let passed = false;
  for (const rule of rules) {
    const val = post[rule.metric_name] ?? 0;
    if (evaluateRule(val, rule.operator, rule.threshold_value)) {
      passed = true;
    }
  }
  return passed;
}

// ── evaluateRule ──────────────────────────────────────────────────────────────

describe('evaluateRule: gte', () => {
  it('returns true when value >= threshold', () => {
    expect(evaluateRule(50000, 'gte', 50000)).toBe(true);
    expect(evaluateRule(100000, 'gte', 50000)).toBe(true);
  });

  it('returns false when value < threshold', () => {
    expect(evaluateRule(49999, 'gte', 50000)).toBe(false);
  });
});

describe('evaluateRule: gt', () => {
  it('returns true only when value > threshold (not equal)', () => {
    expect(evaluateRule(50001, 'gt', 50000)).toBe(true);
    expect(evaluateRule(50000, 'gt', 50000)).toBe(false);
  });
});

describe('evaluateRule: lte', () => {
  it('returns true when value <= threshold', () => {
    expect(evaluateRule(100, 'lte', 100)).toBe(true);
    expect(evaluateRule(99, 'lte', 100)).toBe(true);
    expect(evaluateRule(101, 'lte', 100)).toBe(false);
  });
});

describe('evaluateRule: lt', () => {
  it('returns true only when value < threshold (not equal)', () => {
    expect(evaluateRule(99, 'lt', 100)).toBe(true);
    expect(evaluateRule(100, 'lt', 100)).toBe(false);
  });
});

// ── OR Threshold Logic (current design) ──────────────────────────────────────

describe('Threshold OR Logic (current implementation)', () => {
  const instagramRules = [
    { metric_name: 'likes', operator: 'gte' as Operator, threshold_value: 50000 },
    { metric_name: 'comments', operator: 'gte' as Operator, threshold_value: 2500 },
  ];

  it('passes when only likes exceed threshold (OR logic)', () => {
    const post = { likes: 100000, comments: 100, views: 0 };
    expect(evaluateThresholdOR(instagramRules, post)).toBe(true);
  });

  it('passes when only comments exceed threshold (OR logic)', () => {
    const post = { likes: 100, comments: 5000, views: 0 };
    expect(evaluateThresholdOR(instagramRules, post)).toBe(true);
  });

  it('passes when both exceed threshold', () => {
    const post = { likes: 100000, comments: 5000, views: 0 };
    expect(evaluateThresholdOR(instagramRules, post)).toBe(true);
  });

  it('fails when neither exceeds threshold', () => {
    const post = { likes: 100, comments: 100, views: 0 };
    expect(evaluateThresholdOR(instagramRules, post)).toBe(false);
  });

  it('returns true for zero rules (all posts pass when no rules)', () => {
    expect(evaluateThresholdOR([], { likes: 0, comments: 0, views: 0 })).toBe(true);
  });

  it('youtube: passes on views threshold alone', () => {
    const ytRules = [
      { metric_name: 'views', operator: 'gte' as Operator, threshold_value: 100000 },
      { metric_name: 'likes', operator: 'gte' as Operator, threshold_value: 5000 },
    ];
    const post = { likes: 100, comments: 10, views: 1_000_000 };
    expect(evaluateThresholdOR(ytRules, post)).toBe(true);
  });
});
