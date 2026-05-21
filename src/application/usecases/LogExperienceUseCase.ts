import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { IUserRepository } from '@/core/domains/user/IUserRepository';
import type { CreateExperienceDTO } from '@/application/dto/ExperienceDTO';
import type { IUserSettingsRepository } from '@/core/domains/user-settings/IUserSettingsRepository';

export interface UserMeta {
  displayName: string | null;
}

export class LogExperienceUseCase {
  constructor(
    private readonly expRepo: IExperienceRepository,
    private readonly userRepo: IUserRepository,
    private readonly userSettingsRepo: IUserSettingsRepository,
  ) {}

  async execute(
    userId: string,
    user: UserMeta,
    dto: CreateExperienceDTO[],
    date: string,
  ) {
    await this.userRepo.ensureProfile(userId, user.displayName);
    const domainMap = await this.userRepo.ensureDefaultDomains(userId);
    const userSettings = await this.userSettingsRepo.ensureDefaultByUser(userId);
    const saved = await this.expRepo.save(
      userId,
      dto.map((input) => ({
        ...input,
        reportDifficulty: input.reportDifficulty ?? 3,
        careful: (input.reportDifficulty ?? 3) >= 4 ? true : (input.careful ?? false),
        visibility:
          (input.reportDifficulty ?? 3) >= 4
            ? 'private'
            : (input.visibility ?? userSettings.defaultEvidenceVisibility),
      })),
      date,
      domainMap,
    );

    return { savedIds: saved.map((e) => e.id) };
  }
}
