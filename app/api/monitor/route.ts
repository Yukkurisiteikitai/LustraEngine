import { NextResponse } from 'next/server';
import { createCheckDbLimitsUseCase } from '@/container/createUseCases';
import { handleError } from '@/lib/apiHelpers';
import { AuthError } from '@/core/errors/AuthError';
import { logger } from '@/infrastructure/observability/logger';

async function runMonitor(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  const secret = process.env.MONITOR_SECRET;

  if (!secret) {
    logger.error('monitor:missing_secret', { layer: 'MonitorRoute' });
    return NextResponse.json({ message: 'Server misconfigured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${secret}`) {
    throw new AuthError('Invalid monitor secret');
  }

  logger.info('monitor:check_started', { layer: 'MonitorRoute' });

  const useCase = createCheckDbLimitsUseCase();
  const result = await useCase.execute();

  logger.info('monitor:check_complete', {
    layer: 'MonitorRoute',
    status: result.status,
    totalDbSizeMb: result.stats.totalDbSizeMb,
  });

  return NextResponse.json({
    status: result.status,
    totalDbSizeMb: result.stats.totalDbSizeMb,
    tableSizes: result.stats.tableSizes,
    checkedAt: result.stats.checkedAt,
  });
}

export async function GET(req: Request) {
  try {
    return await runMonitor(req);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    return await runMonitor(req);
  } catch (err) {
    return handleError(err);
  }
}
