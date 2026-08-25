import { db } from '@/lib/db';
import { validateServiceToken } from '@/lib/auth/serviceAuth';
import { NextResponse } from 'next/server';
import { calculateFullNutrition, Gender, GoalType, ActivityLevel } from '@/lib/nutrition-engine';

export async function POST(request: Request) {
  try {
    const authResult = await validateServiceToken(request);
    if ('error' in authResult) {
      return authResult.error;
    }
    const user = authResult.user;

    const profile = await db.userProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      return NextResponse.json({ 
        error: 'Nutrition profile incomplete. Please set your height, weight, and age.' 
      }, { status: 400 });
    }

    const goal = await db.userGoal.findUnique({
      where: { userId: user.id },
    });

    const preference = await db.userPreference.findUnique({
      where: { userId: user.id },
    });

    // The user may send extra fields like allergies, cuisines in the body.
    // For now, deterministic foundation just recalculates the macro targets from the profile.
    const targets = calculateFullNutrition({
      gender: (profile.gender as Gender) || 'other',
      age: profile.age || 25,
      heightCm: profile.heightCm || 170,
      weightKg: profile.weightKg || 70,
      goalType: (goal?.goalType as GoalType) || 'maintain',
      activityLevel: (goal?.activityLevel as ActivityLevel) || 'sedentary',
      macroOverrideJson: preference?.macroOverrideJson
    });

    const today = new Date().toISOString().split('T')[0];
    await db.dailyNutrition.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: {
        targetCalories: targets.calories,
        targetProtein: targets.proteinG,
        targetCarbs: targets.carbsG,
        targetFat: targets.fatG,
      },
      create: {
        userId: user.id,
        date: today,
        targetCalories: targets.calories,
        targetProtein: targets.proteinG,
        targetCarbs: targets.carbsG,
        targetFat: targets.fatG,
      },
    });

    // Mobile currently expects data returned like:
    // { calories: 2000, protein: 150, carbs: 200, fat: 66, ... }
    return NextResponse.json({
      calories: targets.calories,
      protein: targets.proteinG,
      carbs: targets.carbsG,
      fat: targets.fatG,
    });
  } catch (err) {
    console.error('Internal macros POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
