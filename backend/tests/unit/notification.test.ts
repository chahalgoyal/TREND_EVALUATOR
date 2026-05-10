/**
 * Unit Tests: Notification Service
 *
 * Tests the notification service logic with a mocked global fetch.
 * No real HTTP calls are made — verifies:
 *   - Each function routes to the correct webhook
 *   - Embed title prefixes are correct (🔴 CRITICAL, 🟡 WARN, etc.)
 *   - Embed colors are correct per channel
 *   - Empty webhook URL silently skips (no throw)
 *   - Discord non-2xx response does NOT throw
 *   - Fetch error does NOT throw (pipeline safety)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockFetch(status = 204, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: vi.fn().mockResolvedValue(''),
  });
}

/** Extract the embed sent to fetch from the mock's last call */
function captureEmbed(mockFetch: ReturnType<typeof vi.fn>) {
  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  return body.embeds[0] as {
    title: string;
    description: string;
    color: number;
    footer: { text: string };
    timestamp: string;
  };
}

/** Extract the webhook URL from the mock's last call */
function captureUrl(mockFetch: ReturnType<typeof vi.fn>): string {
  return mockFetch.mock.calls[0][0] as string;
}

// ── Test setup ────────────────────────────────────────────────────────────────

const WEBHOOK_CRITICAL = 'https://discord.com/api/webhooks/TEST_CRITICAL';
const WEBHOOK_ERRORS   = 'https://discord.com/api/webhooks/TEST_ERRORS';
const WEBHOOK_HEALTH   = 'https://discord.com/api/webhooks/TEST_HEALTH';

beforeEach(() => {
  process.env.DISCORD_WEBHOOK_CRITICAL = WEBHOOK_CRITICAL;
  process.env.DISCORD_WEBHOOK_ERRORS   = WEBHOOK_ERRORS;
  process.env.DISCORD_WEBHOOK_HEALTH   = WEBHOOK_HEALTH;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DISCORD_WEBHOOK_CRITICAL;
  delete process.env.DISCORD_WEBHOOK_ERRORS;
  delete process.env.DISCORD_WEBHOOK_HEALTH;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('notifyCritical', () => {
  it('sends to the CRITICAL webhook', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyCritical } = await import('../../src/services/notification.service');

    await notifyCritical('Browser Pool Failed', 'No browsers available.');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(captureUrl(mockFetch)).toBe(WEBHOOK_CRITICAL);
  });

  it('prefixes the title with 🔴 CRITICAL —', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyCritical } = await import('../../src/services/notification.service');

    await notifyCritical('DB Down', 'Connection refused.');

    expect(captureEmbed(mockFetch).title).toBe('🔴 CRITICAL — DB Down');
  });

  it('uses red color (0xED4245)', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyCritical } = await import('../../src/services/notification.service');

    await notifyCritical('Test', 'desc');

    expect(captureEmbed(mockFetch).color).toBe(0xED4245);
  });
});

describe('notifyError', () => {
  it('sends to the ERRORS webhook', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyError } = await import('../../src/services/notification.service');

    await notifyError('Threshold DB Error', 'ROLLBACK executed.');

    expect(captureUrl(mockFetch)).toBe(WEBHOOK_ERRORS);
  });

  it('prefixes the title with 🔴 ERROR —', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyError } = await import('../../src/services/notification.service');

    await notifyError('Parser Fatal', 'Retries exhausted.');

    expect(captureEmbed(mockFetch).title).toBe('🔴 ERROR — Parser Fatal');
  });
});

describe('notifyWarn', () => {
  it('sends to the ERRORS webhook (same channel as error, different color)', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyWarn } = await import('../../src/services/notification.service');

    await notifyWarn('Post Skip', 'Individual post page load failed.');

    expect(captureUrl(mockFetch)).toBe(WEBHOOK_ERRORS);
  });

  it('prefixes the title with 🟡 WARN —', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyWarn } = await import('../../src/services/notification.service');

    await notifyWarn('Test Warn', 'desc');

    expect(captureEmbed(mockFetch).title).toBe('🟡 WARN — Test Warn');
  });

  it('uses yellow color (0xFEE75C)', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyWarn } = await import('../../src/services/notification.service');

    await notifyWarn('Test', 'desc');

    expect(captureEmbed(mockFetch).color).toBe(0xFEE75C);
  });
});

describe('notifyHealth', () => {
  it('sends to the HEALTH webhook', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyHealth } = await import('../../src/services/notification.service');

    await notifyHealth('Zero Posts Extracted', 'Session may be invalid.');

    expect(captureUrl(mockFetch)).toBe(WEBHOOK_HEALTH);
  });

  it('prefixes the title with 🔵 HEALTH —', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyHealth } = await import('../../src/services/notification.service');

    await notifyHealth('Anomaly Detected', 'desc');

    expect(captureEmbed(mockFetch).title).toBe('🔵 HEALTH — Anomaly Detected');
  });

  it('uses Discord blurple color (0x5865F2)', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyHealth } = await import('../../src/services/notification.service');

    await notifyHealth('Test', 'desc');

    expect(captureEmbed(mockFetch).color).toBe(0x5865F2);
  });
});

describe('Pipeline safety (never throw)', () => {
  it('does NOT throw when webhook URL is empty', async () => {
    process.env.DISCORD_WEBHOOK_CRITICAL = '';
    vi.stubGlobal('fetch', vi.fn()); // should never be called
    const { notifyCritical } = await import('../../src/services/notification.service');

    await expect(notifyCritical('Test', 'desc')).resolves.not.toThrow();
  });

  it('does NOT throw when Discord returns a non-2xx status', async () => {
    const mockFetch = makeMockFetch(429, false); // 429 Too Many Requests
    vi.stubGlobal('fetch', mockFetch);
    const { notifyCritical } = await import('../../src/services/notification.service');

    await expect(notifyCritical('Test', 'desc')).resolves.not.toThrow();
  });

  it('does NOT throw when fetch itself rejects (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { notifyCritical } = await import('../../src/services/notification.service');

    await expect(notifyCritical('Test', 'desc')).resolves.not.toThrow();
  });
});

describe('Embed structure', () => {
  it('always attaches a timestamp', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyError } = await import('../../src/services/notification.service');

    await notifyError('Test', 'desc');

    const embed = captureEmbed(mockFetch);
    expect(embed.timestamp).toBeTruthy();
    expect(() => new Date(embed.timestamp)).not.toThrow();
  });

  it('always attaches the STI Backend footer', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyError } = await import('../../src/services/notification.service');

    await notifyError('Test', 'desc');

    expect(captureEmbed(mockFetch).footer.text).toBe('STI Backend');
  });

  it('passes the description through unchanged', async () => {
    const mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    const { notifyHealth } = await import('../../src/services/notification.service');
    const desc = 'Platform: instagram\nScrape cycle returned 0 posts.';

    await notifyHealth('Zero Yield', desc);

    expect(captureEmbed(mockFetch).description).toBe(desc);
  });
});
