import { db } from '@/lib/db';
import { success, serverError } from '@/lib/response';

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

    // For SQLite: get all meals and filter in-memory for search reliability
    // SQLite LIKE is case-insensitive by default for ASCII
    let meals = await db.meal.findMany({
      where: { isActive: true },
      include: { nutrition: true, servings: true, aliases: true, tags: true },
      orderBy: { name: 'asc' },
    });

    // Filter by search query
    if (q) {
      const qLower = q.toLowerCase();
      meals = meals.filter(m =>
        m.name.toLowerCase().includes(qLower) ||
        m.aliases.some(a => a.aliasName.toLowerCase().includes(qLower)) ||
        (m.description && m.description.toLowerCase().includes(qLower)) ||
        m.tags.some(t => t.tagName.toLowerCase().includes(qLower))
      );
    }

    // Filter by cuisine
    if (cuisine) {
      const c = cuisine.toLowerCase();
      meals = meals.filter(m => m.cuisine.toLowerCase().includes(c));
    }

    // Filter by meal type
    if (mealType) {
      const mt = mealType.toLowerCase();
      meals = meals.filter(m => m.mealType.toLowerCase().includes(mt));
    }

    // Filter by diet type
    if (dietType) {
      switch (dietType.toLowerCase()) {
        case 'veg':
        case 'vegetarian':
          meals = meals.filter(m => m.isVeg || m.isVegan);
          break;
        case 'vegan':
          meals = meals.filter(m => m.isVegan);
          break;
        case 'eggetarian':
          meals = meals.filter(m => m.isVeg || m.isEggetarian || m.isVegan);
          break;
      }
    }

    const total = meals.length;
    const paginated = meals.slice(skip, skip + limit);

    // Clean up relations for response (avoid circular refs)
    const clean = paginated.map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      mealType: m.mealType,
      cuisine: m.cuisine,
      isVeg: m.isVeg,
      isVegan: m.isVegan,
      isEggetarian: m.isEggetarian,
      baseServingGms: m.baseServingGms,
      prepTimeMin: m.prepTimeMin,
      imageUrl: m.imageUrl,
      source: m.source,
      nutrition: m.nutrition ? {
        calories: m.nutrition.calories,
        proteinG: m.nutrition.proteinG,
        carbsG: m.nutrition.carbsG,
        fatG: m.nutrition.fatG,
        fiberG: m.nutrition.fiberG,
        sugarG: m.nutrition.sugarG,
        sodiumMg: m.nutrition.sodiumMg,
        perServingGms: m.nutrition.perServingGms,
      } : null,
      servings: m.servings.map(s => ({
        id: s.id,
        servingName: s.servingName,
        servingGms: s.servingGms,
        multiplier: s.multiplier,
      })),
    }));

    return success({
      meals: clean,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Meal search error:', err);
    return serverError();
  }
}
