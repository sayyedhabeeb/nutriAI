import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/response';

function getDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    // Generate last 7 days
    const days = Array.from({ length: 7 }, (_, i) => getDateStr(6 - i));

    // Get food logs for last 7 days
    const foodLogs = await db.foodLog.findMany({
      where: {
        userId: session.userId,
        logDate: { in: days },
      },
    });

    // Get daily nutrition targets
    const dailyNutritions = await db.dailyNutrition.findMany({
      where: {
        userId: session.userId,
        date: { in: days },
      },
    });

    // Build chart data
    const chartData = days.map((date) => {
      const log = foodLogs.find((l) => l.logDate === date);
      const targets = dailyNutritions.find((d) => d.date === date);

      return {
        date,
        consumed: {
          calories: Math.round(log?.totalCalories || 0),
          proteinG: Math.round(log?.totalProtein || 0),
          carbsG: Math.round(log?.totalCarbs || 0),
          fatG: Math.round(log?.totalFat || 0),
          fiberG: Math.round(log?.totalFiber || 0),
          calciumMg: Math.round(log?.totalCalciumMg || 0),
          ironMg: Math.round(log?.totalIronMg || 0),
          zincMg: Math.round(log?.totalZincMg || 0),
          magnesiumMg: Math.round(log?.totalMagnesiumMg || 0),
          cholesterolMg: Math.round(log?.totalCholesterolMg || 0),
        },
        targets: targets
          ? {
              calories: Math.round(targets.targetCalories),
              proteinG: Math.round(targets.targetProtein),
              carbsG: Math.round(targets.targetCarbs),
              fatG: Math.round(targets.targetFat),
              fiberG: Math.round(targets.targetFiber),
              calciumMg: Math.round(targets.targetCalciumMg),
              ironMg: Math.round(targets.targetIronMg),
              zincMg: Math.round(targets.targetZincMg),
              magnesiumMg: Math.round(targets.targetMagnesiumMg),
              cholesterolMg: Math.round(targets.targetCholesterolMg),
            }
          : null,
      };
    });

    return success(chartData);
  } catch (err) {
    console.error('Weekly progress error:', err);
    return serverError();
  }
}
