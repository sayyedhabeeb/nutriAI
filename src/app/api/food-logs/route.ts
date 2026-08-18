import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { scaleNutrition } from '@/lib/nutrition-engine';
import { syncMealPlanWithLogs } from '@/lib/meal-plan-sync';
import { success, created, unauthorized, serverError, error, notFound } from '@/lib/response';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getTodayStr();

    let foodLog = await db.foodLog.findUnique({
      where: {
        userId_logDate: {
          userId: session.userId,
          logDate: date,
        },
      },
      include: {
        items: {
          include: {
            meal: {
              include: {
                nutrition: true,
                servings: true,
              },
            },
          },
          orderBy: { loggedAt: 'asc' },
        },
      },
    });

    if (!foodLog) {
      return success({
        id: null,
        logDate: date,
        totalCalories: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        status: 'active',
        itemsBySlot: {},
      });
    }

    // Group items by mealSlot
    const itemsBySlot: Record<string, typeof foodLog.items> = {};
    for (const item of foodLog.items) {
      if (!itemsBySlot[item.mealSlot]) {
        itemsBySlot[item.mealSlot] = [];
      }
      itemsBySlot[item.mealSlot].push(item);
    }

    return success({
      ...foodLog,
      itemsBySlot,
    });
  } catch (err) {
    console.error('Get food log error:', err);
    return serverError();
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const body = await request.json();
    const { mealId, servingGms, mealSlot, name, calories, proteinG, carbsG, fatG, source } = body;

    if (!servingGms || servingGms <= 0) return error('servingGms must be a positive number');
    if (!mealSlot) return error('mealSlot is required (breakfast/lunch/dinner/snack)');

    const validSlots = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validSlots.includes(mealSlot)) {
      return error(`mealSlot must be one of: ${validSlots.join(', ')}`);
    }

    // Either a mealId (DB-backed nutrition) or an inline nutrition payload.
    let itemName: string | null = null;
    let itemMealId: string | null = null;
    let scaled: ReturnType<typeof scaleNutrition>;

    if (mealId) {
      const meal = await db.meal.findUnique({
        where: { id: mealId },
        include: { nutrition: true },
      });

      if (!meal || !meal.nutrition) {
        return error('Meal or meal nutrition not found', 404, 'NOT_FOUND');
      }

      itemMealId = meal.id;
      itemName = meal.name;
      scaled = scaleNutrition(
        {
          calories: meal.nutrition.calories,
          proteinG: meal.nutrition.proteinG,
          carbsG: meal.nutrition.carbsG,
          fatG: meal.nutrition.fatG,
        },
        servingGms
      );
    } else {
      if (!name) return error('name is required when mealId is absent');
      if (!calories || calories <= 0) return error('calories must be a positive number');
      itemName = name;
      scaled = {
        calories: Number(calories),
        proteinG: Number(proteinG || 0),
        carbsG: Number(carbsG || 0),
        fatG: Number(fatG || 0),
        fiberG: Number(body.fiberG || 0),
        sugarG: Number(body.sugarG || 0),
        sodiumMg: Number(body.sodiumMg || 0),
      };
    }

    const today = getTodayStr();

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
        mealId: itemMealId,
        name: itemName,
        servingGms,
        calories: scaled.calories,
        proteinG: scaled.proteinG,
        carbsG: scaled.carbsG,
        fatG: scaled.fatG,
        mealSlot,
        source: source || 'photo',
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
        consumedCalories: { increment: scaled.calories },
        consumedProtein: { increment: scaled.proteinG },
        consumedCarbs: { increment: scaled.carbsG },
        consumedFat: { increment: scaled.fatG },
      },
      create: {
        userId: session.userId,
        date: today,
        targetCalories: 2000, // default, will be updated by goal calculation
        targetProtein: 150,
        targetCarbs: 250,
        targetFat: 67,
        consumedCalories: scaled.calories,
        consumedProtein: scaled.proteinG,
        consumedCarbs: scaled.carbsG,
        consumedFat: scaled.fatG,
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
    console.error('Log food error:', err);
    return serverError();
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return error('Item id is required as a query parameter');

    // Find the item and verify ownership
    const item = await db.foodLogItem.findUnique({
      where: { id },
      include: { foodLog: true },
    });

    if (!item || item.foodLog.userId !== session.userId) {
      return notFound('Food log item not found');
    }

    const foodLogId = item.foodLogId;
    const logDate = item.foodLog.logDate;

    // Delete the item
    await db.foodLogItem.delete({ where: { id } });

    // Update FoodLog totals
    const totals = await db.foodLogItem.aggregate({
      where: { foodLogId },
      _sum: {
        calories: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
      },
    });

    await db.foodLog.update({
      where: { id: foodLogId },
      data: {
        totalCalories: totals._sum.calories || 0,
        totalProtein: totals._sum.proteinG || 0,
        totalCarbs: totals._sum.carbsG || 0,
        totalFat: totals._sum.fatG || 0,
      },
    });

    // Update DailyNutrition consumed values using remaining aggregated totals
    const remainingCalories = Math.max(0, totals._sum.calories || 0);
    const remainingProtein = Math.max(0, totals._sum.proteinG || 0);
    const remainingCarbs = Math.max(0, totals._sum.carbsG || 0);
    const remainingFat = Math.max(0, totals._sum.fatG || 0);

    await db.dailyNutrition.updateMany({
      where: { userId: session.userId, date: logDate },
      data: {
        consumedCalories: remainingCalories,
        consumedProtein: remainingProtein,
        consumedCarbs: remainingCarbs,
        consumedFat: remainingFat,
      },
    });

    // If a slot's last item was deleted, restore it to today's meal plan and
    // re-scale the remaining slots back up to the now-larger remaining budget.
    let planSync: Awaited<ReturnType<typeof syncMealPlanWithLogs>> | null = null;
    if (logDate === getTodayStr()) {
      try {
        planSync = await syncMealPlanWithLogs(session.userId);
      } catch (syncErr) {
        console.warn('Meal plan sync failed:', syncErr);
      }
    }

    return success({ deleted: true, planSync });
  } catch (err) {
    console.error('Delete food log item error:', err);
    return serverError();
  }
}
