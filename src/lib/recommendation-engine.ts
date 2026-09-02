import { db } from "@/lib/db";
import type { MealSlot } from "@/lib/nutrition-engine";

export const TOP_N = 4;
export const TOP_POOL = 15;

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
  return new Date().toISOString().split("T")[0];
}

export function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

export interface SlotTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function isLowFatRequested(
  otherInfo?: string | null,
  avoidedFoods?: string | string[] | null
): boolean {
  const text = `${otherInfo || ""} ${
    Array.isArray(avoidedFoods) ? avoidedFoods.join(" ") : avoidedFoods || ""
  }`.toLowerCase();

  const lowFatKeywords = [
    "without fat",
    "no fat",
    "low fat",
    "zero fat",
    "fat free",
    "fat-free",
    "low-fat",
    "avoid fat",
    "no fatty",
    "no oily",
    "oil free",
    "no fried",
    "avoid fatty",
    "avoid oily",
    "less fat",
    "lean food",
    "lean only",
    "fat food",
    "fat foods",
  ];
  return lowFatKeywords.some((kw) => text.includes(kw));
}

const HIGH_FAT_KEYWORDS = [
  "fried",
  "deep fried",
  "butter",
  "cream",
  "mayo",
  "mayonnaise",
  "ghee",
  "fatty",
  "oily",
  "crispy fried",
  "paratha",
  "puri",
  "bacon",
  "sausage",
  "creamy",
  "lard",
];

export function isHighFatMeal(meal: MealCandidate): boolean {
  if (!meal.nutrition) return false;
  const fatG = meal.nutrition.fatG || 0;
  const cal = meal.nutrition.calories || 1;
  const fatCalRatio = (fatG * 9) / cal;

  // If fat contributes > 30% of calories or > 8g fat per 100g
  if (fatG > 8 || fatCalRatio > 0.30) {
    return true;
  }

  const nameAndIngredients = `${meal.name} ${(meal.aliases || [])
    .map((a) => a.aliasName)
    .join(" ")} ${(meal.ingredients || [])
    .map((i) => i.ingredientName)
    .join(" ")}`.toLowerCase();

  return HIGH_FAT_KEYWORDS.some((kw) => nameAndIngredients.includes(kw));
}

export function computeScore(
  meal: MealCandidate,
  slotTargets: SlotTargets,
  cuisinePreference?: string | null,
  lowFatMode = false
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
  let macroFit = Math.max(0, 100 - macroDiff * 200);

  let prefScore = 50;
  if (
    cuisinePreference &&
    (cuisinePreference.toLowerCase().includes(meal.cuisine.toLowerCase()) ||
      meal.cuisine.toLowerCase() === "general")
  ) {
    prefScore = 100;
  }

  let finalScore = macroFit * 0.5 + 100 * 0.3 + prefScore * 0.2;

  if (lowFatMode) {
    const fatG = meal.nutrition.fatG || 0;
    if (fatG <= 3) {
      finalScore += 50; // Huge bonus for very lean foods
    } else if (fatG <= 6) {
      finalScore += 20;
    } else {
      finalScore -= fatG * 10; // Progressive penalty for fat
    }
  }

  return Math.max(0, finalScore);
}

export interface CandidateFilterOptions {
  slot: MealSlot;
  userAllergenNames: string[];
  cuisinePreference?: string | null;
  dietPreference?: string | null;
  avoidedFoods?: string | string[] | null;
  otherInfo?: string | null;
  recentMealIds: Set<string>;
  slotTargets: SlotTargets;
  strictCuisine: boolean;
  strictRecent?: boolean;
}

