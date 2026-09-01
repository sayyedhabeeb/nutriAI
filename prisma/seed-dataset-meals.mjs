// Seed the Meal table from the curated 1,200-record cuisine catalog
// (food-dataset/food_cuisine_meal_dataset_1200.json).
//
// Scope   : all 1,200 records (6 cuisines x 4 meal types x 50 = 600 unique
//           dishes, each with a Traditional + Home-style variant). These become
//           the initial recommendation catalog (source='dataset').
// Strategy:
//   1. Dedupe records into 600 unique dishes by cuisine|mealType|baseDish.
//   2. For each unique dish, ask the local LLM for the recipe ingredients
//      (grams) using the same extraction prompt as the app's unknown-food flow.
//   3. Compute per-100g macros deterministically via the ingredient nutrition
//      table (Ingredient) plus a small curated fallback map, mirroring the
//      app's IngredientMatcher.
//   4. Create both variant Meal records (Traditional + Home-style) with
//      nested MealNutrition (per-100g), a default MealServing, MealAlias,
//      MealTag and MealIngredient rows.
// Nutrition is marked nutritionStatus='estimated' (never treated as final) or
// 'not_verified' when the LLM/ingredient data is insufficient (meal is then
// created WITHOUT a MealNutrition row so existing filters keep working).
// Idempotent: skips records whose externalId already exists. Never deletes
// existing data. Run with --no-ai to skip annotation, --limit N to process a
// subset, or --dry-run to only report counts.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DATASET_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'food-dataset',
  'food_cuisine_meal_dataset_1200.json'
);

// Annotation cache: uniqueDishKey -> { items }. Lets interrupted runs resume
// without re-asking the LLM for dishes that were already annotated. The
// nutrition/resolved data is recomputed on load (cheap, deterministic).
const CACHE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '.dataset-seed-cache.json');

const LOG_EVERY = 50;
const CACHE_SAVE_EVERY = 10;
const AI_TIMEOUT_MS = 90_000;
const AI_RETRIES = 2;
const AI_CONCURRENCY = 2;

const args = process.argv.slice(2);
const NO_AI = args.includes('--no-ai');
const DRY_RUN = args.includes('--dry-run');
const NO_CACHE = args.includes('--no-cache');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : Infinity;
const maxMinArg = args.find((a) => a.startsWith('--max-min='));
const MAX_ANNOTATION_MS = maxMinArg ? Number.parseInt(maxMinArg.split('=')[1], 10) * 60_000 : Infinity;

// ═══ Ingredient name normalization (mirrors src/lib/ingredient-matching.ts) ═══

const STATE_WORDS = /\b(fresh|raw|boiled|cooked|steamed|grilled|roasted|sauteed|sautéed|sliced|diced|chopped|minced|ground|powdered|dried|shredded|frozen|baked|fried|smoked|marinated|skinless|boneless|organic|plain|unsalted|salted|seasoned|unsweetened|reduced|low-fat|low fat|refined|prepared|canned|tinned|crushed|flaked|chunked|halved|peeled|whipped|melted|toasted|charred)\b/g;

const TOKEN_SYNONYMS = {
  chilli: 'chili',
  chillies: 'chili',
  chilies: 'chili',
  chile: 'chili',
  chiles: 'chili',
  peppers: 'pepper',
  potatos: 'potato',
  leaves: 'leaf',
};

