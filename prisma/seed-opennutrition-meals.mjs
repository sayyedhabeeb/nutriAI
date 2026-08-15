// Seed the Meal table (prepared/cooked dishes) from the OpenNutrition foods
// dataset (food-dataset/opennutrition_foods.tsv).
//
// Scope   : rows where `type` is "prepared" or "restaurant" (cooked dishes that
//           can be recommended to users). Raw ingredients belong to the
//           Ingredient table (see seed-opennutrition-ingredients.mjs).
// Strategy: stream the TSV, clean a display name per dish, dedup by normalized
//           name (keep the most nutritionally complete row), then create each
//           Meal with a nested MealNutrition (per 100 g), a default MealServing
//           (100 g) and one MealIngredient (the dish itself, with allergen flags)
//           so allergen filtering in the recommendation engine keeps working.
//           Idempotent: re-running skips dishes whose normalized name already
//           exists (Meal.name is not unique, so we key off the normalized name).
//           Never deletes existing admin meals.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DATASET_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'food-dataset',
  'opennutrition_foods.tsv'
);

const LOG_EVERY = 2000;
const ALLOWED_TYPES = new Set(['prepared', 'restaurant']);

const STATE_WORDS = /\b(whole|fresh|raw|boiled|cooked|steamed|grilled|roasted|sauteed|sautéed|sliced|diced|chopped|minced|ground|powdered|dried|shredded|frozen|baked|fried|smoked|marinated|skinless|boneless|organic|plain|unsalted|salted|seasoned|unsweetened|reduced|low-fat|low fat|refined|prepared|canned|tinned)\b/g;

function normalizeKey(raw) {
  let name = (raw || '').toLowerCase();
  name = name.split(',')[0];
  name = name.replace(STATE_WORDS, ' ');
  name = name.replace(/\(.*?\)/g, ' ').trim();
  name = name.replace(/\s+/g, ' ').trim();
  return name;
}

