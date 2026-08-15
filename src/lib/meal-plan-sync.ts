// Keeps today's meal plan in sync with what the user has actually eaten.
// Called after every meal log (and log deletion):
//   re-scales the remaining (not-yet-eaten) plan items to the remaining
//   daily macro budget. Eaten slots keep their plan item so the UI can
//   render the slot as completed (tick) instead of dropping it.

import { db } from '@/lib/db';
import {
  getSlotTargets,
  scaleNutrition,
  type MealSlot,
} from '@/lib/nutrition-engine';
import {
  getTodayStr,
  loadCandidateMeals,
  scaleServingToSlot,
} from '@/lib/recommendation-engine';

export interface MealPlanSyncResult {
  removedSlots: string[];
  rescaled: { slot: string; mealId: string; servingGms: number; recommendedCalories: number }[];
  remainingSlots: string[];
}

export async function syncMealPlanWithLogs(userId: string): Promise<MealPlanSyncResult | null> {
  const today = getTodayStr();

  const planDay = await db.mealPlanDay.findUnique({
    where: { userId_planDate: { userId, planDate: today } },
    include: { items: true },
  });
  if (!planDay) return null;

  // Which slots already have at least one logged item today?
  const foodLog = await db.foodLog.findUnique({
    where: { userId_logDate: { userId, logDate: today } },
    include: { items: { select: { mealSlot: true } } },
  });
  const eatenSlots = new Set((foodLog?.items ?? []).map((i) => i.mealSlot));

  // ── Re-scale remaining plan items to the remaining budget ──
  // Eaten slots keep their plan item (the UI shows them as completed).
  const remainingItems = planDay.items.filter((i) => !eatenSlots.has(i.mealSlot));
  const remainingSlots = [...new Set(remainingItems.map((i) => i.mealSlot))];
  const rescaled: MealPlanSyncResult['rescaled'] = [];

  if (remainingItems.length > 0) {
    const dailyNutrition = await db.dailyNutrition.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    const targets = {
      calories: dailyNutrition?.targetCalories ?? 2000,
      proteinG: dailyNutrition?.targetProtein ?? 150,
      carbsG: dailyNutrition?.targetCarbs ?? 250,
      fatG: dailyNutrition?.targetFat ?? 67,
    };
    const consumed = {
      calories: dailyNutrition?.consumedCalories || 0,
      proteinG: dailyNutrition?.consumedProtein || 0,
      carbsG: dailyNutrition?.consumedCarbs || 0,
      fatG: dailyNutrition?.consumedFat || 0,
    };
    const slotTargets = getSlotTargets(targets, consumed, remainingSlots as MealSlot[]);

    const meals = await loadCandidateMeals();
    const byId = new Map(meals.map((m) => [m.id, m]));

    for (const item of remainingItems) {
      const meal = byId.get(item.mealId);
      if (!meal || !meal.nutrition || meal.nutrition.calories <= 0) continue;

      const target = slotTargets[item.mealSlot as MealSlot];
      const servingGms = scaleServingToSlot(meal, target);
      if (servingGms === item.servingGms) continue;

      const scaled = scaleNutrition(
        {
          calories: meal.nutrition.calories,
          proteinG: meal.nutrition.proteinG,
          carbsG: meal.nutrition.carbsG,
          fatG: meal.nutrition.fatG,
        },
        servingGms
      );

      await db.mealPlanItem.update({
        where: { id: item.id },
        data: { servingGms, recommendedCalories: scaled.calories },
      });
      rescaled.push({
        slot: item.mealSlot,
        mealId: item.mealId,
        servingGms,
        recommendedCalories: scaled.calories,
      });
    }
  }

  return {
    removedSlots: [],
    rescaled,
    remainingSlots,
  };
}
