import type { Experience } from '@/core/domains/experience/Experience';
import type { ClusterType } from './Cluster';

// 分類ルール (LLMに依存しない domain logic)
// LLM fallback 時に使用するヒューリスティック
export class ClusterClassifier {
  heuristicClassify(experience: Experience): ClusterType | null {
    const desc = experience.toData().description.toLowerCase();
    if (/先延ばし|できなかった|やろうとした|後回し/.test(desc)) return 'procrastination';
    if (/人付き合い|避けた|会いたくない|孤立/.test(desc)) return 'social_avoidance';
    if (/上司|怖い|緊張|評価|承認/.test(desc)) return 'authority_anxiety';
    if (/完璧|失敗が怖い|全か無か|やり直し/.test(desc)) return 'perfectionism';
    return null;
  }
}
