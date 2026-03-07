export interface IUserRepository {
  ensureProfile(userId: string, displayName: string | null): Promise<void>;
  ensureDefaultDomains(userId: string): Promise<Map<string, string>>;
}
