// ═══ Shared Food Resolution Engine ═══
// Single source of truth for turning recognized foods (from photo OR voice
// input) into the confirm-card result: DB meal matching → stored new-food
// reuse → ingredient composition → AI-extracted fallback, plus portion
// options and scaled nutrition. Both /api/food-recognize (photo) and
// /api/voice-log/parse (voice) call this so the food recognition, Nutrition
// DB matching, portion, and nutrition-calc workflow is EXACTLY the same.
//
// The AI never computes nutrition values. DB foods are scaled with
// scaleNutrition; unknown foods are composed locally from the Ingredient
// table. Only the input stage (image vs voice transcript) differs.

import { db } from '@/lib/db';
import { scaleNutrition, type NutritionValues } from '@/lib/nutrition-engine';
import {
  buildPortionOptions,
  type IngredientItem,
  type PortionOption,
  type PortionType,
} from '@/lib/ingredient-nutrition';
import { IngredientMatcher } from '@/lib/ingredient-matching';

export type MealWithNutrition = Awaited<
  ReturnType<typeof db.meal.findFirst<{ include: { nutrition: true; servings: true } }>>
>;

export interface AIFoodIngredient {
  name: string;
  estimated_grams?: number;
}

export interface AIFood {
  name: string;
  serving_description?: string;
  measurement_type?: PortionType | string;
  portion_type?: 'weight' | 'count';
  estimated_grams?: number;
  estimated_ml?: number;
  estimated_pieces?: number;
  grams_per_piece?: number;
  confidence?: number;
  needs_confirmation?: boolean;
  variants?: string[];
  ingredients?: AIFoodIngredient[];
}

export interface AIResponse {
  food_detected?: boolean;
  foods?: AIFood[];
}

type Nutrition = ReturnType<typeof scaleNutrition>;

export interface VariantResult {
  name: string;
  matched: boolean;
  meal: MealWithNutrition;
  estimatedNutrition: Nutrition | null;
}

export interface RecognizedFoodResult {
  name: string;
  servingDescription: string;
  portionType: PortionType;
  estimatedGrams: number | null;
  estimatedMl: number | null;
  estimatedPieces: number | null;
  gramsPerPiece: number | null;
  totalGrams: number;
  confidence: number;
  needsConfirmation: boolean;
  variants: VariantResult[];
  nutritionSource: 'meal' | 'ingredients' | 'extracted' | 'stored';
  portionOptions: PortionOption[];
  estimatedNutrition: Nutrition | null;
  ingredients: Array<{ name: string; grams: number; matched: boolean }>;
  matched: boolean;
  unknown_food: boolean;
  meal: MealWithNutrition;
  mealId: string | null;
  newFoodId: string | null;
}

// Keyword fallback so foods are categorized correctly even when the model
// omits measurement_type or emits the legacy schema. Checked drink → bowl →
// piece → portion so overlaps resolve sensibly (e.g. "banana milkshake").
const DRINK_KEYWORDS = [
  'juice', 'milk', 'tea', 'coffee', 'chai', 'smoothie', 'lassi', 'shake',
  'milkshake', 'buttermilk', 'chaas', 'coconut water', 'frappe', 'latte',
  'espresso', 'soda', 'cola',
];
const BOWL_KEYWORDS = [
  'curry', 'dal', 'dhal', 'sambar', 'rasam', 'gravy', 'stew', 'sabzi',
  'subzi', 'bhaji', 'shak', 'korma', 'haleem', 'rajma', 'chana', 'saag',
  'tadka', 'payasam', 'soup',
];
const PIECE_KEYWORDS = [
  'idli', 'dosa', 'dosai', 'chapati', 'chappati', 'roti', 'paratha', 'parotta',
  'naan', 'poori', 'puri', 'bread', 'toast', 'egg', 'omelette', 'omelet',
  'banana', 'samosa', 'vada', 'pakora', 'taco', 'wing', 'roll', 'kebab',
  'cutlet', 'cookie', 'biscuit', 'muffin', 'papad', 'utthapam', 'appam',
  'pancake', 'sausage', 'dhokla', 'french toast',
];
const PORTION_KEYWORDS = [
  'biryani', 'fried rice', 'pulao', 'pulav', 'khichdi', 'khichuri', 'noodle',
  'noodles', 'pasta', 'hakka', 'chow mein', 'thali', 'pizza', 'burger',
  'risotto', 'dosa meal', 'spaghetti', 'macaroni', 'penne',
];

