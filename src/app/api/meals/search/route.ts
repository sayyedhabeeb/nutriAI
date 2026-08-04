import { db } from '@/lib/db';
import { success, serverError } from '@/lib/response';
import { Prisma } from '@prisma/client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const cuisine = searchParams.get('cuisine');
    const mealType = searchParams.get('mealType');
    const dietType = searchParams.get('dietType');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const where: Prisma.MealWhereInput = { isActive: true };

    // Search by name or alias
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { aliases: { some: { aliasName: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    // Filter by cuisine
    if (cuisine) {
      where.cuisine = { contains: cuisine, mode: 'insensitive' };
    }

    // Filter by meal type
    if (mealType) {
      where.mealType = { contains: mealType, mode: 'insensitive' };
    }

    // Filter by diet type
    if (dietType) {
      switch (dietType.toLowerCase()) {
        case 'veg':
          where.isVeg = true;
          break;
        case 'vegan':
          where.isVegan = true;
          break;
        case 'eggetarian':
          where.isEggetarian = true;
          break;
      }
    }

    const [meals, total] = await Promise.all([
      db.meal.findMany({
        where,
        include: {
          nutrition: true,
          servings: true,
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      db.meal.count({ where }),
    ]);

    return success({
      meals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Meal search error:', err);
    return serverError();
  }
}
