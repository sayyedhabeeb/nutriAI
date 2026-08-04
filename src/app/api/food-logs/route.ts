import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { scaleNutrition } from '@/lib/nutrition-engine';
import { success, created, unauthorized, serverError, error, notFound } from '@/lib/response';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const session = getSessionFromRequest(request);
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
    const session = getSessionFromRequest(request);
    if (!session) return unauthorized();

    const body = await request.json();
    const { mealId, servingGms, mealSlot } = body;

    if (!mealId) return error('mealId is required');
    if (!servingGms || servingGms <= 0) return error('servingGms must be a positive number');
    if (!mealSlot) return error('mealSlot is required (breakfast/lunch/dinner/snack)');

    const validSlots = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validSlots.includes(mealSlot)) {
      return error(`mealSlot must be one of: ${validSlots.join(', ')}`);
    }

    // Get meal with nutrition
    const meal = await db.meal.findUnique({
      where: { id: mealId },
      include: { nutrition: true },
    });

    if (!meal || !meal.nutrition) {
      return error('Meal or meal nutrition not found', 404, 'NOT_FOUND');
    }

    // Scale nutrition by serving size
    const scaled = scaleNutrition(
      {
        calories: meal.nutrition.calories,
        proteinG: meal.nutrition.proteinG,
        carbsG: meal.nutrition.carbsG,
        fatG: meal.nutrition.fatG,
      },
      servingGms
    );

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
        mealId: meal.id,
        servingGms,
        calories: scaled.calories,
        proteinG: scaled.proteinG,
        carbsG: scaled.carbsG,
        fatG: scaled.fatG,
        mealSlot,
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
    console.error('Log food error:', err);
    return serverError();
  }
}

export async function DELETE(request: Request) {
  try {
    const session = getSessionFromRequest(request);
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

    // Update DailyNutrition consumed (decrement)
    await db.dailyNutrition.updateMany({
      where: { userId: session.userId, date: logDate },
      data: {
        consumedCalories: { decrement: item.calories },
        consumedProtein: { decrement: item.proteinG },
        consumedCarbs: { decrement: item.carbsG },
        consumedFat: { decrement: item.fatG },
      },
    });

    return success({ deleted: true });
  } catch (err) {
    console.error('Delete food log item error:', err);
    return serverError();
  }
}
