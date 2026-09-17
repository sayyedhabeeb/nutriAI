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
  }>;
}
