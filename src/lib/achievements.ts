import { db } from '@/lib/db';

export const ACHIEVEMENT_DEFS = [
  { id: 'first_meal', name: 'First Meal', description: 'Logged your first meal', icon: '🍽️' },
  { id: 'week_warrior', name: 'Week Warrior', description: 'Logged meals for 7 consecutive days', icon: '⚔️' },
  { id: 'hydration_hero', name: 'Hydration Hero', description: 'Logged 8+ glasses in a day', icon: '💧' },
  { id: 'protein_champion', name: 'Protein Champion', description: 'Hit protein goal for 5 days', icon: '💪' },
  { id: 'calorie_crusher', name: 'Calorie Crusher', description: 'Logged 2000+ kcal in a day', icon: '🔥' },
  { id: 'consistency_king', name: 'Consistency King', description: 'Logged meals for 14+ days total', icon: '👑' },
  { id: 'weight_watcher', name: 'Weight Watcher', description: 'Logged weight for 5+ days', icon: '⚖️' },
  { id: 'explorer', name: 'Explorer', description: 'Logged meals from 5+ different cuisines', icon: '🌍' },
  { id: 'explorer_2', name: 'World Traveler', description: 'Try meals from 3+ different cuisines', icon: '🌏' },
  { id: 'streak_14', name: 'Two Week Warrior', description: '14-day logging streak', icon: '🔥' },
  { id: 'calorie_king', name: 'Calorie King', description: 'Hit calorie goal for 7 days', icon: '👑' },
  { id: 'water_master', name: 'Hydration Master', description: 'Log 8+ glasses for 5 days', icon: '💧' },
];

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

export interface AchievementResult {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  earnedDate?: string;
}

export interface LogStreak {
  streak: number;
  logDates: Set<string>;
}

export async function computeLogStreak(userId: string): Promise<LogStreak> {
  const foodLogs = await db.foodLog.findMany({
    where: { userId },
    orderBy: { logDate: 'desc' },
    select: { logDate: true },
  });
  const logDates = new Set(foodLogs.map((f) => f.logDate));
  let streak = 0;
  const startOffset = logDates.has(getDateString(0)) ? 0 : 1;
  for (let i = startOffset; i < 60; i++) {
    const dateStr = getDateString(i);
    if (logDates.has(dateStr)) streak++;
    else break;
  }
  return { streak, logDates };
}

export async function computeAchievements(userId: string): Promise<AchievementResult[]> {
  const results: Record<string, { earned: boolean; earnedDate?: string }> = {};

  // 1. First Meal - check if user has any FoodLogItem
  const firstLogItem = await db.foodLogItem.findFirst({
    where: { foodLog: { userId } },
    orderBy: { loggedAt: 'asc' },
  });
  results['first_meal'] = {
    earned: !!firstLogItem,
    earnedDate: firstLogItem?.loggedAt?.toISOString(),
  };

  // 2. Week Warrior - 7 consecutive days with food logs
  const { streak, logDates } = await computeLogStreak(userId);
  results['week_warrior'] = { earned: streak >= 7 };

  // 3. Hydration Hero - logged 8+ glasses in a day
  const waterLogs = await db.waterLog.findMany({
    where: { userId, glassesConsumed: { gte: 8 } },
    orderBy: { logDate: 'asc' },
    select: { logDate: true, createdAt: true },
    take: 1,
  });
  results['hydration_hero'] = {
    earned: waterLogs.length > 0,
    earnedDate: waterLogs[0]?.createdAt?.toISOString(),
  };

  // 4. Protein Champion - hit protein goal for 5 days
  const proteinDays = await db.dailyNutrition.findMany({
    where: {
      userId,
      consumedProtein: { gte: 1 },
      targetProtein: { gte: 1 },
    },
    select: { date: true, consumedProtein: true, targetProtein: true },
  });
  const proteinHitDays = proteinDays.filter(
    (d) => d.consumedProtein >= d.targetProtein
  );
  results['protein_champion'] = {
    earned: proteinHitDays.length >= 5,
    earnedDate: proteinHitDays.length >= 5 ? proteinHitDays[proteinHitDays.length - 5]?.date : undefined,
  };

  // 5. Calorie Crusher - logged 2000+ kcal in a day
  const calorieDay = await db.dailyNutrition.findFirst({
    where: { userId, consumedCalories: { gte: 2000 } },
    orderBy: { date: 'asc' },
  });
  results['calorie_crusher'] = {
    earned: !!calorieDay,
    earnedDate: calorieDay?.date,
  };

  // 6. Consistency King - logged meals for 14+ unique days
  results['consistency_king'] = { earned: logDates.size >= 14 };

  // 7. Weight Watcher - logged weight for 5+ days
  const weightLogCount = await db.weightLog.count({ where: { userId } });
  results['weight_watcher'] = { earned: weightLogCount >= 5 };

  // 8. Explorer - logged meals from 5+ different cuisines
  const cuisines = await db.foodLogItem.findMany({
    where: { foodLog: { userId }, mealId: { not: null } },
    select: { meal: { select: { cuisine: true } } },
    distinct: ['mealId'],
  });
  const uniqueCuisines = new Set(
    cuisines.map((c) => c.meal?.cuisine).filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
  );
  results['explorer'] = { earned: uniqueCuisines.size >= 5 };

  // 9. World Traveler - meals from 3+ different cuisines
  results['explorer_2'] = { earned: uniqueCuisines.size >= 3 };

  // 10. Two Week Warrior - 14-day logging streak
  results['streak_14'] = { earned: streak >= 14 };

  // 11. Calorie King - hit calorie goal for 7 days
  const calorieGoalDays = await db.dailyNutrition.findMany({
    where: {
      userId,
      consumedCalories: { gte: 1 },
      targetCalories: { gte: 1 },
    },
    select: { date: true, consumedCalories: true, targetCalories: true },
  });
  const calorieHitDays = calorieGoalDays.filter(
    (d) => d.consumedCalories >= d.targetCalories
  );
  results['calorie_king'] = { earned: calorieHitDays.length >= 7 };

  // 12. Hydration Master - log 8+ glasses for 5 days
  const hydrationMasterDays = await db.waterLog.findMany({
    where: { userId, glassesConsumed: { gte: 8 } },
    select: { logDate: true },
    distinct: ['logDate'],
  });
  results['water_master'] = { earned: hydrationMasterDays.length >= 5 };

  return ACHIEVEMENT_DEFS.map((def) => {
    const result = results[def.id];
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon,
      earned: result?.earned || false,
      earnedDate: result?.earnedDate || undefined,
    };
  });
}

export { getTodayStr };
