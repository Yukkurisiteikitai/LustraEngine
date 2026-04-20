import { createRepositories } from '@/container/createRepositories';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import BigFiveRadarChart from '@/components/BigFiveRadarChart';
import AttachmentStyleCard from '@/components/AttachmentStyleCard';
import IdentityExplorationCard from '@/components/IdentityExplorationCard';

interface Props {
  userId: string;
}

export default async function PsychologySection({ userId }: Props) {
  const supabase = await createSupabaseServerClient();
  const { psychology } = createRepositories(supabase);

  const [bigFive, attachment, identity] = await Promise.all([
    psychology.getBigFiveScore(userId),
    psychology.getAttachmentProfile(userId),
    psychology.getIdentityStatus(userId),
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h3 style={{ marginBottom: '0.75rem', fontWeight: 600 }}>Big Five パーソナリティ傾向</h3>
        {bigFive ? (
          <BigFiveRadarChart score={bigFive} />
        ) : (
          <p style={{ color: '#6b7280' }}>データ収集中...</p>
        )}
      </div>

      <div>
        <h3 style={{ marginBottom: '0.75rem', fontWeight: 600 }}>愛着スタイルの傾向</h3>
        {attachment ? (
          <AttachmentStyleCard profile={attachment} />
        ) : (
          <p style={{ color: '#6b7280' }}>まだ分析中...</p>
        )}
      </div>

      <div>
        <h3 style={{ marginBottom: '0.75rem', fontWeight: 600 }}>アイデンティティの探索</h3>
        <IdentityExplorationCard records={identity} />
      </div>
    </div>
  );
}
