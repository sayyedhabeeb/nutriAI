import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import {
  getSlotTargets,
  scaleNutrition,
  type MealSlot,
} from '@/lib/nutrition-engine';
import { success, unauthorized, serverError, error } from '@/lib/response';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session) return unauthorized();

    const { searchParams } = new URL(request.url);
    const slotParam = searchParams.get('slot') || 'lunch';
    const slot = slotParam as MealSlot;
    const validSlots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validSlots.includes(slot)) {
      return error(`Invalid slot. Must be one of: ${validSlots.join(', ')}`);
    }

    const today = getTodayStr();

    // Get user data
    const user = await db.user.findUnique({
      where: { id: session.userId },
      include: {
        profile: true,
        goal: true,
        preference: true,
        allergies: { select: { allergyName: true } },
      },
    });

    if (!user) return unauthorized('User not found');

    // Get daily nutrition for today
    const dailyNutrition = await db.dailyNutrition.findUnique({
      where: { userId_date: { userId: session.userId, date: today } },
    });

    const dailyTargets = dailyNutrition
      ? {
          calories: dailyNutrition.targetCalories,
          proteinG: dailyNutrition.targetProtein,
          carbsG: dailyNutrition.targetCarbs,
          fatG: dailyNutrition.targetFat,
        }
      : { calories: 500, proteinG: 30, carbsG: 60, fatG: 15 }; // fallback slot defaults

    const consumedCal = dailyNutrition?.consumedCalories || 0;
    const slotTargets = getSlotTargets(dailyTargets, consumedCal)[slot];

    // Get recent meal IDs (last 7 days) for variety
    const sevenDaysAgo = getDateDaysAgo(7);
    const recentLogItems = await db.foodLogItem.findMany({
      where: {
        foodLog: {
          userId: session.userId,
          logDate: { gte: sevenDaysAgo },
        },
        mealId: { not: null },
      },
      select: { mealId: true },
      distinct: ['mealId'],
    });
    const recentMealIds = new Set(recentLogItems.map((i) => i.mealId).filter(Boolean));

    // Get user allergen names for ingredient matching
    const userAllergenNames = user.allergies.map((a) =>
      a.allergyName.toLowerCase()
    );

    // Get all meals with nutrition
    const allMeals = await db.meal.findMany({
      where: { isActive: true },
      include: {
        nutrition: true,
        servings: true,
        ingredients: { select: { ingredientName: true, containsAllergen: true } },
        aliases: { select: { aliasName: true } },
      },
    });

    // ── 9-Stage Filtering Pipeline ──

    // Stage 1: Allergy removal
    let filtered = allMeals.filter((meal) => {
      if (userAllergenNames.length === 0) return true;
      return !meal.ingredients.some(
        (ing) =>
          ing.containsAllergen &&
          userAllergenNames.some((a) =>
            ing.ingredientName.toLowerCase().includes(a)
          )
      );
    });

    // Stage 2: Cuisine filter
    if (user.preference?.cuisinePreference) {
      const preferredCuisines = user.preference.cuisinePreference
        .split(',')
        .map((c) => c.trim().toLowerCase());
      filtered = filtered.filter((meal) =>
        preferredCuisines.includes(meal.cuisine.toLowerCase())
      );
    }

    // Stage 3: Meal type filter
    filtered = filtered.filter((meal) =>
      meal.mealType.toLowerCase().includes(slot)
    );

    // Stage 4: Recent removal (last 7 days)
    filtered = filtered.filter((meal) => !recentMealIds.has(meal.id));

    // Stage 5: Calorie cap (within remaining budget + 15%)
    const calCap = slotTargets.calories * 1.15;
    filtered = filtered.filter((meal) => {
      if (!meal.nutrition) return true; // keep if no nutrition data
      return meal.nutrition.calories <= calCap;
    });

    // Stage 6: Protein floor (min 10g per 100g)
    filtered = filtered.filter((meal) => {
      if (!meal.nutrition) return true;
      return meal.nutrition.proteinG >= 10;
    });

    // Stage 7: Dietary filter
    const dietType = user.preference?.dietType?.toLowerCase();
    if (dietType) {
      filtered = filtered.filter((meal) => {
        switch (dietType) {
          case 'veg':
            return meal.isVeg || meal.isVegan;
          case 'vegan':
            return meal.isVegan;
          case 'non-veg':
            return true; // no filter for non-veg
          case 'eggetarian':
            return meal.isVeg || meal.isEggetarian || meal.isVegan;
          default:
            return true;
        }
      });
    }

    // Stage 8: Scoring (composite score)
    const scored = filtered.map((meal) => {
      if (!meal.nutrition) return { meal, score: 0 };

      // Macro fit score (0-100): how close the meal's macro ratio is to the slot target ratio
      const totalSlotCal =
        slotTargets.proteinG * 4 + slotTargets.carbsG * 4 + slotTargets.fatG * 9;
      const targetProtPct = totalSlotCal > 0 ? (slotTargets.proteinG * 4) / totalSlotCal : 0.3;
      const targetCarbsPct = totalSlotCal > 0 ? (slotTargets.carbsG * 4) / totalSlotCal : 0.4;
      const targetFatPct = totalSlotCal > 0 ? (slotTargets.fatG * 9) / totalSlotCal : 0.3;

      const mealCal = meal.nutrition.calories || 1;
      const mealProtPct = (meal.nutrition.proteinG * 4) / mealCal;
      const mealCarbsPct = (meal.nutrition.carbsG * 4) / mealCal;
      const mealFatPct = (meal.nutrition.fatG * 9) / mealCal;

      const macroDiff =
        Math.abs(mealProtPct - targetProtPct) +
        Math.abs(mealCarbsPct - targetCarbsPct) +
        Math.abs(mealFatPct - targetFatPct);
      const macroFit = Math.max(0, 100 - macroDiff * 200);

      // Variety score (0-100): inverse of how recently eaten (not in recent = 100)
      const varietyScore = 100;

      // Preference score (0-100): cuisine match bonus
      let prefScore = 50;
      if (
        user.preference?.cuisinePreference &&
        user.preference.cuisinePreference
          .toLowerCase()
          .includes(meal.cuisine.toLowerCase())
      ) {
        prefScore = 100;
      }

      // Composite score
      const score =
        macroFit * 0.5 + varietyScore * 0.3 + prefScore * 0.2;

      return { meal, score };
    });

    // Stage 9: Top 3 selection
    scored.sort((a, b) => b.score - a.score);
    const top3 = scored.slice(0, 3);

    const recommendations = top3.map(({ meal, score }) => {
      // Calculate recommended serving to fit the slot calorie target
      let recommendedServingGms = meal.baseServingGms;
      if (meal.nutrition && meal.nutrition.calories > 0) {
        const idealServing =
          (slotTargets.calories / meal.nutrition.calories) * 100;
        // Clamp between 50g and 500g
        recommendedServingGms = Math.round(
          Math.min(500, Math.max(50, idealServing))
        );
      }

      const scaledNutrition = meal.nutrition
        ? scaleNutrition(
            {
              calories: meal.nutrition.calories,
              proteinG: meal.nutrition.proteinG,
              carbsG: meal.nutrition.carbsG,
              fatG: meal.nutrition.fatG,
            },
            recommendedServingGms
          )
        : null;

      return {
        meal: {
          id: meal.id,
          name: meal.name,
          mealType: meal.mealType,
          cuisine: meal.cuisine,
          imageUrl: meal.imageUrl,
          prepTimeMin: meal.prepTimeMin,
        },
        score: Math.round(score * 10) / 10,
        recommendedServingGms,
        estimatedNutrition: scaledNutrition,
      };
    });

    return success({
      slot,
      slotTargets,
      recommendations,
    });
  } catch (err) {
    console.error('Recommendations error:', err);
    return serverError();
  }
}
