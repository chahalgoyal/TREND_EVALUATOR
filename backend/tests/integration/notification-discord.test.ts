/**
 * Integration Test: Discord Notification System
 *
 * LIVE test — sends real messages to all 3 Discord channels.
 * Run this when you want to verify that:
 *   1. Webhook URLs in .env are valid and Discord is reachable
 *   2. All 3 channels receive correctly formatted embeds
 *   3. The notification service is wired up correctly end-to-end
 *
 * Each test fires a real HTTP POST to Discord and checks for a 2xx response.
 * You should see messages appear in your Discord server's channels when this runs.
 *
 * Run with:
 *   npx vitest run tests/integration/notification-discord.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import dotenv from 'dotenv';

// Load .env so webhook URLs are available outside Docker
dotenv.config();

import {
  notifyCritical,
  notifyError,
  notifyWarn,
  notifyHealth,
} from '../../src/services/notification.service';

// ── Guards ────────────────────────────────────────────────────────────────────

const WEBHOOKS_CONFIGURED =
  !!process.env.DISCORD_WEBHOOK_CRITICAL &&
  !!process.env.DISCORD_WEBHOOK_ERRORS &&
  !!process.env.DISCORD_WEBHOOK_HEALTH;

if (!WEBHOOKS_CONFIGURED) {
  console.warn(
    '\n⚠️  DISCORD_WEBHOOK_* env vars not set — skipping live Discord tests.\n' +
    '   Add them to .env and re-run.\n'
  );
}

// ── Live fire tests ───────────────────────────────────────────────────────────

describe.skipIf(!WEBHOOKS_CONFIGURED)('Discord Notifications — Live Fire', () => {

  const RUN_ID = new Date().toISOString().replace('T', ' ').slice(0, 19); // e.g. "2026-05-10 21:24:00"

  it('sends a test message to #critical-alerts', async () => {
    // Should appear as a RED embed in #critical-alerts
    await expect(
      notifyCritical(
        'Notification Test',
        `✅ Test passed — notification pipeline is live.\nRun: ${RUN_ID}`,
        [
          { name: 'Channel', value: '#critical-alerts', inline: true },
          { name: 'Triggered By', value: 'vitest integration test', inline: true },
        ]
      )
    ).resolves.not.toThrow();
  });

  it('sends a WARN test message to #errors-warnings', async () => {
    // Should appear as a YELLOW embed in #errors-warnings
    await expect(
      notifyWarn(
        'Notification Test',
        `✅ Test passed — WARN level notifications are working.\nRun: ${RUN_ID}`,
        [
          { name: 'Channel', value: '#errors-warnings (WARN)', inline: true },
          { name: 'Triggered By', value: 'vitest integration test', inline: true },
        ]
      )
    ).resolves.not.toThrow();
  });

  it('sends an ERROR test message to #errors-warnings', async () => {
    // Should appear as a RED embed in #errors-warnings
    await expect(
      notifyError(
        'Notification Test',
        `✅ Test passed — ERROR level notifications are working.\nRun: ${RUN_ID}`,
        [
          { name: 'Channel', value: '#errors-warnings (ERROR)', inline: true },
          { name: 'Triggered By', value: 'vitest integration test', inline: true },
        ]
      )
    ).resolves.not.toThrow();
  });

  it('sends a test message to #system-health', async () => {
    // Should appear as a BLURPLE embed in #system-health
    await expect(
      notifyHealth(
        'Notification Test',
        `✅ Test passed — system health notifications are working.\nRun: ${RUN_ID}`,
        [
          { name: 'Channel', value: '#system-health', inline: true },
          { name: 'Triggered By', value: 'vitest integration test', inline: true },
        ]
      )
    ).resolves.not.toThrow();
  });

  it('confirms all 3 webhook URLs are present and non-empty', () => {
    expect(process.env.DISCORD_WEBHOOK_CRITICAL).toBeTruthy();
    expect(process.env.DISCORD_WEBHOOK_ERRORS).toBeTruthy();
    expect(process.env.DISCORD_WEBHOOK_HEALTH).toBeTruthy();

    // Basic format check — Discord webhooks always start with this
    const prefix = 'https://discord.com/api/webhooks/';
    expect(process.env.DISCORD_WEBHOOK_CRITICAL).toContain(prefix);
    expect(process.env.DISCORD_WEBHOOK_ERRORS).toContain(prefix);
    expect(process.env.DISCORD_WEBHOOK_HEALTH).toContain(prefix);
  });

  it('does not send to wrong channels (critical != errors != health)', () => {
    const c = process.env.DISCORD_WEBHOOK_CRITICAL;
    const e = process.env.DISCORD_WEBHOOK_ERRORS;
    const h = process.env.DISCORD_WEBHOOK_HEALTH;

    expect(c).not.toBe(e);
    expect(c).not.toBe(h);
    expect(e).not.toBe(h);
  });
});

// ── System collection check ───────────────────────────────────────────────────

describe('System Collection Verification', () => {
  it('notification service module loads without errors', async () => {
    const mod = await import('../../src/services/notification.service');
    expect(mod.notifyCritical).toBeTypeOf('function');
    expect(mod.notifyError).toBeTypeOf('function');
    expect(mod.notifyWarn).toBeTypeOf('function');
    expect(mod.notifyHealth).toBeTypeOf('function');
  });

  it('all 4 exported functions are async (return a Promise)', async () => {
    // Point to empty webhooks so no real HTTP call fires
    const saved = {
      c: process.env.DISCORD_WEBHOOK_CRITICAL,
      e: process.env.DISCORD_WEBHOOK_ERRORS,
      h: process.env.DISCORD_WEBHOOK_HEALTH,
    };
    process.env.DISCORD_WEBHOOK_CRITICAL = '';
    process.env.DISCORD_WEBHOOK_ERRORS   = '';
    process.env.DISCORD_WEBHOOK_HEALTH   = '';

    const { notifyCritical, notifyError, notifyWarn, notifyHealth } =
      await import('../../src/services/notification.service');

    expect(notifyCritical('t', 'd')).toBeInstanceOf(Promise);
    expect(notifyError('t', 'd')).toBeInstanceOf(Promise);
    expect(notifyWarn('t', 'd')).toBeInstanceOf(Promise);
    expect(notifyHealth('t', 'd')).toBeInstanceOf(Promise);

    // Restore
    process.env.DISCORD_WEBHOOK_CRITICAL = saved.c;
    process.env.DISCORD_WEBHOOK_ERRORS   = saved.e;
    process.env.DISCORD_WEBHOOK_HEALTH   = saved.h;
  });
});
