import { NextResponse } from 'next/server';
import type { Domain, LogPayload, ObstacleInput } from '@/types';

type StoredLog = LogPayload & { id: string; savedAt: string };

const DOMAIN_SET = new Set<Domain>(['WORK', 'RELATIONSHIP', 'HEALTH', 'MONEY', 'SELF']);
const ACTION_SET = new Set(['AVOIDED', 'CONFRONTED']);

const inMemoryLogs: StoredLog[] = [
  {
    id: 'seed-1',
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    savedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    obstacles: [
      {
        description: '上司への相談を先延ばしにした',
        stressLevel: 4,
        domain: 'WORK',
        actionResult: 'AVOIDED',
      },
    ],
  },
  {
    id: 'seed-2',
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    savedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    obstacles: [
      {
        description: '家計の見直しを実施した',
        stressLevel: 3,
        domain: 'MONEY',
        actionResult: 'CONFRONTED',
      },
      {
        description: '運動習慣の再開を検討した',
        stressLevel: 2,
        domain: 'HEALTH',
        actionResult: 'CONFRONTED',
      },
    ],
  },
];

function waitRandomLatency() {
  const ms = 200 + Math.floor(Math.random() * 401);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidObstacle(obstacle: unknown): obstacle is ObstacleInput {
  if (typeof obstacle !== 'object' || obstacle === null) {
    return false;
  }

  const candidate = obstacle as Partial<ObstacleInput>;
  return (
    typeof candidate.description === 'string' &&
    candidate.description.trim().length > 0 &&
    typeof candidate.stressLevel === 'number' &&
    Number.isInteger(candidate.stressLevel) &&
    candidate.stressLevel >= 1 &&
    candidate.stressLevel <= 5 &&
    typeof candidate.domain === 'string' &&
    DOMAIN_SET.has(candidate.domain as Domain) &&
    typeof candidate.actionResult === 'string' &&
    ACTION_SET.has(candidate.actionResult)
  );
}

function calculateSummary(logs: StoredLog[]) {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);

  const recentLogs = logs.filter((log) => new Date(log.date) >= sevenDaysAgo);
  const recentObstacles = recentLogs.flatMap((log) => log.obstacles);
  const confrontedCount = recentObstacles.filter((o) => o.actionResult === 'CONFRONTED').length;

  const confrontationRate =
    recentObstacles.length > 0
      ? Math.round((confrontedCount / recentObstacles.length) * 100)
      : 0;

  const avgStress7Days =
    recentObstacles.length > 0
      ? Number(
          (
            recentObstacles.reduce((sum, obstacle) => sum + obstacle.stressLevel, 0) /
            recentObstacles.length
          ).toFixed(1),
        )
      : 0;

  const uniqueDates = Array.from(new Set(logs.map((log) => log.date))).sort((a, b) =>
    b.localeCompare(a),
  );

  let streakDays = 0;
  const current = new Date();

  while (true) {
    const dateKey = current.toISOString().slice(0, 10);
    if (!uniqueDates.includes(dateKey)) {
      break;
    }
    streakDays += 1;
    current.setDate(current.getDate() - 1);
  }

  return {
    confrontationRate,
    avgStress7Days,
    streakDays,
  };
}

export async function POST(request: Request) {
  await waitRandomLatency();

  let payload: LogPayload;
  try {
    payload = (await request.json()) as LogPayload;
  } catch {
    return NextResponse.json({ message: 'JSONの形式が不正です' }, { status: 400 });
  }

  if (
    !payload ||
    typeof payload.date !== 'string' ||
    !Array.isArray(payload.obstacles) ||
    payload.obstacles.length === 0
  ) {
    return NextResponse.json(
      { message: 'date と obstacles は必須です' },
      { status: 400 },
    );
  }

  if (!payload.obstacles.every(isValidObstacle)) {
    return NextResponse.json(
      {
        message:
          'obstacles の形式が不正です（description, stressLevel(1-5), domain, actionResult が必要）',
      },
      { status: 400 },
    );
  }

  const stored: StoredLog = {
    ...payload,
    id: `log-${Date.now()}`,
    savedAt: new Date().toISOString(),
  };

  inMemoryLogs.push(stored);

  const summary = calculateSummary(inMemoryLogs);

  return NextResponse.json({
    id: stored.id,
    savedAt: stored.savedAt,
    message: '記録を保存しました。今日の一歩が未来を変えます。',
    summary,
  });
}
