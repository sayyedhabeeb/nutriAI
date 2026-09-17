import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { aiConcurrencyController } from '@/lib/ai/concurrency';
import { cleanTempUploads } from '@/lib/ai/cleanup';

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const setConcurrency = searchParams.get('setConcurrency');
    if (setConcurrency) {
      const n = Number.parseInt(setConcurrency, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 10) {
        aiConcurrencyController.setMaxConcurrency(n);
      }
    }

    const triggerCleanup = searchParams.get('cleanup') === 'true';
    let cleanupResult: { deleted: number; errors: number } | null = null;
    if (triggerCleanup) {
      cleanupResult = await cleanTempUploads();
    }

    const telemetry = aiConcurrencyController.getTelemetry();

    // Query recent AI logs (last 1 hour)
    const oneHourAgo = new Date(Date.now() - 3600_000);
    const recentLogs = await db.aiLog.findMany({
      where: { createdAt: { gte: oneHourAgo } },
      select: {
        id: true,
        modelType: true,
        latencyMs: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const latencies = recentLogs
      .map((l) => l.latencyMs)
      .filter((l): l is number => typeof l === 'number');

    const avgLatencyMs = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        concurrency: telemetry,
        metrics: {
          requestsLastHour: recentLogs.length,
          avgLatencyMs,
        },
        cleanupResult,
        recentLogs: recentLogs.slice(0, 10),
      },
    });
  } catch (err) {
    console.error('AI Health error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve AI health telemetry' },
      { status: 500 }
    );
  }
}
