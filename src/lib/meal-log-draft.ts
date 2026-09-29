export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** The input-neutral handoff used before the existing portion confirmation UI. */
export interface MealLogDraft {
  source: 'photo' | 'voice' | 'text';
  mealType?: MealSlot;
  items: Array<{
    foodName: string;
    quantity: number | null;
    unit: string | null;
    portionSpecified: boolean;
    /** 0-1 confidence from the food-understanding step (voice input). Optional. */
    confidence?: number;
    /** The natural portion unit for this food, from food knowledge
     *  (voice input). Optional; null = let the shared classifier decide. */
    portionType?: 'piece' | 'glass' | 'plate' | 'bowl' | 'grams' | 'ml' | null;
  }>;
}
