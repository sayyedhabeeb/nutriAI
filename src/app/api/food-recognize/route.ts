import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { created, unauthorized, serverError, error } from '@/lib/response';
import { getFoodRecognitionClient, detectFoodPresence, logAiCall } from '@/lib/ai/client';
import { scaleNutrition, type NutritionValues } from '@/lib/nutrition-engine';
import {
  buildPortionOptions,
  type PortionOption,
  type PortionType,
  type IngredientItem,
} from '@/lib/ingredient-nutrition';
import { IngredientMatcher } from '@/lib/ingredient-matching';
import { splitFoodNames } from '@/lib/food-names';

const VISION_PROMPT = `You are a food recognition assistant for a nutrition tracking app. Analyze the image carefully.

STEP 1 — FOOD PRESENCE. Decide whether the image actually contains an edible food or drink item that is physically visible.
- "food_detected" is true ONLY when a real, edible food/drink item is visible in the image (a meal, dish, snack, fruit, vegetable, beverage, etc.).
- Visible text, words, labels, packaging, menus, recipe cards, papers, documents, screens, or any other writing do NOT count as food. An image that only shows the word "Chapathi" on paper is NOT food.
- If the image shows only text, an object, a person, scenery, or anything non-edible, set "food_detected" to false.
- Never guess a food from context, titles, or words visible in the image. Only what you can SEE as edible food/drink counts.

When "food_detected" is TRUE, also decide the food's MEASUREMENT TYPE based on how people naturally measure and consume it:
- "piece" — individually countable foods: idli, dosa, chapati, roti, paratha, naan, bread, toast, eggs, omelette, banana, samosa, vada, pakora, taco, wing, kebab, cutlet, roll, cookie, biscuit, muffin, papad.
- "portion" — served as a plated portion: biryani, fried rice, pulao, khichdi, noodles, pasta, hakka, chow mein, thali, pizza, burger, risotto.
- "bowl" — served in a bowl as a dish/side: curry, dal, sambar, rasam, soup, gravy, stew, sabzi, korma, chana, rajma, mixed vegetables.
- "drink" — served as a beverage by volume: juice, milk, tea, coffee, chai, smoothie, lassi, shake, buttermilk, chaas, coconut water.
- "weight" — anything else measured in grams.

Return ONLY a JSON object. No markdown, no code fences, no commentary. "food_detected" MUST be the first field.

When food IS detected, example:
{
  "food_detected": true,
  "foods": [
    {
      "name": "Biryani",
      "serving_description": "one plate",
      "measurement_type": "portion",
      "estimated_grams": 350,
      "estimated_ml": null,
      "estimated_pieces": null,
      "grams_per_piece": null,
      "confidence": 0.8,
      "needs_confirmation": true,
      "variants": ["Chicken Biryani", "Mutton Biryani", "Vegetable Biryani"],
      "ingredients": [
        { "name": "Basmati Rice", "estimated_grams": 180 },
        { "name": "Chicken", "estimated_grams": 80 },
        { "name": "Onions", "estimated_grams": 30 }
      ]
    }
  ]
}

When NO food is detected, return exactly this:
{
  "food_detected": false,
  "foods": []
}

Rules:
- "food_detected" MUST be true or false, and "foods" MUST be an empty array when it is false.
- "foods" MUST only be populated when "food_detected" is true.
- NEVER identify a food based only on text, labels, packaging, or words visible in the image. A word on paper is not food.
- "measurement_type" MUST always be exactly one of: piece, portion, bowl, drink, weight.
- For piece foods: set "estimated_pieces" (count) and "grams_per_piece" (weight of one piece, e.g. naan ~80g, roti ~50g, wing ~35g, idli ~35g, dosa ~120g). Set "estimated_grams" to null.
- For portion, bowl, weight foods: set "estimated_grams" (total weight in grams). Set "estimated_pieces" and "grams_per_piece" to null.
- For drink foods: set "estimated_ml" (volume in millilitres, e.g. tea ~240ml, juice glass ~250ml, smoothie ~300ml). Set "estimated_grams" to null.
- "name" is the short dish name.
- "serving_description" describes how it was served (e.g. one plate, one bowl, one cup, two idlis).
- "confidence" is how sure you are of the dish identity, 0.0 to 1.0.
- "needs_confirmation" must be true when the exact dish is ambiguous (e.g. "Biryani" could be chicken, beef, mutton, or vegetarian) or when confidence is low.
- "variants" lists plausible specific variants only when needs_confirmation is true; otherwise an empty array.
- "ingredients" lists the main ingredients you can identify with estimated weights in grams. Use simple common names (e.g. "Chicken", "Basmati Rice", "Onions", "Tomatoes", "Paneer", "Butter", "Lentils", "Milk"). Include at least 2 and at most 8.
- If the image contains MULTIPLE dishes, list EACH dish as its own entry in "foods". NEVER combine two or more dishes into a single food "name" (e.g. do NOT write "Dosa + Kadala Curry" as one name). A food "name" must always be a single dish.`;