// Deterministic candidate filtering:
// 1. NON-NEGOTIABLE: Allergy removal
// 2. Meal slot matching
// 3. Low-Fat & Avoided Foods filtering
// 4. Dietary preference (veg, vegan, etc.)
// 5. Cuisine & Recent exclusions (gracefully relaxed if pool < TOP_N)
export function filterCandidates(
  meals: MealCandidate[],
  opts: CandidateFilterOptions
): MealCandidate[] {
  const {
    slot,
    userAllergenNames,
    cuisinePreference,
    dietPreference,
    avoidedFoods,
    otherInfo,
    recentMealIds,
    slotTargets,
    strictCuisine,
    strictRecent = true,
  } = opts;

  let filtered = [...meals];

  // 1. NON-NEGOTIABLE: Remove meals containing user allergens
  if (userAllergenNames.length > 0) {
    filtered = filtered.filter(
      (meal) =>
        !meal.ingredients.some(
          (ing) =>
            ing.containsAllergen &&
            userAllergenNames.some((a) =>
              ing.ingredientName.toLowerCase().includes(a.toLowerCase())
            )
        )
    );
  }

  // 2. Meal slot matching
  const slotFiltered = filtered.filter((meal) =>
    meal.mealType.toLowerCase().includes(slot)
  );
  if (slotFiltered.length >= TOP_N) {
    filtered = slotFiltered;
  }

  // 3. User Avoided Foods Filtering
  const avoidTerms: string[] = [];
  if (avoidedFoods) {
    const rawAvoid = Array.isArray(avoidedFoods) ? avoidedFoods : [avoidedFoods];
    for (const item of rawAvoid) {
      if (typeof item === "string") {
        item.split(",").forEach((term) => {
          const t = term.trim().toLowerCase();
          if (t && t !== "none" && !t.includes("no known")) {
            avoidTerms.push(t);
          }
        });
      }
    }
  }

  if (avoidTerms.length > 0) {
    const nonAvoided = filtered.filter((meal) => {
      const text = `${meal.name} ${meal.cuisine} ${(meal.ingredients || [])
        .map((i) => i.ingredientName)
        .join(" ")}`.toLowerCase();
      return !avoidTerms.some((term) => text.includes(term));
    });
    if (nonAvoided.length >= TOP_N) {
      filtered = nonAvoided;
    }
  }

  // 4. Low-Fat / No-Fat Filtering (if user requested "without fat", "no fat", "low fat")
  const lowFatMode = isLowFatRequested(otherInfo, avoidedFoods);
  if (lowFatMode) {
    const leanOnly = filtered.filter((meal) => !isHighFatMeal(meal));
    if (leanOnly.length >= TOP_N) {
      filtered = leanOnly;
    } else if (leanOnly.length > 0) {
      // Sort by fat ascending so least fat meals come first
      filtered = [...filtered].sort(
        (a, b) => (a.nutrition?.fatG || 0) - (b.nutrition?.fatG || 0)
      );
    }
  }

  // 5. Recent meal exclusion for variety
  if (strictRecent && recentMealIds.size > 0) {
    const nonRecent = filtered.filter((meal) => !recentMealIds.has(meal.id));
    if (nonRecent.length >= TOP_N) {
      filtered = nonRecent;
    }
  }

  // 6. Strict cuisine filter
  if (strictCuisine && cuisinePreference) {
    const preferredCuisines = cuisinePreference
      .split(",")
      .map((c) => c.trim().toLowerCase());
    const cuisineMatches = filtered.filter(
      (meal) =>
        preferredCuisines.includes(meal.cuisine.toLowerCase()) ||
        meal.cuisine.toLowerCase() === "general"
    );
    if (cuisineMatches.length >= TOP_N) {
      filtered = cuisineMatches;
    }
  }

  // 7. Dietary preference (veg, vegan, eggetarian)
  if (dietPreference) {
    const dietMatches = filtered.filter((meal) => {
      switch (dietPreference) {
        case "veg":
        case "vegetarian":
          return meal.isVeg || meal.isVegan;
        case "vegan":
          return meal.isVegan;
        case "eggetarian":
          return meal.isVeg || meal.isEggetarian || meal.isVegan;
        default:
          return true;
      }
    });
    if (dietMatches.length >= TOP_N) {
      filtered = dietMatches;
    }
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
  let candidates = filterCandidates(allMeals, opts);

  // If strict filtering returned fewer than TOP_N, fallback with relaxed constraints
  if (candidates.length < TOP_N) {
    candidates = filterCandidates(allMeals, {
      ...opts,
      strictCuisine: false,
      strictRecent: false,
    });
  }

  // If still empty, fall back to all allergy-safe, active meals
  if (candidates.length === 0) {
    candidates = allMeals.filter(
      (meal) =>
        !meal.ingredients.some(
          (ing) =>
            ing.containsAllergen &&
            opts.userAllergenNames.some((a) =>
              ing.ingredientName.toLowerCase().includes(a.toLowerCase())
            )
        )
    );
  }

  const lowFatMode = isLowFatRequested(opts.otherInfo, opts.avoidedFoods);

  return candidates
    .map((meal) => ({
      meal,
      score: computeScore(meal, opts.slotTargets, opts.cuisinePreference, lowFatMode),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function scaleServingToSlot(
  meal: MealCandidate,
  slotTargets: SlotTargets
): number {
  if (!meal.nutrition || meal.nutrition.calories <= 0)
    return meal.baseServingGms || 100;
  const targetCal = Math.max(100, slotTargets.calories);
  const idealServing = (targetCal / meal.nutrition.calories) * 100;
  return Math.round(Math.min(500, Math.max(50, idealServing)));
}
