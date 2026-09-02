// ═══ Ingredient Matching Engine ═══
// Turns raw AI-detected ingredient names into canonical keys that resolve
// against the OpenNutrition Ingredient table (and a small curated fallback map
// for staples that are missing or badly represented there).
//
// Key differences from the old exact-name lookup:
//  - strips the " by <brand>" suffix (most OpenNutrition rows are branded)
//  - singularizes plurals, drops state/prep words, applies Hindi→English maps
//  - prefers generic rows over branded ones and skips junk rows
//  - curated map takes priority for known-problematic staples

import type { ScaledNutrition } from '@/lib/nutrition-engine';
import type { IngredientItem, IngredientNutritionRow } from '@/lib/ingredient-nutrition';

export type MatchSource = 'db' | 'curated' | 'missing';

export interface ResolvedIngredient {
  // Canonical/display name used for storage and UI.
  name: string;
  grams: number;
  matched: boolean;
  source: MatchSource;
  row: IngredientNutritionRow | null;
  // Optional flags carried through for Meal creation.
  isVeg?: boolean;
  isVegan?: boolean;
  containsAllergen?: boolean;
}

export interface IngredientComposeResult {
  nutrition: ScaledNutrition | null;
  matched: string[];
  missing: string[];
  resolved: ResolvedIngredient[];
  flags: {
    isVeg: boolean;
    isVegan: boolean;
    containsAllergen: boolean;
  };
}

export type MatchRow = IngredientNutritionRow & {
  id?: string;
  isVeg?: boolean;
  isVegan?: boolean;
  containsAllergen?: boolean;
};

// ── Normalization ──

const STATE_WORDS = /\b(fresh|raw|boiled|cooked|steamed|grilled|roasted|sauteed|sautéed|sliced|diced|chopped|minced|ground|powdered|dried|shredded|frozen|baked|fried|smoked|marinated|skinless|boneless|organic|plain|unsalted|salted|seasoned|unsweetened|reduced|low-fat|low fat|refined|prepared|canned|tinned|crushed|flaked|chunked|halved|peeled|whipped|melted|toasted|charred)\b/g;

// Token-level replacements (applied inside the name).
const TOKEN_SYNONYMS: Record<string, string> = {
  chilli: 'chili',
  chillies: 'chili',
  chilies: 'chili',
  chile: 'chili',
  chiles: 'chili',
  peppers: 'pepper',
  potatos: 'potato',
  leaves: 'leaf',
};

// Full-name replacements (applied after singularization). Keys are the
// post-normalization form.
const NAME_SYNONYMS: Record<string, string> = {
  dhal: 'dal',
  palak: 'spinach',
  bhindi: 'okra',
  brinjal: 'eggplant',
  aubergine: 'eggplant',
  courgette: 'zucchini',
  lauki: 'bottle gourd',
  karela: 'bitter gourd',
  methi: 'fenugreek',
  'methi leaf': 'fenugreek',
  dahi: 'yogurt',
  chaas: 'buttermilk',
  sarson: 'mustard seeds',
  jeera: 'cumin',
  zeera: 'cumin',
  dhania: 'coriander',
  haldi: 'turmeric',
  rajma: 'kidney bean',
  'kidney beans': 'kidney bean',
  maida: 'all purpose flour',
  atta: 'whole wheat flour',
  sooji: 'semolina',
  rava: 'semolina',
  'arhar dal': 'toor dal',
  'tur dal': 'toor dal',
  'toovar dal': 'toor dal',
  'mung bean': 'moong dal',
  'mung beans': 'moong dal',
  'green gram': 'moong dal',
  'black gram': 'urad dal',
  'black lentil': 'urad dal',
  'red onion': 'onion',
  'yellow onion': 'onion',
  'white onion': 'onion',
  'capsicum': 'bell pepper',
  'cooking oil': 'vegetable oil',
  'whole milk': 'milk',
  'whole tomato': 'tomato',
  'turmeric powder': 'turmeric',
  'coriander powder': 'coriander',
  'cumin powder': 'cumin',
  'garam masala powder': 'garam masala',
  'chili powder': 'red chili powder',
  'chilli powder': 'red chili powder',
  'red chilli powder': 'red chili powder',
  'red chili': 'red chili powder',
  'flattened rice': 'poha',
  'beaten rice': 'poha',
  'poha flakes': 'poha',
  'cashew nut': 'cashew',
  'cashew nuts': 'cashew',
  'walnut kernel': 'walnut',
};

export function normalizeIngredientName(raw: string): string {
  let name = (raw || '').toLowerCase().trim();
  // Strip " by <brand>" suffixes (the OpenNutrition rows are heavily branded).
  name = name.replace(/\s+by\s+.+$/, '');
  // Keep only the first comma-separated description segment.
  name = name.split(',')[0];
  name = name.replace(/\(.*?\)/g, ' ');
  name = name.replace(STATE_WORDS, ' ');
  name = name.replace(/[^a-z0-9 ]/g, ' ');
  name = name.replace(/\s+/g, ' ').trim();

  // Token synonyms.
  name = name.replace(/\b(chillies|chilies|chilli|chile|chiles|peppers|potatos|leaves)\b/g, (m) => TOKEN_SYNONYMS[m] ?? m);

  // Light singularization (both DB rows and AI names go through this, so the
  // canonical keys stay aligned).
  name = name.replace(/([a-z])ies$/i, '$1y');
  name = name.replace(/([a-z])es$/i, '$1');
  name = name.replace(/([a-z])s$/i, '$1');

  name = name.replace(/\b(a|an|the|some|freshly)\b/g, ' ');
  name = name.replace(/\s+/g, ' ').trim();

  return NAME_SYNONYMS[name] ?? name;
}

