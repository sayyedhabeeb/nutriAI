import { scaleNutrition } from '@/lib/nutrition-engine';

export interface PlanItemWithMeal {
  id: string;
  mealSlot: string;
  servingGms: number;
  recommendedCalories: number;
  rankScore: number | null;
  rankPosition: number | null;
  createdAt: Date;
  meal: {
    id: string;
    name: string;
    mealType: string;
    cuisine: string;
    imageUrl: string | null;
    isVeg: boolean;
    isVegan: boolean;
    prepTimeMin: number | null;
    nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null; sugarG: number | null; sodiumMg: number | null; calciumMg: number | null; ironMg: number | null; zincMg: number | null; magnesiumMg: number | null; cholesterolMg: number | null } | null;
  };
}

export interface PlanItemView {
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
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null; sugarG: number | null; sodiumMg: number | null; calciumMg: number | null; ironMg: number | null; zincMg: number | null; magnesiumMg: number | null; cholesterolMg: number | null } | null;
}

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

export function buildPlanItems(items: PlanItemWithMeal[]): PlanItemView[] {
  const bySlot = new Map<string, PlanItemWithMeal[]>();
  for (const item of items) {
    const list = bySlot.get(item.mealSlot) || [];
    list.push(item);
    bySlot.set(item.mealSlot, list);
  }

  const out: PlanItemView[] = [];
  for (const slot of SLOT_ORDER) {
    const slotItems = bySlot.get(slot) || [];
    const sorted = [...slotItems].sort((a, b) => {
      const ra = a.rankPosition ?? Number.MAX_SAFE_INTEGER;
      const rb = b.rankPosition ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return (b.rankScore ?? 0) - (a.rankScore ?? 0);
    });

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const scaled = item.meal.nutrition
        ? scaleNutrition(
            {
              calories: item.meal.nutrition.calories,
              proteinG: item.meal.nutrition.proteinG,
              carbsG: item.meal.nutrition.carbsG,
              fatG: item.meal.nutrition.fatG,
              fiberG: item.meal.nutrition.fiberG ?? 0,
              sugarG: item.meal.nutrition.sugarG ?? 0,
              sodiumMg: item.meal.nutrition.sodiumMg ?? 0,
              calciumMg: item.meal.nutrition.calciumMg ?? 0,
              ironMg: item.meal.nutrition.ironMg ?? 0,
              zincMg: item.meal.nutrition.zincMg ?? 0,
              magnesiumMg: item.meal.nutrition.magnesiumMg ?? 0,
              cholesterolMg: item.meal.nutrition.cholesterolMg ?? 0,
            },
            item.servingGms
          )
        : null;

      out.push({
        id: item.id,
        mealSlot: item.mealSlot,
        servingGms: item.servingGms,
        recommendedCalories: item.recommendedCalories,
        rankScore: item.rankScore ?? 0,
        rankPosition: i + 1,
        meal: {
          id: item.meal.id,
          name: item.meal.name,
          mealType: item.meal.mealType,
          cuisine: item.meal.cuisine,
          imageUrl: item.meal.imageUrl,
          isVeg: item.meal.isVeg,
          isVegan: item.meal.isVegan,
          prepTimeMin: item.meal.prepTimeMin,
        },
        nutrition: scaled,
      });
    }
  }

  return out;
}