const NAME_SYNONYMS = {
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
  capsicum: 'bell pepper',
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

function normalizeIngredientName(raw) {
  let name = (raw || '').toLowerCase().trim();
  name = name.replace(/\s+by\s.+$/, '');
  name = name.split(',')[0];
  name = name.replace(/\(.*?\)/g, ' ');
  name = name.replace(STATE_WORDS, ' ');
  name = name.replace(/[^a-z0-9 ]/g, ' ');
  name = name.replace(/\s+/g, ' ').trim();
  name = name.replace(
    /\b(chillies|chilies|chilli|chile|chiles|peppers|potatos|leaves)\b/g,
    (m) => TOKEN_SYNONYMS[m] ?? m
  );
  name = name.replace(/([a-z])ies$/i, '$1y');
  name = name.replace(/([a-z])es$/i, '$1');
  name = name.replace(/([a-z])s$/i, '$1');
  name = name.replace(/\b(a|an|the|some|freshly)\b/g, ' ');
  name = name.replace(/\s+/g, ' ').trim();
  return NAME_SYNONYMS[name] ?? name;
}

// ═══ Curated fallback nutrition (mirrors src/lib/ingredient-matching.ts) ═══
const CURATED_INGREDIENTS = [
  { name: 'mustard oil', caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 0 },
  { name: 'peanut oil', caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 0 },
  { name: 'coconut oil', caloriesPer100g: 862, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 0 },
  { name: 'olive oil', caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 0 },
  { name: 'vegetable oil', caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 0 },
  { name: 'sugar', caloriesPer100g: 387, proteinPer100g: 0, carbsPer100g: 100, fatPer100g: 0, fiberPer100g: 0, sugarPer100g: 100, sodiumMgPer100g: 0 },
  { name: 'milk', caloriesPer100g: 61, proteinPer100g: 3.2, carbsPer100g: 4.8, fatPer100g: 3.3, fiberPer100g: 0, sugarPer100g: 4.8, sodiumMgPer100g: 43 },
  { name: 'curd', caloriesPer100g: 61, proteinPer100g: 3.5, carbsPer100g: 4.7, fatPer100g: 3.3, fiberPer100g: 0, sugarPer100g: 4.7, sodiumMgPer100g: 47 },
  { name: 'yogurt', caloriesPer100g: 59, proteinPer100g: 3.5, carbsPer100g: 4.7, fatPer100g: 3.3, fiberPer100g: 0, sugarPer100g: 4.7, sodiumMgPer100g: 36 },
  { name: 'buttermilk', caloriesPer100g: 40, proteinPer100g: 3.3, carbsPer100g: 4.8, fatPer100g: 0.9, fiberPer100g: 0, sugarPer100g: 4.8, sodiumMgPer100g: 42 },
  { name: 'butter', caloriesPer100g: 717, proteinPer100g: 0.9, carbsPer100g: 0.1, fatPer100g: 81.1, fiberPer100g: 0, sugarPer100g: 0.1, sodiumMgPer100g: 643 },
  { name: 'cheese', caloriesPer100g: 403, proteinPer100g: 24.9, carbsPer100g: 1.3, fatPer100g: 33.1, fiberPer100g: 0, sugarPer100g: 0.5, sodiumMgPer100g: 621 },
  { name: 'chicken', caloriesPer100g: 239, proteinPer100g: 27, carbsPer100g: 0, fatPer100g: 14, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 74 },
  { name: 'chicken breast', caloriesPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 74 },
  { name: 'chicken thigh', caloriesPer100g: 209, proteinPer100g: 26, carbsPer100g: 0, fatPer100g: 10.9, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 83 },
  { name: 'mutton', caloriesPer100g: 294, proteinPer100g: 25.5, carbsPer100g: 0, fatPer100g: 20.8, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 72 },
  { name: 'salmon', caloriesPer100g: 208, proteinPer100g: 20, carbsPer100g: 0, fatPer100g: 13, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 59 },
  { name: 'shrimp', caloriesPer100g: 99, proteinPer100g: 24, carbsPer100g: 0.2, fatPer100g: 0.3, fiberPer100g: 0, sugarPer100g: 0, sodiumMgPer100g: 111 },
  { name: 'tomato', caloriesPer100g: 18, proteinPer100g: 0.9, carbsPer100g: 3.9, fatPer100g: 0.2, fiberPer100g: 1.2, sugarPer100g: 2.6, sodiumMgPer100g: 5 },
  { name: 'potato', caloriesPer100g: 77, proteinPer100g: 2, carbsPer100g: 17.1, fatPer100g: 0.1, fiberPer100g: 2.2, sugarPer100g: 0.8, sodiumMgPer100g: 6 },
  { name: 'sweet potato', caloriesPer100g: 86, proteinPer100g: 1.6, carbsPer100g: 20.1, fatPer100g: 0.1, fiberPer100g: 3, sugarPer100g: 4.2, sodiumMgPer100g: 55 },
  { name: 'garlic', caloriesPer100g: 149, proteinPer100g: 6.4, carbsPer100g: 33.1, fatPer100g: 0.5, fiberPer100g: 2.1, sugarPer100g: 1, sodiumMgPer100g: 17 },
  { name: 'green chili', caloriesPer100g: 40, proteinPer100g: 2, carbsPer100g: 9, fatPer100g: 0.4, fiberPer100g: 1.5, sugarPer100g: 5, sodiumMgPer100g: 9 },
  { name: 'red chili powder', caloriesPer100g: 282, proteinPer100g: 13.5, carbsPer100g: 49.7, fatPer100g: 14.3, fiberPer100g: 26.8, sugarPer100g: 7.2, sodiumMgPer100g: 168 },
  { name: 'bell pepper', caloriesPer100g: 26, proteinPer100g: 1, carbsPer100g: 6, fatPer100g: 0.3, fiberPer100g: 2.1, sugarPer100g: 4.2, sodiumMgPer100g: 3 },
  { name: 'green pepper', caloriesPer100g: 20, proteinPer100g: 0.9, carbsPer100g: 4.6, fatPer100g: 0.2, fiberPer100g: 1.7, sugarPer100g: 2.4, sodiumMgPer100g: 3 },
  { name: 'coriander leaf', caloriesPer100g: 23, proteinPer100g: 2.1, carbsPer100g: 3.7, fatPer100g: 0.5, fiberPer100g: 2.8, sugarPer100g: 0.9, sodiumMgPer100g: 46 },
  { name: 'spinach', caloriesPer100g: 23, proteinPer100g: 2.9, carbsPer100g: 3.6, fatPer100g: 0.4, fiberPer100g: 2.2, sugarPer100g: 0.4, sodiumMgPer100g: 79 },
  { name: 'cauliflower', caloriesPer100g: 25, proteinPer100g: 1.9, carbsPer100g: 5, fatPer100g: 0.3, fiberPer100g: 2, sugarPer100g: 1.9, sodiumMgPer100g: 30 },
  { name: 'eggplant', caloriesPer100g: 25, proteinPer100g: 1, carbsPer100g: 5.9, fatPer100g: 0.2, fiberPer100g: 3, sugarPer100g: 3.5, sodiumMgPer100g: 2 },
  { name: 'green bean', caloriesPer100g: 31, proteinPer100g: 1.8, carbsPer100g: 7, fatPer100g: 0.2, fiberPer100g: 2.7, sugarPer100g: 3.3, sodiumMgPer100g: 6 },
  { name: 'green pea', caloriesPer100g: 81, proteinPer100g: 5.4, carbsPer100g: 14.5, fatPer100g: 0.4, fiberPer100g: 5.7, sugarPer100g: 5.7, sodiumMgPer100g: 5 },
  { name: 'mushroom', caloriesPer100g: 22, proteinPer100g: 3.1, carbsPer100g: 3.3, fatPer100g: 0.3, fiberPer100g: 1, sugarPer100g: 2, sodiumMgPer100g: 5 },
  { name: 'beetroot', caloriesPer100g: 43, proteinPer100g: 1.6, carbsPer100g: 10, fatPer100g: 0.2, fiberPer100g: 2.8, sugarPer100g: 6.8, sodiumMgPer100g: 78 },
  { name: 'radish', caloriesPer100g: 16, proteinPer100g: 0.7, carbsPer100g: 3.4, fatPer100g: 0.1, fiberPer100g: 1.6, sugarPer100g: 1.9, sodiumMgPer100g: 39 },
  { name: 'bottle gourd', caloriesPer100g: 15, proteinPer100g: 0.6, carbsPer100g: 3.4, fatPer100g: 0.1, fiberPer100g: 0.5, sugarPer100g: 2.5, sodiumMgPer100g: 2 },
  { name: 'bitter gourd', caloriesPer100g: 17, proteinPer100g: 1, carbsPer100g: 3.7, fatPer100g: 0.2, fiberPer100g: 2.8, sugarPer100g: 1.9, sodiumMgPer100g: 5 },
  { name: 'green onion', caloriesPer100g: 32, proteinPer100g: 1.8, carbsPer100g: 7.3, fatPer100g: 0.2, fiberPer100g: 2.6, sugarPer100g: 2.3, sodiumMgPer100g: 16 },
  { name: 'basmati rice', caloriesPer100g: 362, proteinPer100g: 7.1, carbsPer100g: 78.9, fatPer100g: 0.7, fiberPer100g: 1.4, sugarPer100g: 0.1, sodiumMgPer100g: 2 },
  { name: 'white rice', caloriesPer100g: 360, proteinPer100g: 6.6, carbsPer100g: 79.3, fatPer100g: 0.6, fiberPer100g: 1.3, sugarPer100g: 0.1, sodiumMgPer100g: 2 },
  { name: 'brown rice', caloriesPer100g: 367, proteinPer100g: 7.5, carbsPer100g: 76.2, fatPer100g: 3.1, fiberPer100g: 3.4, sugarPer100g: 0.7, sodiumMgPer100g: 4 },
  { name: 'parboiled rice', caloriesPer100g: 362, proteinPer100g: 7.5, carbsPer100g: 79.3, fatPer100g: 0.7, fiberPer100g: 1.9, sugarPer100g: 0.1, sodiumMgPer100g: 2 },
  { name: 'idli rice', caloriesPer100g: 362, proteinPer100g: 7.1, carbsPer100g: 78.9, fatPer100g: 0.7, fiberPer100g: 1.4, sugarPer100g: 0.1, sodiumMgPer100g: 2 },
  { name: 'dosa batter', caloriesPer100g: 210, proteinPer100g: 5.5, carbsPer100g: 40, fatPer100g: 2, fiberPer100g: 2.5, sugarPer100g: 1, sodiumMgPer100g: 380 },
  { name: 'poha', caloriesPer100g: 360, proteinPer100g: 8.1, carbsPer100g: 78.4, fatPer100g: 1.5, fiberPer100g: 3.2, sugarPer100g: 0.6, sodiumMgPer100g: 12 },
  { name: 'chana dal', caloriesPer100g: 372, proteinPer100g: 20.8, carbsPer100g: 62.3, fatPer100g: 5.4, fiberPer100g: 12.8, sugarPer100g: 10.7, sodiumMgPer100g: 24 },
  { name: 'masoor dal', caloriesPer100g: 352, proteinPer100g: 24.6, carbsPer100g: 63.4, fatPer100g: 1.1, fiberPer100g: 10.7, sugarPer100g: 2, sodiumMgPer100g: 6 },
  { name: 'kidney bean', caloriesPer100g: 333, proteinPer100g: 23.6, carbsPer100g: 60, fatPer100g: 0.8, fiberPer100g: 24.9, sugarPer100g: 2.2, sodiumMgPer100g: 24 },
  { name: 'whole wheat flour', caloriesPer100g: 340, proteinPer100g: 13.2, carbsPer100g: 72, fatPer100g: 2.5, fiberPer100g: 10.7, sugarPer100g: 0.4, sodiumMgPer100g: 2 },
  { name: 'amchur', caloriesPer100g: 346, proteinPer100g: 3.3, carbsPer100g: 83, fatPer100g: 1.8, fiberPer100g: 6, sugarPer100g: 40, sodiumMgPer100g: 45 },
  { name: 'bay leaf', caloriesPer100g: 313, proteinPer100g: 7.6, carbsPer100g: 75, fatPer100g: 8.4, fiberPer100g: 26.3, sugarPer100g: 0, sodiumMgPer100g: 23 },
  { name: 'raisin', caloriesPer100g: 299, proteinPer100g: 3.1, carbsPer100g: 79.2, fatPer100g: 0.5, fiberPer100g: 3.7, sugarPer100g: 59.2, sodiumMgPer100g: 11 },
  { name: 'coconut', caloriesPer100g: 354, proteinPer100g: 3.3, carbsPer100g: 15.2, fatPer100g: 33.5, fiberPer100g: 9, sugarPer100g: 6.2, sodiumMgPer100g: 20 },
];

const curatedByKey = new Map();
for (const entry of CURATED_INGREDIENTS) {
  const key = normalizeIngredientName(entry.name);
  if (key) curatedByKey.set(key, entry);
}

const ALLERGEN_WORDS = [
  'peanut', 'almond', 'cashew', 'walnut', 'pecan', 'hazelnut', 'pistachio',
  'macadamia', 'nut', 'soy', 'soya', 'tofu', 'gluten', 'wheat', 'barley',
  'rye', 'milk', 'cheese', 'butter', 'cream', 'egg', 'eggs', 'fish',
  'shellfish', 'shrimp', 'prawn', 'crab', 'lobster', 'oyster', 'mussel',
  'sesame', 'mustard', 'sulphite', 'sulfite', 'celery',
];

function containsAllergen(name) {
  const lower = (name || '').toLowerCase();
  return ALLERGEN_WORDS.some((w) => lower.includes(w));
}

// ═══ Row selection (mirrors ingredient-matching.ts pickBest) ═══

function isGenericName(rawName) {
  const base = (rawName || '').toLowerCase();
  if (/\bby\b/.test(base) || /\d/.test(base)) return false;
  return base.length <= 40;
}

function completeness(r) {
  let c = 0;
  if (r.caloriesPer100g > 0) c++;
  if (r.proteinPer100g > 0) c++;
  if (r.carbsPer100g > 0) c++;
  if (r.fatPer100g > 0) c++;
  if (r.fiberPer100g != null && r.fiberPer100g > 0) c++;
  if (r.sugarPer100g != null && r.sugarPer100g > 0) c++;
  if (r.sodiumMgPer100g != null && r.sodiumMgPer100g > 0) c++;
  return c;
}

function isValidRow(r) {
  const cal = r.caloriesPer100g;
  return Number.isFinite(cal) && cal > 0 && cal <= 900;
}

function pickBest(candidates) {
  const valid = candidates.filter(isValidRow);
  if (!valid.length) return null;
  const generic = valid.filter((c) => isGenericName(c.name));
  const pool = generic.length ? generic : valid;
  pool.sort((a, b) => completeness(b) - completeness(a));
  return pool[0];
}

function buildIngredientMap(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = normalizeIngredientName(row.name);
    if (!key) continue;
    const list = grouped.get(key);
    if (list) list.push(row);
    else grouped.set(key, [row]);
  }
  const byKey = new Map();
  for (const [key, candidates] of grouped) {
    const best = pickBest(candidates);
    if (best) byKey.set(key, best);
  }
  return byKey;
}