type MealWithNutrition = Awaited<
  ReturnType<typeof db.meal.findFirst<{ include: { nutrition: true; servings: true } }>>
>;

interface AIFood {
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
  ingredients?: Array<{ name: string; estimated_grams?: number }>;
}
interface AIResponse {
  food_detected?: boolean;
  foods?: AIFood[];
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

function classifyMeasurementType(name: string): PortionType {
  const lower = name.toLowerCase();
  const hit = (list: string[]) => list.some((k) => lower.includes(k));
  if (hit(DRINK_KEYWORDS)) return 'drink';
  if (hit(BOWL_KEYWORDS)) return 'bowl';
  if (hit(PIECE_KEYWORDS)) return 'piece';
  if (hit(PORTION_KEYWORDS)) return 'portion';
  return 'weight';
}

function resolveMeasurementType(food: AIFood): PortionType {
  const ai = food.measurement_type;
  if (ai === 'piece' || ai === 'portion' || ai === 'bowl' || ai === 'drink' || ai === 'weight') {
    return ai;
  }
  if (food.portion_type === 'count') return 'piece';
  if (food.portion_type === 'weight') return 'weight';
  return classifyMeasurementType(food.name || '');
}

type Nutrition = ReturnType<typeof scaleNutrition>;

interface VariantResult {
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

function defaultPortion(food: AIFood, type: PortionType): { grams: number; ml: number; pieces: number } {
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

function toNutritionValues(n: NonNullable<MealWithNutrition>['nutrition']): NutritionValues {
  return {
    calories: n?.calories ?? 0,
    proteinG: n?.proteinG ?? 0,
    carbsG: n?.carbsG ?? 0,
    fatG: n?.fatG ?? 0,
    fiberG: n?.fiberG ?? 0,
    sugarG: n?.sugarG ?? 0,
    sodiumMg: n?.sodiumMg ?? 0,
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let userId: string | null = null;
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();
    userId = session.userId;

    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return error('Image file is required');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
      return error('Unsupported image format. Please use JPG, PNG, or WebP.');
    }

    if (file.size > 10 * 1024 * 1024) {
      return error('Image is too large. Maximum size is 10MB.');
    }

    const bytes = await file.arrayBuffer();
    let buffer: Buffer = Buffer.from(bytes);
    let mimeType = file.type || 'image/jpeg';

    // LM Studio's REST API can't decode WebP (and some other formats) images,
    // so re-encode anything that isn't JPEG/PNG before sending to the AI.
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(mimeType)) {
      try {
        buffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
        mimeType = 'image/jpeg';
      } catch {
        // Leave as-is; the AI call will surface a clear error below.
      }
    }
    const base64 = buffer.toString('base64');

    // ── Strict pre-validation: does the image actually contain food? ──
    // Runs BEFORE food recognition. Text, labels, words, or drawings never
    // count — a paper with "Chapathi" written on it is not food.
    const foodPresent = await detectFoodPresence({ imageBase64: base64, mimeType });
    if (!foodPresent) {
      return error('Sorry, no food detected.', 422, 'NO_FOOD_DETECTED');
    }

    const ai = getFoodRecognitionClient();
    const content = await ai.vision({
      system: VISION_PROMPT,
      user: 'Identify the food(s) in this image and return the JSON as instructed.',
      imageBase64: base64,
      mimeType,
    });

    let aiResponse: AIResponse;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      aiResponse = JSON.parse(jsonMatch[0]);
    } catch {
      return error('Failed to parse AI food recognition response', 500, 'AI_001');
    }