// ── Curated fallback map ──
// Authoritative per-100g macros for staples that are missing from OpenNutrition
// or represented by junk rows. Curated keys are post-normalization forms.

interface CuratedEntry extends IngredientNutritionRow {
  displayName: string;
  isVeg?: boolean;
  isVegan?: boolean;
  containsAllergen?: boolean;
}

const CURATED_INGREDIENTS: CuratedEntry[] = [
  // Oils & fats
  { name: 'mustard oil', displayName: 'Mustard Oil', caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 0, calciumMgPer100g: 0, ironMgPer100g: 0, zincMgPer100g: 0, magnesiumMgPer100g: 0, cholesterolMgPer100g: 0 },
  { name: 'peanut oil', displayName: 'Peanut Oil', caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 0, calciumMgPer100g: 0, ironMgPer100g: 0, zincMgPer100g: 0, magnesiumMgPer100g: 0, cholesterolMgPer100g: 0 },
  { name: 'coconut oil', displayName: 'Coconut Oil', caloriesPer100g: 862, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 0, calciumMgPer100g: 0, ironMgPer100g: 0, zincMgPer100g: 0, magnesiumMgPer100g: 0, cholesterolMgPer100g: 0 },
  { name: 'olive oil', displayName: 'Olive Oil', caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 0, calciumMgPer100g: 0, ironMgPer100g: 0.56, zincMgPer100g: 0, magnesiumMgPer100g: 0, cholesterolMgPer100g: 0 },
  { name: 'vegetable oil', displayName: 'Vegetable Oil', caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 0, calciumMgPer100g: 0, ironMgPer100g: 0, zincMgPer100g: 0, magnesiumMgPer100g: 0, cholesterolMgPer100g: 0 },
  // Sweeteners & dairy
  { name: 'sugar', displayName: 'Sugar', caloriesPer100g: 387, proteinPer100g: 0, carbsPer100g: 100, fatPer100g: 0, fiberPer100g: 0, sugarPer100g: 100, sodiumMgPer100g: 0, calciumMgPer100g: 0, ironMgPer100g: 0, zincMgPer100g: 0, magnesiumMgPer100g: 0, cholesterolMgPer100g: 0 },
  { name: 'milk', displayName: 'Milk', caloriesPer100g: 61, proteinPer100g: 3.2, carbsPer100g: 4.8, fatPer100g: 3.3, fiberPer100g: 0, sugarPer100g: 4.8, sodiumMgPer100g: 43, calciumMgPer100g: 113, ironMgPer100g: 0.03, zincMgPer100g: 0.37, magnesiumMgPer100g: 11, cholesterolMgPer100g: 10, isVegan: false },
  { name: 'curd', displayName: 'Curd (Yogurt)', caloriesPer100g: 61, proteinPer100g: 3.5, carbsPer100g: 4.7, fatPer100g: 3.3, fiberPer100g: 0, sugarPer100g: 4.7, sodiumMgPer100g: 47, calciumMgPer100g: 110, ironMgPer100g: 0.05, zincMgPer100g: 0.52, magnesiumMgPer100g: 11, cholesterolMgPer100g: 11, isVegan: false },
  { name: 'yogurt', displayName: 'Yogurt', caloriesPer100g: 59, proteinPer100g: 3.5, carbsPer100g: 4.7, fatPer100g: 3.3, fiberPer100g: 0, sugarPer100g: 4.7, sodiumMgPer100g: 36, calciumMgPer100g: 110, ironMgPer100g: 0.05, zincMgPer100g: 0.52, magnesiumMgPer100g: 11, cholesterolMgPer100g: 11, isVegan: false },
  { name: 'buttermilk', displayName: 'Buttermilk', caloriesPer100g: 40, proteinPer100g: 3.3, carbsPer100g: 4.8, fatPer100g: 0.9, fiberPer100g: 0, sugarPer100g: 4.8, sodiumMgPer100g: 42, calciumMgPer100g: 105, ironMgPer100g: 0.03, zincMgPer100g: 0.3, magnesiumMgPer100g: 10, cholesterolMgPer100g: 3, isVegan: false },
  { name: 'butter', displayName: 'Butter', caloriesPer100g: 717, proteinPer100g: 0.9, carbsPer100g: 0.1, fatPer100g: 81.1, fiberPer100g: 0, sugarPer100g: 0.1, sodiumMgPer100g: 643, calciumMgPer100g: 24, ironMgPer100g: 0.02, zincMgPer100g: 0.09, magnesiumMgPer100g: 2, cholesterolMgPer100g: 215, isVegan: false },
  { name: 'cheese', displayName: 'Cheese', caloriesPer100g: 403, proteinPer100g: 24.9, carbsPer100g: 1.3, fatPer100g: 33.1, fiberPer100g: 0, sugarPer100g: 0.5, sodiumMgPer100g: 621, calciumMgPer100g: 721, ironMgPer100g: 0.72, zincMgPer100g: 3.14, magnesiumMgPer100g: 28, cholesterolMgPer100g: 105, isVegan: false },
  // Meat & fish
  { name: 'chicken', displayName: 'Chicken', caloriesPer100g: 239, proteinPer100g: 27, carbsPer100g: 0, fatPer100g: 14, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 74, calciumMgPer100g: 15, ironMgPer100g: 0.9, zincMgPer100g: 1.5, magnesiumMgPer100g: 25, cholesterolMgPer100g: 88, isVeg: false, isVegan: false, containsAllergen: false },
  { name: 'chicken breast', displayName: 'Chicken Breast', caloriesPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 74, calciumMgPer100g: 15, ironMgPer100g: 0.45, zincMgPer100g: 0.9, magnesiumMgPer100g: 29, cholesterolMgPer100g: 85, isVeg: false, isVegan: false },
  { name: 'chicken thigh', displayName: 'Chicken Thigh', caloriesPer100g: 209, proteinPer100g: 26, carbsPer100g: 0, fatPer100g: 10.9, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 83, calciumMgPer100g: 12, ironMgPer100g: 1.1, zincMgPer100g: 2.1, magnesiumMgPer100g: 22, cholesterolMgPer100g: 93, isVeg: false, isVegan: false },
  { name: 'mutton', displayName: 'Mutton', caloriesPer100g: 294, proteinPer100g: 25.5, carbsPer100g: 0, fatPer100g: 20.8, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 72, calciumMgPer100g: 17, ironMgPer100g: 1.9, zincMgPer100g: 4.5, magnesiumMgPer100g: 22, cholesterolMgPer100g: 97, isVeg: false, isVegan: false },
  { name: 'salmon', displayName: 'Salmon', caloriesPer100g: 208, proteinPer100g: 20, carbsPer100g: 0, fatPer100g: 13, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 59, calciumMgPer100g: 12, ironMgPer100g: 0.34, zincMgPer100g: 0.64, magnesiumMgPer100g: 29, cholesterolMgPer100g: 55, isVeg: false, isVegan: false, containsAllergen: true },
  { name: 'egg', displayName: 'Egg', caloriesPer100g: 155, proteinPer100g: 13, carbsPer100g: 1.1, fatPer100g: 11, fiberPer100g: 0, sugarPer100g: 1.1, sodiumMgPer100g: 124, calciumMgPer100g: 56, ironMgPer100g: 1.75, zincMgPer100g: 1.29, magnesiumMgPer100g: 12, cholesterolMgPer100g: 373, isVeg: false, isVegan: false },
  { name: 'shrimp', displayName: 'Shrimp', caloriesPer100g: 99, proteinPer100g: 24, carbsPer100g: 0.2, fatPer100g: 0.3, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 111, calciumMgPer100g: 70, ironMgPer100g: 0.51, zincMgPer100g: 0.39, magnesiumMgPer100g: 37, cholesterolMgPer100g: 189, isVeg: false, isVegan: false, containsAllergen: true },
  // Vegetables
  { name: 'tomato', displayName: 'Tomato', caloriesPer100g: 18, proteinPer100g: 0.9, carbsPer100g: 3.9, fatPer100g: 0.2, fiberPer100g: 1.2, sugarPer100g: 2.6, sodiumMgPer100g: 5, calciumMgPer100g: 10, ironMgPer100g: 0.27, zincMgPer100g: 0.17, magnesiumMgPer100g: 11, cholesterolMgPer100g: 0 },
  { name: 'potato', displayName: 'Potato', caloriesPer100g: 77, proteinPer100g: 2, carbsPer100g: 17.1, fatPer100g: 0.1, fiberPer100g: 2.2, sugarPer100g: 0.8, sodiumMgPer100g: 6, calciumMgPer100g: 12, ironMgPer100g: 0.81, zincMgPer100g: 0.3, magnesiumMgPer100g: 23, cholesterolMgPer100g: 0 },
  { name: 'sweet potato', displayName: 'Sweet Potato', caloriesPer100g: 86, proteinPer100g: 1.6, carbsPer100g: 20.1, fatPer100g: 0.1, fiberPer100g: 3, sugarPer100g: 4.2, sodiumMgPer100g: 55, calciumMgPer100g: 30, ironMgPer100g: 0.61, zincMgPer100g: 0.4, magnesiumMgPer100g: 25, cholesterolMgPer100g: 0 },
  { name: 'garlic', displayName: 'Garlic', caloriesPer100g: 149, proteinPer100g: 6.4, carbsPer100g: 33.1, fatPer100g: 0.5, fiberPer100g: 2.1, sugarPer100g: 1, sodiumMgPer100g: 17, calciumMgPer100g: 181, ironMgPer100g: 1.7, zincMgPer100g: 1.16, magnesiumMgPer100g: 25, cholesterolMgPer100g: 0 },
  { name: 'green chili', displayName: 'Green Chili', caloriesPer100g: 40, proteinPer100g: 2, carbsPer100g: 9, fatPer100g: 0.4, fiberPer100g: 1.5, sugarPer100g: 5, sodiumMgPer100g: 9, calciumMgPer100g: 18, ironMgPer100g: 1.2, zincMgPer100g: 0.3, magnesiumMgPer100g: 25, cholesterolMgPer100g: 0 },
  { name: 'red chili powder', displayName: 'Red Chili Powder', caloriesPer100g: 282, proteinPer100g: 13.5, carbsPer100g: 49.7, fatPer100g: 14.3, fiberPer100g: 26.8, sugarPer100g: 7.2, sodiumMgPer100g: 168, calciumMgPer100g: 166, ironMgPer100g: 7.8, zincMgPer100g: 2.48, magnesiumMgPer100g: 87, cholesterolMgPer100g: 0 },
  { name: 'bell pepper', displayName: 'Bell Pepper', caloriesPer100g: 26, proteinPer100g: 1, carbsPer100g: 6, fatPer100g: 0.3, fiberPer100g: 2.1, sugarPer100g: 4.2, sodiumMgPer100g: 3, calciumMgPer100g: 7, ironMgPer100g: 0.43, zincMgPer100g: 0.25, magnesiumMgPer100g: 12, cholesterolMgPer100g: 0 },
  { name: 'green pepper', displayName: 'Green Pepper', caloriesPer100g: 20, proteinPer100g: 0.9, carbsPer100g: 4.6, fatPer100g: 0.2, fiberPer100g: 1.7, sugarPer100g: 2.4, sodiumMgPer100g: 3, calciumMgPer100g: 7, ironMgPer100g: 0.34, zincMgPer100g: 0.13, magnesiumMgPer100g: 10, cholesterolMgPer100g: 0 },
  { name: 'coriander leaf', displayName: 'Coriander Leaves', caloriesPer100g: 23, proteinPer100g: 2.1, carbsPer100g: 3.7, fatPer100g: 0.5, fiberPer100g: 2.8, sugarPer100g: 0.9, sodiumMgPer100g: 46, calciumMgPer100g: 67, ironMgPer100g: 1.77, zincMgPer100g: 0.5, magnesiumMgPer100g: 26, cholesterolMgPer100g: 0 },
  { name: 'spinach', displayName: 'Spinach', caloriesPer100g: 23, proteinPer100g: 2.9, carbsPer100g: 3.6, fatPer100g: 0.4, fiberPer100g: 2.2, sugarPer100g: 0.4, sodiumMgPer100g: 79, calciumMgPer100g: 99, ironMgPer100g: 2.71, zincMgPer100g: 0.53, magnesiumMgPer100g: 79, cholesterolMgPer100g: 0 },
  { name: 'cauliflower', displayName: 'Cauliflower', caloriesPer100g: 25, proteinPer100g: 1.9, carbsPer100g: 5, fatPer100g: 0.3, fiberPer100g: 2, sugarPer100g: 1.9, sodiumMgPer100g: 30, calciumMgPer100g: 22, ironMgPer100g: 0.42, zincMgPer100g: 0.27, magnesiumMgPer100g: 15, cholesterolMgPer100g: 0 },
  { name: 'eggplant', displayName: 'Eggplant', caloriesPer100g: 25, proteinPer100g: 1, carbsPer100g: 5.9, fatPer100g: 0.2, fiberPer100g: 3, sugarPer100g: 3.5, sodiumMgPer100g: 2, calciumMgPer100g: 9, ironMgPer100g: 0.23, zincMgPer100g: 0.16, magnesiumMgPer100g: 14, cholesterolMgPer100g: 0 },
  { name: 'green bean', displayName: 'Green Beans', caloriesPer100g: 31, proteinPer100g: 1.8, carbsPer100g: 7, fatPer100g: 0.2, fiberPer100g: 2.7, sugarPer100g: 3.3, sodiumMgPer100g: 6, calciumMgPer100g: 37, ironMgPer100g: 1.03, zincMgPer100g: 0.24, magnesiumMgPer100g: 21, cholesterolMgPer100g: 0 },
  { name: 'green pea', displayName: 'Green Peas', caloriesPer100g: 81, proteinPer100g: 5.4, carbsPer100g: 14.5, fatPer100g: 0.4, fiberPer100g: 5.7, sugarPer100g: 5.7, sodiumMgPer100g: 5, calciumMgPer100g: 25, ironMgPer100g: 1.47, zincMgPer100g: 1.24, magnesiumMgPer100g: 33, cholesterolMgPer100g: 0 },
  { name: 'mushroom', displayName: 'Mushroom', caloriesPer100g: 22, proteinPer100g: 3.1, carbsPer100g: 3.3, fatPer100g: 0.3, fiberPer100g: 1, sugarPer100g: 2, sodiumMgPer100g: 5, calciumMgPer100g: 3, ironMgPer100g: 0.5, zincMgPer100g: 0.52, magnesiumMgPer100g: 9, cholesterolMgPer100g: 0 },
  { name: 'beetroot', displayName: 'Beetroot', caloriesPer100g: 43, proteinPer100g: 1.6, carbsPer100g: 10, fatPer100g: 0.2, fiberPer100g: 2.8, sugarPer100g: 6.8, sodiumMgPer100g: 78, calciumMgPer100g: 16, ironMgPer100g: 0.8, zincMgPer100g: 0.35, magnesiumMgPer100g: 23, cholesterolMgPer100g: 0 },
  { name: 'radish', displayName: 'Radish', caloriesPer100g: 16, proteinPer100g: 0.7, carbsPer100g: 3.4, fatPer100g: 0.1, fiberPer100g: 1.6, sugarPer100g: 1.9, sodiumMgPer100g: 39, calciumMgPer100g: 25, ironMgPer100g: 0.34, zincMgPer100g: 0.18, magnesiumMgPer100g: 16, cholesterolMgPer100g: 0 },
  { name: 'bottle gourd', displayName: 'Bottle Gourd (Lauki)', caloriesPer100g: 15, proteinPer100g: 0.6, carbsPer100g: 3.4, fatPer100g: 0.1, fiberPer100g: 0.5, sugarPer100g: 2.5, sodiumMgPer100g: 2, calciumMgPer100g: 26, ironMgPer100g: 0.2, zincMgPer100g: 0.08, magnesiumMgPer100g: 11, cholesterolMgPer100g: 0 },
  { name: 'bitter gourd', displayName: 'Bitter Gourd (Karela)', caloriesPer100g: 17, proteinPer100g: 1, carbsPer100g: 3.7, fatPer100g: 0.2, fiberPer100g: 2.8, sugarPer100g: 1.9, sodiumMgPer100g: 5, calciumMgPer100g: 19, ironMgPer100g: 0.43, zincMgPer100g: 0.77, magnesiumMgPer100g: 17, cholesterolMgPer100g: 0 },
  { name: 'green onion', displayName: 'Green Onion', caloriesPer100g: 32, proteinPer100g: 1.8, carbsPer100g: 7.3, fatPer100g: 0.2, fiberPer100g: 2.6, sugarPer100g: 2.3, sodiumMgPer100g: 16, calciumMgPer100g: 72, ironMgPer100g: 1.48, zincMgPer100g: 0.39, magnesiumMgPer100g: 20, cholesterolMgPer100g: 0 },
  // Grains & pulses
  { name: 'basmati rice', displayName: 'Basmati Rice', caloriesPer100g: 362, proteinPer100g: 7.1, carbsPer100g: 78.9, fatPer100g: 0.7, fiberPer100g: 1.4, sugarPer100g: 0.1, sodiumMgPer100g: 2, calciumMgPer100g: 8, ironMgPer100g: 0.8, zincMgPer100g: 1.1, magnesiumMgPer100g: 27, cholesterolMgPer100g: 0 },
  { name: 'white rice', displayName: 'White Rice', caloriesPer100g: 360, proteinPer100g: 6.6, carbsPer100g: 79.3, fatPer100g: 0.6, fiberPer100g: 1.3, sugarPer100g: 0.1, sodiumMgPer100g: 2, calciumMgPer100g: 10, ironMgPer100g: 0.8, zincMgPer100g: 1.1, magnesiumMgPer100g: 25, cholesterolMgPer100g: 0 },
  { name: 'brown rice', displayName: 'Brown Rice', caloriesPer100g: 367, proteinPer100g: 7.5, carbsPer100g: 76.2, fatPer100g: 3.1, fiberPer100g: 3.4, sugarPer100g: 0.7, sodiumMgPer100g: 4, calciumMgPer100g: 33, ironMgPer100g: 1.47, zincMgPer100g: 2.02, magnesiumMgPer100g: 143, cholesterolMgPer100g: 0 },
  { name: 'parboiled rice', displayName: 'Parboiled Rice', caloriesPer100g: 362, proteinPer100g: 7.5, carbsPer100g: 79.3, fatPer100g: 0.7, fiberPer100g: 1.9, sugarPer100g: 0.1, sodiumMgPer100g: 2, calciumMgPer100g: 10, ironMgPer100g: 0.8, zincMgPer100g: 1.1, magnesiumMgPer100g: 25, cholesterolMgPer100g: 0 },
  { name: 'idli rice', displayName: 'Idli Rice', caloriesPer100g: 362, proteinPer100g: 7.1, carbsPer100g: 78.9, fatPer100g: 0.7, fiberPer100g: 1.4, sugarPer100g: 0.1, sodiumMgPer100g: 2, calciumMgPer100g: 8, ironMgPer100g: 0.8, zincMgPer100g: 1.1, magnesiumMgPer100g: 27, cholesterolMgPer100g: 0 },
  { name: 'dosa batter', displayName: 'Dosa Batter', caloriesPer100g: 210, proteinPer100g: 5.5, carbsPer100g: 40, fatPer100g: 2, fiberPer100g: 2.5, sugarPer100g: 1, sodiumMgPer100g: 380, calciumMgPer100g: 25, ironMgPer100g: 1.2, zincMgPer100g: 0.8, magnesiumMgPer100g: 20, cholesterolMgPer100g: 0 },
  { name: 'poha', displayName: 'Poha (Flattened Rice)', caloriesPer100g: 360, proteinPer100g: 8.1, carbsPer100g: 78.4, fatPer100g: 1.5, fiberPer100g: 3.2, sugarPer100g: 0.6, sodiumMgPer100g: 12, calciumMgPer100g: 10, ironMgPer100g: 1.0, zincMgPer100g: 1.2, magnesiumMgPer100g: 30, cholesterolMgPer100g: 0 },
  { name: 'chana dal', displayName: 'Chana Dal', caloriesPer100g: 372, proteinPer100g: 20.8, carbsPer100g: 62.3, fatPer100g: 5.4, fiberPer100g: 12.8, sugarPer100g: 10.7, sodiumMgPer100g: 24, calciumMgPer100g: 55, ironMgPer100g: 3.2, zincMgPer100g: 2.5, magnesiumMgPer100g: 97, cholesterolMgPer100g: 0 },
  { name: 'masoor dal', displayName: 'Masoor Dal', caloriesPer100g: 352, proteinPer100g: 24.6, carbsPer100g: 63.4, fatPer100g: 1.1, fiberPer100g: 10.7, sugarPer100g: 2, sodiumMgPer100g: 6, calciumMgPer100g: 48, ironMgPer100g: 3.9, zincMgPer100g: 3.3, magnesiumMgPer100g: 80, cholesterolMgPer100g: 0 },
  { name: 'moong dal', displayName: 'Moong Dal', caloriesPer100g: 347, proteinPer100g: 24.5, carbsPer100g: 62.6, fatPer100g: 1.2, fiberPer100g: 15.5, sugarPer100g: 6.7, sodiumMgPer100g: 12, calciumMgPer100g: 54, ironMgPer100g: 3.8, zincMgPer100g: 2.8, magnesiumMgPer100g: 99, cholesterolMgPer100g: 0 },
  { name: 'toor dal', displayName: 'Toor Dal', caloriesPer100g: 343, proteinPer100g: 22.8, carbsPer100g: 61.5, fatPer100g: 1.5, fiberPer100g: 14.8, sugarPer100g: 6.5, sodiumMgPer100g: 15, calciumMgPer100g: 42, ironMgPer100g: 3.6, zincMgPer100g: 2.4, magnesiumMgPer100g: 88, cholesterolMgPer100g: 0 },
  { name: 'urad dal', displayName: 'Urad Dal', caloriesPer100g: 341, proteinPer100g: 24.2, carbsPer100g: 59.6, fatPer100g: 1.4, fiberPer100g: 18.3, sugarPer100g: 2.9, sodiumMgPer100g: 15, calciumMgPer100g: 44, ironMgPer100g: 3.8, zincMgPer100g: 2.9, magnesiumMgPer100g: 94, cholesterolMgPer100g: 0 },
  { name: 'kidney bean', displayName: 'Kidney Beans', caloriesPer100g: 333, proteinPer100g: 23.6, carbsPer100g: 60, fatPer100g: 0.8, fiberPer100g: 24.9, sugarPer100g: 2.2, sodiumMgPer100g: 24, calciumMgPer100g: 45, ironMgPer100g: 5.1, zincMgPer100g: 2.4, magnesiumMgPer100g: 120, cholesterolMgPer100g: 0 },
  { name: 'whole wheat flour', displayName: 'Whole Wheat Flour (Atta)', caloriesPer100g: 340, proteinPer100g: 13.2, carbsPer100g: 72, fatPer100g: 2.5, fiberPer100g: 10.7, sugarPer100g: 0.4, sodiumMgPer100g: 2, calciumMgPer100g: 34, ironMgPer100g: 3.6, zincMgPer100g: 2.6, magnesiumMgPer100g: 126, cholesterolMgPer100g: 0 },
  { name: 'oat', displayName: 'Oats', caloriesPer100g: 389, proteinPer100g: 16.9, carbsPer100g: 66.3, fatPer100g: 6.9, fiberPer100g: 10.6, sugarPer100g: 0, sodiumMgPer100g: 2, calciumMgPer100g: 54, ironMgPer100g: 4.7, zincMgPer100g: 3.97, magnesiumMgPer100g: 177, cholesterolMgPer100g: 0 },
  // Nuts & seeds
  { name: 'almond', displayName: 'Almonds', caloriesPer100g: 579, proteinPer100g: 21.2, carbsPer100g: 21.7, fatPer100g: 49.9, fiberPer100g: 12.5, sugarPer100g: 4.4, sodiumMgPer100g: 1, calciumMgPer100g: 269, ironMgPer100g: 3.72, zincMgPer100g: 3.12, magnesiumMgPer100g: 270, cholesterolMgPer100g: 0 },
  { name: 'cashew', displayName: 'Cashews', caloriesPer100g: 553, proteinPer100g: 18.2, carbsPer100g: 30.2, fatPer100g: 43.9, fiberPer100g: 3.3, sugarPer100g: 5.9, sodiumMgPer100g: 12, calciumMgPer100g: 37, ironMgPer100g: 6.68, zincMgPer100g: 5.78, magnesiumMgPer100g: 292, cholesterolMgPer100g: 0 },
  { name: 'peanut', displayName: 'Peanuts', caloriesPer100g: 567, proteinPer100g: 25.8, carbsPer100g: 16.1, fatPer100g: 49.2, fiberPer100g: 8.5, sugarPer100g: 4, sodiumMgPer100g: 18, calciumMgPer100g: 92, ironMgPer100g: 4.58, zincMgPer100g: 3.27, magnesiumMgPer100g: 168, cholesterolMgPer100g: 0 },
  { name: 'walnut', displayName: 'Walnuts', caloriesPer100g: 654, proteinPer100g: 15.2, carbsPer100g: 13.7, fatPer100g: 65.2, fiberPer100g: 6.7, sugarPer100g: 2.6, sodiumMgPer100g: 2, calciumMgPer100g: 98, ironMgPer100g: 2.91, zincMgPer100g: 3.09, magnesiumMgPer100g: 158, cholesterolMgPer100g: 0 },
  { name: 'sesame', displayName: 'Sesame Seeds', caloriesPer100g: 573, proteinPer100g: 17.7, carbsPer100g: 23.5, fatPer100g: 49.7, fiberPer100g: 11.8, sugarPer100g: 0.3, sodiumMgPer100g: 11, calciumMgPer100g: 975, ironMgPer100g: 14.6, zincMgPer100g: 7.75, magnesiumMgPer100g: 351, cholesterolMgPer100g: 0 },
  // Fruits
  { name: 'banana', displayName: 'Banana', caloriesPer100g: 89, proteinPer100g: 1.1, carbsPer100g: 22.8, fatPer100g: 0.3, fiberPer100g: 2.6, sugarPer100g: 12.2, sodiumMgPer100g: 1, calciumMgPer100g: 5, ironMgPer100g: 0.26, zincMgPer100g: 0.18, magnesiumMgPer100g: 27, cholesterolMgPer100g: 0 },
  { name: 'apple', displayName: 'Apple', caloriesPer100g: 52, proteinPer100g: 0.3, carbsPer100g: 13.8, fatPer100g: 0.2, fiberPer100g: 2.4, sugarPer100g: 10.4, sodiumMgPer100g: 1, calciumMgPer100g: 6, ironMgPer100g: 0.12, zincMgPer100g: 0.04, magnesiumMgPer100g: 5, cholesterolMgPer100g: 0 },
  { name: 'orange', displayName: 'Orange', caloriesPer100g: 47, proteinPer100g: 0.9, carbsPer100g: 11.8, fatPer100g: 0.1, fiberPer100g: 2.4, sugarPer100g: 9.4, sodiumMgPer100g: 0, calciumMgPer100g: 40, ironMgPer100g: 0.1, zincMgPer100g: 0.07, magnesiumMgPer100g: 10, cholesterolMgPer100g: 0 },
  { name: 'mango', displayName: 'Mango', caloriesPer100g: 60, proteinPer100g: 0.8, carbsPer100g: 15, fatPer100g: 0.4, fiberPer100g: 1.6, sugarPer100g: 13.7, sodiumMgPer100g: 1, calciumMgPer100g: 11, ironMgPer100g: 0.16, zincMgPer100g: 0.09, magnesiumMgPer100g: 10, cholesterolMgPer100g: 0 },
  // Legumes & soy
  { name: 'soybean', displayName: 'Soybeans', caloriesPer100g: 173, proteinPer100g: 16.6, carbsPer100g: 9.9, fatPer100g: 9, fiberPer100g: 6, sugarPer100g: 3, sodiumMgPer100g: 1, calciumMgPer100g: 102, ironMgPer100g: 1.57, zincMgPer100g: 0.99, magnesiumMgPer100g: 65, cholesterolMgPer100g: 0 },
  { name: 'paneer', displayName: 'Paneer', caloriesPer100g: 265, proteinPer100g: 18.3, carbsPer100g: 3.6, fatPer100g: 20, fiberPer100g: 0, sugarPer100g: 0.6, sodiumMgPer100g: 46, calciumMgPer100g: 208, ironMgPer100g: 0.3, zincMgPer100g: 1.5, magnesiumMgPer100g: 8, cholesterolMgPer100g: 62, isVegan: false },
  // Misc
  { name: 'amchur', displayName: 'Amchur (Dry Mango Powder)', caloriesPer100g: 346, proteinPer100g: 3.3, carbsPer100g: 83, fatPer100g: 1.8, fiberPer100g: 6, sugarPer100g: 40, sodiumMgPer100g: 45, calciumMgPer100g: 30, ironMgPer100g: 2.5, zincMgPer100g: 0.4, magnesiumMgPer100g: 20, cholesterolMgPer100g: 0 },
  { name: 'bay leaf', displayName: 'Bay Leaf', caloriesPer100g: 313, proteinPer100g: 7.6, carbsPer100g: 75, fatPer100g: 8.4, fiberPer100g: 26.3, sugarPer100g: 0, sodiumMgPer100g: 23, calciumMgPer100g: 408, ironMgPer100g: 43, zincMgPer100g: 1.93, magnesiumMgPer100g: 103, cholesterolMgPer100g: 0 },
  { name: 'raisin', displayName: 'Raisins', caloriesPer100g: 299, proteinPer100g: 3.1, carbsPer100g: 79.2, fatPer100g: 0.5, fiberPer100g: 3.7, sugarPer100g: 59.2, sodiumMgPer100g: 11, calciumMgPer100g: 50, ironMgPer100g: 2.59, zincMgPer100g: 0.32, magnesiumMgPer100g: 32, cholesterolMgPer100g: 0 },
  { name: 'coconut', displayName: 'Coconut', caloriesPer100g: 354, proteinPer100g: 3.3, carbsPer100g: 15.2, fatPer100g: 33.5, fiberPer100g: 9, sugarPer100g: 6.2, sodiumMgPer100g: 20, calciumMgPer100g: 14, ironMgPer100g: 2.43, zincMgPer100g: 2.01, magnesiumMgPer100g: 90, cholesterolMgPer100g: 0 },
];

