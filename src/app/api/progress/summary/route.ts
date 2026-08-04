import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError, error } from '@/lib/response';

function getDaysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'week';

    const days = period === 'month' ? 30 : 7;
    const startDate = getDaysAgoStr(days);

    // Get food log aggregates
    const foodLogStats = await db.foodLog.findMany({
      where: {
        userId: session.userId,
        logDate: { gte: startDate },
      },
      select: {
        logDate: true,
        totalCalories: true,
        totalProtein: true,
        totalCarbs: true,
        totalFat: true,
      },
      orderBy: { logDate: 'asc' },
    });

    // Get daily nutrition for target comparison
    const dailyNutritions = await db.dailyNutrition.findMany({
      where: {
        userId: session.userId,
        date: { gte: startDate },
      },
    });

    // Calculate averages
    const totalDays = foodLogStats.length || 1;
    const avgCalories = foodLogStats.reduce((sum, d) => sum + (d.totalCalories || 0), 0) / totalDays;
    const avgProtein = foodLogStats.reduce((sum, d) => sum + (d.totalProtein || 0), 0) / totalDays;
    const avgCarbs = foodLogStats.reduce((sum, d) => sum + (d.totalCarbs || 0), 0) / totalDays;
    const avgFat = foodLogStats.reduce((sum, d) => sum + (d.totalFat || 0), 0) / totalDays;

    // Days on target (within 10% of calorie target)
    let daysOnTarget = 0;
    for (const dn of dailyNutritions) {
      const log = foodLogStats.find((l) => l.logDate === dn.date);
      const consumed = log?.totalCalories || 0;
      const target = dn.targetCalories;
      if (target > 0 && consumed >= target * 0.9 && consumed <= target * 1.1) {
        daysOnTarget++;
      }
    }

    // Total food log items count
    const totalItems = await db.foodLogItem.count({
      where: {
        foodLog: {
          userId: session.userId,
          logDate: { gte: startDate },
        },
      },
    });

    // Weight log data
    const weightLogs = await db.weightLog.findMany({
      where: {
        userId: session.userId,
        logDate: { gte: startDate },
      },
      orderBy: { logDate: 'desc' },
      take: 2,
    });

    const currentWeight = weightLogs[0]?.weightKg || null;
    const previousWeight = weightLogs[1]?.weightKg || null;
    const weightChange =
      currentWeight && previousWeight
        ? Math.round((currentWeight - previousWeight) * 10) / 10
        : null;

    // Water average
    const waterLogs = await db.waterLog.findMany({
      where: {
        userId: session.userId,
        logDate: { gte: startDate },
      },
    });
    const avgWater =
      waterLogs.length > 0
        ? waterLogs.reduce((sum, w) => sum + w.glassesConsumed, 0) / waterLogs.length
        : 0;

    return success({
      period,
      days,
      summary: {
        totalDays: foodLogStats.length,
        totalItems,
        avgCalories: Math.round(avgCalories),
        avgProtein: Math.round(avgProtein),
        avgCarbs: Math.round(avgCarbs),
        avgFat: Math.round(avgFat),
        daysOnTarget,
        adherencePct:
          dailyNutritions.length > 0
            ? Math.round((daysOnTarget / dailyNutritions.length) * 100)
            : 0,
        currentWeight,
        weightChange,
        avgWaterGlasses: Math.round(avgWater * 10) / 10,
      },
    });
  } catch (err) {
    console.error('Progress summary error:', err);
    return serverError();
  }
}
