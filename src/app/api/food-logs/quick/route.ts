import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, created, unauthorized, serverError, error } from '@/lib/response';
import { syncMealPlanWithLogs } from '@/lib/meal-plan-sync';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const body = await request.json();
    const { name, calories, proteinG, carbsG, fatG, fiberG, sodiumMg, calciumMg, ironMg, zincMg, magnesiumMg, cholesterolMg, mealSlot, servingGms } = body;

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
    const fiG = fiberG || 0;
    const sMg = sodiumMg || 0;
    const caMg = calciumMg || 0;
    const feMg = ironMg || 0;
    const znMg = zincMg || 0;
    const mgMg = magnesiumMg || 0;
    const chMg = cholesterolMg || 0;

    // Calculate per-100g values from the user-provided serving
    const factor = 100 / serving;
    const calPer100g = Math.round(calories * factor);
    const protPer100g = Math.round(pG * factor * 10) / 10;
    const carbPer100g = Math.round(cG * factor * 10) / 10;
    const fatPer100g = Math.round(fG * factor * 10) / 10;
    const fiberPer100g = Math.round(fiG * factor * 10) / 10;
    const sodiumPer100g = Math.round(sMg * factor * 10) / 10;
    const calciumPer100g = Math.round(caMg * factor * 10) / 10;
    const ironPer100g = Math.round(feMg * factor * 10) / 10;
    const zincPer100g = Math.round(znMg * factor * 10) / 10;
    const magnesiumPer100g = Math.round(mgMg * factor * 10) / 10;
    const cholesterolPer100g = Math.round(chMg * factor * 10) / 10;

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
            fiberG: fiberPer100g,
            sodiumMg: sodiumPer100g,
            calciumMg: calciumPer100g,
            ironMg: ironPer100g,
            zincMg: zincPer100g,
            magnesiumMg: magnesiumPer100g,
            cholesterolMg: cholesterolPer100g,
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
        fiberG: fiG,
        calciumMg: caMg,
        ironMg: feMg,
        zincMg: znMg,
        magnesiumMg: mgMg,
        cholesterolMg: chMg,
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
        fiberG: true,
        calciumMg: true,
        ironMg: true,
        zincMg: true,
        magnesiumMg: true,
        cholesterolMg: true,
      },
    });

    await db.foodLog.update({
      where: { id: foodLog.id },
      data: {
        totalCalories: totals._sum.calories || 0,
        totalProtein: totals._sum.proteinG || 0,
        totalCarbs: totals._sum.carbsG || 0,
        totalFat: totals._sum.fatG || 0,
        totalFiber: totals._sum.fiberG || 0,
        totalCalciumMg: totals._sum.calciumMg || 0,
        totalIronMg: totals._sum.ironMg || 0,
        totalZincMg: totals._sum.zincMg || 0,
        totalMagnesiumMg: totals._sum.magnesiumMg || 0,
        totalCholesterolMg: totals._sum.cholesterolMg || 0,
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
        consumedFiber: { increment: fiG },
        consumedCalciumMg: { increment: caMg },
        consumedIronMg: { increment: feMg },
        consumedZincMg: { increment: znMg },
        consumedMagnesiumMg: { increment: mgMg },
        consumedCholesterolMg: { increment: chMg },
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
        consumedFiber: fiG,
        consumedCalciumMg: caMg,
        consumedIronMg: feMg,
        consumedZincMg: znMg,
        consumedMagnesiumMg: mgMg,
        consumedCholesterolMg: chMg,
      },
    });

    // Reconcile today's meal plan: drop slots just eaten and re-scale the rest.
    let planSync: Awaited<ReturnType<typeof syncMealPlanWithLogs>> | null = null;
    try {
      planSync = await syncMealPlanWithLogs(session.userId);
    } catch (syncErr) {
      console.warn('Meal plan sync failed:', syncErr);
    }

    return created({
      logItem,
      foodLogTotals: {
        totalCalories: totals._sum.calories || 0,
        totalProtein: totals._sum.proteinG || 0,
        totalCarbs: totals._sum.carbsG || 0,
        totalFat: totals._sum.fatG || 0,
      },
      planSync,
    });
  } catch (err) {
    console.error('Quick add food log error:', err);
    return serverError();
  }
}
