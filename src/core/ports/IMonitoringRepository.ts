export interface TableSizeEntry {
  tableName: string;
  sizeMb: number;
}

export interface DbStats {
  totalDbSizeMb: number;
  tableSizes: TableSizeEntry[];
  checkedAt: string;
}

export interface IMonitoringRepository {
  getDbStats(): Promise<DbStats>;
}
