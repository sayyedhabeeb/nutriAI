import { db } from '@/lib/db';
import { success, notFound, serverError } from '@/lib/response';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const meal = await db.meal.findUnique({
      where: { id },
      include: {
        nutrition: true,
        servings: true,
        aliases: {
          select: { aliasName: true },
        },
        tags: {
          select: { tagName: true },
        },
        ingredients: {
          select: { ingredientName: true, containsAllergen: true },
        },
      },
    });

    if (!meal) {
      return notFound('Meal not found');
    }

    return success({
      ...meal,
      aliases: meal.aliases.map((a) => a.aliasName),
      tags: meal.tags.map((t) => t.tagName),
    });
  } catch (err) {
    console.error('Get meal error:', err);
    return serverError();
  }
}