    // Strict food-presence gate: reject images that don't actually contain an
    // edible food/drink item. Text, labels, or words visible in the image never
    // count as food.
    const aiFoods = aiResponse.foods ?? [];
    if (aiResponse.food_detected === false || aiFoods.length === 0) {
      return error('Sorry, no food detected.', 422, 'NO_FOOD_DETECTED');
    }

    // Safety net: expand any compound food names ("Dosa + Kadala Curry") into
    // individual foods so each dish is recognized and stored separately. The
    // combined dish's ingredients/variants can't be attributed per-part, so
    // they are dropped and each part is resolved independently below.
    aiResponse.foods = (aiResponse.foods || []).flatMap((food) => {
      if (!food.name) return [food];
      const parts = splitFoodNames(food.name);
      if (parts.length <= 1) return [food];
      return parts.map((partName) => ({
        ...food,
        name: partName,
        ingredients: [],
        variants: [],
      }));
    });

    // Load the ingredient nutrition master table once per request and build a
    // matcher that resolves raw AI ingredient names against it.
    const ingredientRows = await db.ingredient.findMany();
    const matcher = new IngredientMatcher(
      ingredientRows.map((r) => ({
        id: r.id,
        name: r.name,
        isVeg: r.isVeg,
        isVegan: r.isVegan,
        containsAllergen: r.containsAllergen,
        caloriesPer100g: r.caloriesPer100g,
        proteinPer100g: r.proteinPer100g,
        carbsPer100g: r.carbsPer100g,
        fatPer100g: r.fatPer100g,
        fiberPer100g: r.fiberPer100g,
        sugarPer100g: r.sugarPer100g,
        sodiumMgPer100g: r.sodiumMgPer100g,
      }))
    );

