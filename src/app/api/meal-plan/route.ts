import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/response';
import { buildPlanItems } from '@/lib/meal-plan-view';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const today = getTodayStr();

    const planDay = await db.mealPlanDay.findUnique({
      where: { userId_planDate: { userId: session.userId, planDate: today } },
      include: {
        items: {
          include: {
            meal: {
              include: { nutrition: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!planDay) {
      return success({ exists: false, planDate: today, items: [] });
    }

    return success({
      exists: true,
      planDate: planDay.planDate,
      targetCalories: planDay.targetCalories,
      targetProtein: planDay.targetProtein,
      targetCarbs: planDay.targetCarbs,
      targetFat: planDay.targetFat,
      items: buildPlanItems(planDay.items),
    });
  } catch (err) {
    console.error('Get meal plan error:', err);
    return serverError();
  }
}
