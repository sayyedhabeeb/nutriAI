import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/response';
import { buildPlanItems } from '@/lib/meal-plan-view';
import { computeAchievements, computeLogStreak, getTodayStr } from '@/lib/achievements';

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const today = getTodayStr();

    const [user, dailyNutrition, waterLog, foodLog, planDay, logStreak, achievements] =
      await Promise.all([
        db.user.findUnique({
          where: { id: session.userId },
          include: {
            profile: true,
            goal: true,
            preference: true,
            allergies: { select: { allergyName: true } },
          },
        }),
        db.dailyNutrition.findUnique({
          where: { userId_date: { userId: session.userId, date: today } },
        }),
        db.waterLog.findUnique({
          where: { userId_logDate: { userId: session.userId, logDate: today } },
        }),
        db.foodLog.findUnique({
          where: { userId_logDate: { userId: session.userId, logDate: today } },
          include: { items: true },
        }),
        db.mealPlanDay.findUnique({
          where: { userId_planDate: { userId: session.userId, planDate: today } },
          include: {
            items: {
              include: {
                meal: { include: { nutrition: true } },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        }),
        computeLogStreak(session.userId),
        computeAchievements(session.userId),
      ]);

    if (!user) return unauthorized('User not found');

    const targets = {
      calories: dailyNutrition?.targetCalories ?? 0,
      proteinG: dailyNutrition?.targetProtein ?? 0,
      carbsG: dailyNutrition?.targetCarbs ?? 0,
      fatG: dailyNutrition?.targetFat ?? 0,
      fiberG: dailyNutrition?.targetFiber ?? 0,
      calciumMg: dailyNutrition?.targetCalciumMg ?? 0,
      ironMg: dailyNutrition?.targetIronMg ?? 0,
      zincMg: dailyNutrition?.targetZincMg ?? 0,
      magnesiumMg: dailyNutrition?.targetMagnesiumMg ?? 0,
      cholesterolMg: dailyNutrition?.targetCholesterolMg ?? 0,
    };
    const consumed = {
      calories: dailyNutrition?.consumedCalories ?? 0,
      proteinG: dailyNutrition?.consumedProtein ?? 0,
      carbsG: dailyNutrition?.consumedCarbs ?? 0,
      fatG: dailyNutrition?.consumedFat ?? 0,
      fiberG: dailyNutrition?.consumedFiber ?? 0,
      calciumMg: dailyNutrition?.consumedCalciumMg ?? 0,
      ironMg: dailyNutrition?.consumedIronMg ?? 0,
      zincMg: dailyNutrition?.consumedZincMg ?? 0,
      magnesiumMg: dailyNutrition?.consumedMagnesiumMg ?? 0,
      cholesterolMg: dailyNutrition?.consumedCholesterolMg ?? 0,
    };
    const remaining = {
      calories: Math.max(0, targets.calories - consumed.calories),
      proteinG: Math.max(0, targets.proteinG - consumed.proteinG),
      carbsG: Math.max(0, targets.carbsG - consumed.carbsG),
      fatG: Math.max(0, targets.fatG - consumed.fatG),
      fiberG: Math.max(0, targets.fiberG - consumed.fiberG),
      calciumMg: Math.max(0, targets.calciumMg - consumed.calciumMg),
      ironMg: Math.max(0, targets.ironMg - consumed.ironMg),
      zincMg: Math.max(0, targets.zincMg - consumed.zincMg),
      magnesiumMg: Math.max(0, targets.magnesiumMg - consumed.magnesiumMg),
      cholesterolMg: Math.max(0, targets.cholesterolMg - consumed.cholesterolMg),
    };
    const percentages = {
      calories: targets.calories > 0 ? Math.round((consumed.calories / targets.calories) * 100) : 0,
      proteinG: targets.proteinG > 0 ? Math.round((consumed.proteinG / targets.proteinG) * 100) : 0,
      carbsG: targets.carbsG > 0 ? Math.round((consumed.carbsG / targets.carbsG) * 100) : 0,
      fatG: targets.fatG > 0 ? Math.round((consumed.fatG / targets.fatG) * 100) : 0,
      fiberG: targets.fiberG > 0 ? Math.round((consumed.fiberG / targets.fiberG) * 100) : 0,
      calciumMg: targets.calciumMg > 0 ? Math.round((consumed.calciumMg / targets.calciumMg) * 100) : 0,
      ironMg: targets.ironMg > 0 ? Math.round((consumed.ironMg / targets.ironMg) * 100) : 0,
      zincMg: targets.zincMg > 0 ? Math.round((consumed.zincMg / targets.zincMg) * 100) : 0,
      magnesiumMg: targets.magnesiumMg > 0 ? Math.round((consumed.magnesiumMg / targets.magnesiumMg) * 100) : 0,
      cholesterolMg: targets.cholesterolMg > 0 ? Math.round((consumed.cholesterolMg / targets.cholesterolMg) * 100) : 0,
    };

    const loggedSlots = Array.from(
      new Set(foodLog?.items.map((i) => i.mealSlot).filter(Boolean) ?? [])
    ) as string[];

    const hydration = {
      glassesConsumed: waterLog?.glassesConsumed ?? 0,
      targetGlasses: waterLog?.targetGlasses ?? 8,
      mlConsumed: (waterLog?.glassesConsumed ?? 0) * 250,
      targetMl: (waterLog?.targetGlasses ?? 8) * 250,
      percentage: waterLog ? Math.round((waterLog.glassesConsumed / waterLog.targetGlasses) * 100) : 0,
    };

    return success({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profile: user.profile,
        goal: user.goal,
        preference: user.preference,
        allergies: user.allergies.map((a) => a.allergyName),
      },
      nutrition: { date: today, targets, consumed, remaining, percentages },
      waterCount: hydration.glassesConsumed,
      hydration,
      loggedSlots,
      mealsLoggedToday: foodLog?.items.length ?? 0,
      mealPlan: planDay
        ? {
            exists: true,
            planDate: planDay.planDate,
            targetCalories: planDay.targetCalories,
            targetProtein: planDay.targetProtein,
            targetCarbs: planDay.targetCarbs,
            targetFat: planDay.targetFat,
            items: buildPlanItems(planDay.items),
          }
        : { exists: false, planDate: today, items: [] },
      streak: logStreak.streak,
      achievements,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return serverError();
  }
}
