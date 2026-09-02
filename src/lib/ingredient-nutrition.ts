// ═══ Ingredient & Portion Engine ═══
// Pure helpers for composing nutrition from ingredients and building
// portion-confirmation options. All deterministic - no AI here.

import type { ScaledNutrition } from '@/lib/nutrition-engine';

export interface IngredientItem {
  name: string;
  grams: number;
}

export interface IngredientNutritionRow {
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  sugarPer100g: number | null;
  sodiumMgPer100g: number | null;
  calciumMgPer100g: number | null;
  ironMgPer100g: number | null;
  zincMgPer100g: number | null;
  magnesiumMgPer100g: number | null;
  cholesterolMgPer100g: number | null;
}

export type PortionType = 'piece' | 'portion' | 'bowl' | 'drink' | 'weight';
export type PortionUnit = 'g' | 'pc' | 'ml';

export interface PortionOption {
  label: string;
  value: number;
  unit: PortionUnit;
  kind: 'preset' | 'custom';
  default?: boolean;
}

// Compose total nutrition from ingredient amounts, using a known
// ingredient nutrition table. Unknown ingredients are reported as missing.
export function composeNutritionFromItems(
  items: IngredientItem[],
  known: IngredientNutritionRow[]
): {
  nutrition: ScaledNutrition | null;
  matched: string[];
  missing: string[];
} {
  const knownMap = new Map(known.map((i) => [i.name.toLowerCase(), i]));
  const matched: string[] = [];
  const missing: string[] = [];
  const totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0, calciumMg: 0, ironMg: 0, zincMg: 0, magnesiumMg: 0, cholesterolMg: 0 };
  let anyMatched = false;

  for (const item of items) {
    const row = knownMap.get(item.name.toLowerCase());
    if (!row) {
      missing.push(item.name);
      continue;
    }
    anyMatched = true;
    matched.push(item.name);
    const f = item.grams / 100;
    totals.calories += row.caloriesPer100g * f;
    totals.proteinG += row.proteinPer100g * f;
    totals.carbsG += row.carbsPer100g * f;
    totals.fatG += row.fatPer100g * f;
    totals.fiberG += (row.fiberPer100g ?? 0) * f;
    totals.sugarG += (row.sugarPer100g ?? 0) * f;
    totals.sodiumMg += (row.sodiumMgPer100g ?? 0) * f;
    totals.calciumMg += (row.calciumMgPer100g ?? 0) * f;
    totals.ironMg += (row.ironMgPer100g ?? 0) * f;
    totals.zincMg += (row.zincMgPer100g ?? 0) * f;
    totals.magnesiumMg += (row.magnesiumMgPer100g ?? 0) * f;
    totals.cholesterolMg += (row.cholesterolMgPer100g ?? 0) * f;
  }

  if (!anyMatched) {
    return {
      nutrition: null,
      matched: [],
      missing: missing.length ? missing : items.map((i) => i.name),
    };
  }

  return {
    nutrition: {
      calories: Math.round(totals.calories),
      proteinG: Math.round(totals.proteinG * 10) / 10,
      carbsG: Math.round(totals.carbsG * 10) / 10,
      fatG: Math.round(totals.fatG * 10) / 10,
      fiberG: Math.round(totals.fiberG * 10) / 10,
      sugarG: Math.round(totals.sugarG * 10) / 10,
      sodiumMg: Math.round(totals.sodiumMg),
      calciumMg: Math.round(totals.calciumMg * 10) / 10,
      ironMg: Math.round(totals.ironMg * 10) / 10,
      zincMg: Math.round(totals.zincMg * 10) / 10,
      magnesiumMg: Math.round(totals.magnesiumMg * 10) / 10,
      cholesterolMg: Math.round(totals.cholesterolMg * 10) / 10,
    },
    matched,
    missing,
  };
}

// Natural piece counts used for piece-based foods (idli, chapati, eggs...).
const PIECE_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20];

// Build confirmation options appropriate to how a food is naturally measured:
//  - piece   → pieces (1, 2, 3 pc around the AI estimate)
//  - portion → Half / Medium / Full / Large (grams)
//  - bowl    → Small / Medium / Large bowl (grams)
//  - drink   → Small / Medium / Large cup (ml)
//  - weight  → Small / Medium / Large (grams)
export function buildPortionOptions(
  portionType: PortionType,
  estimate: number
): PortionOption[] {
  if (portionType === 'piece') {
    const base = Math.max(1, Math.round(estimate));
    const near = PIECE_COUNTS.map((n) => ({ n, d: Math.abs(n - base) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => x.n)
      .sort((a, b) => a - b);
    return [
      ...near.map((n) => ({
        label: String(n),
        value: n,
        unit: 'pc' as const,
        kind: 'preset' as const,
        default: n === base,
      })),
      { label: 'More', value: 0, unit: 'pc' as const, kind: 'custom' as const },
    ];
  }

  const roundTo = (n: number) => Math.max(20, Math.round(n / 10) * 10);
  const g = (label: string, factor: number, isDefault = false): PortionOption => ({
    label,
    value: roundTo(estimate * factor),
    unit: 'g',
    kind: 'preset',
    default: isDefault,
  });

  if (portionType === 'portion') {
    return [
      g('Half', 0.5),
      g('Medium', 0.75),
      g('Full', 1, true),
      g('Large', 1.25),
      { label: 'More', value: 0, unit: 'g' as const, kind: 'custom' as const },
    ];
  }

  if (portionType === 'bowl') {
    return [
      g('Small Bowl', 0.75),
      g('Medium Bowl', 1, true),
      g('Large Bowl', 1.3),
      { label: 'More', value: 0, unit: 'g' as const, kind: 'custom' as const },
    ];
  }

  if (portionType === 'drink') {
    const ml = (label: string, factor: number, isDefault = false): PortionOption => ({
      label,
      value: Math.max(50, Math.round(estimate * factor / 10) * 10),
      unit: 'ml',
      kind: 'preset',
      default: isDefault,
    });
    return [
      ml('Small Cup', 0.75),
      ml('Medium Cup', 1, true),
      ml('Large Cup', 1.3),
      { label: 'More', value: 0, unit: 'ml' as const, kind: 'custom' as const },
    ];
  }

  // weight (fallback)
  return [
    g('Small', 0.7),
    g('Medium', 1, true),
    g('Large', 1.3),
    { label: 'More', value: 0, unit: 'g' as const, kind: 'custom' as const },
  ];
}

// Convert a portion nutrition to per-100g values (used for logging non-DB foods).
export function nutritionToPer100(
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number },
  grams: number
): { calories: number; proteinG: number; carbsG: number; fatG: number } {
  if (!grams || grams <= 0) {
    return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  }
  const f = 100 / grams;
  return {
    calories: Math.round(nutrition.calories * f),
    proteinG: Math.round(nutrition.proteinG * f * 10) / 10,
    carbsG: Math.round(nutrition.carbsG * f * 10) / 10,
    fatG: Math.round(nutrition.fatG * f * 10) / 10,
  };
}

// Pick a meal slot from the current time.
export function slotForTime(d: Date = new Date()): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const h = d.getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}

// Fuzzy-match an extracted ingredient name against the master table,
// trying exact, case-insensitive, and "X of Y"-style cleanup.
export function resolveIngredientName(raw: string): string {
  let name = raw.trim().toLowerCase();
  name = name.replace(/\b(whole|fresh|raw|boiled|cooked|steamed|grilled|roasted|sauteed|sliced|diced|chopped|minced|ground|powdered|dried|shredded)\b/g, ' ').trim();
  name = name.replace(/\s+/g, ' ').trim();
  return name;
}
