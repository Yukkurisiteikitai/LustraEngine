import type { IMonitoringRepository, DbStats } from '@/core/ports/IMonitoringRepository';
import type { INotificationPort, DbLimitAlert } from '@/core/ports/INotificationPort';

export interface DbLimitThresholds {
  warnMb: number;
  criticalMb: number;
}

export type CheckDbLimitsResult =
  | { status: 'ok'; stats: DbStats }
  | { status: 'warn'; stats: DbStats; alert: DbLimitAlert }
  | { status: 'critical'; stats: DbStats; alert: DbLimitAlert };

export class CheckDbLimitsUseCase {
  constructor(
    private readonly monitoringRepo: IMonitoringRepository,
    private readonly notification: INotificationPort,
    private readonly thresholds: DbLimitThresholds,
  ) {}

  async execute(): Promise<CheckDbLimitsResult> {
    const stats = await this.monitoringRepo.getDbStats();
    const { totalDbSizeMb } = stats;

    if (totalDbSizeMb >= this.thresholds.criticalMb) {
      const alert: DbLimitAlert = {
        severity: 'critical',
        totalDbSizeMb,
        thresholdMb: this.thresholds.criticalMb,
        tableSizes: stats.tableSizes,
        checkedAt: stats.checkedAt,
      };
      await this.notification.sendDbLimitAlert(alert);
      return { status: 'critical', stats, alert };
    }

    if (totalDbSizeMb >= this.thresholds.warnMb) {
      const alert: DbLimitAlert = {
        severity: 'warn',
        totalDbSizeMb,
        thresholdMb: this.thresholds.warnMb,
        tableSizes: stats.tableSizes,
        checkedAt: stats.checkedAt,
      };
      await this.notification.sendDbLimitAlert(alert);
      return { status: 'warn', stats, alert };
    }

    return { status: 'ok', stats };
  }
}