function resolveIngredient(name, byKey) {
  const key = normalizeIngredientName(name);
  if (!key) return { name: (name || '').trim(), matched: false, row: null, containsAllergen: containsAllergen(name) };
  const curated = curatedByKey.get(key);
  if (curated) {
    return { name: key, matched: true, row: curated, containsAllergen: containsAllergen(key) };
  }
  const row = byKey.get(key);
  if (row) {
    return { name: key, matched: true, row, containsAllergen: row.containsAllergen ?? containsAllergen(key) };
  }
  return { name: key, matched: false, row: null, containsAllergen: containsAllergen(key) };
}

function composeNutrition(items, byKey) {
  const matched = [];
  const missing = [];
  const totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0 };
  const resolved = [];
  let anyMatched = false;
  let totalGrams = 0;

  for (const item of items) {
    const grams = Math.max(1, item.grams || 0);
    totalGrams += grams;
    const r = resolveIngredient(item.name, byKey);
    r.grams = grams;
    resolved.push(r);
    if (!r.row) {
      missing.push(r.name);
      continue;
    }
    anyMatched = true;
    matched.push(r.name);
    const f = grams / 100;
    totals.calories += r.row.caloriesPer100g * f;
    totals.proteinG += r.row.proteinPer100g * f;
    totals.carbsG += r.row.carbsPer100g * f;
    totals.fatG += r.row.fatPer100g * f;
    totals.fiberG += (r.row.fiberPer100g ?? 0) * f;
    totals.sugarG += (r.row.sugarPer100g ?? 0) * f;
    totals.sodiumMg += (r.row.sodiumMgPer100g ?? 0) * f;
  }

  if (!anyMatched || totalGrams <= 0) {
    return { nutrition: null, matched, missing, resolved, totalGrams };
  }

  const f = 100 / totalGrams;
  return {
    nutrition: {
      calories: Math.round(totals.calories * f),
      proteinG: Math.round(totals.proteinG * f * 10) / 10,
      carbsG: Math.round(totals.carbsG * f * 10) / 10,
      fatG: Math.round(totals.fatG * f * 10) / 10,
      fiberG: Math.round(totals.fiberG * f * 10) / 10,
      sugarG: Math.round(totals.sugarG * f * 10) / 10,
      sodiumMg: Math.round(totals.sodiumMg * f),
    },
    matched,
    missing,
    resolved,
    totalGrams,
  };
}