function displayName(raw) {
  const base = (raw || '').split(',')[0].trim().toLowerCase();
  return base
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

// ── mealType heuristics (breakfast → snack → lunch/dinner) ──
const BREAKFAST_WORDS = [
  'breakfast', 'oatmeal', 'oat', 'porridge', 'cereal', 'pancake', 'waffle',
  'omelet', 'omelette', 'scrambled egg', 'fried egg', 'boiled egg', 'egg white',
  'toast', 'bagel', 'muffin', 'croissant', 'granola', 'hash brown', 'french toast',
  'idli', 'dosa', 'poha', 'upma', 'uttapam', 'quinoa bowl', 'breakfast bowl',
  'crepes', 'crepe', 'smoothie', 'frittata', 'french fries with eggs',
];

const SNACK_WORDS = [
  'cookie', 'chips', 'biscuit', 'cracker', 'granola bar', 'protein bar', 'candy',
  'chocolate', 'dessert', 'cake', 'brownie', 'popcorn', 'pretzel', 'donut',
  'doughnut', 'pastry', 'pie', 'ice cream', 'sherbet', 'sorbet', 'pudding',
  'custard', 'jelly', 'jam', 'trail mix', 'fruit salad', 'yogurt', 'milkshake',
  'fries', 'nacho', 'hummus', 'guacamole', 'dip', 'nuts', 'roasted nuts',
  'samosa', 'pakora', 'bhaji', 'tart', 'cheesecake', 'muffin top',
];

function classifyMealType(lowerName) {
  if (BREAKFAST_WORDS.some((w) => lowerName.includes(w))) return 'breakfast';
  if (SNACK_WORDS.some((w) => lowerName.includes(w))) return 'snack';
  return 'lunch, dinner';
}

// ── cuisine heuristics (best-effort keyword lists) ──
const CUISINE_RULES = [
  ['indian', ['tandoori', 'curry', 'biryani', 'masala', 'tikka', 'korma', 'vindaloo', 'sambar', 'rasam', 'samosa', 'pakora', 'dosa', 'idli', 'poha', 'upma', 'chutney', 'naan', 'roti', 'paratha', 'dal', 'paneer', 'saag', 'chana', 'butter chicken', 'paneer tikka', 'vada', 'halwa']],
  ['italian', ['pizza', 'pasta', 'lasagna', 'risotto', 'spaghetti', 'penne', 'fettuccine', 'bolognese', 'marinara', 'parmesan', 'mozzarella', 'tiramisu', 'bruschetta', 'gnocchi', 'carbonara', 'alfredo', 'cannelloni', 'ravioli']],
  ['chinese', ['chow mein', 'dumpling', 'spring roll', 'wonton', 'dim sum', 'kung pao', 'sweet and sour', 'egg roll', 'fried rice', 'lo mein', 'mapo', 'sesame chicken', 'orange chicken']],
  ['mexican', ['taco', 'burrito', 'enchilada', 'quesadilla', 'nacho', 'guacamole', 'salsa', 'tortilla', 'fajita', 'tamale', 'chilaquiles', 'carnitas', 'chipotle']],
  ['thai', ['thai', 'pad thai', 'tom yum', 'green curry', 'red curry', 'massaman', 'basil chicken', 'lemongrass']],
  ['japanese', ['sushi', 'ramen', 'tempura', 'teriyaki', 'miso', 'udon', 'soba', 'gyoza', 'okonomiyaki', 'tonkatsu', 'sashimi', 'bento']],
  ['korean', ['kimchi', 'bulgogi', 'bibimbap', 'korean', 'gochujang', 'kimbap']],
  ['greek', ['greek', 'gyro', 'tzatziki', 'souvlaki', 'feta', 'moussaka', 'spanakopita']],
  ['mediterranean', ['hummus', 'falafel', 'tabbouleh', 'pita', 'shawarma', 'mediterranean', 'baba ghanoush', 'tabouli']],
  ['french', ['croissant', 'crepe', 'baguette', 'quiche', 'ratatouille', 'béarnaise', 'bearnaise', 'au gratin']],
  ['american', ['burger', 'hot dog', 'bbq', 'barbecue', 'mac and cheese', 'macaroni and cheese', 'milkshake', 'chicken wings', 'ranch', 'brisket', 'pulled pork', 'meatloaf', 'corn dog', 'buffalo chicken']],
];

function classifyCuisine(lowerName) {
  for (const [cuisine, words] of CUISINE_RULES) {
    if (words.some((w) => lowerName.includes(w))) return cuisine;
  }
  return 'general';
}

// ── Veg / vegan / allergen heuristics (best-effort keyword lists) ──
const NON_VEG_WORDS = [
  'chicken', 'beef', 'pork', 'lamb', 'mutton', 'veal', 'bison', 'buffalo',
  'turkey', 'duck', 'goose', 'venison', 'sausage', 'bacon', 'ham', 'salami',
  'pepperoni', 'meat', 'fish', 'tuna', 'salmon', 'trout', 'cod', 'tilapia',
  'mackerel', 'sardine', 'anchovy', 'herring', 'roe', 'caviar', 'shrimp',
  'prawn', 'crab', 'lobster', 'squid', 'octopus', 'mussel', 'clam', 'oyster',
  'scallop', 'gelatin', 'gelatine', 'lard', 'suet', 'stock', 'broth', 'bone',
];

const NON_VEGAN_WORDS = [
  ...NON_VEG_WORDS,
  'milk', 'cheese', 'butter', 'ghee', 'cream', 'yogurt', 'yoghurt', 'paneer',
  'curd', 'whey', 'casein', 'egg', 'eggs', 'mayonnaise', 'mayo', 'honey',
  'custard', 'ice cream', 'buttermilk',
];

const ALLERGEN_WORDS = [
  'peanut', 'almond', 'cashew', 'walnut', 'pecan', 'hazelnut', 'pistachio',
  'macadamia', 'nut', 'soy', 'soya', 'tofu', 'gluten', 'wheat', 'barley',
  'rye', 'milk', 'cheese', 'butter', 'cream', 'egg', 'eggs', 'fish', 'shellfish',
  'shrimp', 'prawn', 'crab', 'lobster', 'oyster', 'mussel', 'sesame', 'mustard',
  'sulphite', 'sulfite', 'celery',
];

function classify(lowerName) {
  let isVeg = true;
  let isVegan = true;
  let containsAllergen = false;
  for (const w of NON_VEG_WORDS) {
    if (lowerName.includes(w)) { isVeg = false; isVegan = false; break; }
  }
  if (isVegan) {
    for (const w of NON_VEGAN_WORDS) {
      if (lowerName.includes(w)) { isVegan = false; break; }
    }
  }
  for (const w of ALLERGEN_WORDS) {
    if (lowerName.includes(w)) { containsAllergen = true; break; }
  }
  return { isVeg, isVegan, containsAllergen };
}

function parseNutrition(json) {
  try {
    const n = JSON.parse(json);
    const calories = Number(n.calories);
    if (calories == null || !Number.isFinite(calories)) return null;
    const toNum = (v) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    };
    return {
      calories: calories,
      proteinG: toNum(n.protein) ?? 0,
      carbsG: toNum(n.carbohydrates) ?? 0,
      fatG: toNum(n.total_fat) ?? 0,
      fiberG: toNum(n.dietary_fiber),
      sugarG: toNum(n.total_sugars),
      sodiumMg: toNum(n.sodium),
    };
  } catch {
    return null;
  }
}

