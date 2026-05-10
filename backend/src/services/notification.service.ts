import { logger } from '../shared/logger';

// ── Types ──────────────────────────────────────────────────────────────────────

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: EmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

// ── Webhook URLs (from environment) ───────────────────────────────────────────

function getWebhooks() {
  return {
    critical: process.env.DISCORD_WEBHOOK_CRITICAL ?? '',
    errors:   process.env.DISCORD_WEBHOOK_ERRORS   ?? '',
    health:   process.env.DISCORD_WEBHOOK_HEALTH   ?? '',
  };
}

// ── Internal sender ───────────────────────────────────────────────────────────

async function sendEmbed(webhookUrl: string, embed: DiscordEmbed): Promise<void> {
  if (!webhookUrl) return; // silently skip if not configured

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          ...embed,
          timestamp: embed.timestamp ?? new Date().toISOString(),
          footer: embed.footer ?? { text: 'STI Backend' },
        }],
      }),
    });

    if (!res.ok) {
      // Log but never throw — notification failure must never crash the pipeline
      logger.warn(
        { status: res.status, body: await res.text().catch(() => '') },
        'Discord notification: webhook returned non-2xx'
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Discord notification: fetch failed');
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** 
 * #critical-alerts — system cannot continue, manual action required.
 * Color: Discord red.
 */
export async function notifyCritical(
  title: string,
  description: string,
  fields?: EmbedField[]
): Promise<void> {
  await sendEmbed(getWebhooks().critical, {
    title: `🔴 CRITICAL — ${title}`,
    description,
    color: 0xED4245,
    fields,
  });
}

/** 
 * #errors-warnings — recoverable ERROR level event.
 * Color: red-orange.
 */
export async function notifyError(
  title: string,
  description: string,
  fields?: EmbedField[]
): Promise<void> {
  await sendEmbed(getWebhooks().errors, {
    title: `🔴 ERROR — ${title}`,
    description,
    color: 0xE24B4B,
    fields,
  });
}

/** 
 * #errors-warnings — recoverable WARN level event.
 * Color: yellow.
 */
export async function notifyWarn(
  title: string,
  description: string,
  fields?: EmbedField[]
): Promise<void> {
  await sendEmbed(getWebhooks().errors, {
    title: `🟡 WARN — ${title}`,
    description,
    color: 0xFEE75C,
    fields,
  });
}

/** 
 * #system-health — notable/anomalous system state (NOT sent on healthy cycles).
 * Color: Discord blurple.
 */
export async function notifyHealth(
  title: string,
  description: string,
  fields?: EmbedField[]
): Promise<void> {
  await sendEmbed(getWebhooks().health, {
    title: `🔵 HEALTH — ${title}`,
    description,
    color: 0x5865F2,
    fields,
  });
}