// ═══ AI ingredient extraction (mirrors src/lib/ai/client.ts) ═══

const INGREDIENT_EXTRACTION_SYSTEM = `You are an expert nutrition assistant specializing in global and South Asian cuisine. Your ONLY job is to list the recipe ingredients of a dish so the backend can compute its nutrition. You never provide calories, macros, or any nutritional values.

Return ONLY a JSON object, no markdown, no code fences, no commentary:
{
  "ingredients": [
    { "name": "Basmati Rice", "grams": 180 },
    { "name": "Chicken Breast", "grams": 80 }
  ]
}

Rules:
- Include the main ingredients (at least 3, at most 12): grains/rice/bread, protein, vegetables, dairy, and any significant oil/ghee/sugar.
- "grams" is the approximate weight of that ingredient as consumed in the dish (cooked weight for cooked items).
- Use simple common names (e.g. "Basmati Rice", "Chicken", "Onions", "Tomatoes", "Paneer", "Cooking Oil", "Toor Dal", "Milk").
- NEVER use vague placeholder ingredient names. "Meat", "Vegetables", "Mixed Vegetables", "Greens", "Spices", "Herbs", "Curry", "Gravy", "Sauce" and similar generic categories are FORBIDDEN — always name the specific ingredient (e.g. "Chicken", "Potatoes", "Spinach", "Cumin", "Curry Leaves", "Tomato Gravy").
- Ignore trace seasoning unless it meaningfully contributes (e.g. omit a pinch of salt).
- NEVER include calories, protein, carbs, fat, or any other nutritional values.
- NEVER include "water".`;