// Curated keys normalized once (they are already in normalized form).
const curatedByKey = new Map<string, CuratedEntry>();
for (const entry of CURATED_INGREDIENTS) {
  const key = normalizeIngredientName(entry.name);
  if (key) curatedByKey.set(key, entry);
}

// ── Row selection & sanity ──

function isGenericName(rawName: string): boolean {
  const base = (rawName || '').toLowerCase();
  if (/\bby\b/.test(base) || /\d/.test(base)) return false;
  return base.length <= 40;
}

function titleCase(key: string): string {
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

function completeness(r: IngredientNutritionRow): number {
  let c = 0;
  if (r.caloriesPer100g > 0) c++;
  if (r.proteinPer100g > 0) c++;
  if (r.carbsPer100g > 0) c++;
  if (r.fatPer100g > 0) c++;
  if (r.fiberPer100g != null && r.fiberPer100g > 0) c++;
  if (r.sugarPer100g != null && r.sugarPer100g > 0) c++;
  if (r.sodiumMgPer100g != null && r.sodiumMgPer100g > 0) c++;
  if (r.calciumMgPer100g != null && r.calciumMgPer100g > 0) c++;
  if (r.ironMgPer100g != null && r.ironMgPer100g > 0) c++;
  if (r.zincMgPer100g != null && r.zincMgPer100g > 0) c++;
  if (r.magnesiumMgPer100g != null && r.magnesiumMgPer100g > 0) c++;
  if (r.cholesterolMgPer100g != null && r.cholesterolMgPer100g > 0) c++;
  return c;
}

function isValidRow(r: IngredientNutritionRow): boolean {
  const cal = r.caloriesPer100g;
  if (!Number.isFinite(cal) || cal <= 0 || cal > 900) return false;
  return true;
}

function pickBest(candidates: MatchRow[]): MatchRow | null {
  const valid = candidates.filter(isValidRow);
  if (!valid.length) return null;
  const generic = valid.filter((c) => isGenericName(c.name));
  const pool = generic.length ? generic : valid;
  pool.sort((a, b) => completeness(b) - completeness(a));
  return pool[0];
}

// ── Matcher ──

export class IngredientMatcher {
  private byKey: Map<string, MatchRow>;

  constructor(rows: MatchRow[]) {
    const grouped = new Map<string, MatchRow[]>();
    for (const row of rows) {
      const key = normalizeIngredientName(row.name);
      if (!key) continue;
      const list = grouped.get(key);
      if (list) list.push(row);
      else grouped.set(key, [row]);
    }
    this.byKey = new Map();
    for (const [key, candidates] of grouped) {
      const best = pickBest(candidates);
      if (best) this.byKey.set(key, best);
    }
  }

  /**
   * Resolve a raw ingredient name. Returns the best DB row, a curated row, or
   * null. `source` tells the caller which one won.
   */
  resolve(raw: string): ResolvedIngredient {
    const key = normalizeIngredientName(raw);
    if (!key) {
      return { name: (raw || '').trim(), grams: 0, matched: false, source: 'missing', row: null };
    }
    const curated = curatedByKey.get(key);
    if (curated) {
      return {
        name: curated.displayName,
        grams: 0,
        matched: true,
        source: 'curated',
        row: curated,
        isVeg: curated.isVeg ?? true,
        isVegan: curated.isVegan ?? true,
        containsAllergen: curated.containsAllergen ?? false,
      };
    }
    const row = this.byKey.get(key);
    if (row) {
      return {
        name: titleCase(key),
        grams: 0,
        matched: true,
        source: 'db',
        row,
        isVeg: row.isVeg ?? true,
        isVegan: row.isVegan ?? true,
        containsAllergen: row.containsAllergen ?? false,
      };
    }
    return { name: titleCase(key), grams: 0, matched: false, source: 'missing', row: null };
  }

  /**
   * Compose total nutrition from ingredient amounts. Unknown/missing
   * ingredients are reported in `missing`.
   */
  compose(items: IngredientItem[]): IngredientComposeResult {
    const resolved: ResolvedIngredient[] = [];
    const matched: string[] = [];
    const missing: string[] = [];
    const totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0, calciumMg: 0, ironMg: 0, zincMg: 0, magnesiumMg: 0, cholesterolMg: 0 };
    let anyMatched = false;
    let anyVeg = true;
    let anyVegan = true;
    let anyAllergen = false;

    for (const item of items) {
      const grams = Math.max(1, item.grams || 0);
      const r = this.resolve(item.name);
      r.grams = grams;
      const row = r.row;
      if (!row || !isValidRow(row)) {
        r.matched = false;
        r.source = 'missing';
        r.row = null;
        resolved.push(r);
        missing.push(r.name);
        continue;
      }
      resolved.push(r);
      anyMatched = true;
      matched.push(r.name);
      if (r.isVeg === false) anyVeg = false;
      if (r.isVegan === false) anyVegan = false;
      if (r.containsAllergen) anyAllergen = true;

      const f = grams / 100;
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
        resolved,
        flags: { isVeg: true, isVegan: true, containsAllergen: false },
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
      resolved,
      flags: { isVeg: anyVeg, isVegan: anyVegan, containsAllergen: anyAllergen },
    };
  }
}

// Convenience: build a matcher + compose in one call.
export function matchIngredients(
  items: IngredientItem[],
  rows: MatchRow[]
): IngredientComposeResult {
  return new IngredientMatcher(rows).compose(items);
}
