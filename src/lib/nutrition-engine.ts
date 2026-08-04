// ═══ Nutrition Engine ═══
// All deterministic calculations - no AI needed

export type Gender = 'male' | 'female' | 'other';
export type GoalType = 'muscle_gain' | 'lose_fat' | 'maintain' | 'recomp' | 'weight_gain' | 'athlete';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';

export interface NutritionTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface UserNutritionProfile {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  goalType: GoalType;
  activityLevel: ActivityLevel;
  macroOverrideJson?: string | null;
}

// BMI Calculation
export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

export function getBMICategory(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: '#f59e0b' };
  if (bmi < 25) return { label: 'Normal', color: '#22c55e' };
  if (bmi < 30) return { label: 'Overweight', color: '#f97316' };
  return { label: 'Obese', color: '#ef4444' };
}

// BMR - Mifflin-St Jeor Equation
export function calculateBMR(profile: { gender: Gender; age: number; heightCm: number; weightKg: number }): number {
  const { gender, age, heightCm, weightKg } = profile;
  const maleBMR = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
  const femaleBMR = (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;
  
  if (gender === 'male') return maleBMR;
  if (gender === 'female') return femaleBMR;
  return (maleBMR + femaleBMR) / 2; // average for 'other'
}

// TDEE multipliers
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel];
}

// Goal calorie adjustments
const GOAL_ADJUSTMENTS: Record<GoalType, number> = {
  muscle_gain: 500,
  lose_fat: -500,
  maintain: 0,
  recomp: -250,
  weight_gain: 750,
  athlete: 300,
};

export function calculateTargetCalories(tdee: number, goalType: GoalType): number {
  return Math.round(tdee + GOAL_ADJUSTMENTS[goalType]);
}

// Default macro percentages per goal
const MACRO_PERCENTAGES: Record<GoalType, { protein: number; carbs: number; fat: number }> = {
  muscle_gain: { protein: 0.30, carbs: 0.45, fat: 0.25 },
  lose_fat: { protein: 0.40, carbs: 0.30, fat: 0.30 },
  maintain: { protein: 0.30, carbs: 0.40, fat: 0.30 },
  recomp: { protein: 0.35, carbs: 0.35, fat: 0.30 },
  weight_gain: { protein: 0.25, carbs: 0.50, fat: 0.25 },
  athlete: { protein: 0.35, carbs: 0.45, fat: 0.20 },
};

export function calculateMacroTargets(
  targetCalories: number,
  goalType: GoalType,
  macroOverrideJson?: string | null
): NutritionTargets {
  let macros = MACRO_PERCENTAGES[goalType];
  
  if (macroOverrideJson) {
    try {
      const override = JSON.parse(macroOverrideJson);
      macros = { ...macros, ...override };
    } catch {}
  }
  
  const proteinG = Math.round((targetCalories * macros.protein) / 4);
  const carbsG = Math.round((targetCalories * macros.carbs) / 4);
  const fatG = Math.round((targetCalories * macros.fat) / 9);
  
  return { calories: targetCalories, proteinG, carbsG, fatG };
}

// Full nutrition calculation pipeline
export function calculateFullNutrition(profile: UserNutritionProfile): NutritionTargets {
  const bmr = calculateBMR(profile);
  const tdee = calculateTDEE(bmr, profile.activityLevel);
  const targetCalories = calculateTargetCalories(tdee, profile.goalType);
  return calculateMacroTargets(targetCalories, profile.goalType, profile.macroOverrideJson);
}

// Meal slot distribution
export const MEAL_SLOT_DISTRIBUTION = {
  breakfast: 0.25,
  lunch: 0.30,
  dinner: 0.30,
  snack: 0.15,
} as const;

export type MealSlot = keyof typeof MEAL_SLOT_DISTRIBUTION;

export function getSlotTargets(
  dailyTargets: NutritionTargets,
  consumedCalories: number = 0
): Record<MealSlot, NutritionTargets> {
  const remaining = dailyTargets.calories - consumedCalories;
  const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
  
  const result = {} as Record<MealSlot, NutritionTargets>;
  for (const slot of slots) {
    const pct = MEAL_SLOT_DISTRIBUTION[slot];
    const cal = Math.round(remaining * pct);
    result[slot] = {
      calories: cal,
      proteinG: Math.round(dailyTargets.proteinG * pct),
      carbsG: Math.round(dailyTargets.carbsG * pct),
      fatG: Math.round(dailyTargets.fatG * pct),
    };
  }
  return result;
}

// Scale nutrition by serving size
export function scaleNutrition(
  basePer100g: { calories: number; proteinG: number; carbsG: number; fatG: number },
  servingGms: number
): { calories: number; proteinG: number; carbsG: number; fatG: number } {
  const factor = servingGms / 100;
  return {
    calories: Math.round(basePer100g.calories * factor),
    proteinG: Math.round(basePer100g.proteinG * factor * 10) / 10,
    carbsG: Math.round(basePer100g.carbsG * factor * 10) / 10,
    fatG: Math.round(basePer100g.fatG * factor * 10) / 10,
  };
}
