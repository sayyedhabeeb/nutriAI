import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { scaleNutrition, getSlotTargets, type MealSlot } from '@/lib/nutrition-engine';
import { success, unauthorized, serverError, error } from '@/lib/response';
import { getRecommendationClient, logAiCall } from '@/lib/ai/client';
import {
  TOP_POOL,
  buildRankedPool,
  getDateDaysAgo,
  getTodayStr,
  loadCandidateMeals,
  scaleServingToSlot,
  type RankedCandidate,
} from '@/lib/recommendation-engine';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const PICKS_PER_SLOT = 3;

interface SlotPick {
  mealId: string;
  reason?: string;
}

function isValidSlot(value: string | null): value is MealSlot {
  return !!value && (SLOTS as string[]).includes(value);
}

async function loadRecentMeals(userId: string, days: number) {
  const since = getDateDaysAgo(days);
  const recentLogItems = await db.foodLogItem.findMany({
    where: {
      foodLog: { userId, logDate: { gte: since } },
      mealId: { not: null },
    },
    select: { mealId: true, meal: { select: { name: true } } },
    distinct: ['mealId'],
  });
  const ids = new Set(
    recentLogItems.map((i) => i.mealId).filter((id): id is string => !!id)
  );
  const names = recentLogItems
    .map((i) => i.meal?.name)
    .filter((n): n is string => !!n);
  return { ids, names };
}

function candidateLines(pool: RankedCandidate[]): string {
  return pool
    .map(
      (rc, i) =>
        `${i + 1}. {"id":"${rc.meal.id}","name":"${rc.meal.name}","cuisine":"${rc.meal.cuisine}","isVeg":${rc.meal.isVeg},"calories":${rc.meal.nutrition?.calories ?? 0},"proteinG":${rc.meal.nutrition?.proteinG ?? 0},"carbsG":${rc.meal.nutrition?.carbsG ?? 0},"fatG":${rc.meal.nutrition?.fatG ?? 0}}`
    )
    .join('\n');
}

function buildContext(opts: {
  userGoalType: string;
  dietPreference?: string | null;
  cuisinePreference?: string | null;
  recentMealNames: string[];
  slotTargets?: Record<MealSlot, { calories: number; proteinG: number; carbsG: number; fatG: number }>;
  slot?: MealSlot;
}): string {
  return [
    `Goal: ${opts.userGoalType}`,
    `Diet type: ${opts.dietPreference ?? 'any'}`,
    opts.cuisinePreference ? `Cuisine preference: ${opts.cuisinePreference}` : null,
    opts.recentMealNames.length > 0
      ? `Recently eaten in the last 2 days (DO NOT recommend): ${opts.recentMealNames.join(', ')}`
      : null,
    ...(opts.slot
      ? (() => {
          const st = opts.slotTargets![opts.slot!];
          return [`${opts.slot} targets: ${st.calories} kcal, ${st.proteinG}g protein, ${st.carbsG}g carbs, ${st.fatG}g fat`];
        })()
      : (opts.slotTargets
          ? SLOTS.map((slot) => {
              const st = opts.slotTargets![slot];
              return `${slot} targets: ${st.calories} kcal, ${st.proteinG}g protein, ${st.carbsG}g carbs, ${st.fatG}g fat`;
            })
          : [])),
  ]
    .filter((line): line is string => !!line)
    .join('\n');
}

