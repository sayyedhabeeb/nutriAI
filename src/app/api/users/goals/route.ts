import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import {
  calculateFullNutrition,
  type GoalType,
  type ActivityLevel,
  type Gender,
} from '@/lib/nutrition-engine';
import { success, unauthorized, serverError, error } from '@/lib/response';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const body = await request.json();
    const { goalType, activityLevel, workoutFrequency, targetWeightKg } = body;

    if (!goalType) return error('goalType is required');
    if (!activityLevel) return error('activityLevel is required');

    // Validate enums
    const validGoals: GoalType[] = ['muscle_gain', 'lose_fat', 'maintain', 'recomp', 'weight_gain', 'athlete'];
    if (!validGoals.includes(goalType)) {
      return error(`Invalid goalType. Must be one of: ${validGoals.join(', ')}`);
    }

    const validActivities: ActivityLevel[] = ['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'];
    if (!validActivities.includes(activityLevel)) {
      return error(`Invalid activityLevel. Must be one of: ${validActivities.join(', ')}`);
    }

    // Upsert goal
    const goal = await db.userGoal.upsert({
      where: { userId: session.userId },
      update: {
        goalType,
        activityLevel,
        ...(workoutFrequency !== undefined && { workoutFrequency }),
        ...(targetWeightKg !== undefined && { targetWeightKg }),
      },
      create: {
        userId: session.userId,
        goalType,
        activityLevel,
        workoutFrequency: workoutFrequency || null,
        targetWeightKg: targetWeightKg || null,
      },
    });

    // Get profile for nutrition calculation
    const profile = await db.userProfile.findUnique({
      where: { userId: session.userId },
    });
    const user = await db.user.findUnique({
      where: { id: session.userId },
      include: { preference: true },
    });

    const gender = (profile?.gender as Gender) || 'other';
    const age = profile?.age || 25;
    const heightCm = profile?.heightCm || 170;
    const weightKg = profile?.weightKg || 70;

    // Calculate nutrition targets
    const targets = calculateFullNutrition({
      gender,
      age,
      heightCm,
      weightKg,
      goalType,
      activityLevel,
      macroOverrideJson: user?.preference?.macroOverrideJson,
    });

    const today = getTodayStr();

    // Upsert DailyNutrition for today
    await db.dailyNutrition.upsert({
      where: { userId_date: { userId: session.userId, date: today } },
      update: {
        targetCalories: targets.calories,
        targetProtein: targets.proteinG,
        targetCarbs: targets.carbsG,
        targetFat: targets.fatG,
      },
      create: {
        userId: session.userId,
        date: today,
        targetCalories: targets.calories,
        targetProtein: targets.proteinG,
        targetCarbs: targets.carbsG,
        targetFat: targets.fatG,
      },
    });

    return success({
      goal,
      nutritionTargets: targets,
    });
  } catch (err) {
    console.error('Update goals error:', err);
    return serverError();
  }
}
