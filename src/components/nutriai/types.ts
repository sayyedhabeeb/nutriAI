export type ViewType = 'auth' | 'onboarding' | 'dashboard' | 'foodlog' | 'upload' | 'progress' | 'settings';
export type TabType = 'dashboard' | 'foodlog' | 'upload' | 'progress' | 'settings';

export interface NutritionData {
  targets: { calories: number; proteinG: number; carbsG: number; fatG: number };
  consumed: { calories: number; proteinG: number; carbsG: number; fatG: number };
  remaining: { calories: number; proteinG: number; carbsG: number; fatG: number };
  percentages: { calories: number; proteinG: number; carbsG: number; fatG: number };
}

export interface MealRecommendation {
  meal: {
    id: string; name: string; mealType: string; cuisine: string;
    imageUrl: string | null; prepTimeMin: number | null;
    isVeg?: boolean; isVegan?: boolean; description?: string | null;
  };
  score: number;
  recommendedServingGms: number;
  estimatedNutrition: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
  baseNutritionPer100g: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
}

export interface FoodLogItem {
  id: string;
  mealId: string | null;
  servingGms: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealSlot: string;
  meal: { name: string; nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number } | null } | null;
}

export interface RecognizedFood {
  name: string;
  servingDescription: string;
  servingWeightGrams: number;
  confidence: number;
  matched: boolean;
  unknown_food?: boolean;
  meal: Record<string, unknown> | null;
}

export interface SearchMeal {
  id: string;
  name: string;
  mealType: string;
  cuisine: string;
  baseServingGms: number;
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarG: number; sodiumMg: number } | null;
  isVeg: boolean;
  isVegan: boolean;
  prepTimeMin: number | null;
  servings: { servingSizeGms: number; servingDescription: string }[];
}

export interface MealPlanItemData {
  id: string;
  mealSlot: string;
  servingGms: number;
  recommendedCalories: number;
  rankScore: number;
  meal: {
    id: string;
    name: string;
    mealType: string;
    cuisine: string;
    isVeg: boolean;
    isVegan: boolean;
    prepTimeMin: number | null;
  };
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
}
