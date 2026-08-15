import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import {
  getSlotTargets,
  scaleNutrition,
  type MealSlot,
} from '@/lib/nutrition-engine';
import { success, unauthorized, serverError, error } from '@/lib/response';
import { getRecommendationClient, logAiCall } from '@/lib/ai/client';
import {
  TOP_N,
  computeScore,
  filterCandidates,
  getDateDaysAgo,
  getTodayStr,
  loadCandidateMeals,
  scaleServingToSlot,
  type MealCandidate,
} from '@/lib/recommendation-engine';

interface RankingEntry {
  meal_id: string;
  rank: number;
  reason?: string;
}

// Cap how long we wait for the AI ranking before the existing
// deterministic fallback takes over (keeps Home loads fast).
const RECOMMENDATION_AI_TIMEOUT_MS = 2000;

export async function GET(request: Request) {
  const startedAt = Date.now();
  let userId: string | null = null;
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();
    userId = session.userId;

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

    // Aliases for safe closure usage (TS resets narrowing inside nested functions)
    const cuisinePreference = user.preference?.cuisinePreference ?? null;
    const dietPreference = user.preference?.dietType?.toLowerCase();
    const userGoalType = user.goal?.goalType || 'not set';

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
      : { calories: 500, proteinG: 30, carbsG: 60, fatG: 15 };

    const consumed = {
      calories: dailyNutrition?.consumedCalories || 0,
      proteinG: dailyNutrition?.consumedProtein || 0,
      carbsG: dailyNutrition?.consumedCarbs || 0,
      fatG: dailyNutrition?.consumedFat || 0,
    };
    const slotTargets = getSlotTargets(dailyTargets, consumed)[slot];

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
      select: { mealId: true, meal: { select: { name: true } } },
      distinct: ['mealId'],
    });
    const recentMealIds = new Set(
      recentLogItems.map((i) => i.mealId).filter((id): id is string => !!id)
    );
    const recentMealNames = recentLogItems
      .map((i) => i.meal?.name)
      .filter((n): n is string => !!n);

    // Get user allergen names for ingredient matching
    const userAllergenNames = user.allergies.map((a) =>
      a.allergyName.toLowerCase()
    );

    // Get all meals with nutrition
    const allMeals = await loadCandidateMeals();

    let candidates = filterCandidates(allMeals, {
      slot,
      userAllergenNames,
      cuisinePreference,
      dietPreference,
      recentMealIds,
      slotTargets,
      strictCuisine: true,
    });
    if (candidates.length < TOP_N) {
      candidates = filterCandidates(allMeals, {
        slot,
        userAllergenNames,
        cuisinePreference,
        dietPreference,
        recentMealIds,
        slotTargets,
        strictCuisine: false,
      });
    }

    // --- Stage 8: AI ranking (Gemma via LM Studio), with deterministic fallback
    const aiReasons = new Map<string, string>();
    let topMeals = candidates;

    try {
      // Keep AI payload small: pre-rank by macro fit and send top 30
      const preRanked = [...candidates].sort(
        (a, b) =>
          computeScore(b, slotTargets, cuisinePreference) -
          computeScore(a, slotTargets, cuisinePreference)
      );
      const aiPool = preRanked.slice(0, 30);

      const candidateLines = aiPool
        .map(
          (meal, i) =>
            `${i + 1}. {"id":"${meal.id}","name":"${meal.name}","cuisine":"${meal.cuisine}","isVeg":${meal.isVeg},"calories":${meal.nutrition?.calories ?? 0},"proteinG":${meal.nutrition?.proteinG ?? 0},"carbsG":${meal.nutrition?.carbsG ?? 0},"fatG":${meal.nutrition?.fatG ?? 0}}`
        )
        .join('\n');

      const context = [
        `Meal slot: ${slot}`,
        `Slot targets (remaining): ${slotTargets.calories} kcal, ${slotTargets.proteinG}g protein, ${slotTargets.carbsG}g carbs, ${slotTargets.fatG}g fat`,
        `Goal: ${userGoalType}`,
        `Diet type: ${dietPreference ?? 'any'}`,
        cuisinePreference
          ? `Cuisine preference: ${cuisinePreference}`
          : null,
        recentMealNames.length > 0
          ? `Recently eaten (avoid if possible): ${recentMealNames.join(', ')}`
          : null,
      ]
        .filter((line): line is string => !!line)
        .join('\n');

      const systemPrompt = `You are a meal recommendation AI for a nutrition tracking app.

The backend has already removed foods the user is allergic to and filtered by dietary preference, meal slot, calorie budget, and recent meals. It also computed the user's remaining nutrition targets for this meal slot.

Your job: choose the best ${TOP_N} meals from the candidate list for the "${slot}" slot and rank them 1 to ${TOP_N}. Prefer meals whose macros best match the remaining targets and give the user variety (avoid recently eaten meals where possible).

Return ONLY a JSON object, no markdown, no commentary:
{ "rankings": [ { "meal_id": "...", "rank": 1, "reason": "short reason" } ] }
Rank them exactly 1 to ${TOP_N}. Use only meal_id values from the candidate list.`;

      const userPrompt = `${context}

Candidates:
${candidateLines}

Return the JSON ranking.`;

      const ai = getRecommendationClient();
      const aiRaw = await ai.chat({
        system: systemPrompt,
        user: userPrompt,
        timeoutMs: RECOMMENDATION_AI_TIMEOUT_MS,
      });

      interface AIRanking {
        rankings?: RankingEntry[];
      }
      const aiResponse = JSON.parse(
        (aiRaw.match(/\{[\s\S]*\}/) || ['{}'])[0]
      ) as AIRanking;

      const candidateIds = new Set(aiPool.map((m) => m.id));
      const validRankings = (aiResponse.rankings || [])
        .filter((r) => r && candidateIds.has(r.meal_id))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, TOP_N);

      if (validRankings.length >= 2) {
        const idToMeal = new Map(aiPool.map((m) => [m.id, m]));
        topMeals = validRankings
          .map((r) => idToMeal.get(r.meal_id))
          .filter((m): m is MealCandidate => !!m);
        for (const r of validRankings) {
          if (r.reason) aiReasons.set(r.meal_id, r.reason);
        }
      }
    } catch (err) {
      console.warn('AI ranking unavailable, using deterministic fallback:', err);
    }

    // --- Stage 9: fallback + final ordering
    if (topMeals.length === 0 || topMeals.length < TOP_N) {
      const fallback = [...allMeals]
        .sort(
          (a, b) =>
            computeScore(b, slotTargets, cuisinePreference) -
            computeScore(a, slotTargets, cuisinePreference)
        )
        .slice(0, TOP_N);
      topMeals = fallback;
    }

    const recommendations = topMeals.slice(0, TOP_N).map((meal) => {
      const recommendedServingGms = scaleServingToSlot(meal, slotTargets);

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
          isVeg: meal.isVeg,
          isVegan: meal.isVegan,
          description: meal.description,
        },
        score:
          Math.round(
            computeScore(meal, slotTargets, cuisinePreference) *
              10
          ) / 10,
        aiReason: aiReasons.get(meal.id) ?? null,
        recommendedServingGms,
        estimatedNutrition: scaledNutrition,
        baseNutritionPer100g: meal.nutrition
          ? {
              calories: meal.nutrition.calories,
              proteinG: meal.nutrition.proteinG,
              carbsG: meal.nutrition.carbsG,
              fatG: meal.nutrition.fatG,
            }
          : null,
      };
    });

    await logAiCall({
      userId,
      modelType: 'recommendation',
      requestPayload: JSON.stringify({ slot, slotTargets, candidateCount: candidates.length }),
      responsePayload: JSON.stringify(
        recommendations.map((r) => ({ id: r.meal.id, name: r.meal.name, reason: r.aiReason }))
      ),
      latencyMs: Date.now() - startedAt,
    });

    return success({
      slot,
      slotTargets,
      recommendations,
    });
  } catch (err) {
    console.error('Recommendations error:', err);
    await logAiCall({
      userId: userId ?? undefined,
      modelType: 'recommendation',
      requestPayload: '',
      responsePayload: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    });
    return serverError();
  }
}

