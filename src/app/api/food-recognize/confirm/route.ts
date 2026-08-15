import { copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError, error } from '@/lib/response';
import { scaleNutrition, type ScaledNutrition } from '@/lib/nutrition-engine';
import { IngredientMatcher } from '@/lib/ingredient-matching';
import { extractRecipeIngredients } from '@/lib/ai/client';
import { splitFoodNames } from '@/lib/food-names';

interface ConfirmBody {
  name: string;
  mealId?: string;
  newFoodId?: string;
  tempImagePath?: string;
  ingredients?: Array<{ name: string; grams: number }>;
  portionType: 'piece' | 'portion' | 'bowl' | 'drink' | 'weight';
  gramsPerPiece?: number;
  totalGrams?: number;
  portionValue: number;
  unit: 'g' | 'pc' | 'ml';
  mealType?: string;
  cuisine?: string;
  servingDescription?: string;
}

interface ResolvedFood {
  name: string;
  grams: number;
  unit: 'g';
  nutrition: ScaledNutrition;
  mealId: string | null;
  newFoodId: string | null;
  submissionId?: string | null;
  missingIngredients?: string[];
}

async function findMealByName(name: string) {
  const exact = await db.meal.findFirst({
    where: {
      isActive: true,
      OR: [
        { name: { equals: name } },
        { aliases: { some: { aliasName: { equals: name } } } },
      ],
    },
    include: { nutrition: true },
  });
  if (exact) return exact;
  return db.meal.findFirst({
    where: {
      isActive: true,
      OR: [
        { name: { contains: name } },
        { aliases: { some: { aliasName: { contains: name } } } },
      ],
    },
    include: { nutrition: true },
  });
}

// ═══ Image persistence helpers ═══

const DIET_FOLDERS = ['non-veg', 'vegetarian', 'vegan', 'eggetarian'];

// Map the user's dietary preference to a safe subfolder name under /uploads/.
function dietFolder(dietType?: string | null): string {
  const value = (dietType || '').toLowerCase().trim();
  return DIET_FOLDERS.includes(value) ? value : 'general';
}

// Meal name → filesystem-safe filename fragment.
function sanitizeFileName(name: string): string {
  return (
    (name || 'meal')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'meal'
  );
}

// Only accept files our own recognize step created (temp-<user>-<ts>.<ext>),
// blocking path traversal / arbitrary uploads from the request body.
function safeTempBasename(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const base = path.basename(raw);
  if (!/^temp-[\w-]+\.(jpg|jpeg|png|webp)$/i.test(base)) return null;
  return base;
}

// Move a file, falling back to copy+delete if rename crosses devices.
async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EXDEV' || code === 'EINVAL' || code === 'EPERM') {
      await copyFile(from, to);
      await unlink(from);
    } else {
      throw err;
    }
  }
}

// Attach the scanned image to a meal unless it already has one:
//   - meal already has imageUrl → keep it, delete the temp file.
//   - otherwise move temp → /uploads/<diet>/<name>-<ts>.<ext> and persist.
// Returns the final imageUrl (or null when there is nothing to attach).
async function persistMealImage(opts: {
  userId: string;
  tempImagePath?: string;
  mealId: string | null;
  mealName?: string;
}): Promise<string | null> {
  if (!opts.tempImagePath || !opts.mealId) return null;

  const tempBase = safeTempBasename(opts.tempImagePath);
  if (!tempBase) return null;

  const tempFile = path.join(process.cwd(), 'public', 'uploads', 'temp', tempBase);
  try {
    await stat(tempFile);
  } catch {
    return null; // temp file missing → nothing to do
  }

  const meal = await db.meal.findUnique({
    where: { id: opts.mealId },
    select: { imageUrl: true },
  });
  if (!meal) {
    await unlink(tempFile).catch(() => {});
    return null;
  }

  if (meal.imageUrl) {
    // Never overwrite an existing image — just clean up the temp upload.
    await unlink(tempFile).catch(() => {});
    return meal.imageUrl;
  }

  const preference = await db.userPreference.findUnique({
    where: { userId: opts.userId },
    select: { dietType: true },
  });

  const folder = dietFolder(preference?.dietType);
  const ext = path.extname(tempBase) || '.jpg';
  const finalRelPath = `/uploads/${folder}/${sanitizeFileName(opts.mealName || 'meal')}-${Date.now()}${ext}`;
  const finalFile = path.join(process.cwd(), 'public', finalRelPath);

  await moveFile(tempFile, finalFile);
  await db.meal.update({ where: { id: opts.mealId }, data: { imageUrl: finalRelPath } });
  return finalRelPath;
}

