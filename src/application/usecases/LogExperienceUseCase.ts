import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { IUserRepository } from '@/core/domains/user/IUserRepository';
import type { CreateExperienceDTO } from '@/application/dto/ExperienceDTO';

export interface UserMeta {
  displayName: string | null;
}

export class LogExperienceUseCase {
  constructor(
    private readonly expRepo: IExperienceRepository,
    private readonly userRepo: IUserRepository,
  ) {}

  async execute(
    userId: string,
    user: UserMeta,
    dto: CreateExperienceDTO[],
    date: string,
  ) {
    await this.userRepo.ensureProfile(userId, user.displayName);
    const domainMap = await this.userRepo.ensureDefaultDomains(userId);
    const saved = await this.expRepo.save(userId, dto, date, domainMap);

    return { savedIds: saved.map((e) => e.id) };
  }
}
