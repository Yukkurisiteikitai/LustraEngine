import type { IExperienceRepository } from '@/core/domains/experience/IExperienceRepository';
import type { IUserRepository } from '@/core/domains/user/IUserRepository';
import type { IJobQueue } from '@/application/jobs/IJobQueue';
import { DETECT_PATTERNS_JOB } from '@/application/jobs/DetectPatternsJob';
import type { CreateExperienceDTO } from '@/application/dto/ExperienceDTO';
import type { LMConfig } from '@/types';

export interface UserMeta {
  displayName: string | null;
}

export class LogExperienceUseCase {
  constructor(
    private readonly expRepo: IExperienceRepository,
    private readonly userRepo: IUserRepository,
    private readonly jobQueue: IJobQueue,
  ) {}

  async execute(
    userId: string,
    user: UserMeta,
    dto: CreateExperienceDTO[],
    date: string,
    lmConfig: LMConfig | undefined,
  ) {
    await this.userRepo.ensureProfile(userId, user.displayName);
    const domainMap = await this.userRepo.ensureDefaultDomains(userId);
    const saved = await this.expRepo.save(userId, dto, date, domainMap);

    // 非同期 job enqueue (HTTP response を blocking しない)
    if (lmConfig) {
      await this.jobQueue.enqueue(DETECT_PATTERNS_JOB, { userId, lmConfig });
    }

    return { savedIds: saved.map((e) => e.id) };
  }
}
