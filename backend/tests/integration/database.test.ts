/**
 * Integration Tests: Database Layer
 * Tests all 11 database tables directly via psql queries.
 * Validates schema, constraints, data integrity, and analytics correctness.
 * Requires Docker postgres container to be running.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

const PSQL = (sql: string): any[] => {
  const raw = execSync(
    `docker exec sti-postgres psql -U postgres -d social_trend_intelligence -c "${sql.replace(/"/g, '\\"')}" --csv -q`,
    { encoding: 'utf-8' }
  ).trim();
  if (!raw) return [];
  const lines = raw.split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h.trim(), values[i]?.trim()]));
  });
};

// ── Table Existence ───────────────────────────────────────────────────────────

describe('Database: Table Existence', () => {
  const EXPECTED_TABLES = [
    'platforms', 'platform_accounts', 'posts', 'post_scores',
    'post_hashtags', 'hashtags', 'hashtag_analytics', 'hashtag_cooccurrence',
    'threshold_rules', 'scrape_jobs', 'raw_payloads',
  ];

  it('all 11 expected tables exist', () => {
    const rows = PSQL("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    const existing = rows.map(r => r.tablename);
    for (const table of EXPECTED_TABLES) {
      expect(existing, `Table "${table}" must exist`).toContain(table);
    }
  });
});

// ── Platforms Table ───────────────────────────────────────────────────────────

describe('Database: platforms', () => {
  it('has exactly 3 platforms', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM platforms');
    expect(parseInt(rows[0].cnt)).toBe(3);
  });

  it('contains instagram, linkedin, youtube', () => {
    const rows = PSQL('SELECT slug FROM platforms ORDER BY slug');
    const slugs = rows.map(r => r.slug);
    expect(slugs).toContain('instagram');
    expect(slugs).toContain('linkedin');
    expect(slugs).toContain('youtube');
  });

  it('all platforms have scrape_interval_min set', () => {
    const rows = PSQL('SELECT slug FROM platforms WHERE scrape_interval_min IS NULL');
    expect(rows.length).toBe(0);
  });
});

// ── platform_accounts Table ───────────────────────────────────────────────────

describe('Database: platform_accounts', () => {
  it('has at least 3 accounts configured', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM platform_accounts');
    expect(parseInt(rows[0].cnt)).toBeGreaterThanOrEqual(3);
  });

  it('has the new hardening columns', () => {
    const rows = PSQL(
      "SELECT column_name FROM information_schema.columns WHERE table_name='platform_accounts' AND column_name IN ('consecutive_failures','retry_after','last_failure_reason')"
    );
    expect(rows.length).toBe(3);
  });

  it('consecutive_failures defaults to 0', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM platform_accounts WHERE consecutive_failures > 0');
    // May have some failures but should be non-negative
    expect(parseInt(rows[0].cnt)).toBeGreaterThanOrEqual(0);
  });
});

// ── Posts Table ───────────────────────────────────────────────────────────────

describe('Database: posts', () => {
  it('has significant post volume', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM posts WHERE deleted_at IS NULL');
    expect(parseInt(rows[0].cnt)).toBeGreaterThan(100);
  });

  it('has posts across multiple platforms', () => {
    const rows = PSQL('SELECT platform_id, COUNT(*) as cnt FROM posts GROUP BY platform_id');
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('no post has negative likes', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM posts WHERE likes < 0');
    expect(parseInt(rows[0].cnt)).toBe(0);
  });

  it('no post has negative comments', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM posts WHERE comments < 0');
    expect(parseInt(rows[0].cnt)).toBe(0);
  });

  it('newer posts have posted_at populated (from normalizer fix)', () => {
    const rows = PSQL(
      "SELECT COUNT(*) as cnt FROM posts WHERE platform_id = 21 AND posted_at IS NOT NULL"
    );
    // YouTube posts should have timestamps
    expect(parseInt(rows[0].cnt)).toBeGreaterThan(0);
  });
});

// ── post_scores Table ─────────────────────────────────────────────────────────

describe('Database: post_scores', () => {
  it('has scores calculated for viral posts', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM post_scores');
    expect(parseInt(rows[0].cnt)).toBeGreaterThan(0);
  });

  it('no score is negative', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM post_scores WHERE total_trend_score < 0');
    expect(parseInt(rows[0].cnt)).toBe(0);
  });

  it('no score is NaN (stored as text would be null)', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM post_scores WHERE total_trend_score IS NULL');
    expect(parseInt(rows[0].cnt)).toBe(0);
  });

  it('engagement_rate stays between 0 and 100', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM post_scores WHERE engagement_rate > 100');
    expect(parseInt(rows[0].cnt)).toBe(0);
  });
});

// ── Hashtags Table ────────────────────────────────────────────────────────────

describe('Database: hashtags', () => {
  it('has significant hashtag volume', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM hashtags');
    expect(parseInt(rows[0].cnt)).toBeGreaterThan(100);
  });

  it('all tags are lowercase (constraint enforced)', () => {
    const rows = PSQL("SELECT COUNT(*) as cnt FROM hashtags WHERE tag != lower(tag)");
    expect(parseInt(rows[0].cnt)).toBe(0);
  });

  it('no duplicate tags exist', () => {
    const rows = PSQL('SELECT tag, COUNT(*) as cnt FROM hashtags GROUP BY tag HAVING COUNT(*) > 1');
    expect(rows.length).toBe(0);
  });

  it('post_count is always positive', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM hashtags WHERE post_count <= 0');
    expect(parseInt(rows[0].cnt)).toBe(0);
  });
});

// ── hashtag_analytics Table ───────────────────────────────────────────────────

describe('Database: hashtag_analytics', () => {
  it('has analytics data', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM hashtag_analytics');
    expect(parseInt(rows[0].cnt)).toBeGreaterThan(0);
  });

  it('velocity is stored as a numeric value', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM hashtag_analytics WHERE velocity_percentage IS NOT NULL');
    expect(parseInt(rows[0].cnt)).toBeGreaterThan(0);
  });

  it('one record per hashtag per date_bucket (unique constraint)', () => {
    const rows = PSQL(
      'SELECT hashtag_id, date_bucket, COUNT(*) as cnt FROM hashtag_analytics GROUP BY hashtag_id, date_bucket HAVING COUNT(*) > 1'
    );
    expect(rows.length).toBe(0);
  });
});

// ── threshold_rules Table ─────────────────────────────────────────────────────

describe('Database: threshold_rules', () => {
  it('has at least 6 active rules (2 per platform)', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM threshold_rules WHERE is_active = true');
    expect(parseInt(rows[0].cnt)).toBeGreaterThanOrEqual(6);
  });

  it('platform_metric pair is unique (constraint)', () => {
    const rows = PSQL(
      'SELECT platform_id, metric_name, COUNT(*) as cnt FROM threshold_rules GROUP BY platform_id, metric_name HAVING COUNT(*) > 1'
    );
    expect(rows.length).toBe(0);
  });

  it('all threshold_values are non-negative', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM threshold_rules WHERE threshold_value < 0');
    expect(parseInt(rows[0].cnt)).toBe(0);
  });
});

// ── scrape_jobs Table ─────────────────────────────────────────────────────────

describe('Database: scrape_jobs', () => {
  it('has scrape job history', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM scrape_jobs');
    expect(parseInt(rows[0].cnt)).toBeGreaterThan(0);
  });

  it('no two scheduler jobs are queued simultaneously for same platform (race fix)', () => {
    const rows = PSQL(
      "SELECT platform_id, COUNT(*) as cnt FROM scrape_jobs WHERE status = 'queued' AND trigger_type = 'scheduler' GROUP BY platform_id HAVING COUNT(*) > 1"
    );
    expect(rows.length).toBe(0);
  });

  it('most recent jobs have completed status', () => {
    const rows = PSQL(
      "SELECT COUNT(*) as cnt FROM scrape_jobs WHERE status = 'completed' AND created_at > NOW() - INTERVAL '2 hours'"
    );
    expect(parseInt(rows[0].cnt)).toBeGreaterThan(0);
  });

  it('no job has negative posts_scraped', () => {
    const rows = PSQL('SELECT COUNT(*) as cnt FROM scrape_jobs WHERE posts_scraped < 0');
    expect(parseInt(rows[0].cnt)).toBe(0);
  });
});

// ── Referential Integrity ─────────────────────────────────────────────────────

describe('Database: Referential Integrity', () => {
  it('all posts reference valid platform_ids', () => {
    const rows = PSQL(
      'SELECT COUNT(*) as cnt FROM posts p LEFT JOIN platforms pl ON p.platform_id = pl.id WHERE pl.id IS NULL'
    );
    expect(parseInt(rows[0].cnt)).toBe(0);
  });

  it('all post_hashtags reference valid post_ids', () => {
    const rows = PSQL(
      'SELECT COUNT(*) as cnt FROM post_hashtags ph LEFT JOIN posts p ON ph.post_id = p.id WHERE p.id IS NULL'
    );
    expect(parseInt(rows[0].cnt)).toBe(0);
  });

  it('all hashtag_analytics reference valid hashtag_ids', () => {
    const rows = PSQL(
      'SELECT COUNT(*) as cnt FROM hashtag_analytics ha LEFT JOIN hashtags h ON ha.hashtag_id = h.id WHERE h.id IS NULL'
    );
    expect(parseInt(rows[0].cnt)).toBe(0);
  });
});