    // Load known "new foods" for reuse lookup (skip rejected).
    const storedFoods = await db.unknownFoodSubmission.findMany({
      where: { status: { not: 'rejected' }, computedNutritionJson: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const results: RecognizedFoodResult[] = [];

    for (const food of aiResponse.foods || []) {
      if (!food.name) continue;

      const servingDescription = food.serving_description || '';
      const portionType = resolveMeasurementType(food);
      const { grams: defaultGrams, ml: defaultMl, pieces: defaultPieces } = defaultPortion(food, portionType);

      const findMealExact = (name: string) =>
        db.meal.findFirst({
          where: {
            isActive: true,
            OR: [
              { name: { equals: name } },
              { aliases: { some: { aliasName: { equals: name } } } },
            ],
          },
          include: { nutrition: true, servings: true },
        });

      const findMeal = async (name: string) => {
        const exact = await findMealExact(name);
        if (exact) return exact;
        return db.meal.findFirst({
          where: {
            isActive: true,
            OR: [
              { name: { contains: name } },
              { aliases: { some: { aliasName: { contains: name } } } },
            ],
          },
          include: { nutrition: true, servings: true },
        });
      };

      // ── Reuse check: New Foods store ──
      const lower = food.name.toLowerCase();
      const storedHit = storedFoods.find(
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
        const variantMeal = await findMeal(variant);
        variantResults.push({
          name: variant,
          matched: !!variantMeal,
          meal: variantMeal,
          estimatedNutrition: null,
        });
        if (!matchedVariantMeal && variantMeal) matchedVariantMeal = variantMeal;
      }

      // ── Primary meal: exact name wins, then a matched variant, then a loose
      //    `contains` match (so a generic "Biryani" never quietly resolves to
      //    an unrelated "… Biryani" row when a specific variant is in the DB).
      const primaryMeal: MealWithNutrition = storedHit
        ? null
        : ((await findMealExact(food.name)) ?? matchedVariantMeal ?? (await findMeal(food.name)));

      // ── Extract ingredients (for tier 2/3 + storage) ──
      const ingredientItems: IngredientItem[] = (food.ingredients || [])
        .map((i) => ({
          name: i.name,
          grams: Math.max(1, i.estimated_grams ?? 10),
        }))
        .slice(0, 8);

      // Resolve ingredient ids for matched items
      const ingredientResolved = ingredientItems.map((item) => {
        const resolved = matcher.resolve(item.name);
        return { name: resolved.name, grams: item.grams, matched: resolved.matched };
      });

      const composed = matcher.compose(ingredientItems);
      const composedTotalGrams = ingredientItems.reduce((sum, i) => sum + i.grams, 0);

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
        totalGrams = composedTotalGrams || defaultGrams;
        if (composed.nutrition) {
          estimatedNutrition = composed.nutrition;
          nutritionSource = composed.missing.length === 0 ? 'ingredients' : 'extracted';
        } else {
          nutritionSource = 'extracted';
          estimatedNutrition = null;
        }
      }

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
        portionOptions: buildPortionOptions(portionType, estimateForOptions),
        estimatedNutrition,
        ingredients: ingredientResolved,
        matched,
        unknown_food: unknownFood,
        meal,
        mealId,
        newFoodId,
      });
    }

    // Final safety net: if nothing survived the per-food validation (e.g. the
    // model emitted food objects without a name), treat it as no food.
    if (results.length === 0) {
      return error('Sorry, no food detected.', 422, 'NO_FOOD_DETECTED');
    }

    // Persist the uploaded image temporarily so the confirm step can attach it
    // to a meal (public/uploads/<dietType>/<name>-<ts>.<ext>) if the user logs
    // it. Written only now so failed recognitions never leave orphaned files.
    let tempImagePath: string | null = null;
    try {
      const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
      const tempRelPath = `/uploads/temp/temp-${userId}-${Date.now()}.${ext}`;
      await mkdir(path.join(process.cwd(), 'public', 'uploads', 'temp'), { recursive: true });
      await writeFile(path.join(process.cwd(), 'public', tempRelPath), buffer);
      tempImagePath = tempRelPath;
    } catch (err) {
      // Non-fatal: the scan still works, the image just won't be attached.
      console.warn('Failed to persist temp image:', err);
    }

    await logAiCall({
      userId,
      modelType: 'food-recognition',
      requestPayload: JSON.stringify({
        fileName: file.name,
        size: file.size,
        mimeType,
      }).slice(0, 2000),
      responsePayload: JSON.stringify(results).slice(0, 4000),
      latencyMs: Date.now() - startedAt,
    });

    return created({ foods: results, tempImagePath });
  } catch (err) {
    console.error('Food recognize error:', err);
    await logAiCall({
      userId: userId ?? undefined,
      modelType: 'food-recognition',
      requestPayload: '',
      responsePayload: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    });
    const msg = err instanceof Error ? err.message : 'Recognition failed';
    if (msg.includes('format') || msg.includes('解析')) {
      return error('Failed to process image. Please try a different format (JPG, PNG, or WebP).');
    }
    if (msg.includes('Failed to load image') || msg.includes('Failed to load image or audio')) {
      return error('Could not read the image. The file may be corrupted or too small.');
    }
    if (
      msg.includes('AI request failed') ||
      msg.includes('Empty AI') ||
      msg.includes('fetch failed') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('timed out') ||
      msg.includes('unreachable')
    ) {
      return error(
        'Food recognition is temporarily unavailable. Please make sure the local AI server is running.'
      );
    }
    return serverError();
  }
}
