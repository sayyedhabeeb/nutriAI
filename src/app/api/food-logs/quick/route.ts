import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, created, unauthorized, serverError, error } from '@/lib/response';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const body = await request.json();
    const { name, calories, proteinG, carbsG, fatG, mealSlot, servingGms } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return error('Food name is required');
    }
    if (!calories || calories <= 0) {
      return error('Calories must be a positive number');
    }
    if (!mealSlot || !['breakfast', 'lunch', 'dinner', 'snack'].includes(mealSlot)) {
      return error('mealSlot is required (breakfast/lunch/dinner/snack)');
    }

    const serving = servingGms || 100;
    const pG = proteinG || 0;
    const cG = carbsG || 0;
    const fG = fatG || 0;

    // Calculate per-100g values from the user-provided serving
    const factor = 100 / serving;
    const calPer100g = Math.round(calories * factor);
    const protPer100g = Math.round(pG * factor * 10) / 10;
    const carbPer100g = Math.round(cG * factor * 10) / 10;
    const fatPer100g = Math.round(fG * factor * 10) / 10;

    const today = getTodayStr();

    // Create a custom Meal record (source='user')
    const meal = await db.meal.create({
      data: {
        name: name.trim(),
        mealType: mealSlot,
        cuisine: 'Custom',
        isVeg: true,
        isVegan: false,
        baseServingGms: serving,
        source: 'user',
        nutrition: {
          create: {
            calories: calPer100g,
            proteinG: protPer100g,
            carbsG: carbPer100g,
            fatG: fatPer100g,
            perServingGms: 100,
          },
        },
      },
    });

    // Create or get FoodLog for today
    const foodLog = await db.foodLog.upsert({
      where: {
        userId_logDate: {
          userId: session.userId,
          logDate: today,
        },
      },
      update: {},
      create: {
        userId: session.userId,
        logDate: today,
      },
    });

    // Create FoodLogItem
    const logItem = await db.foodLogItem.create({
      data: {
        foodLogId: foodLog.id,
        mealId: meal.id,
        servingGms: serving,
        calories,
        proteinG: pG,
        carbsG: cG,
        fatG: fG,
        mealSlot,
        source: 'quick-add',
      },
      include: {
        meal: {
          include: { nutrition: true },
        },
      },
    });

    // Update FoodLog totals
    const totals = await db.foodLogItem.aggregate({
      where: { foodLogId: foodLog.id },
      _sum: {
        calories: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
      },
    });

    await db.foodLog.update({
      where: { id: foodLog.id },
      data: {
        totalCalories: totals._sum.calories || 0,
        totalProtein: totals._sum.proteinG || 0,
        totalCarbs: totals._sum.carbsG || 0,
        totalFat: totals._sum.fatG || 0,
      },
    });

    // Update DailyNutrition consumed values
    await db.dailyNutrition.upsert({
      where: { userId_date: { userId: session.userId, date: today } },
      update: {
        consumedCalories: { increment: calories },
        consumedProtein: { increment: pG },
        consumedCarbs: { increment: cG },
        consumedFat: { increment: fG },
      },
      create: {
        userId: session.userId,
        date: today,
        targetCalories: 2000,
        targetProtein: 150,
        targetCarbs: 250,
        targetFat: 67,
        consumedCalories: calories,
        consumedProtein: pG,
        consumedCarbs: cG,
        consumedFat: fG,
      },
    });

    return created({
      logItem,
      foodLogTotals: {
        totalCalories: totals._sum.calories || 0,
        totalProtein: totals._sum.proteinG || 0,
        totalCarbs: totals._sum.carbsG || 0,
        totalFat: totals._sum.fatG || 0,
      },
    });
  } catch (err) {
    console.error('Quick add food log error:', err);
    return serverError();
  }
}
