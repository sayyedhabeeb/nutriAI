import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/response';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return unauthorized();

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getTodayStr();

    const dailyNutrition = await db.dailyNutrition.findUnique({
      where: {
        userId_date: {
          userId: session.userId,
          date,
        },
      },
    });

    if (!dailyNutrition) {
      // Return zeros with default targets
      return success({
        date,
        targets: {
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
        },
        consumed: {
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
        },
        remaining: {
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
        },
        percentages: {
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
        },
      });
    }

    const targets = {
      calories: dailyNutrition.targetCalories,
      proteinG: dailyNutrition.targetProtein,
      carbsG: dailyNutrition.targetCarbs,
      fatG: dailyNutrition.targetFat,
    };

    const consumed = {
      calories: dailyNutrition.consumedCalories,
      proteinG: dailyNutrition.consumedProtein,
      carbsG: dailyNutrition.consumedCarbs,
      fatG: dailyNutrition.consumedFat,
    };

    const remaining = {
      calories: Math.max(0, dailyNutrition.targetCalories - dailyNutrition.consumedCalories),
      proteinG: Math.max(0, dailyNutrition.targetProtein - dailyNutrition.consumedProtein),
      carbsG: Math.max(0, dailyNutrition.targetCarbs - dailyNutrition.consumedCarbs),
      fatG: Math.max(0, dailyNutrition.targetFat - dailyNutrition.consumedFat),
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
    };

    return success({
      date,
      targets,
      consumed,
      remaining,
      percentages,
    });
  } catch (err) {
    console.error('Daily nutrition error:', err);
    return serverError();
  }
}
