import type { TableSizeEntry } from './IMonitoringRepository';

export type AlertSeverity = 'warn' | 'critical';

export interface DbLimitAlert {
  severity: AlertSeverity;
  totalDbSizeMb: number;
  thresholdMb: number;
  tableSizes: TableSizeEntry[];
  checkedAt: string;
}

export interface INotificationPort {
  sendDbLimitAlert(alert: DbLimitAlert): Promise<void>;
}
