import type { ClusterAssignment } from '@/types';

// CQRS: write only — atomic RPC
export interface IClusterCommandRepository {
  classifyExperienceAtomic(
    userId: string,
    experienceId: string,
    assignments: ClusterAssignment[],
  ): Promise<void>;
}