async function resolveFood(item: ConfirmBody, userId: string): Promise<ResolvedFood> {
  const name = item.name;

  // Convert the confirmed portion to grams (1ml ≈ 1g for beverages).
  const grams = Math.round(
    item.unit === 'pc'
      ? item.portionValue * (item.gramsPerPiece || 80)
      : item.portionValue
  );

  let nutrition: ScaledNutrition;
  let mealId: string | null = item.mealId ?? null;
  let newFoodId: string | null = item.newFoodId ?? null;
  let submissionId: string | null = null;
  let missingIngredients: string[] | undefined;

  // ── Tier 1: DB meal nutrition, scaled by confirmed grams ──
  if (item.mealId) {
    const meal = await db.meal.findUnique({
      where: { id: item.mealId },
      include: { nutrition: true },
    });
    if (!meal?.nutrition) {
      throw new ConfirmError('Meal nutrition not found', 404, 'NOT_FOUND');
    }
    nutrition = scaleNutrition(
      {
        calories: meal.nutrition.calories,
        proteinG: meal.nutrition.proteinG,
        carbsG: meal.nutrition.carbsG,
        fatG: meal.nutrition.fatG,
        fiberG: meal.nutrition.fiberG ?? undefined,
        sugarG: meal.nutrition.sugarG ?? undefined,
        sodiumMg: meal.nutrition.sodiumMg ?? undefined,
      },
      grams
    );
  } else if (item.newFoodId) {
    // ── Tier 2: previously saved unknown food, rescaled to confirmed grams ──
    const stored = await db.unknownFoodSubmission.findUnique({
      where: { id: item.newFoodId },
    });
    if (!stored?.computedNutritionJson) {
      throw new ConfirmError('Stored food nutrition not found', 404, 'NOT_FOUND');
    }
    const parsed = JSON.parse(stored.computedNutritionJson) as ScaledNutrition;
    const baseGms = stored.baseServingGms || grams;
    const per100 = {
      calories: (parsed.calories / baseGms) * 100,
      proteinG: (parsed.proteinG / baseGms) * 100,
      carbsG: (parsed.carbsG / baseGms) * 100,
      fatG: (parsed.fatG / baseGms) * 100,
      fiberG: (parsed.fiberG / baseGms) * 100,
      sugarG: (parsed.sugarG / baseGms) * 100,
      sodiumMg: (parsed.sodiumMg / baseGms) * 100,
    };
    nutrition = scaleNutrition(per100, grams);
  } else {
    // ── Tier 3: try a DB meal lookup by confirmed name ──
    const namedMeal = await findMealByName(name);
    if (namedMeal?.nutrition) {
      mealId = namedMeal.id;
      nutrition = scaleNutrition(
        {
          calories: namedMeal.nutrition.calories,
          proteinG: namedMeal.nutrition.proteinG,
          carbsG: namedMeal.nutrition.carbsG,
          fatG: namedMeal.nutrition.fatG,
          fiberG: namedMeal.nutrition.fiberG ?? undefined,
          sugarG: namedMeal.nutrition.sugarG ?? undefined,
          sodiumMg: namedMeal.nutrition.sodiumMg ?? undefined,
        },
        grams
      );
    } else {
      // ── Tier 4 (fallback): AI gives the recipe ingredients; the backend
      // computes nutrition from the Ingredient table (never from the AI).
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

      let items = (item.ingredients || [])
        .map((i) => ({ name: i.name, grams: Math.max(1, i.grams || 0) }))
        .filter((i) => i.name.trim().length > 0);

      // No ingredients from the scan → ask the AI to extract the recipe.
      if (!items.length) {
        const extracted = await extractRecipeIngredients({
          foodName: name,
          servingDescription: item.servingDescription,
        });
        items = extracted.map((i) => ({ name: i.name, grams: Math.max(1, i.grams) }));
      }

      const composed = matcher.compose(items);
      if (!composed.nutrition) {
        throw new ConfirmError(
          'Could not compute nutrition for this food. Please enter its calories manually.',
          422,
          'NO_NUTRITION'
        );
      }
      missingIngredients = composed.missing;

      const baseGms = item.totalGrams || grams || items.reduce((s, i) => s + i.grams, 0);
      const ratio = grams / baseGms;
      nutrition = {
        calories: Math.round(composed.nutrition.calories * ratio),
        proteinG: Math.round(composed.nutrition.proteinG * ratio * 10) / 10,
        carbsG: Math.round(composed.nutrition.carbsG * ratio * 10) / 10,
        fatG: Math.round(composed.nutrition.fatG * ratio * 10) / 10,
        fiberG: Math.round(composed.nutrition.fiberG * ratio * 10) / 10,
        sugarG: Math.round(composed.nutrition.sugarG * ratio * 10) / 10,
        sodiumMg: Math.round(composed.nutrition.sodiumMg * ratio),
      };

      // Save as a new cooked meal so it is recognized in the future.
      const per100 = (v: number) => Math.round(((v / baseGms) * 100) * 10) / 10;
      const mealType = item.mealType || (item.portionType === 'drink' ? 'snack' : 'lunch');
      const meal = await db.meal.create({
        data: {
          name,
          mealType,
          cuisine: item.cuisine || 'general',
          isVeg: composed.flags.isVeg,
          isVegan: composed.flags.isVegan,
          isEggetarian: composed.flags.isVeg && !composed.flags.isVegan,
          baseServingGms: grams || 100,
          source: 'user',
          nutrition: {
            create: {
              calories: per100(nutrition.calories),
              proteinG: per100(nutrition.proteinG),
              carbsG: per100(nutrition.carbsG),
              fatG: per100(nutrition.fatG),
              fiberG: per100(nutrition.fiberG),
              sugarG: per100(nutrition.sugarG),
              sodiumMg: per100(nutrition.sodiumMg),
              perServingGms: 100,
            },
          },
          servings: {
            create: {
              servingName: 'Confirmed Serving',
              servingGms: grams || 100,
              multiplier: (grams || 100) / 100,
            },
          },
          aliases: {
            create: { aliasName: name.toLowerCase() },
          },
          ingredients: {
            create: composed.resolved
              .filter((r) => r.matched)
              .map((r) => ({
                ingredientName: r.name,
                containsAllergen: r.containsAllergen ?? false,
                amountGrams: r.grams,
                ingredientId: (r.row as { id?: string } | null)?.id ?? null,
              })),
          },
        },
        include: { nutrition: true },
      });
      mealId = meal.id;

      // Record the submission for audit/reuse.
      const submission = await db.unknownFoodSubmission.create({
        data: {
          userId,
          aiDetectedName: name,
          confirmedName: name,
          confirmedPortion: grams || 100,
          caloriesPer100g: per100(nutrition.calories),
          proteinPer100g: per100(nutrition.proteinG),
          carbsPer100g: per100(nutrition.carbsG),
          fatPer100g: per100(nutrition.fatG),
          status: 'submitted',
          ingredientsJson: JSON.stringify(
            composed.resolved.map((r) => ({ name: r.name, grams: r.grams, matched: r.matched }))
          ),
          computedNutritionJson: JSON.stringify(nutrition),
          baseServingGms: grams || 100,
        },
      });
      submissionId = submission.id;
      newFoodId = null;
    }
  }

  return {
    name,
    grams,
    unit: 'g' as const,
    nutrition,
    mealId,
    newFoodId,
    submissionId,
    missingIngredients,
  };
}

