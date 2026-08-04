import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { scaleNutrition, getSlotTargets, type MealSlot } from '@/lib/nutrition-engine';
import { success, unauthorized, serverError } from '@/lib/response';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const today = getTodayStr();

    // Check if plan already exists for today
    const existingPlan = await db.mealPlanDay.findUnique({
      where: { userId_planDate: { userId: session.userId, planDate: today } },
    });

    if (existingPlan) {
      return success({ planId: existingPlan.id, status: 'existing', message: 'Plan already exists for today' });
    }

    // Get user data for targets
    const dailyNutrition = await db.dailyNutrition.findUnique({
      where: { userId_date: { userId: session.userId, date: today } },
    });

    const targets = dailyNutrition
      ? { calories: dailyNutrition.targetCalories, proteinG: dailyNutrition.targetProtein, carbsG: dailyNutrition.targetCarbs, fatG: dailyNutrition.targetFat }
      : { calories: 2000, proteinG: 150, carbsG: 250, fatG: 67 };

    const consumedCal = dailyNutrition?.consumedCalories || 0;
    const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

    // Get user allergies and preferences
    const user = await db.user.findUnique({
      where: { id: session.userId },
      include: { allergies: { select: { allergyName: true } }, preference: true },
    });

    const userAllergenNames = (user?.allergies || []).map((a) => a.allergyName.toLowerCase());
    const dietType = user?.preference?.dietType?.toLowerCase();

    // Get active meals with nutrition
    const allMeals = await db.meal.findMany({
      where: { isActive: true, source: 'admin' },
      include: { nutrition: true, ingredients: { select: { ingredientName: true, containsAllergen: true } } },
    });

    const slotTargets = getSlotTargets(targets, consumedCal);

    // For each slot, pick the #1 recommendation
    const planItems: { mealId: string; mealSlot: string; servingGms: number; recommendedCalories: number; rankScore: number }[] = [];

    for (const slot of slots) {
      const st = slotTargets[slot];

      // Filter meals for this slot
      let candidates = allMeals.filter((m) =>
        m.mealType.toLowerCase().includes(slot) && m.nutrition !== null
      );

      // Filter by allergens
      if (userAllergenNames.length > 0) {
        candidates = candidates.filter((meal) =>
          !meal.ingredients.some((ing) =>
            ing.containsAllergen && userAllergenNames.some((a) => ing.ingredientName.toLowerCase().includes(a))
          )
        );
      }

      // Filter by diet type
      if (dietType) {
        candidates = candidates.filter((meal) => {
          if (dietType === 'vegetarian' || dietType === 'veg') return meal.isVeg || meal.isVegan;
          if (dietType === 'vegan') return meal.isVegan;
          return true;
        });
      }

      // Calorie cap
      const calCap = st.calories * 1.15;
      candidates = candidates.filter((m) => m.nutrition!.calories <= calCap);

      if (candidates.length === 0) continue;

      // Score by macro fit
      const scored = candidates.map((meal) => {
        const totalSlotCal = st.proteinG * 4 + st.carbsG * 4 + st.fatG * 9;
        const targetProtPct = totalSlotCal > 0 ? (st.proteinG * 4) / totalSlotCal : 0.3;
        const targetCarbsPct = totalSlotCal > 0 ? (st.carbsG * 4) / totalSlotCal : 0.4;
        const targetFatPct = totalSlotCal > 0 ? (st.fatG * 9) / totalSlotCal : 0.3;

        const mealCal = meal.nutrition!.calories || 1;
        const mealProtPct = (meal.nutrition!.proteinG * 4) / mealCal;
        const mealCarbsPct = (meal.nutrition!.carbsG * 4) / mealCal;
        const mealFatPct = (meal.nutrition!.fatG * 9) / mealCal;

        const macroDiff = Math.abs(mealProtPct - targetProtPct) + Math.abs(mealCarbsPct - targetCarbsPct) + Math.abs(mealFatPct - targetFatPct);
        const score = Math.max(0, 100 - macroDiff * 200);

        // Calculate recommended serving
        let recommendedServingGms = meal.baseServingGms;
        if (meal.nutrition!.calories > 0) {
          const ideal = (st.calories / meal.nutrition!.calories) * 100;
          recommendedServingGms = Math.round(Math.min(500, Math.max(50, ideal)));
        }
        const scaled = scaleNutrition(
          { calories: meal.nutrition!.calories, proteinG: meal.nutrition!.proteinG, carbsG: meal.nutrition!.carbsG, fatG: meal.nutrition!.fatG },
          recommendedServingGms
        );

        return { meal, score, recommendedServingGms, scaledCalories: scaled.calories };
      });

      scored.sort((a, b) => b.score - a.score);
      const top = scored[0];
      if (!top) continue;

      planItems.push({
        mealId: top.meal.id,
        mealSlot: slot,
        servingGms: top.recommendedServingGms,
        recommendedCalories: top.scaledCalories,
        rankScore: top.score,
      });
    }

    // Create MealPlanDay
    const planDay = await db.mealPlanDay.create({
      data: {
        userId: session.userId,
        planDate: today,
        targetCalories: targets.calories,
        targetProtein: targets.proteinG,
        targetCarbs: targets.carbsG,
        targetFat: targets.fatG,
        items: {
          create: planItems.map((item) => ({
            mealSlot: item.mealSlot,
            mealId: item.mealId,
            servingGms: item.servingGms,
            recommendedCalories: item.recommendedCalories,
            rankScore: item.rankScore,
          })),
        },
      },
    });

    return success({ planId: planDay.id, status: 'generated', message: 'Meal plan generated for today' });
  } catch (err) {
    console.error('Generate meal plan error:', err);
    return serverError();
  }
}