// One AI call that picks up to PICKS_PER_SLOT meals per slot for the whole day,
// told to avoid duplicates across slots and recently-eaten foods.
async function aiPickFullDay(opts: {
  pools: Record<MealSlot, RankedCandidate[]>;
  slotTargets: Record<MealSlot, { calories: number; proteinG: number; carbsG: number; fatG: number }>;
  userGoalType: string;
  dietPreference?: string | null;
  cuisinePreference?: string | null;
  recentMealNames: string[];
}): Promise<Partial<Record<MealSlot, SlotPick[]>>> {
  const activeSlots = SLOTS.filter((slot) => opts.pools[slot].length > 0);
  if (activeSlots.length === 0) return {};

  try {
    const candidateBlock = activeSlots
      .map((slot) => `[${slot}]\n${candidateLines(opts.pools[slot])}`)
      .join('\n\n');

    const context = buildContext(opts);
    const systemPrompt = `You are a meal plan AI for a nutrition tracking app.

The backend has already removed foods the user is allergic to and filtered by dietary preference, meal type, calorie budget, cuisine preference, and foods eaten in the last 2 days. Candidates per meal slot are ranked best-first.

Your job: choose exactly ${PICKS_PER_SLOT} distinct meals PER slot from the candidates, matching macros to each slot's targets, ranked best-first (the best option first). You MUST NOT choose the same meal for two different slots, and you MUST NOT recommend anything in the recently-eaten list.

Return ONLY a JSON object, no markdown, no commentary:
{ "picks": { "breakfast": [{"meal_id":"...","reason":"short reason"},{"meal_id":"...","reason":"..."},{"meal_id":"...","reason":"..."}], "lunch": [ ... ], "dinner": [ ... ], "snack": [ ... ] } }
Return exactly ${PICKS_PER_SLOT} meal_id values per slot, each from that slot's candidate list. If you cannot fill all ${PICKS_PER_SLOT} with high-confidence choices, return as many as you are confident about.`;

    const userPrompt = `${context}

Candidates (ranked best-first per slot):
${candidateBlock}

Return the JSON picks.`;

    const ai = getRecommendationClient();
    const aiRaw = await ai.chat({ system: systemPrompt, user: userPrompt });
    const parsed = JSON.parse((aiRaw.match(/\{[\s\S]*\}/) || ['{}'])[0]);
    const rawPicks = (parsed.picks ?? {}) as Record<string, unknown>;

    const result: Partial<Record<MealSlot, SlotPick[]>> = {};
    const usedGlobally = new Set<string>();
    for (const slot of activeSlots) {
      const slotPool = new Set(opts.pools[slot].map((rc) => rc.meal.id));
      const raw = Array.isArray(rawPicks[slot]) ? (rawPicks[slot] as Array<{ meal_id?: string; reason?: string }>) : [];
      const picks: SlotPick[] = [];
      for (const p of raw) {
        if (p && typeof p.meal_id === 'string' && slotPool.has(p.meal_id) && !usedGlobally.has(p.meal_id)) {
          usedGlobally.add(p.meal_id);
          picks.push({ mealId: p.meal_id, reason: p.reason });
        }
        if (picks.length >= PICKS_PER_SLOT) break;
      }
      if (picks.length > 0) result[slot] = picks;
    }
    return result;
  } catch (err) {
    console.warn('AI meal plan generation unavailable, using deterministic fallback:', err);
    return {};
  }
}

// AI picks up to PICKS_PER_SLOT next-best meals for one slot from its ranked pool (refresh).
async function aiPickSlotOptions(opts: {
  slot: MealSlot;
  pool: RankedCandidate[];
  slotTargets: { calories: number; proteinG: number; carbsG: number; fatG: number };
  userGoalType: string;
  dietPreference?: string | null;
  cuisinePreference?: string | null;
  recentMealNames: string[];
}): Promise<SlotPick[]> {
  try {
    const context = buildContext({
      userGoalType: opts.userGoalType,
      dietPreference: opts.dietPreference,
      cuisinePreference: opts.cuisinePreference,
      recentMealNames: opts.recentMealNames,
      slot: opts.slot,
      slotTargets: { breakfast: opts.slotTargets, lunch: opts.slotTargets, dinner: opts.slotTargets, snack: opts.slotTargets },
    });
    const systemPrompt = `You are a meal plan AI for a nutrition tracking app.

The backend has filtered these candidates by allergy, dietary preference, meal type, calorie budget, cuisine preference, foods eaten in the last 2 days, and meals already chosen for other slots today. They are ranked best-first.

Your job: pick the best ${PICKS_PER_SLOT} meals for the "${opts.slot}" slot from the candidates, ranked best-first, avoiding anything in the recently-eaten list.

Return ONLY a JSON object, no markdown, no commentary:
{ "pick": [{"meal_id":"...","reason":"short reason"},{"meal_id":"...","reason":"..."},{"meal_id":"...","reason":"..."}] }
Return up to ${PICKS_PER_SLOT} meal_id values from the candidate list.`;

    const userPrompt = `${context}

Candidates:
${candidateLines(opts.pool)}

Return the JSON pick.`;

    const ai = getRecommendationClient();
    const aiRaw = await ai.chat({ system: systemPrompt, user: userPrompt });
    const parsed = JSON.parse((aiRaw.match(/\{[\s\S]*\}/) || ['{}'])[0]);
    const rawList = parsed.pick ?? parsed.picks?.[opts.slot];
    if (!Array.isArray(rawList)) return [];
    const poolIds = new Set(opts.pool.map((rc) => rc.meal.id));
    const picks: SlotPick[] = [];
    for (const p of rawList) {
      if (p && typeof p.meal_id === 'string' && poolIds.has(p.meal_id)) {
        picks.push({ mealId: p.meal_id, reason: p.reason });
      }
      if (picks.length >= PICKS_PER_SLOT) break;
    }
    return picks;
  } catch (err) {
    console.warn('AI meal refresh unavailable, using deterministic fallback:', err);
    return [];
  }
}

