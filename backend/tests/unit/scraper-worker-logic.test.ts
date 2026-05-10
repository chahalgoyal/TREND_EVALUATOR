import { describe, it, expect } from 'vitest';

// Emulating scraper's failure tracking logic for platform_accounts
function handleScrapeFailure(account: { consecutive_failures: number, is_active: boolean }): { updated_failures: number, next_active: boolean, retry_after_minutes: number } {
  const updated_failures = (account.consecutive_failures || 0) + 1;
  const next_active = updated_failures < 3; // Deactivate on 3rd failure
  const retry_after_minutes = next_active ? 60 : 0; // 1 hour cooldown if still active
  
  return { updated_failures, next_active, retry_after_minutes };
}

describe('Scraper Worker: Account Health Logic', () => {
  it('increments consecutive failures to 1 on first fail, stays active', () => {
    const acc = { consecutive_failures: 0, is_active: true };
    const res = handleScrapeFailure(acc);
    expect(res.updated_failures).toBe(1);
    expect(res.next_active).toBe(true);
    expect(res.retry_after_minutes).toBe(60);
  });

  it('increments consecutive failures to 2 on second fail, stays active', () => {
    const acc = { consecutive_failures: 1, is_active: true };
    const res = handleScrapeFailure(acc);
    expect(res.updated_failures).toBe(2);
    expect(res.next_active).toBe(true);
    expect(res.retry_after_minutes).toBe(60);
  });

  it('deactivates account on 3rd consecutive failure', () => {
    const acc = { consecutive_failures: 2, is_active: true };
    const res = handleScrapeFailure(acc);
    expect(res.updated_failures).toBe(3);
    expect(res.next_active).toBe(false);
  });

  it('handles null/undefined consecutive failures', () => {
    const acc = { consecutive_failures: undefined as any, is_active: true };
    const res = handleScrapeFailure(acc);
    expect(res.updated_failures).toBe(1);
    expect(res.next_active).toBe(true);
  });
});
