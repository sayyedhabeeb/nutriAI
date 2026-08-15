// Seed the Ingredient master table from the OpenNutrition foods dataset
// (food-dataset/opennutrition_foods.tsv).
//
// Scope   : rows where `type` is "grocery" or "everyday" (raw ingredient-like foods).
// Strategy: stream the TSV line-by-line (the file is ~280MB), normalize each name to
//           match the app's resolveIngredientName() lookup, dedup by normalized name
//           (keep the most nutritionally complete row), then upsert in raw-SQL batches.
//           Idempotent + re-runnable. Overwrites conflicting names in place (the same
//           row id is kept), so existing MealIngredient.ingredientId links stay valid.
//           Never deletes, so a mid-run failure leaves previous data intact.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
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

const BATCH_SIZE = 400;
const LOG_EVERY = 25000;
const ALLOWED_TYPES = new Set(['grocery', 'everyday']);

// Mirrors resolveIngredientName() in src/lib/ingredient-nutrition.ts plus a few
// extra descriptors so OpenNutrition's "Chicken Breast, Boneless Skinless, Cooked"
// normalizes to "chicken breast".
const STATE_WORDS = /\b(whole|fresh|raw|boiled|cooked|steamed|grilled|roasted|sauteed|sautéed|sliced|diced|chopped|minced|ground|powdered|dried|shredded|frozen|baked|fried|smoked|marinated|skinless|boneless|organic|plain|unsalted|salted|seasoned|unsweetened|reduced|low-fat|low fat|refined|all purpose|unbleached|enriched|prepared|canned|tinned)\b/g;

function truncate(name, max = 191) {
  if (name.length <= max) return name;
  const cut = name.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
}

function normalizeName(raw) {
  let name = (raw || '').toLowerCase();
  name = name.split(',')[0];
  name = name.replace(STATE_WORDS, ' ');
  name = name.replace(/\(.*?\)/g, ' ').trim();
  name = name.replace(/\s+/g, ' ').trim();
  return truncate(name);
}

// ── Veg / vegan / allergen heuristics (best-effort keyword lists) ──
const NON_VEG_WORDS = [
  'chicken', 'beef', 'pork', 'lamb', 'mutton', 'veal', 'bison', 'buffalo',
  'turkey', 'duck', 'goose', 'venison', 'sausage', 'bacon', 'ham', 'salami',
  'pepperoni', 'meat', 'fish', 'tuna', 'salmon', 'trout', 'cod', 'tilapia',
  'mackerel', 'sardine', 'anchovy', 'herring', 'roe', 'caviar', 'shrimp',
  'prawn', 'crab', 'lobster', 'squid', 'octopus', 'mussel', 'clam', 'oyster',
  'scallop', 'anchovies', 'gelatin', 'gelatine', 'lard', 'suet', 'stock',
  'broth', 'bone',
];

const NON_VEGAN_WORDS = [
  ...NON_VEG_WORDS,
  'milk', 'cheese', 'butter', 'ghee', 'cream', 'yogurt', 'yoghurt', 'paneer',
  'curd', 'whey', 'casein', 'egg', 'eggs', 'mayonnaise', 'mayo', 'honey',
  'custard', 'ice cream', 'buttermilk', 'condensed milk', 'evaporated milk',
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
      caloriesPer100g: calories,
      proteinPer100g: toNum(n.protein) ?? 0,
      carbsPer100g: toNum(n.carbohydrates) ?? 0,
      fatPer100g: toNum(n.total_fat) ?? 0,
      fiberPer100g: toNum(n.dietary_fiber),
      sugarPer100g: toNum(n.total_sugars),
      sodiumMgPer100g: toNum(n.sodium),
    };
  } catch {
    return null;
  }
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

