import { db } from '@/lib/db';
import type { MealSlot } from '@/lib/nutrition-engine';

export const TOP_N = 3;
export const TOP_POOL = 12;

export type MealCandidate = Awaited<ReturnType<typeof loadCandidateMeals>>[number];

export function loadCandidateMeals() {
  return db.meal.findMany({
    where: { isActive: true },
    include: {
      nutrition: true,
      servings: true,
      ingredients: { select: { ingredientName: true, containsAllergen: true } },
      aliases: { select: { aliasName: true } },
    },
  });
}

export function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export interface SlotTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function computeScore(
  meal: {
    nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
    cuisine: string;
  },
  slotTargets: SlotTargets,
  cuisinePreference?: string | null
): number {
  if (!meal.nutrition) return 0;

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

  let prefScore = 50;
  if (
    cuisinePreference &&
    cuisinePreference.toLowerCase().includes(meal.cuisine.toLowerCase())
  ) {
    prefScore = 100;
  }

  return macroFit * 0.5 + 100 * 0.3 + prefScore * 0.2;
}

export interface CandidateFilterOptions {
  slot: MealSlot;
  userAllergenNames: string[];
  cuisinePreference?: string | null;
  dietPreference?: string | null;
  recentMealIds: Set<string>;
  slotTargets: SlotTargets;
  strictCuisine: boolean;
}

// Deterministic candidate filtering: allergy removal, cuisine (strict mode),
// meal type, recent exclusion, calorie cap, protein floor, dietary preference.
export function filterCandidates(
  meals: MealCandidate[],
  opts: CandidateFilterOptions
): MealCandidate[] {
  const {
    slot,
    userAllergenNames,
    cuisinePreference,
    dietPreference,
    recentMealIds,
    slotTargets,
    strictCuisine,
  } = opts;

  let filtered = [...meals];

  if (userAllergenNames.length > 0) {
    filtered = filtered.filter(
      (meal) =>
        !meal.ingredients.some(
          (ing) =>
            ing.containsAllergen &&
            userAllergenNames.some((a) =>
              ing.ingredientName.toLowerCase().includes(a)
            )
        )
    );
  }

  if (strictCuisine && cuisinePreference) {
    const preferredCuisines = cuisinePreference
      .split(',')
      .map((c) => c.trim().toLowerCase());
    filtered = filtered.filter((meal) =>
      preferredCuisines.includes(meal.cuisine.toLowerCase())
    );
  }

  filtered = filtered.filter((meal) =>
    meal.mealType.toLowerCase().includes(slot)
  );

  filtered = filtered.filter((meal) => !recentMealIds.has(meal.id));

  const calCap = slotTargets.calories * 1.15;
  filtered = filtered.filter((meal) => {
    if (!meal.nutrition) return true;
    return meal.nutrition.calories <= calCap;
  });

  const proteinFloor = slot === 'breakfast' || slot === 'snack' ? 2 : 5;
  filtered = filtered.filter((meal) => {
    if (!meal.nutrition) return true;
    return meal.nutrition.proteinG >= proteinFloor;
  });

  if (dietPreference) {
    filtered = filtered.filter((meal) => {
      switch (dietPreference) {
        case 'veg':
        case 'vegetarian':
          return meal.isVeg || meal.isVegan;
        case 'vegan':
          return meal.isVegan;
        case 'non-veg':
          return true;
        case 'eggetarian':
          return meal.isVeg || meal.isEggetarian || meal.isVegan;
        default:
          return true;
      }
    });
  }

  return filtered;
}

export interface RankedCandidate {
  meal: MealCandidate;
  score: number;
}

export function buildRankedPool(
  allMeals: MealCandidate[],
  opts: CandidateFilterOptions,
  limit = TOP_POOL
): RankedCandidate[] {
  return filterCandidates(allMeals, opts)
    .map((meal) => ({ meal, score: computeScore(meal, opts.slotTargets, opts.cuisinePreference) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function scaleServingToSlot(
  meal: MealCandidate,
  slotTargets: SlotTargets
): number {
  if (!meal.nutrition || meal.nutrition.calories <= 0) return meal.baseServingGms;
  const idealServing = (slotTargets.calories / meal.nutrition.calories) * 100;
  return Math.round(Math.min(500, Math.max(50, idealServing)));
}