class ConfirmError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const body = (await request.json()) as ConfirmBody;

    if (!body.name) return error('name is required');
    const validPortionTypes = ['piece', 'portion', 'bowl', 'drink', 'weight'];
    if (!validPortionTypes.includes(body.portionType)) {
      return error('portionType must be one of: piece, portion, bowl, drink, weight');
    }
    if (!body.portionValue || body.portionValue <= 0) {
      return error('portionValue must be a positive number');
    }
    if (body.unit !== 'g' && body.unit !== 'pc' && body.unit !== 'ml') {
      return error('unit must be g, pc, or ml');
    }

    // Split any compound name ("Dosa + Kadala Curry") into individual foods so
    // each dish is resolved and stored separately — never as one combined meal.
    const parts = splitFoodNames(body.name);
    const items: ConfirmBody[] = parts.map((name) => ({
      ...body,
      name,
      mealId: undefined,
      newFoodId: undefined,
    }));

    // Attach the scanned image to the matched/created meal (only the first
    // food of a multi-dish scan gets it), then link it to any new food
    // submissions created by this scan for audit/reuse.
    const persistScanImage = async (foods: ResolvedFood[]) => {
      const target = foods.find((f) => f.mealId) ?? foods[0];
      let imageUrl: string | null = null;
      if (target?.mealId) {
        imageUrl = await persistMealImage({
          userId: session.userId,
          tempImagePath: body.tempImagePath,
          mealId: target.mealId,
          mealName: target.name,
        });
      }
      if (imageUrl) {
        for (const f of foods) {
          if (f.submissionId) {
            await db.unknownFoodSubmission.update({
              where: { id: f.submissionId },
              data: { imageFilePath: imageUrl },
            });
          }
        }
      }
      return imageUrl;
    };

    if (items.length === 1) {
      const resolved = await resolveFood(items[0], session.userId);
      const imageUrl = await persistScanImage([resolved]);
      return success(imageUrl ? { ...resolved, imageUrl } : resolved);
    }

    const foods: ResolvedFood[] = [];
    for (const item of items) {
      foods.push(await resolveFood(item, session.userId));
    }
    const totalNutrition: ScaledNutrition = foods.reduce(
      (acc, f) => ({
        calories: acc.calories + f.nutrition.calories,
        proteinG: Math.round((acc.proteinG + f.nutrition.proteinG) * 10) / 10,
        carbsG: Math.round((acc.carbsG + f.nutrition.carbsG) * 10) / 10,
        fatG: Math.round((acc.fatG + f.nutrition.fatG) * 10) / 10,
        fiberG: Math.round((acc.fiberG + f.nutrition.fiberG) * 10) / 10,
        sugarG: Math.round((acc.sugarG + f.nutrition.sugarG) * 10) / 10,
        sodiumMg: acc.sodiumMg + f.nutrition.sodiumMg,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0 }
    );

    const imageUrl = await persistScanImage(foods);
    return success(imageUrl ? { foods, totalNutrition, imageUrl } : { foods, totalNutrition });
  } catch (err) {
    console.error('Confirm food error:', err);
    if (err instanceof ConfirmError) {
      return error(err.message, err.status, err.code);
    }
    return serverError();
  }
}
