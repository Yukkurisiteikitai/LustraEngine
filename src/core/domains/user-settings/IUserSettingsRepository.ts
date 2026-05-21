import type { UserSettingsData, UserSettingsUpdateInput } from './UserSettings';

export interface IUserSettingsRepository {
  getByUser(userId: string): Promise<UserSettingsData | null>;
  ensureDefaultByUser(userId: string): Promise<UserSettingsData>;
  updateByUser(userId: string, input: UserSettingsUpdateInput): Promise<UserSettingsData>;
}
