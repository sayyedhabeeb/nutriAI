export type ViewType = 'auth' | 'onboarding' | 'dashboard' | 'foodlog' | 'upload' | 'progress' | 'settings' | 'chat';
export type TabType = 'dashboard' | 'foodlog' | 'upload' | 'chat' | 'progress' | 'settings';

export interface NutritionData {
  targets: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; calciumMg: number; ironMg: number; zincMg: number; magnesiumMg: number; cholesterolMg: number };
  consumed: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; calciumMg: number; ironMg: number; zincMg: number; magnesiumMg: number; cholesterolMg: number };
  remaining: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; calciumMg: number; ironMg: number; zincMg: number; magnesiumMg: number; cholesterolMg: number };
  percentages: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; calciumMg: number; ironMg: number; zincMg: number; magnesiumMg: number; cholesterolMg: number };
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
  name: string | null;
  servingGms: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  calciumMg: number;
  ironMg: number;
  zincMg: number;
  magnesiumMg: number;
  cholesterolMg: number;
  mealSlot: string;
  meal: { name: string; nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number } | null } | null;
}

export interface HydrationData {
  glassesConsumed: number;
  targetGlasses: number;
  mlConsumed: number;
  targetMl: number;
  percentage: number;
}

export type NutritionSource = 'meal' | 'ingredients' | 'extracted' | 'stored';

export type PortionType = 'piece' | 'portion' | 'bowl' | 'drink' | 'weight';

export interface PortionOption {
  label: string;
  value: number;
  unit: 'g' | 'pc' | 'ml';
  kind: 'preset' | 'custom';
  default?: boolean;
}

export interface RecognizedFood {
  name: string;
  servingDescription: string;
  portionType: PortionType;
  estimatedGrams: number | null;
  estimatedMl: number | null;
  estimatedPieces: number | null;
  gramsPerPiece: number | null;
  totalGrams: number;
  confidence: number;
  needsConfirmation: boolean;
  nutritionSource: NutritionSource;
  portionOptions: PortionOption[];
  estimatedNutrition: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarG: number; sodiumMg: number; calciumMg: number; ironMg: number; zincMg: number; magnesiumMg: number; cholesterolMg: number } | null;
  ingredients: { name: string; grams: number; matched: boolean }[];
  variants: { name: string; matched: boolean; estimatedNutrition: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarG: number; sodiumMg: number; calciumMg: number; ironMg: number; zincMg: number; magnesiumMg: number; cholesterolMg: number } | null }[];
  matched: boolean;
  unknown_food: boolean;
  meal: Record<string, unknown> | null;
  mealId: string | null;
  newFoodId: string | null;
}

export interface SearchMeal {
  id: string;
  name: string;
  mealType: string;
  cuisine: string;
  imageUrl: string | null;
  baseServingGms: number;
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarG: number; sodiumMg: number; calciumMg: number; ironMg: number; zincMg: number; magnesiumMg: number; cholesterolMg: number } | null;
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
  rankPosition: number;
  meal: {
    id: string;
    name: string;
    mealType: string;
    cuisine: string;
    imageUrl: string | null;
    isVeg: boolean;
    isVegan: boolean;
    prepTimeMin: number | null;
  };
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; calciumMg: number; ironMg: number; zincMg: number; magnesiumMg: number; cholesterolMg: number } | null;
}