function toItemsForSlot(
  slot: MealSlot,
  pool: RankedCandidate[],
  picks: SlotPick[],
  slotTargets: { calories: number; proteinG: number; carbsG: number; fatG: number },
  usedMealIds: Set<string>
) {
  const items: {
    mealId: string;
    mealSlot: MealSlot;
    servingGms: number;
    recommendedCalories: number;
    rankScore: number;
    rankPosition: number;
  }[] = [];

  const poolById = new Map(pool.map((rc) => [rc.meal.id, rc]));
  const chosen: RankedCandidate[] = [];

  // 1) AI picks first, in the order the AI returned them.
  for (const pick of picks) {
    const rc = poolById.get(pick.mealId);
    if (rc && !usedMealIds.has(rc.meal.id) && !chosen.includes(rc)) {
      chosen.push(rc);
    }
  }
  // 2) Fill any remaining positions with the next highest-scored unused meals.
  const byScore = [...pool].sort((a, b) => b.score - a.score);
  for (const rc of byScore) {
    if (chosen.length >= PICKS_PER_SLOT) break;
    if (!usedMealIds.has(rc.meal.id) && !chosen.includes(rc)) {
      chosen.push(rc);
    }
  }

  for (const rc of chosen) {
    usedMealIds.add(rc.meal.id);
    const servingGms = scaleServingToSlot(rc.meal, slotTargets);
    const scaled = scaleNutrition(
      {
        calories: rc.meal.nutrition?.calories ?? 0,
        proteinG: rc.meal.nutrition?.proteinG ?? 0,
        carbsG: rc.meal.nutrition?.carbsG ?? 0,
        fatG: rc.meal.nutrition?.fatG ?? 0,
        fiberG: rc.meal.nutrition?.fiberG ?? 0,
        sugarG: rc.meal.nutrition?.sugarG ?? 0,
        sodiumMg: rc.meal.nutrition?.sodiumMg ?? 0,
        calciumMg: rc.meal.nutrition?.calciumMg ?? 0,
        ironMg: rc.meal.nutrition?.ironMg ?? 0,
        zincMg: rc.meal.nutrition?.zincMg ?? 0,
        magnesiumMg: rc.meal.nutrition?.magnesiumMg ?? 0,
        cholesterolMg: rc.meal.nutrition?.cholesterolMg ?? 0,
      },
      servingGms
    );
    items.push({
      mealId: rc.meal.id,
      mealSlot: slot,
      servingGms,
      recommendedCalories: scaled.calories,
      rankScore: rc.score,
      rankPosition: items.length + 1,
    });
  }

  return items;
}