export function classifyMeasurementType(name: string): PortionType {
  const lower = name.toLowerCase();
  const hit = (list: string[]) => list.some((k) => lower.includes(k));
  if (hit(DRINK_KEYWORDS)) return 'drink';
  if (hit(BOWL_KEYWORDS)) return 'bowl';
  if (hit(PIECE_KEYWORDS)) return 'piece';
  if (hit(PORTION_KEYWORDS)) return 'portion';
  return 'weight';
}

export function resolveMeasurementType(food: AIFood): PortionType {
  const ai = food.measurement_type;
  if (ai === 'piece' || ai === 'portion' || ai === 'bowl' || ai === 'drink' || ai === 'weight') {
    return ai;
  }
  if (food.portion_type === 'count') return 'piece';
  if (food.portion_type === 'weight') return 'weight';
  return classifyMeasurementType(food.name || '');
}

export function defaultPortion(food: AIFood, type: PortionType): { grams: number; ml: number; pieces: number } {
  if (type === 'drink') {
    const ml = Math.max(50, food.estimated_ml ?? 250);
    return { grams: ml, ml, pieces: 1 };
  }
  if (type === 'piece') {
    const pieces = Math.max(1, Math.round(food.estimated_pieces ?? 2));
    const gpp = Math.max(10, food.grams_per_piece ?? 80);
    return { grams: pieces * gpp, ml: 0, pieces };
  }
  return { grams: Math.max(20, food.estimated_grams ?? 200), ml: 0, pieces: 1 };
}

export function toNutritionValues(n: NonNullable<MealWithNutrition>['nutrition']): NutritionValues {
  return {
    calories: n?.calories ?? 0,
    proteinG: n?.proteinG ?? 0,
    carbsG: n?.carbsG ?? 0,
    fatG: n?.fatG ?? 0,
    fiberG: n?.fiberG ?? 0,
    sugarG: n?.sugarG ?? 0,
    sodiumMg: n?.sodiumMg ?? 0,
    calciumMg: n?.calciumMg ?? 0,
    ironMg: n?.ironMg ?? 0,
    zincMg: n?.zincMg ?? 0,
    magnesiumMg: n?.magnesiumMg ?? 0,
    cholesterolMg: n?.cholesterolMg ?? 0,
  };
}

// Voice uses the same confirmation structure/format as photo, but with the
// food's natural portion unit: glasses for liquids, plates for rice/biryani,
// fixed gram levels for gram-based foods, and the standard pieces/bowls for
// piece and curry-type foods. Options reflect the spoken amount (via the
// estimate) by marking the matching option as the default.
export function buildNaturalPortionOptions(
  portionType: PortionType,
  estimate: number
): PortionOption[] {
  // piece and bowl behave exactly like the photo engine already does.
  if (portionType === 'piece' || portionType === 'bowl') {
    return buildPortionOptions(portionType, estimate);
  }

  const more: PortionOption = { label: 'More', value: 0, unit: 'g' as const, kind: 'custom' as const };

  if (portionType === 'drink') {
    // Glasses: 1 glass ≈ 250ml. Default = closest glass count to the estimate.
    const glassMl = 250;
    const count = Math.max(1, Math.min(3, Math.round(estimate / glassMl)));
    const glasses = [1, 2, 3].map((n) => ({
      label: `${n} Glass${n > 1 ? 'es' : ''}`,
      value: n * glassMl,
      unit: 'ml' as const,
      kind: 'preset' as const,
      default: n === count,
    }));
    return [...glasses, { ...more, unit: 'ml' as const }];
  }

  if (portionType === 'portion') {
    // Plates: Small / Medium / Full around the estimate (default = Full).
    const roundTo = (n: number) => Math.max(20, Math.round(n / 10) * 10);
    const plate = (label: string, factor: number, isDefault = false): PortionOption => ({
      label,
      value: roundTo(estimate * factor),
      unit: 'g',
      kind: 'preset',
      default: isDefault,
    });
    return [plate('Small Plate', 0.5), plate('Medium Plate', 0.75), plate('Full Plate', 1, true), { ...more }];
  }

  // weight: fixed gram levels around the estimate (e.g. 50g / 100g / 150g).
  const base = Math.max(20, Math.round((estimate || 100) / 10) * 10);
  const low = Math.max(20, Math.round((base / 2) / 10) * 10);
  const high = Math.max(20, Math.round((base * 1.5) / 10) * 10);
  const mid = Math.max(low, Math.min(base, high));
  const grams: PortionOption[] = [low, mid, high].map((v, i) => ({
    label: `${v}g`,
    value: v,
    unit: 'g' as const,
    kind: 'preset' as const,
    default: i === 1,
  }));
  return [...grams, { ...more }];
}

