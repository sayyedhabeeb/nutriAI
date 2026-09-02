// ═══ Hydration Summary Service ═══
// Fetches today's water log and computes the hydration goal/status summary.
// Fully independent of the meal nutrition flow.

import { db } from '@/lib/db';
import {
  computeHydrationTarget,
  getTodayStr,
} from '@/lib/hydration';

export interface HydrationSummary {
  glassesConsumed: number;
  targetGlasses: number;
  mlConsumed: number;
  targetMl: number;
  percentage: number;
  status: 'under' | 'on-track' | 'well-hydrated' | 'none';
}

export async function getHydrationSummary(userId: string): Promise<HydrationSummary> {
  const today = getTodayStr();

  const [waterLog, user] = await Promise.all([
    db.waterLog.findUnique({
      where: { userId_logDate: { userId, logDate: today } },
    }),
    db.user.findUnique({
      where: { id: userId },
      include: { profile: true, goal: true, preference: true },
    }),
  ]);

  const glasses = waterLog?.glassesConsumed ?? 0;

  const target = (user?.preference as { targetGlasses?: number } | null)?.targetGlasses ?? undefined;

  const baseProfile = user?.profile || user?.goal
    ? {
        weightKg: user?.profile?.weightKg ?? 0,
        activityLevel: user?.goal?.activityLevel ?? 'sedentary',
        goalType: user?.goal?.goalType ?? null,
      }
    : null;

  const targetCalc = computeHydrationTarget(
    baseProfile,
    target
  );

  const percentage = targetCalc.targetGlasses > 0
    ? Math.round((glasses / targetCalc.targetGlasses) * 100)
    : 0;
  const status: HydrationSummary['status'] =
    glasses <= 0
      ? 'none'
      : percentage >= 100
        ? 'well-hydrated'
        : percentage >= 80
          ? 'on-track'
          : 'under';

  return {
    glassesConsumed: glasses,
    targetGlasses: targetCalc.targetGlasses,
    mlConsumed: glasses * 250,
    targetMl: targetCalc.targetMl,
    percentage,
    status,
  };
}
