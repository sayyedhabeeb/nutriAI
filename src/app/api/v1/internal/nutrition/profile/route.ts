import { db } from '@/lib/db';
import { validateServiceToken } from '@/lib/auth/serviceAuth';
import { NextResponse } from 'next/server';
import { calculateFullNutrition, Gender, GoalType, ActivityLevel } from '@/lib/nutrition-engine';

export async function GET(request: Request) {
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
      return NextResponse.json({ error: 'Nutrition profile not found' }, { status: 404 });
    }

    const goal = await db.userGoal.findUnique({
      where: { userId: user.id },
    });

    const preference = await db.userPreference.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({ profile, goal, preference });
  } catch (err) {
    console.error('Internal profile GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authResult = await validateServiceToken(request);
    if ('error' in authResult) {
      return authResult.error;
    }
    const user = authResult.user;

    const body = await request.json();
    const { 
      age, 
      gender, 
      heightCm, 
      weightKg, 
      goalType, 
      activityLevel,
      macroOverrideJson,
      dietPreference,
      allergies,
      skipDays,
      meals,
      cuisines,
      avoidedFoods,
      otherInfo
    } = body;

    // Strict validation
    if (age !== undefined && (typeof age !== 'number' || age < 10 || age > 120)) {
      return NextResponse.json({ error: 'Invalid age' }, { status: 400 });
    }
    if (heightCm !== undefined && (typeof heightCm !== 'number' || heightCm < 50 || heightCm > 300)) {
      return NextResponse.json({ error: 'Invalid height' }, { status: 400 });
    }
    if (weightKg !== undefined && (typeof weightKg !== 'number' || weightKg < 20 || weightKg > 500)) {
      return NextResponse.json({ error: 'Invalid weight' }, { status: 400 });
    }

    const validGoals: GoalType[] = ['muscle_gain', 'lose_fat', 'maintain', 'recomp', 'weight_gain', 'athlete'];
    if (goalType && !validGoals.includes(goalType)) {
      return NextResponse.json({ error: `Invalid goalType. Must be one of: ${validGoals.join(', ')}` }, { status: 400 });
    }

    const validActivities: ActivityLevel[] = ['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'];
    if (activityLevel && !validActivities.includes(activityLevel)) {
      return NextResponse.json({ error: `Invalid activityLevel. Must be one of: ${validActivities.join(', ')}` }, { status: 400 });
    }

    const validGenders: Gender[] = ['male', 'female', 'other'];
    if (gender && !validGenders.includes(gender)) {
      return NextResponse.json({ error: `Invalid gender. Must be one of: ${validGenders.join(', ')}` }, { status: 400 });
    }

    // Upsert Profile
    const profile = await db.userProfile.upsert({
      where: { userId: user.id },
      update: {
        ...(age !== undefined && { age }),
        ...(gender !== undefined && { gender }),
        ...(heightCm !== undefined && { heightCm }),
        ...(weightKg !== undefined && { weightKg }),
      },
      create: {
        userId: user.id,
        age: age || 25,
        gender: gender || 'other',
        heightCm: heightCm || 170,
        weightKg: weightKg || 70,
      },
    });

    // Upsert Goal
    const goal = await db.userGoal.upsert({
      where: { userId: user.id },
      update: {
        ...(goalType !== undefined && { goalType }),
        ...(activityLevel !== undefined && { activityLevel }),
      },
      create: {
        userId: user.id,
        goalType: goalType || 'maintain',
        activityLevel: activityLevel || 'sedentary',
      },
    });

    const formatStr = (val: any) => {
      if (val === undefined || val === null) return undefined;
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    };

    // Upsert Preferences
    const preference = await db.userPreference.upsert({
      where: { userId: user.id },
      update: {
        ...(macroOverrideJson !== undefined && { macroOverrideJson: formatStr(macroOverrideJson) }),
        ...(dietPreference !== undefined && { dietType: dietPreference }),
        ...(allergies !== undefined && { allergies: formatStr(allergies) }),
        ...(skipDays !== undefined && { skipDays: formatStr(skipDays) }),
        ...(meals !== undefined && { meals: formatStr(meals) }),
        ...(cuisines !== undefined && { cuisines: formatStr(cuisines) }),
        ...(avoidedFoods !== undefined && { avoidedFoods: formatStr(avoidedFoods) }),
        ...(otherInfo !== undefined && { otherInfo: formatStr(otherInfo) }),
      },
      create: {
        userId: user.id,
        macroOverrideJson: formatStr(macroOverrideJson) || null,
        dietType: dietPreference || null,
        allergies: formatStr(allergies) || null,
        skipDays: formatStr(skipDays) || null,
        meals: formatStr(meals) || null,
        cuisines: formatStr(cuisines) || null,
        avoidedFoods: formatStr(avoidedFoods) || null,
        otherInfo: formatStr(otherInfo) || null,
      },
    });

    // We must recalculate today's daily nutrition deterministically
    const targets = calculateFullNutrition({
      gender: (profile.gender as Gender) || 'other',
      age: profile.age || 25,
      heightCm: profile.heightCm || 170,
      weightKg: profile.weightKg || 70,
      goalType: (goal.goalType as GoalType) || 'maintain',
      activityLevel: (goal.activityLevel as ActivityLevel) || 'sedentary',
      macroOverrideJson: preference.macroOverrideJson
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

    return NextResponse.json({ profile, goal, preference, targets });
  } catch (err) {
    console.error('Internal profile PUT error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