function completeness(r) {
  let c = 0;
  if (r.calories > 0) c++;
  if (r.proteinG > 0) c++;
  if (r.carbsG > 0) c++;
  if (r.fatG > 0) c++;
  if (r.fiberG != null && r.fiberG > 0) c++;
  if (r.sugarG != null && r.sugarG > 0) c++;
  if (r.sodiumMg != null && r.sodiumMg > 0) c++;
  return c;
}

async function main() {
  console.log('Reading:', DATASET_PATH);

  const unique = new Map();
  let scanned = 0;
  let parsed = 0;

  const rl = createInterface({
    input: createReadStream(DATASET_PATH),
    crlfDelay: Infinity,
  });

  let isFirst = true;
  for await (const line of rl) {
    if (isFirst) { isFirst = false; continue; }
    scanned++;
    const p = line.split('\t');
    if (p.length < 8) continue;
    if (!ALLOWED_TYPES.has(p[4].trim())) continue;

    const rawName = p[1] || '';
    const nut = parseNutrition(p[7]);
    if (!nut) continue;

    const key = normalizeKey(rawName);
    if (!key) continue;

    const flags = classify(rawName.toLowerCase());
    const row = {
      key,
      name: displayName(rawName),
      description: (p[3] || '').slice(0, 190) || null,
      mealType: classifyMealType(key),
      cuisine: classifyCuisine(key),
      ...flags,
      ...nut,
    };

    const existing = unique.get(key);
    if (!existing || completeness(row) > completeness(existing)) {
      unique.set(key, row);
    }
    parsed++;

    if (scanned % LOG_EVERY === 0) {
      console.log(`  scanned ${scanned.toLocaleString()} rows, ${unique.size.toLocaleString()} unique meals`);
    }
  }
  rl.close();

  console.log(`Scanned ${scanned.toLocaleString()}, parsed ${parsed.toLocaleString()}, unique meals ${unique.size.toLocaleString()}`);

  // Look up existing meals by normalized name so re-runs are idempotent.
  const existingMeals = await prisma.meal.findMany({ select: { name: true } });
  const seenNames = new Set(
    existingMeals.map((m) => normalizeKey(m.name)).filter((n) => n.length > 0)
  );

  // Ingredient lookup for MealIngredient.ingredientId linking.
  const allIngredients = await prisma.ingredient.findMany({ select: { id: true, name: true } });
  const ingredientByKey = new Map(
    allIngredients.map((i) => [normalizeKey(i.name), i.id])
  );

  const meals = [...unique.values()];
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < meals.length; i += 50) {
    const batch = meals.slice(i, i + 50);
    const toCreate = batch.filter((m) => !seenNames.has(m.key));
    skipped += batch.length - toCreate.length;

    for (const m of toCreate) {
      await prisma.meal.create({
        data: {
          name: m.name,
          description: m.description,
          mealType: m.mealType,
          cuisine: m.cuisine,
          isVeg: m.isVeg,
          isVegan: m.isVegan,
          isEggetarian: m.isVeg && !m.isVegan,
          baseServingGms: 100,
          isActive: true,
          source: 'admin',
          nutrition: {
            create: {
              calories: m.calories,
              proteinG: m.proteinG,
              carbsG: m.carbsG,
              fatG: m.fatG,
              fiberG: m.fiberG,
              sugarG: m.sugarG,
              sodiumMg: m.sodiumMg,
              perServingGms: 100,
            },
          },
          servings: {
            create: { servingName: 'Serving (100g)', servingGms: 100, multiplier: 1 },
          },
          ingredients: {
            create: {
              ingredientName: m.name,
              containsAllergen: m.containsAllergen,
              amountGrams: 100,
              ingredientId: ingredientByKey.get(m.key) ?? null,
            },
          },
        },
      });
      created++;
    }
    if ((i + batch.length) % 1000 === 0 || i + batch.length >= meals.length) {
      console.log(`  created ${created.toLocaleString()}/${meals.length.toLocaleString()} meals (skipped ${skipped.toLocaleString()})`);
    }
  }

  console.log(`Created ${created} meals, skipped ${skipped} existing.`);
  console.log(`Total Meal rows: ${await prisma.meal.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