export interface ResolveRecognizedFoodsOptions {
  /** Recognized foods (compound names already split by the caller). */
  foods: AIFood[];
  /**
   * Optional provider for recipe ingredients of foods that did NOT match a DB
   * meal. The photo flow passes nothing (the vision model returns ingredients
   * in the recognition call). The voice flow provides this so unknown foods get
   * ingredient-based nutrition at recognition time instead of at confirmation.
   */
  onUnknownFoodIngredients?: (food: AIFood) => Promise<IngredientItem[]>;
  /**
   * Voice-only: render portion options in the food's natural unit (glasses,
   * plates, fixed gram levels) instead of the photo engine's option set.
   * Photo recognition does NOT pass this, so its confirmation stays identical.
   */
  naturalPortions?: boolean;
  /**
   * Voice-only: lock the AI-identified food as the source of truth and match
   * it EXACTLY (name/alias equality only — no substring/contains fallback, no
   * loose stored-new-food reuse). A DB/stored row for a different dish is
   * never substituted for the user's food; unmatched foods fall through to the
   * AI-estimated ingredients path. Photo recognition does NOT pass this.
   */
  exactMatchOnly?: boolean;
}

export async function resolveRecognizedFoods(
  opts: ResolveRecognizedFoodsOptions
): Promise<RecognizedFoodResult[]> {
  const meals = await db.meal.findMany({
    where: { isActive: true },
    include: { nutrition: true, servings: true, aliases: true },
  });
  const ingredientRows = await db.ingredient.findMany();
  const matcher = new IngredientMatcher(ingredientRows);
  const storedFoods = await db.unknownFoodSubmission.findMany({
    where: { status: { not: 'rejected' }, computedNutritionJson: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  // In-memory equivalents of the per-food DB lookups used by the photo flow.
  // Preserves findFirst semantics: first match in loaded (id-ascending) order.
  const findMealExact = (name: string): MealWithNutrition =>
    meals.find(
      (m) =>
        m.name.toLowerCase() === name.toLowerCase() ||
        (m.aliases ?? []).some((a) => a.aliasName.toLowerCase() === name.toLowerCase())
    ) ?? null;
  const findMeal = (name: string): MealWithNutrition =>
    opts.exactMatchOnly
      ? findMealExact(name)
      : findMealExact(name) ??
        meals.find(
          (m) =>
            m.name.toLowerCase().includes(name.toLowerCase()) ||
            (m.aliases ?? []).some((a) => a.aliasName.toLowerCase().includes(name.toLowerCase()))
        ) ??
        null;

  const results: RecognizedFoodResult[] = [];

  for (const food of opts.foods || []) {
    if (!food.name) continue;

    const servingDescription = food.serving_description || '';
    const portionType = resolveMeasurementType(food);
    const defaulted = defaultPortion(food, portionType);
    let defaultGrams = defaulted.grams;
    const { ml: defaultMl, pieces: defaultPieces } = defaulted;
    // Voice default serving for gram-based foods: a 100g snack serving (so
    // unspoken portions of e.g. banana chips resolve to 50g/100g/150g).
    if (opts.naturalPortions && portionType === 'weight') {
      defaultGrams = Math.max(20, food.estimated_grams ?? 100);
    }

    // ── Reuse check: New Foods store ──
    const lower = food.name.toLowerCase();
    const storedHit = opts.exactMatchOnly
      ? storedFoods.find(
          (s) =>
            s.aiDetectedName.toLowerCase() === lower ||
            s.confirmedName.toLowerCase() === lower
        )
      : storedFoods.find(
          (s) =>
            s.aiDetectedName.toLowerCase() === lower ||
            s.confirmedName.toLowerCase() === lower ||
            s.confirmedName.toLowerCase().includes(lower) ||
            lower.includes(s.confirmedName.toLowerCase())
        );

    // ── Resolve variant meals first (used for preference + results) ──
    const variantResults: VariantResult[] = [];
    let matchedVariantMeal: MealWithNutrition = null;
    for (const variant of (food.variants || []).slice(0, 6)) {
      if (!variant || variant.toLowerCase() === food.name.toLowerCase()) continue;
      const variantMeal = findMeal(variant);
      variantResults.push({
        name: variant,
        matched: !!variantMeal,
        meal: variantMeal ?? null,
        estimatedNutrition: null,
      });
      if (!matchedVariantMeal && variantMeal) matchedVariantMeal = variantMeal;
    }

    // ── Primary meal: exact name wins, then a matched variant, then a loose
    //    `contains` match (so a generic "Biryani" never quietly resolves to
    //    an unrelated "… Biryani" row when a specific variant is in the DB).
    const primaryMeal: MealWithNutrition = storedHit
      ? null
      : (findMealExact(food.name) ?? matchedVariantMeal ?? findMeal(food.name));

    // ── Ingredient list (may be augmented below for unknown foods) ──
    let ingredientItems: IngredientItem[] = (food.ingredients || [])
      .map((i) => ({
        name: i.name,
        grams: Math.max(1, i.estimated_grams ?? 10),
      }))
      .slice(0, 8);

    let nutritionSource: RecognizedFoodResult['nutritionSource'] = 'meal';
    let estimatedNutrition: Nutrition | null = null;
    let matched = false;
    let unknownFood = false;
    let meal: MealWithNutrition = null;
    let mealId: string | null = null;
    let newFoodId: string | null = null;
    let totalGrams = defaultGrams;

    if (storedHit) {
      // Reuse stored computed nutrition.
      nutritionSource = 'stored';
      unknownFood = true;
      newFoodId = storedHit.id;
      try {
        const stored = JSON.parse(storedHit.computedNutritionJson as string) as Nutrition;
        estimatedNutrition = stored;
        totalGrams = storedHit.baseServingGms || defaultGrams;
      } catch {
        estimatedNutrition = null;
      }
    } else if (primaryMeal) {
      nutritionSource = 'meal';
      matched = true;
      meal = primaryMeal;
      mealId = primaryMeal.id;
      totalGrams = defaultGrams;
      if (primaryMeal.nutrition) {
        estimatedNutrition = scaleNutrition(toNutritionValues(primaryMeal.nutrition), totalGrams);
      }
    } else {
      // Tier 2: ingredients all in DB → 'ingredients'
      // Tier 3: partial/none in DB → 'extracted' + store for reuse
      unknownFood = true;

      // Unknown food and no ingredients from the input → the caller (voice)
      // supplies recipe ingredients via the existing AI fallback workflow.
      if (ingredientItems.length === 0 && opts.onUnknownFoodIngredients) {
        const fetched = await opts.onUnknownFoodIngredients(food);
        ingredientItems = fetched
          .map((i) => ({ name: i.name, grams: Math.max(1, i.grams || 0) }))
          .slice(0, 8);
      }

      const composed = matcher.compose(ingredientItems);
      const composedTotalGrams = ingredientItems.reduce((sum, i) => sum + i.grams, 0);
      totalGrams = composedTotalGrams || defaultGrams;
      if (composed.nutrition) {
        estimatedNutrition = composed.nutrition;
        nutritionSource = composed.missing.length === 0 ? 'ingredients' : 'extracted';
      } else {
        nutritionSource = 'extracted';
        estimatedNutrition = null;
      }
    }

    // Resolve ingredient ids for matched items.
    const ingredientResolved = ingredientItems.map((item) => {
      const resolved = matcher.resolve(item.name);
      return { name: resolved.name, grams: item.grams, matched: resolved.matched };
    });

    // Scale variant nutrition now that totalGrams is final.
    for (const vr of variantResults) {
      if (vr.meal?.nutrition) {
        vr.estimatedNutrition = scaleNutrition(toNutritionValues(vr.meal.nutrition), totalGrams);
      }
    }

    const confidence = food.confidence ?? 0;
    const estimateForOptions =
      portionType === 'piece' ? defaultPieces :
      portionType === 'drink' ? defaultMl :
      defaultGrams;
    results.push({
      name: food.name,
      servingDescription,
      portionType,
      estimatedGrams: portionType === 'drink' ? null : defaultGrams,
      estimatedMl: portionType === 'drink' ? defaultMl : null,
      estimatedPieces: portionType === 'piece' ? defaultPieces : null,
      gramsPerPiece: portionType === 'piece' ? food.grams_per_piece ?? null : null,
      totalGrams,
      confidence,
      needsConfirmation: food.needs_confirmation ?? confidence < 0.75,
      variants: variantResults,
      nutritionSource,
      portionOptions: opts.naturalPortions
        ? buildNaturalPortionOptions(portionType, estimateForOptions)
        : buildPortionOptions(portionType, estimateForOptions),
      estimatedNutrition,
      ingredients: ingredientResolved,
      matched,
      unknown_food: unknownFood,
      meal,
      mealId,
      newFoodId,
    });
  }

  return results;
}