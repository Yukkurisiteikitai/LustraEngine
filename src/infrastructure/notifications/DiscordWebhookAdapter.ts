import type { INotificationPort, DbLimitAlert } from '@/core/ports/INotificationPort';
import { InfrastructureError } from '@/core/errors/InfrastructureError';
import { logger } from '@/infrastructure/observability/logger';

const FREE_TIER_LIMIT_MB = 500;
const EMBED_COLORS = { warn: 0xffa500, critical: 0xff0000 } as const;

export class DiscordWebhookAdapter implements INotificationPort {
  constructor(private readonly webhookUrl: string) {}

  async sendDbLimitAlert(alert: DbLimitAlert): Promise<void> {
    const usagePct = ((alert.totalDbSizeMb / FREE_TIER_LIMIT_MB) * 100).toFixed(1);
    const topTables = alert.tableSizes
      .slice(0, 5)
      .map((t) => `\`${t.tableName}\`: ${t.sizeMb} MB`)
      .join('\n');

    const title =
      alert.severity === 'critical'
        ? '[CRITICAL] Supabase DB Size Limit'
        : '[WARNING] Supabase DB Size Limit';

    const payload = {
      embeds: [
        {
          title,
          color: EMBED_COLORS[alert.severity],
          fields: [
            {
              name: 'Current Size',
              value: `${alert.totalDbSizeMb} MB (${usagePct}% of ${FREE_TIER_LIMIT_MB} MB free tier)`,
              inline: false,
            },
            {
              name: 'Threshold Triggered',
              value: `${alert.thresholdMb} MB (${alert.severity})`,
              inline: false,
            },
            {
              name: 'Largest Tables (top 5)',
              value: topTables || 'No table data',
              inline: false,
            },
          ],
          footer: { text: 'YourselfLM / RecEngine monitoring' },
          timestamp: alert.checkedAt,
        },
      ],
    };

    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error('monitoring:discord_webhook_failed', {
        status: res.status,
        body,
        severity: alert.severity,
      });
      throw new InfrastructureError(`Discord webhook failed: ${res.status} ${body}`);
    }

    logger.info('monitoring:discord_alert_sent', {
      severity: alert.severity,
      totalDbSizeMb: alert.totalDbSizeMb,
    });
  }
}
