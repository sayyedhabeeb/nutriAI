'use server';

import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { success, unauthorized, serverError } from '@/lib/response';

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    // Get 3 random active meals with nutrition
    const totalMeals = await db.meal.count({ where: { isActive: true, nutrition: { isNot: null } } });
    const skip = Math.max(0, Math.floor(Math.random() * totalMeals) - 3);

    const meals = await db.meal.findMany({
      where: { isActive: true, nutrition: { isNot: null } },
      include: { nutrition: true },
      take: 3,
      skip,
      orderBy: { createdAt: 'asc' },
    });

    return success({
      meals: meals.map((m) => ({
        id: m.id,
        name: m.name,
        cuisine: m.cuisine,
        caloriesPer100g: m.nutrition?.calories || 0,
        proteinPer100g: m.nutrition?.proteinG || 0,
        baseServingGms: m.baseServingGms,
        mealType: m.mealType,
        isVeg: m.isVeg,
        isVegan: m.isVegan,
      })),
    });
  } catch (err) {
    console.error('Suggest meals error:', err);
    return serverError();
  }
}
