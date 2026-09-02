import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/response';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getTodayStr();

    const [dailyNutrition, waterLog] = await Promise.all([
      db.dailyNutrition.findUnique({
        where: {
          userId_date: {
            userId: session.userId,
            date,
          },
        },
      }),
      db.waterLog.findUnique({
        where: {
          userId_logDate: {
            userId: session.userId,
            logDate: date,
          },
        },
      }),
    ]);

    const hydration = {
      glassesConsumed: waterLog?.glassesConsumed ?? 0,
      targetGlasses: waterLog?.targetGlasses ?? 8,
      mlConsumed: (waterLog?.glassesConsumed ?? 0) * 250,
      targetMl: (waterLog?.targetGlasses ?? 8) * 250,
      percentage: waterLog ? Math.round((waterLog.glassesConsumed / waterLog.targetGlasses) * 100) : 0,
    };

    if (!dailyNutrition) {
      // Return zeros with default targets
      return success({
        date,
        targets: {
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
          fiberG: 0,
          calciumMg: 0,
          ironMg: 0,
          zincMg: 0,
          magnesiumMg: 0,
          cholesterolMg: 0,
        },
        consumed: {
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
          fiberG: 0,
          calciumMg: 0,
          ironMg: 0,
          zincMg: 0,
          magnesiumMg: 0,
          cholesterolMg: 0,
        },
        remaining: {
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
          fiberG: 0,
          calciumMg: 0,
          ironMg: 0,
          zincMg: 0,
          magnesiumMg: 0,
          cholesterolMg: 0,
        },
        percentages: {
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
          fiberG: 0,
          calciumMg: 0,
          ironMg: 0,
          zincMg: 0,
          magnesiumMg: 0,
          cholesterolMg: 0,
        },
        hydration,
      });
    }

    const targets = {
      calories: dailyNutrition.targetCalories,
      proteinG: dailyNutrition.targetProtein,
      carbsG: dailyNutrition.targetCarbs,
      fatG: dailyNutrition.targetFat,
      fiberG: dailyNutrition.targetFiber,
      calciumMg: dailyNutrition.targetCalciumMg,
      ironMg: dailyNutrition.targetIronMg,
      zincMg: dailyNutrition.targetZincMg,
      magnesiumMg: dailyNutrition.targetMagnesiumMg,
      cholesterolMg: dailyNutrition.targetCholesterolMg,
    };

    const consumed = {
      calories: dailyNutrition.consumedCalories,
      proteinG: dailyNutrition.consumedProtein,
      carbsG: dailyNutrition.consumedCarbs,
      fatG: dailyNutrition.consumedFat,
      fiberG: dailyNutrition.consumedFiber,
      calciumMg: dailyNutrition.consumedCalciumMg,
      ironMg: dailyNutrition.consumedIronMg,
      zincMg: dailyNutrition.consumedZincMg,
      magnesiumMg: dailyNutrition.consumedMagnesiumMg,
      cholesterolMg: dailyNutrition.consumedCholesterolMg,
    };

    const remaining = {
      calories: Math.max(0, dailyNutrition.targetCalories - dailyNutrition.consumedCalories),
      proteinG: Math.max(0, dailyNutrition.targetProtein - dailyNutrition.consumedProtein),
      carbsG: Math.max(0, dailyNutrition.targetCarbs - dailyNutrition.consumedCarbs),
      fatG: Math.max(0, dailyNutrition.targetFat - dailyNutrition.consumedFat),
      fiberG: Math.max(0, dailyNutrition.targetFiber - dailyNutrition.consumedFiber),
      calciumMg: Math.max(0, dailyNutrition.targetCalciumMg - dailyNutrition.consumedCalciumMg),
      ironMg: Math.max(0, dailyNutrition.targetIronMg - dailyNutrition.consumedIronMg),
      zincMg: Math.max(0, dailyNutrition.targetZincMg - dailyNutrition.consumedZincMg),
      magnesiumMg: Math.max(0, dailyNutrition.targetMagnesiumMg - dailyNutrition.consumedMagnesiumMg),
      cholesterolMg: Math.max(0, dailyNutrition.targetCholesterolMg - dailyNutrition.consumedCholesterolMg),
    };

    const percentages = {
      calories: dailyNutrition.targetCalories > 0
        ? Math.round((dailyNutrition.consumedCalories / dailyNutrition.targetCalories) * 100)
        : 0,
      proteinG: dailyNutrition.targetProtein > 0
        ? Math.round((dailyNutrition.consumedProtein / dailyNutrition.targetProtein) * 100)
        : 0,
      carbsG: dailyNutrition.targetCarbs > 0
        ? Math.round((dailyNutrition.consumedCarbs / dailyNutrition.targetCarbs) * 100)
        : 0,
      fatG: dailyNutrition.targetFat > 0
        ? Math.round((dailyNutrition.consumedFat / dailyNutrition.targetFat) * 100)
        : 0,
      fiberG: dailyNutrition.targetFiber > 0
        ? Math.round((dailyNutrition.consumedFiber / dailyNutrition.targetFiber) * 100)
        : 0,
      calciumMg: dailyNutrition.targetCalciumMg > 0
        ? Math.round((dailyNutrition.consumedCalciumMg / dailyNutrition.targetCalciumMg) * 100)
        : 0,
      ironMg: dailyNutrition.targetIronMg > 0
        ? Math.round((dailyNutrition.consumedIronMg / dailyNutrition.targetIronMg) * 100)
        : 0,
      zincMg: dailyNutrition.targetZincMg > 0
        ? Math.round((dailyNutrition.consumedZincMg / dailyNutrition.targetZincMg) * 100)
        : 0,
      magnesiumMg: dailyNutrition.targetMagnesiumMg > 0
        ? Math.round((dailyNutrition.consumedMagnesiumMg / dailyNutrition.targetMagnesiumMg) * 100)
        : 0,
      cholesterolMg: dailyNutrition.targetCholesterolMg > 0
        ? Math.round((dailyNutrition.consumedCholesterolMg / dailyNutrition.targetCholesterolMg) * 100)
        : 0,
    };

    return success({
      date,
      targets,
      consumed,
      remaining,
      percentages,
      hydration,
    });
  } catch (err) {
    console.error('Daily nutrition error:', err);
    return serverError();
  }
}
