import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { created, unauthorized, serverError, error } from '@/lib/response';
import { assertSingleFoodName } from '@/lib/food-names';

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const body = await request.json();
    const {
      aiDetectedName,
      confirmedName,
      confirmedPortion,
      caloriesPer100g,
      proteinPer100g,
      carbsPer100g,
      fatPer100g,
      mealType,
      cuisine,
    } = body;

    if (!confirmedName) return error('confirmedName is required');
    const compoundMessage = assertSingleFoodName(confirmedName);
    if (compoundMessage) return error(compoundMessage);
    if (!caloriesPer100g || caloriesPer100g <= 0) return error('Valid caloriesPer100g is required');
    if (!mealType) return error('mealType is required');
    if (!cuisine) return error('cuisine is required');

    // Create the Meal
    const meal = await db.meal.create({
      data: {
        name: confirmedName,
        mealType,
        cuisine,
        isVeg: body.isVeg || false,
        isVegan: body.isVegan || false,
        isEggetarian: body.isEggetarian || false,
        baseServingGms: confirmedPortion || 100,
        source: 'user',
        nutrition: {
          create: {
            calories: caloriesPer100g,
            proteinG: proteinPer100g || 0,
            carbsG: carbsPer100g || 0,
            fatG: fatPer100g || 0,
            perServingGms: 100,
          },
        },
        servings: {
          create: {
            servingName: 'Standard Serving',
            servingGms: confirmedPortion || 100,
            multiplier: (confirmedPortion || 100) / 100,
          },
        },
        aliases: {
          create: {
            aliasName: confirmedName.toLowerCase(),
          },
        },
      },
      include: {
        nutrition: true,
        servings: true,
        aliases: true,
      },
    });

    // Create UnknownFoodSubmission record
    await db.unknownFoodSubmission.create({
      data: {
        userId: session.userId,
        aiDetectedName: aiDetectedName || confirmedName,
        confirmedName,
        confirmedPortion: confirmedPortion || 100,
        caloriesPer100g,
        proteinPer100g: proteinPer100g || 0,
        carbsPer100g: carbsPer100g || 0,
        fatPer100g: fatPer100g || 0,
        status: 'submitted',
      },
    });

    return created({
      meal,
      message: 'Food submitted and added to database',
    });
  } catch (err) {
    console.error('Submit unknown food error:', err);
    return serverError();
  }
}
