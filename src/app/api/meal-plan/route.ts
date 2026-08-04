import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/response';
import { scaleNutrition } from '@/lib/nutrition-engine';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const today = getTodayStr();

    const planDay = await db.mealPlanDay.findUnique({
      where: { userId_planDate: { userId: session.userId, planDate: today } },
      include: {
        items: {
          include: {
            meal: {
              include: { nutrition: true },
            },
          },
          orderBy: { mealSlot: 'asc' },
        },
      },
    });

    if (!planDay) {
      return success({ exists: false, planDate: today, items: [] });
    }

    const items = planDay.items.map((item) => {
      const scaled = item.meal.nutrition
        ? scaleNutrition(
            { calories: item.meal.nutrition.calories, proteinG: item.meal.nutrition.proteinG, carbsG: item.meal.nutrition.carbsG, fatG: item.meal.nutrition.fatG },
            item.servingGms
          )
        : null;

      return {
        id: item.id,
        mealSlot: item.mealSlot,
        servingGms: item.servingGms,
        recommendedCalories: item.recommendedCalories,
        rankScore: item.rankScore,
        meal: {
          id: item.meal.id,
          name: item.meal.name,
          mealType: item.meal.mealType,
          cuisine: item.meal.cuisine,
          isVeg: item.meal.isVeg,
          isVegan: item.meal.isVegan,
          prepTimeMin: item.meal.prepTimeMin,
        },
        nutrition: scaled,
      };
    });

    return success({
      exists: true,
      planDate: planDay.planDate,
      targetCalories: planDay.targetCalories,
      targetProtein: planDay.targetProtein,
      targetCarbs: planDay.targetCarbs,
      targetFat: planDay.targetFat,
      items,
    });
  } catch (err) {
    console.error('Get meal plan error:', err);
    return serverError();
  }
}