async function resolvePlan(
  pools: Record<MealSlot, RankedCandidate[]>,
  picks: Partial<Record<MealSlot, SlotPick[]>>,
  slotTargets: Record<MealSlot, { calories: number; proteinG: number; carbsG: number; fatG: number }>
) {
  const usedMealIds = new Set<string>();
  const items: {
    mealId: string;
    mealSlot: MealSlot;
    servingGms: number;
    recommendedCalories: number;
    rankScore: number;
    rankPosition: number;
  }[] = [];

  for (const slot of SLOTS) {
    const pool = pools[slot];
    if (pool.length === 0) continue;
    items.push(...toItemsForSlot(slot, pool, picks[slot] ?? [], slotTargets[slot], usedMealIds));
  }

  return items;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  let userId: string | null = null;
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();
    userId = session.userId;

    const { searchParams } = new URL(request.url);
    const refreshSlot = searchParams.get('refresh');

    const today = getTodayStr();

    // ── Refresh: swap a slot's meals from its already-ranked pool ──
    if (refreshSlot) {
      if (!isValidSlot(refreshSlot)) {
        return error(`Invalid refresh slot. Must be one of: ${SLOTS.join(', ')}`);
      }
      return await refreshSlotPlan(refreshSlot, session.userId, startedAt);
    }

    // ── Initial generation ──
    // A complete plan is left untouched. Legacy/incomplete plans (e.g. created
    // before 3 picks per slot) are rebuilt automatically.
    const expectedItemCount = SLOTS.length * PICKS_PER_SLOT;
    const existingPlan = await db.mealPlanDay.findUnique({
      where: { userId_planDate: { userId: session.userId, planDate: today } },
      include: { items: { select: { id: true } } },
    });
    if (existingPlan) {
      if (existingPlan.items.length >= expectedItemCount) {
        return success({ planId: existingPlan.id, status: 'existing', message: 'Plan already exists for today' });
      }
      await db.mealPlanDay.delete({ where: { id: existingPlan.id } });
    }

    // User context (allergies, diet, cuisine, goal)
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

    const cuisinePreference = user.preference?.cuisinePreference ?? null;
    const dietPreference = user.preference?.dietType?.toLowerCase();
    const userGoalType = user.goal?.goalType || 'not set';
    const userAllergenNames = (user.allergies || []).map((a) => a.allergyName.toLowerCase());

    // Daily targets
    const dailyNutrition = await db.dailyNutrition.findUnique({
      where: { userId_date: { userId: session.userId, date: today } },
    });
    const targets = dailyNutrition
      ? { calories: dailyNutrition.targetCalories, proteinG: dailyNutrition.targetProtein, carbsG: dailyNutrition.targetCarbs, fatG: dailyNutrition.targetFat }
      : { calories: 2000, proteinG: 150, carbsG: 250, fatG: 67 };
    const consumed = {
      calories: dailyNutrition?.consumedCalories || 0,
      proteinG: dailyNutrition?.consumedProtein || 0,
      carbsG: dailyNutrition?.consumedCarbs || 0,
      fatG: dailyNutrition?.consumedFat || 0,
    };
    const slotTargets = getSlotTargets(targets, consumed);

    // Recent 2-day exclusion (variety)
    const recent = await loadRecentMeals(session.userId, 2);

    const allMeals = await loadCandidateMeals();

    // Backend ranks the top pool for each slot.
    const pools: Record<MealSlot, RankedCandidate[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const slot of SLOTS) {
      pools[slot] = buildRankedPool(allMeals, {
        slot,
        userAllergenNames,
        cuisinePreference,
        dietPreference,
        recentMealIds: recent.ids,
        slotTargets: slotTargets[slot],
        strictCuisine: true,
      });
    }

    // AI picks up to 3 meals per slot from the ranked pools.
    const picks = await aiPickFullDay({
      pools,
      slotTargets,
      userGoalType,
      dietPreference,
      cuisinePreference,
      recentMealNames: recent.names,
    });

    const planItems = await resolvePlan(pools, picks, slotTargets);

    // Persist the plan.
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
            rankPosition: item.rankPosition,
          })),
        },
      },
    });

    await logAiCall({
      userId,
      modelType: 'recommendation',
      requestPayload: JSON.stringify({ action: 'generate', poolSize: TOP_POOL, slotCandidates: SLOTS.map((s) => pools[s].length) }),
      responsePayload: JSON.stringify(
        planItems.map((i) => ({ slot: i.mealSlot, mealId: i.mealId, rank: i.rankPosition }))
      ),
      latencyMs: Date.now() - startedAt,
    });

    return success({ planId: planDay.id, status: 'generated', message: 'Meal plan generated for today' });
  } catch (err) {
    console.error('Generate meal plan error:', err);
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

async function refreshSlotPlan(slot: MealSlot, userId: string, startedAt: number) {
  const today = getTodayStr();

  const planDay = await db.mealPlanDay.findUnique({
    where: { userId_planDate: { userId, planDate: today } },
    include: { items: true },
  });
  if (!planDay) {
    return error('No meal plan exists for today. Generate one first.', 400, 'NO_PLAN');
  }
  const slotItems = planDay.items.filter((i) => i.mealSlot === slot);
  if (slotItems.length === 0) {
    return error(`No meal planned for ${slot}.`, 404, 'SLOT_MISSING');
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      goal: true,
      preference: true,
      allergies: { select: { allergyName: true } },
    },
  });
  const cuisinePreference = user?.preference?.cuisinePreference ?? null;
  const dietPreference = user?.preference?.dietType?.toLowerCase();
  const userGoalType = user?.goal?.goalType || 'not set';
  const userAllergenNames = (user?.allergies || []).map((a) => a.allergyName.toLowerCase());

  const dailyNutrition = await db.dailyNutrition.findUnique({
    where: { userId_date: { userId, date: today } },
  });
  const targets = dailyNutrition
    ? { calories: dailyNutrition.targetCalories, proteinG: dailyNutrition.targetProtein, carbsG: dailyNutrition.targetCarbs, fatG: dailyNutrition.targetFat }
    : { calories: 2000, proteinG: 150, carbsG: 250, fatG: 67 };
  const consumed = {
    calories: dailyNutrition?.consumedCalories || 0,
    proteinG: dailyNutrition?.consumedProtein || 0,
    carbsG: dailyNutrition?.consumedCarbs || 0,
    fatG: dailyNutrition?.consumedFat || 0,
  };
  const slotTargets = getSlotTargets(targets, consumed);

  const recent = await loadRecentMeals(userId, 2);
  const allMeals = await loadCandidateMeals();

  // Rebuild this slot's ranked pool (same filters, freshest 2-day exclusion),
  // then exclude meals already chosen for other slots + the current selection.
  const usedIds = new Set(
    planDay.items.filter((i) => i.mealSlot !== slot).map((i) => i.mealId)
  );
  const currentSlotIds = new Set(slotItems.map((i) => i.mealId));
  const pool = buildRankedPool(allMeals, {
    slot,
    userAllergenNames,
    cuisinePreference,
    dietPreference,
    recentMealIds: recent.ids,
    slotTargets: slotTargets[slot],
    strictCuisine: true,
  }).filter((rc) => !usedIds.has(rc.meal.id) && !currentSlotIds.has(rc.meal.id));

  if (pool.length === 0) {
    return error(`No alternative meals available for ${slot}.`, 422, 'NO_ALTERNATIVES');
  }

  const picks = await aiPickSlotOptions({
    slot,
    pool,
    slotTargets: slotTargets[slot],
    userGoalType,
    dietPreference,
    cuisinePreference,
    recentMealNames: recent.names,
  });

  const used = new Set(usedIds);
  const newItems = toItemsForSlot(slot, pool, picks, slotTargets[slot], used);

  if (newItems.length === 0) {
    return error(`No alternative meals available for ${slot}.`, 422, 'NO_ALTERNATIVES');
  }

  // Replace the slot's items with the newly picked options.
  await db.$transaction([
    db.mealPlanItem.deleteMany({ where: { planDayId: planDay.id, mealSlot: slot } }),
    ...newItems.map((item) =>
      db.mealPlanItem.create({
        data: {
          planDayId: planDay.id,
          mealSlot: item.mealSlot,
          mealId: item.mealId,
          servingGms: item.servingGms,
          recommendedCalories: item.recommendedCalories,
          rankScore: item.rankScore,
          rankPosition: item.rankPosition,
        },
      })
    ),
  ]);

  await logAiCall({
    userId,
    modelType: 'recommendation',
    requestPayload: JSON.stringify({ action: 'refresh', slot }),
    responsePayload: JSON.stringify(
      newItems.map((i) => ({ mealId: i.mealId, rank: i.rankPosition }))
    ),
    latencyMs: Date.now() - startedAt,
  });

  return success({
    status: 'refreshed',
    slot,
    meals: newItems.map((i) => ({ mealId: i.mealId, rankPosition: i.rankPosition })),
  });
}
