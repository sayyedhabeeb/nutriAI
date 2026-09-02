import { db } from '@/lib/db';
import { scaleNutrition, getSlotTargets, type MealSlot } from '@/lib/nutrition-engine';
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

export const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const PICKS_PER_SLOT = 3;

interface SlotPick {
  mealId: string;
  reason?: string;
}

export function isValidSlot(value: string | null): value is MealSlot {
  return !!value && (SLOTS as string[]).includes(value);
}

export class GenerationError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
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
  const ids = new Set<string>(
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
        `${i + 1}. {"id":"${rc.meal.id}","name":"${rc.meal.name}","calories":${rc.meal.nutrition?.calories ?? 0},"proteinG":${rc.meal.nutrition?.proteinG ?? 0},"carbsG":${rc.meal.nutrition?.carbsG ?? 0},"fatG":${rc.meal.nutrition?.fatG ?? 0}}`
    )
    .join('\n');
}

function buildContext(opts: {
  userGoalType: string;
  dietPreference?: string | null;
  cuisinePreference?: string | null;
  recentMealNames: string[];
  activityContext?: any;
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
    opts.activityContext
      ? `Recent Physical Activity (Context only, do not blindly change calories): ${JSON.stringify(opts.activityContext)}`
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

async function aiPickFullDay(opts: {
  pools: Record<MealSlot, RankedCandidate[]>;
  slotTargets: Record<MealSlot, { calories: number; proteinG: number; carbsG: number; fatG: number }>;
  userGoalType: string;
  dietPreference?: string | null;
  cuisinePreference?: string | null;
  recentMealNames: string[];
  activityContext?: any;
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
    console.warn('AI meal plan generation unavailable:', err);
    throw new GenerationError('AI provider failed to generate full day plan in time.', 504, 'AI_TIMEOUT');
  }
}

async function aiPickMultiDay(opts: {
  daysCount: number;
  pools: Record<MealSlot, RankedCandidate[]>;
  slotTargets: Record<MealSlot, { calories: number; proteinG: number; carbsG: number; fatG: number }>;
  userGoalType: string;
  dietPreference?: string | null;
  cuisinePreference?: string | null;
  recentMealNames: string[];
  activityContext?: any;
}): Promise<Array<Partial<Record<MealSlot, SlotPick[]>>>> {
  const activeSlots = SLOTS.filter((slot) => opts.pools[slot].length > 0);
  if (activeSlots.length === 0) return Array.from({ length: opts.daysCount }, () => ({}));

  try {
    const candidateBlock = activeSlots
      .map((slot) => `[${slot}]\n${candidateLines(opts.pools[slot])}`)
      .join('\n\n');

    const context = buildContext(opts);
    const systemPrompt = `You are a meal plan AI for a nutrition tracking app.

The backend has already removed foods the user is allergic to and filtered by dietary preference, meal type, calorie budget, cuisine preference, and foods eaten in the last 2 days. Candidates per meal slot are ranked best-first.

Your job: generate a ${opts.daysCount}-day meal plan.
For EACH day (0 to ${opts.daysCount - 1}), choose exactly ${PICKS_PER_SLOT} distinct meals PER slot from the candidates, matching macros to each slot's targets, ranked best-first (the best option first).
You MUST NOT choose the same meal for two different slots in the same day.
You MUST NOT recommend anything in the recently-eaten list.
Maximize variety across the ${opts.daysCount} days (avoid repeating identical meals on adjacent days, prefer diverse selections).

Return ONLY a JSON object, no markdown, no commentary:
{ "days": [ { "dayIndex": 0, "picks": { "breakfast": [{"meal_id":"...","reason":"..."}], "lunch": [ ... ], "dinner": [ ... ], "snack": [ ... ] } }, ... ] }
Return exactly ${PICKS_PER_SLOT} meal_id values per slot per day, each from that slot's candidate list.`;

    const userPrompt = `${context}

Candidates (ranked best-first per slot, use these exact meal_id values):
${candidateBlock}

Return the JSON array of days.`;

    const ai = getRecommendationClient();
    const aiRaw = await ai.chat({ system: systemPrompt, user: userPrompt });
    const parsed = JSON.parse((aiRaw.match(/\{[\s\S]*\}/) || ['{"days":[]}'])[0]);
    const rawDays = Array.isArray(parsed.days) ? parsed.days : [];

    const results: Array<Partial<Record<MealSlot, SlotPick[]>>> = [];
    const usedAcrossDays = new Set<string>();

    for (let i = 0; i < opts.daysCount; i++) {
      const dayData = rawDays.find((d: any) => d.dayIndex === i) || { picks: {} };
      const rawPicks = (dayData.picks ?? {}) as Record<string, unknown>;
      
      const result: Partial<Record<MealSlot, SlotPick[]>> = {};
      const usedInDay = new Set<string>();
      
      for (const slot of activeSlots) {
        const slotPool = new Set(opts.pools[slot].map((rc) => rc.meal.id));
        const raw = Array.isArray(rawPicks[slot]) ? (rawPicks[slot] as Array<{ meal_id?: string; reason?: string }>) : [];
        const picks: SlotPick[] = [];
        
        for (const p of raw) {
          if (p && typeof p.meal_id === 'string' && slotPool.has(p.meal_id) && !usedInDay.has(p.meal_id)) {
            let finalMealId = p.meal_id;
            let finalReason = p.reason;
            
            // Deterministic Variety Enforcement:
            // If LLM selected a meal already used on a previous day, find the next highest-ranked unused candidate
            if (usedAcrossDays.has(finalMealId)) {
               const unusedCandidate = opts.pools[slot].find(rc => !usedAcrossDays.has(rc.meal.id) && !usedInDay.has(rc.meal.id));
               if (unusedCandidate) {
                 finalMealId = unusedCandidate.meal.id;
                 finalReason = 'Deterministically swapped for variety';
               } else {
                 // Genuinely out of unused candidates; gracefully allow the duplication
                 console.warn(`[NutritionAI] Insufficient candidates for slot ${slot}, allowing duplication.`);
               }
            }
            
            usedInDay.add(finalMealId);
            usedAcrossDays.add(finalMealId);
            picks.push({ mealId: finalMealId, reason: finalReason });
          }
          if (picks.length >= PICKS_PER_SLOT) break;
        }
        if (picks.length > 0) result[slot] = picks;
      }
      results.push(result);
    }
    
    return results;
  } catch (err) {
    console.warn('AI multi-day meal plan generation unavailable:', err);
    throw new GenerationError('AI provider failed to generate multi-day plan in time.', 504, 'AI_TIMEOUT');
  }
}


async function aiPickSlotOptions(opts: {
  slot: MealSlot;
  pool: RankedCandidate[];
  slotTargets: { calories: number; proteinG: number; carbsG: number; fatG: number };
  userGoalType: string;
  dietPreference?: string | null;
  cuisinePreference?: string | null;
  recentMealNames: string[];
  activityContext?: any;
}): Promise<SlotPick[]> {
  try {
    const context = buildContext({
      userGoalType: opts.userGoalType,
      dietPreference: opts.dietPreference,
      cuisinePreference: opts.cuisinePreference,
      recentMealNames: opts.recentMealNames,
      activityContext: opts.activityContext,
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
    console.warn('AI meal refresh unavailable:', err);
    throw new GenerationError('AI provider failed to generate slot alternatives in time.', 504, 'AI_TIMEOUT');
  }
}

function toItemsForSlot(
  slot: MealSlot,
  pool: RankedCandidate[],
  picks: SlotPick[],
  slotTargets: { calories: number; proteinG: number; carbsG: number; fatG: number },
  usedInDay: Set<string>,
  usedAcrossDays?: Set<string>,
  dayIndex: number = 0
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

  // 1. Add valid explicit picks (from AI or caller)
  for (const pick of picks) {
    const rc = poolById.get(pick.mealId);
    if (rc && !usedInDay.has(rc.meal.id) && !chosen.includes(rc)) {
      chosen.push(rc);
      usedInDay.add(rc.meal.id);
      usedAcrossDays?.add(rc.meal.id);
    }
  }

  // 2. Sort candidates by score
  const byScore = [...pool].sort((a, b) => b.score - a.score);

  // Pass A (Diversity Priority): Pick meals NOT yet assigned to any day this week
  if (chosen.length < PICKS_PER_SLOT && byScore.length > 0) {
    for (const rc of byScore) {
      if (chosen.length >= PICKS_PER_SLOT) break;
      if (!usedInDay.has(rc.meal.id) && !usedAcrossDays?.has(rc.meal.id) && !chosen.includes(rc)) {
        chosen.push(rc);
        usedInDay.add(rc.meal.id);
        usedAcrossDays?.add(rc.meal.id);
      }
    }
  }

  // Pass B (Pool Rotation Fallback): If pool has fewer unique meals than 7 days * 3 slots,
  // rotate through the pool with a day offset so each day starts at a different meal index
  if (chosen.length < PICKS_PER_SLOT && byScore.length > 0) {
    const offset = (dayIndex * PICKS_PER_SLOT) % byScore.length;
    const rotated = [...byScore.slice(offset), ...byScore.slice(0, offset)];
    for (const rc of rotated) {
      if (chosen.length >= PICKS_PER_SLOT) break;
      if (!usedInDay.has(rc.meal.id) && !chosen.includes(rc)) {
        chosen.push(rc);
        usedInDay.add(rc.meal.id);
      }
    }
  }

  for (let idx = 0; idx < chosen.length; idx++) {
    const rc = chosen[idx];
    const servingGms = scaleServingToSlot(rc.meal, slotTargets);
    const scaled = scaleNutrition(
      {
        calories: rc.meal.nutrition?.calories ?? 0,
        proteinG: rc.meal.nutrition?.proteinG ?? 0,
        carbsG: rc.meal.nutrition?.carbsG ?? 0,
        fatG: rc.meal.nutrition?.fatG ?? 0,
      },
      servingGms
    );
    items.push({
      mealId: rc.meal.id,
      mealSlot: slot,
      servingGms,
      recommendedCalories: scaled.calories,
      rankScore: rc.score,
      rankPosition: idx + 1,
    });
  }

  return items;
}

async function resolvePlan(
  pools: Record<MealSlot, RankedCandidate[]>,
  picks: Partial<Record<MealSlot, SlotPick[]>>,
  slotTargets: Record<MealSlot, { calories: number; proteinG: number; carbsG: number; fatG: number }>,
  usedAcrossDays?: Set<string>,
  dayIndex: number = 0
) {
  const usedInDay = new Set<string>();
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
    items.push(...toItemsForSlot(slot, pool, picks[slot] ?? [], slotTargets[slot], usedInDay, usedAcrossDays, dayIndex));
  }

  return items;
}

export async function generateMealPlan(
  userId: string, 
  refreshSlot: string | null, 
  startedAt: number,
  options: { dateOffset?: number, externalRecentMealNames?: string[], persist?: boolean, force?: boolean, activityContext?: any } = {}
) {
  const d = new Date();
  if (options.dateOffset) {
    d.setDate(d.getDate() + options.dateOffset);
  }
  const targetDateStr = d.toISOString().split('T')[0];
  const shouldPersist = options.persist !== false;

  if (refreshSlot) {
    if (!isValidSlot(refreshSlot)) {
      throw new GenerationError(`Invalid refresh slot. Must be one of: ${SLOTS.join(', ')}`, 400, 'INVALID_SLOT');
    }
    return await refreshSlotPlan(refreshSlot, userId, startedAt); // refresh only works for today currently
  }

  const expectedItemCount = SLOTS.length * PICKS_PER_SLOT;
  
  if (!options.force) {
    const existingPlan = await db.mealPlanDay.findUnique({
      where: { userId_planDate: { userId, planDate: targetDateStr } },
      include: { items: { select: { id: true } } },
    });
    if (existingPlan && existingPlan.items.length >= expectedItemCount) {
      return { planId: existingPlan.id, status: 'existing', message: 'Plan already exists for this date' };
    }
  }

  // We no longer delete the existing plan here to remain safe for partial failures.
  // The caller (route.ts) is responsible for deleting old plans via a single transaction when doing multi-day generation, 
  // or it will be replaced at the end of this function if `shouldPersist` is true.

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      goal: true,
      preference: true,
      allergies: { select: { allergyName: true } },
    },
  });
  if (!user) throw new GenerationError('User not found', 404, 'USER_NOT_FOUND');

  const cuisinePreference = user.preference?.cuisinePreference ?? null;
  const dietPreference = user.preference?.dietType?.toLowerCase();
  const userGoalType = user.goal?.goalType || 'not set';
  const userAllergenNames = (user.allergies || []).map((a) => a.allergyName.toLowerCase());

  // Use today's nutrition targets for all future days
  const todayStr = getTodayStr();
  const dailyNutrition = await db.dailyNutrition.findUnique({
    where: { userId_date: { userId, date: todayStr } },
  });
  const targets = dailyNutrition
    ? { calories: dailyNutrition.targetCalories, proteinG: dailyNutrition.targetProtein, carbsG: dailyNutrition.targetCarbs, fatG: dailyNutrition.targetFat }
    : { calories: 2000, proteinG: 150, carbsG: 250, fatG: 67 };
  
  // Only apply 'consumed' deductions to today's plan
  const consumed = (options.dateOffset === 0 || !options.dateOffset) ? {
    calories: dailyNutrition?.consumedCalories || 0,
    proteinG: dailyNutrition?.consumedProtein || 0,
    carbsG: dailyNutrition?.consumedCarbs || 0,
    fatG: dailyNutrition?.consumedFat || 0,
  } : { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const slotTargets = getSlotTargets(targets, consumed);

  const recent = await loadRecentMeals(userId, 2);
  const rawNames = [...recent.names, ...(options.externalRecentMealNames || [])];
  const allRecentNames = rawNames.filter((item, pos) => rawNames.indexOf(item) === pos);

  const allMeals = await loadCandidateMeals();

  const pools: Record<MealSlot, RankedCandidate[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const slot of SLOTS) {
    pools[slot] = buildRankedPool(allMeals, {
      slot,
      userAllergenNames,
      cuisinePreference,
      dietPreference,
      recentMealIds: recent.ids, // We don't have IDs for Swapp's external meals, so they bypass ID filtering here
      slotTargets: slotTargets[slot],
      strictCuisine: true,
    });
  }

  const picks = await aiPickFullDay({
    pools,
    slotTargets,
    userGoalType,
    dietPreference,
    cuisinePreference,
    recentMealNames: allRecentNames, // LLM will filter out recent meals by name
    activityContext: options.activityContext,
  });

  const planItems = await resolvePlan(pools, picks, slotTargets, undefined, options.dateOffset || 0);

  const planItemsCreate = planItems.map((item) => ({
    mealSlot: item.mealSlot,
    mealId: item.mealId,
    servingGms: item.servingGms,
    recommendedCalories: item.recommendedCalories,
    rankScore: item.rankScore,
    rankPosition: item.rankPosition,
  }));

  const planDayData = {
    userId,
    planDate: targetDateStr,
    targetCalories: targets.calories,
    targetProtein: targets.proteinG,
    targetCarbs: targets.carbsG,
    targetFat: targets.fatG,
    items: {
      create: planItemsCreate,
    },
  };

  if (!shouldPersist) {
    // Also track AI call stats in memory for atomic logging later if needed, 
    // but for now we just log it asynchronously because it's not critical for partial failure
    await logAiCall({
      userId,
      modelType: 'recommendation',
      requestPayload: JSON.stringify({ action: 'generate', poolSize: TOP_POOL, slotCandidates: SLOTS.map((s) => pools[s].length) }),
      responsePayload: JSON.stringify(planItemsCreate.map((i) => ({ slot: i.mealSlot, mealId: i.mealId, rank: i.rankPosition }))),
      latencyMs: Date.now() - startedAt,
    }).catch(console.error);

    return { status: 'generated', data: planDayData };
  }

  // Backward compatibility / direct generation (e.g. refreshSlot might need persistence)
  // Delete existing if we're forcing a persistence overwrite directly
  if (options.force) {
    await db.mealPlanDay.deleteMany({ where: { userId, planDate: targetDateStr } });
  }

  const planDay = await db.mealPlanDay.create({ data: planDayData });

  await logAiCall({
    userId,
    modelType: 'recommendation',
    requestPayload: JSON.stringify({ action: 'generate', poolSize: TOP_POOL, slotCandidates: SLOTS.map((s) => pools[s].length) }),
    responsePayload: JSON.stringify(planItemsCreate.map((i) => ({ slot: i.mealSlot, mealId: i.mealId, rank: i.rankPosition }))),
    latencyMs: Date.now() - startedAt,
  });

  return { planId: planDay.id, status: 'generated', message: 'Meal plan generated for today' };
}

async function refreshSlotPlan(slot: MealSlot, userId: string, startedAt: number) {
  const today = getTodayStr();

  const planDay = await db.mealPlanDay.findUnique({
    where: { userId_planDate: { userId, planDate: today } },
    include: { items: true },
  });
  if (!planDay) {
    throw new GenerationError('No meal plan exists for today. Generate one first.', 400, 'NO_PLAN');
  }
  const slotItems = planDay.items.filter((i) => i.mealSlot === slot);
  if (slotItems.length === 0) {
    throw new GenerationError(`No meal planned for ${slot}.`, 404, 'SLOT_MISSING');
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

  const usedIds = new Set<string>(
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
    throw new GenerationError(`No alternative meals available for ${slot}.`, 422, 'NO_ALTERNATIVES');
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

  const used = new Set<string>(usedIds);
  const newItems = toItemsForSlot(slot, pool, picks, slotTargets[slot], used);

  if (newItems.length === 0) {
    throw new GenerationError(`No alternative meals available for ${slot}.`, 422, 'NO_ALTERNATIVES');
  }

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

  return {
    status: 'refreshed',
    slot,
    meals: newItems.map((i) => ({ mealId: i.mealId, rankPosition: i.rankPosition })),
  };
}

export async function generateWeeklyMealPlan(
  userId: string,
  generateDays: number,
  startedAt: number,
  options: { externalRecentMealNames?: string[]; force?: boolean; activityContext?: any } = {}
) {
  const d = new Date();
  const targetDateStr = d.toISOString().split('T')[0];

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      goal: true,
      preference: true,
      allergies: { select: { allergyName: true } },
    },
  });
  if (!user) throw new GenerationError('User not found', 404, 'USER_NOT_FOUND');

  const cuisinePreference = user.preference?.cuisinePreference ?? null;
  const dietPreference = user.preference?.dietType?.toLowerCase();
  const userGoalType = user.goal?.goalType || 'not set';
  const userAllergenNames = (user.allergies || []).map((a) => a.allergyName.toLowerCase());

  const dailyNutrition = await db.dailyNutrition.findUnique({
    where: { userId_date: { userId, date: targetDateStr } },
  });
  const targets = dailyNutrition
    ? { calories: dailyNutrition.targetCalories, proteinG: dailyNutrition.targetProtein, carbsG: dailyNutrition.targetCarbs, fatG: dailyNutrition.targetFat }
    : { calories: 2000, proteinG: 150, carbsG: 250, fatG: 67 };
    
  // We use the same base targets for all days. Consumed gets zeroed out for future days.
  const baseSlotTargets = getSlotTargets(targets, { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  
  // Build the candidate pool globally once
  const recent = await loadRecentMeals(userId, 2);
  const rawNames = [...recent.names, ...(options.externalRecentMealNames || [])];
  const allRecentNames = rawNames.filter((item, pos) => rawNames.indexOf(item) === pos);

  const allMeals = await loadCandidateMeals();

  const pools: Record<MealSlot, RankedCandidate[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const slot of SLOTS) {
    pools[slot] = buildRankedPool(allMeals, {
      slot,
      userAllergenNames,
      cuisinePreference,
      dietPreference,
      recentMealIds: recent.ids,
      slotTargets: baseSlotTargets[slot],
      strictCuisine: true,
    });
  }

  const multiPicks = await aiPickMultiDay({
    daysCount: generateDays,
    pools,
    slotTargets: baseSlotTargets,
    userGoalType,
    dietPreference,
    cuisinePreference,
    recentMealNames: allRecentNames,
    activityContext: options.activityContext,
  });

  const generatedPayloads: any[] = [];
  const usedAcrossDays = new Set<string>();
  
  for (let i = 0; i < generateDays; i++) {
    const loopDate = new Date(d);
    loopDate.setDate(loopDate.getDate() + i);
    const loopDateStr = loopDate.toISOString().split('T')[0];
    
    // For day 0, subtract consumed
    const consumed = i === 0 ? {
      calories: dailyNutrition?.consumedCalories || 0,
      proteinG: dailyNutrition?.consumedProtein || 0,
      carbsG: dailyNutrition?.consumedCarbs || 0,
      fatG: dailyNutrition?.consumedFat || 0,
    } : { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    
    const daySlotTargets = getSlotTargets(targets, consumed);
    const picks = multiPicks[i] || {};
    
    const planItems = await resolvePlan(pools, picks, daySlotTargets, usedAcrossDays, i);
    
    const planItemsCreate = planItems.map((item) => ({
      mealSlot: item.mealSlot,
      mealId: item.mealId,
      servingGms: item.servingGms,
      recommendedCalories: item.recommendedCalories,
      rankScore: item.rankScore,
      rankPosition: item.rankPosition,
    }));

    generatedPayloads.push({
      userId,
      planDate: loopDateStr,
      targetCalories: targets.calories,
      targetProtein: targets.proteinG,
      targetCarbs: targets.carbsG,
      targetFat: targets.fatG,
      items: { create: planItemsCreate },
    });
  }
  
  // Do an aggregate log
  await logAiCall({
    userId,
    modelType: 'recommendation',
    requestPayload: JSON.stringify({ action: 'generateWeekly', generateDays, poolSize: TOP_POOL }),
    responsePayload: JSON.stringify({ daysCount: generatedPayloads.length }),
    latencyMs: Date.now() - startedAt,
  }).catch(console.error);

  return { status: 'generated', data: generatedPayloads };
}

