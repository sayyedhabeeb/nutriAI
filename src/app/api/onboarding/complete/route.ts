import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import {
  calculateFullNutrition,
  type GoalType,
  type ActivityLevel,
  type Gender,
} from '@/lib/nutrition-engine';
import { success, created, unauthorized, serverError, error } from '@/lib/response';

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) return unauthorized();

    const body = await request.json();
    const {
      goalType,
      activityLevel,
      workoutFrequency,
      cuisinePreference,
      dietType,
      allergies = [],
      budgetLevel,
    } = body;

    if (!goalType) return error('goalType is required');
    if (!activityLevel) return error('activityLevel is required');

    // Validate
    const validGoals: GoalType[] = ['muscle_gain', 'lose_fat', 'maintain', 'recomp', 'weight_gain', 'athlete'];
    if (!validGoals.includes(goalType)) {
      return error(`Invalid goalType. Must be one of: ${validGoals.join(', ')}`);
    }
    const validActivities: ActivityLevel[] = ['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'];
    if (!validActivities.includes(activityLevel)) {
      return error(`Invalid activityLevel. Must be one of: ${validActivities.join(', ')}`);
    }

    // Create or update UserGoal (idempotent)
    const goal = await db.userGoal.upsert({
      where: { userId: session.userId },
      update: {
        goalType,
        activityLevel,
        workoutFrequency: workoutFrequency || null,
      },
      create: {
        userId: session.userId,
        goalType,
        activityLevel,
        workoutFrequency: workoutFrequency || null,
      },
    });

    // Create or update UserPreference (idempotent)
    const preference = await db.userPreference.upsert({
      where: { userId: session.userId },
      update: {
        cuisinePreference: cuisinePreference || null,
        dietType: dietType || null,
        budgetLevel: budgetLevel || null,
      },
      create: {
        userId: session.userId,
        cuisinePreference: cuisinePreference || null,
        dietType: dietType || null,
        budgetLevel: budgetLevel || null,
      },
    });

    // Create allergies (delete old ones first to prevent duplicates)
    await db.userAllergy.deleteMany({
      where: { userId: session.userId },
    });
    if (Array.isArray(allergies) && allergies.length > 0) {
      await db.userAllergy.createMany({
        data: allergies.map((name: string) => ({
          userId: session.userId,
          allergyName: name,
        })),
      });
    }

    // Get profile for nutrition calc
    const profile = await db.userProfile.findUnique({
      where: { userId: session.userId },
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
    });

    const today = getTodayStr();

    // Create or update DailyNutrition for today (idempotent)
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

    return created({
      goal,
      preference,
      nutritionTargets: targets,
    });
  } catch (err) {
    console.error('Onboarding error:', err);
    return serverError();
  }
}
