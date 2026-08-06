import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const prisma = new PrismaClient();

const SQLITE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'custom.db'
);

const DATE_COLS = {
  AiLog: ['createdAt'],
  DailyNutrition: ['createdAt'],
  FoodLog: ['createdAt'],
  FoodLogItem: ['loggedAt'],
  Meal: ['createdAt', 'updatedAt'],
  MealAlias: ['createdAt'],
  MealNutrition: ['createdAt'],
  MealPlanDay: ['createdAt'],
  MealPlanItem: ['createdAt'],
  MealServing: ['createdAt'],
  Session: ['expiresAt', 'createdAt'],
  UnknownFoodSubmission: ['createdAt'],
  User: ['lastLoginAt', 'createdAt', 'updatedAt'],
  UserAllergy: ['createdAt'],
  UserGoal: ['createdAt', 'updatedAt'],
  UserPreference: ['createdAt', 'updatedAt'],
  UserProfile: ['updatedAt'],
  WaterLog: ['createdAt'],
  WeightLog: ['createdAt'],
};

const BOOL_COLS = {
  Meal: ['isVeg', 'isVegan', 'isEggetarian', 'isActive'],
  MealIngredient: ['containsAllergen'],
  User: ['isActive'],
};

function normalize(table, row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (value == null) {
      out[key] = value;
      continue;
    }
    if (BOOL_COLS[table]?.includes(key)) {
      out[key] = !!value;
      continue;
    }
    if (DATE_COLS[table]?.includes(key)) {
      out[key] = new Date(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

async function insertTable(db, model) {
  const rows = db.prepare(`SELECT * FROM "${model}"`).all();
  if (rows.length === 0) {
    console.log(`  ${model}: 0 rows (skip)`);
    return 0;
  }
  await prisma[model].createMany({ data: rows.map((r) => normalize(model, r)) });
  console.log(`  ${model}: ${rows.length} rows`);
  return rows.length;
}

async function clearTable(model) {
  const before = await prisma[model].count();
  if (before > 0) {
    await prisma[model].deleteMany();
    console.log(`  cleared ${model}: ${before} rows`);
  }
}

const DELETE_ORDER = [
  'FoodLogItem',
  'MealPlanItem',
  'FoodLog',
  'MealPlanDay',
  'DailyNutrition',
  'WaterLog',
  'WeightLog',
  'AiLog',
  'UnknownFoodSubmission',
  'Session',
  'UserAllergy',
  'UserProfile',
  'UserGoal',
  'UserPreference',
  'MealServing',
  'MealAlias',
  'MealTag',
  'MealIngredient',
  'MealNutrition',
  'Meal',
  'User',
];

const INSERT_ORDER = [
  'Meal',
  'User',
  'MealNutrition',
  'MealServing',
  'MealAlias',
  'MealTag',
  'MealIngredient',
  'UserProfile',
  'UserGoal',
  'UserAllergy',
  'UserPreference',
  'FoodLog',
  'DailyNutrition',
  'WaterLog',
  'WeightLog',
  'MealPlanDay',
  'AiLog',
  'UnknownFoodSubmission',
  'Session',
  'FoodLogItem',
  'MealPlanItem',
];

async function main() {
  const db = new DatabaseSync(SQLITE_PATH, { readOnly: true });
  console.log('🗄️  Reading from SQLite:', SQLITE_PATH);

  console.log('\n🧹 Clearing MySQL tables...');
  for (const model of DELETE_ORDER) {
    await clearTable(model);
  }

  console.log('\n📦 Inserting into MySQL...');
  for (const model of INSERT_ORDER) {
    await insertTable(db, model);
  }

  db.close();

  console.log('\n✅ Migration complete!');
  const counts = {};
  for (const model of INSERT_ORDER) {
    counts[model] = await prisma[model].count();
  }
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