async function aiChat(system, user) {
  const baseUrl = process.env.FOOD_AI_BASE_URL || 'http://localhost:1234/v1';
  const apiKey = process.env.FOOD_AI_API_KEY || 'lm-studio';
  const model = process.env.FOOD_AI_MODEL || 'gemma-3-4b-it-qat';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AI request failed (${res.status} ${res.statusText}): ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('Empty AI response');
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

async function extractIngredients(foodName, servingDescription) {
  const user = `Dish: "${foodName}"${servingDescription ? ` (served as: ${servingDescription})` : ''}\n\nReturn the ingredient JSON now.`;
  let lastErr;
  for (let attempt = 0; attempt <= AI_RETRIES; attempt++) {
    try {
      const content = await aiChat(INGREDIENT_EXTRACTION_SYSTEM, user);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      const parsed = JSON.parse(jsonMatch[0]);
      const list = Array.isArray(parsed) ? parsed : parsed?.ingredients;
      if (!Array.isArray(list)) throw new Error('No ingredients array');
      return list
        .filter(
          (i) =>
            i &&
            typeof i.name === 'string' &&
            i.name.trim().length > 0 &&
            Number.isFinite(Number(i.grams)) &&
            Number(i.grams) > 0
        )
        .map((i) => ({ name: i.name.trim(), grams: Math.round(Number(i.grams)) }))
        .slice(0, 12);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

// ═══ Dataset helpers ═══

const MEAL_TYPE_MAP = { Breakfast: 'breakfast', Lunch: 'lunch', Snack: 'snack', Dinner: 'dinner' };

function dietFlags(dietType) {
  if (dietType === 'Vegetarian') {
    return { isVeg: true, isVegan: false, isEggetarian: true };
  }
  return { isVeg: false, isVegan: false, isEggetarian: false };
}

function uniqueDishKey(r) {
  return `${r.cuisine}|${r.meal_type}|${r.base_dish.toLowerCase()}`;
}

// ═══ Worker pool for concurrent annotation ═══

async function mapWithConcurrency(items, limit, worker, shouldStop) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (cursor < items.length && !(shouldStop && shouldStop())) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

// ═══ Main ═══

async function main() {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, 'utf8'));
  if (!Array.isArray(dataset) || dataset.length !== 1200) {
    throw new Error(`Expected 1,200 records, got ${Array.isArray(dataset) ? dataset.length : 'not an array'}`);
  }
  console.log('📖 Dataset:', DATASET_PATH, `(${dataset.length} records)`);

  // Unique dishes for annotation.
  const dishes = new Map();
  for (const r of dataset) {
    const key = uniqueDishKey(r);
    const group = dishes.get(key);
    if (group) group.push(r);
    else dishes.set(key, [r]);
  }
  const dishList = [...dishes.values()];
  console.log(`🍛 Unique dishes to annotate: ${dishList.length}`);

  // Idempotency: skip records whose externalId already exists.
  const existing = await prisma.meal.findMany({
    where: { source: 'dataset' },
    select: { externalId: true },
  });
  const existingIds = new Set(existing.map((m) => m.externalId).filter(Boolean));
  const toCreate = dataset.filter((r) => !existingIds.has(r.food_id));
  console.log(`🔄 Already seeded: ${existingIds.size} records; to create: ${toCreate.length}`);
  if (toCreate.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Build the ingredient nutrition map (best row per normalized key).
  const ingredientRows = await prisma.ingredient.findMany();
  const byKey = buildIngredientMap(
    ingredientRows.map((r) => ({
      id: r.id,
      name: r.name,
      containsAllergen: r.containsAllergen,
      caloriesPer100g: r.caloriesPer100g,
      proteinPer100g: r.proteinPer100g,
      carbsPer100g: r.carbsPer100g,
      fatPer100g: r.fatPer100g,
      fiberPer100g: r.fiberPer100g,
      sugarPer100g: r.sugarPer100g,
      sodiumMgPer100g: r.sodiumMgPer100g,
    }))
  );
  console.log(`🧪 Ingredient table rows: ${ingredientRows.length.toLocaleString()}`);

  // Annotation: which unique dishes still need work?
  const dishKeysToDo = new Set(toCreate.map((r) => uniqueDishKey(r)));
  const dishesToDo = dishList.filter((group) => dishKeysToDo.has(uniqueDishKey(group[0])));

  // Load the annotation cache and hydrate it into composed nutrition data.
  const saveCache = () => {
    if (NO_CACHE || NO_AI) return;
    writeFileSync(CACHE_PATH, JSON.stringify(cacheItems, null, 2));
  };
  const cacheItems = {}; // uniqueDishKey -> { items }
  if (!NO_CACHE && existsSync(CACHE_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
      for (const [k, v] of Object.entries(raw)) {
        if (Array.isArray(v?.items) && v.items.length) cacheItems[k] = v;
      }
    } catch {
      // Corrupt cache is treated as empty; re-annotation will rebuild it.
    }
  }

  const annotated = new Map(); // uniqueDishKey -> { ingredients, nutrition, resolved } | null
  const hydrateFromCache = (key) => {
    const entry = cacheItems[key];
    if (!entry) return false;
    const composed = composeNutrition(entry.items, byKey);
    annotated.set(key, { items: entry.items, ...composed, missing: composed.missing.length ? composed.missing : null });
    return true;
  };

  if (NO_AI) {
    console.log('--no-ai: skipping ingredient annotation (all new meals → not_verified)');
  } else if (DRY_RUN) {
    console.log('--dry-run: not calling AI');
  } else {
    const target = dishesToDo.filter((group) => !hydrateFromCache(uniqueDishKey(group[0]))).slice(0, LIMIT);
    console.log(`📦 Cache hits: ${Object.keys(cacheItems).length}; dishes to annotate: ${target.length}`);
    console.log(`🤖 Annotating ${target.length} dishes via AI (concurrency ${AI_CONCURRENCY})...`);
    const startedAt = Date.now();
    let done = 0;
    let ok = 0;
    let capped = false;
    const shouldStop = () => {
      if (!capped && Date.now() - startedAt > MAX_ANNOTATION_MS) {
        capped = true;
        console.log(`⏱ Annotation cap reached (${Math.round((Date.now() - startedAt) / 1000)}s); resumable from cache.`);
      }
      return capped;
    };
    await mapWithConcurrency(
      target,
      AI_CONCURRENCY,
      async (group) => {
        const r0 = group[0];
        const key = uniqueDishKey(r0);
        try {
          const items = await extractIngredients(r0.base_dish, `${r0.meal_type} • ${r0.cuisine}`);
          const composed = composeNutrition(items, byKey);
          annotated.set(key, {
            items,
            ...composed,
            missing: composed.missing.length ? composed.missing : null,
          });
          cacheItems[key] = { items };
          if (composed.nutrition) ok++;
        } catch (err) {
          console.warn(`  ⚠️ annotation failed for "${r0.base_dish}": ${err instanceof Error ? err.message : String(err).slice(0, 160)}`);
          annotated.set(key, null);
        }
        done++;
        if (done % CACHE_SAVE_EVERY === 0) saveCache();
        if (done % LOG_EVERY === 0) {
          const elapsed = Math.round((Date.now() - startedAt) / 1000);
          console.log(`  annotated ${done}/${target.length} (${ok} with nutrition) after ${elapsed}s`);
        }
      },
      shouldStop
    );
    saveCache();
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(`Annotation done: ${ok}/${target.length} with usable nutrition in ${elapsed}s`);
  }

  if (DRY_RUN) {
    console.log('Dry run complete — no records created.');
    return;
  }

  // Create meals (both variants per unique dish). Only for dishes we have
  // annotation for; NO_AI creates everything as not_verified. On a capped or
  // interrupted run, un-annotated dishes wait for the next resume.
  const target = toCreate.filter((r) => NO_AI || annotated.has(uniqueDishKey(r))).slice(0, LIMIT);
  let created = 0;
  let estimated = 0;
  let notVerified = 0;

  const BATCH_SIZE = 50;
  for (let i = 0; i < target.length; i += BATCH_SIZE) {
    const batch = target.slice(i, i + BATCH_SIZE);
    const operations = batch.map(r => {
      const key = uniqueDishKey(r);
      const annotation = annotated.get(key);

      const mealType = MEAL_TYPE_MAP[r.meal_type] ?? r.meal_type.toLowerCase();
      const flags = dietFlags(r.diet_type);
      const hasNutrition = !!annotation?.nutrition && annotation.matched.length >= 2;
      const nutritionStatus = hasNutrition ? 'estimated' : 'not_verified';

      return prisma.meal.create({
        data: {
          name: r.food_name,
          description: `${r.base_dish} (${r.variant}) — ${r.cuisine} ${r.meal_type} dish from the curated catalog.`,
          mealType,
          cuisine: r.cuisine,
          ...flags,
          baseServingGms: 100,
          isActive: true,
          source: 'dataset',
          externalId: r.food_id,
          imageSearchName: r.image_search_name,
          nutritionStatus,
          ...(hasNutrition
            ? {
                nutrition: {
                  create: {
                    calories: annotation.nutrition.calories,
                    proteinG: annotation.nutrition.proteinG,
                    carbsG: annotation.nutrition.carbsG,
                    fatG: annotation.nutrition.fatG,
                    fiberG: annotation.nutrition.fiberG,
                    sugarG: annotation.nutrition.sugarG,
                    sodiumMg: annotation.nutrition.sodiumMg,
                    perServingGms: 100,
                  },
                },
              }
            : {}),
          servings: {
            create: { servingName: 'Serving (100g)', servingGms: 100, multiplier: 1 },
          },
          aliases: {
            create: [
              { aliasName: r.base_dish },
              { aliasName: r.food_name.toLowerCase() },
              { aliasName: `${r.base_dish} ${r.variant}`.toLowerCase() },
            ],
          },
          tags: {
            create: [
              { tagName: r.cuisine },
              { tagName: r.variant },
              { tagName: r.base_dish.toLowerCase() },
              { tagName: 'dataset' },
            ],
          },
          ingredients: {
            create: (annotation?.items ?? []).map((item, idx) => {
              const res = annotation.resolved?.[idx];
              return {
                ingredientName: item.name,
                amountGrams: item.grams,
                containsAllergen: res?.containsAllergen ?? containsAllergen(item.name),
                ingredientId: res?.row?.id ?? null,
              };
            }),
          },
        },
      });
    });

    await prisma.$transaction(operations);

    for (const r of batch) {
      const key = uniqueDishKey(r);
      const annotation = annotated.get(key);
      const hasNutrition = !!annotation?.nutrition && annotation.matched.length >= 2;
      
      created++;
      if (hasNutrition) estimated++;
      else notVerified++;
    }

    console.log(`  created ${created}/${target.length} (estimated ${estimated}, not_verified ${notVerified})`);
  }

  console.log(`\n✅ Seeded ${created} dataset meals (estimated ${estimated}, not_verified ${notVerified}).`);
  console.log(`Total Meal rows: ${await prisma.meal.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