function upsertSql(rows) {
  const values = [];
  const params = [];
  for (const r of rows) {
    values.push(
      `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`
    );
    params.push(
      r.id, r.name, r.isVeg, r.isVegan, r.containsAllergen,
      r.caloriesPer100g, r.proteinPer100g, r.carbsPer100g, r.fatPer100g,
      r.fiberPer100g, r.sugarPer100g, r.sodiumMgPer100g
    );
  }
  const sql = `
    INSERT INTO Ingredient
      (id, name, isVeg, isVegan, containsAllergen, caloriesPer100g,
       proteinPer100g, carbsPer100g, fatPer100g, fiberPer100g,
       sugarPer100g, sodiumMgPer100g, createdAt, updatedAt)
    VALUES ${values.join(', ')}
    AS new
    ON DUPLICATE KEY UPDATE
      name = new.name,
      isVeg = new.isVeg,
      isVegan = new.isVegan,
      containsAllergen = new.containsAllergen,
      caloriesPer100g = new.caloriesPer100g,
      proteinPer100g = new.proteinPer100g,
      carbsPer100g = new.carbsPer100g,
      fatPer100g = new.fatPer100g,
      fiberPer100g = new.fiberPer100g,
      sugarPer100g = new.sugarPer100g,
      sodiumMgPer100g = new.sodiumMgPer100g,
      updatedAt = CURRENT_TIMESTAMP(3)`;
  return { sql, params };
}

async function main() {
  console.log('Reading:', DATASET_PATH);

  const unique = new Map();
  let scanned = 0;
  let parsed = 0;
  let skippedNoCal = 0;

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
    if (!nut) { skippedNoCal++; continue; }

    const normalized = normalizeName(rawName);
    if (!normalized) { skippedNoCal++; continue; }

    const lowerRaw = rawName.toLowerCase();
    const flags = classify(lowerRaw);
    const row = { name: normalized, ...nut, ...flags };

    const existing = unique.get(normalized);
    if (!existing || completeness(row) > completeness(existing)) {
      unique.set(normalized, row);
    }
    parsed++;

    if (scanned % LOG_EVERY === 0) {
      console.log(`  scanned ${scanned.toLocaleString()} rows, ${unique.size.toLocaleString()} unique ingredients`);
    }
  }
  rl.close();

  console.log(`Scanned ${scanned.toLocaleString()}, parsed ${parsed.toLocaleString()}, unique ${unique.size.toLocaleString()}, skipped/no-cal ${skippedNoCal.toLocaleString()}`);

  const rows = [...unique.values()].map((r) => ({ ...r, id: randomUUID() }));
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { sql, params } = upsertSql(batch);
    // affected = inserts*1 + updates*2 → updates = affected - len, inserts = 2*len - affected
    const affected = await prisma.$executeRawUnsafe(sql, ...params);
    inserted += 2 * batch.length - affected;
    updated += affected - batch.length;
    if ((i + batch.length) % (BATCH_SIZE * 50) === 0 || i + batch.length >= rows.length) {
      console.log(`  upserted ${(i + batch.length).toLocaleString()}/${rows.length.toLocaleString()}`);
    }
  }

  console.log(`Ingredient upserts: ${inserted} inserted, ${updated} updated`);

  // Backfill MealIngredient.ingredientId by case-insensitive name match.
  const allIngredients = await prisma.ingredient.findMany({ select: { id: true, name: true } });
  const byName = new Map(allIngredients.map((i) => [i.name.toLowerCase(), i.id]));
  const mealIngredients = await prisma.mealIngredient.findMany({
    select: { id: true, ingredientName: true, ingredientId: true },
  });
  let linked = 0;
  for (const mi of mealIngredients) {
    const id = byName.get(mi.ingredientName.toLowerCase());
    if (id && mi.ingredientId !== id) {
      await prisma.mealIngredient.update({ where: { id: mi.id }, data: { ingredientId: id } });
      linked++;
    }
  }
  console.log(`Linked ${linked} MealIngredient rows to Ingredient rows.`);
  console.log(`Total Ingredient rows: ${await prisma.ingredient.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
