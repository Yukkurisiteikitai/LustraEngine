import type { ClusterAssignment } from '@/types';

// CQRS: write only — atomic RPC
export interface IClusterCommandRepository {
  classifyExperienceAtomic(experienceId: string, assignments: ClusterAssignment[]): Promise<void>;
}
