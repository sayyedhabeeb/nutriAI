import { PrismaClient } from '@prisma/client';
import { format, subDays } from 'date-fns';

const prisma = new PrismaClient();

// Simulated daily meal plans (mealId, slot, servingGms)
const DAILY_PLANS: { name: string; slot: string; servingGms: number }[][] = [
  // Day 1 (14 days ago) - light day
  [
    { name: 'Idli Sambar', slot: 'breakfast', servingGms: 300 },
    { name: 'Dal Tadka', slot: 'lunch', servingGms: 250 },
    { name: 'Tandoori Chicken', slot: 'dinner', servingGms: 200 },
  ],
  // Day 2
  [
    { name: 'Masala Dosa', slot: 'breakfast', servingGms: 250 },
    { name: 'Chicken Biryani', slot: 'lunch', servingGms: 300 },
    { name: 'Grilled Paneer Tikka Plate', slot: 'snack', servingGms: 200 },
    { name: 'Butter Chicken', slot: 'dinner', servingGms: 250 },
  ],
  // Day 3
  [
    { name: 'Chole Bhature', slot: 'breakfast', servingGms: 200 },
    { name: 'Rajma Chawal', slot: 'lunch', servingGms: 350 },
    { name: 'Tom Yum Soup', slot: 'snack', servingGms: 300 },
    { name: 'Grilled Fish Tacos', slot: 'dinner', servingGms: 250 },
  ],
  // Day 4
  [
    { name: 'Scrambled Eggs', slot: 'breakfast', servingGms: 200 },
    { name: 'Chicken Shawarma Wrap', slot: 'lunch', servingGms: 300 },
    { name: 'Edamame', slot: 'snack', servingGms: 150 },
    { name: 'Shakshuka', slot: 'dinner', servingGms: 250 },
  ],
  // Day 5 - over target day
  [
    { name: 'Pancakes', slot: 'breakfast', servingGms: 250 },
    { name: 'Chicken Biryani', slot: 'lunch', servingGms: 350 },
    { name: 'Margherita Pizza', slot: 'snack', servingGms: 300 },
    { name: 'Fettuccine Alfredo', slot: 'dinner', servingGms: 350 },
  ],
  // Day 6
  [
    { name: 'Overnight Oats', slot: 'breakfast', servingGms: 250 },
    { name: 'Dal Makhani', slot: 'lunch', servingGms: 300 },
    { name: 'Miso Soup', slot: 'snack', servingGms: 200 },
    { name: 'Grilled Salmon', slot: 'dinner', servingGms: 200 },
  ],
  // Day 7 - under target
  [
    { name: 'Greek Yogurt Bowl', slot: 'breakfast', servingGms: 200 },
    { name: 'Vegetable Fried Rice', slot: 'lunch', servingGms: 250 },
  ],
  // Day 8
  [
    { name: 'Masala Dosa', slot: 'breakfast', servingGms: 280 },
    { name: 'Kung Pao Chicken', slot: 'lunch', servingGms: 250 },
    { name: 'Paneer Tikka', slot: 'snack', servingGms: 180 },
    { name: 'Hyderabadi Veg Biryani', slot: 'dinner', servingGms: 300 },
  ],
  // Day 9
  [
    { name: 'Chole Bhature', slot: 'breakfast', servingGms: 220 },
    { name: 'Palak Paneer', slot: 'lunch', servingGms: 250 },
    { name: 'Spring Rolls', slot: 'snack', servingGms: 150 },
    { name: 'Tandoori Chicken', slot: 'dinner', servingGms: 220 },
  ],
  // Day 10 - over target
  [
    { name: 'Pancakes', slot: 'breakfast', servingGms: 280 },
    { name: 'Chicken Biryani', slot: 'lunch', servingGms: 320 },
    { name: 'Hummus with Pita', slot: 'snack', servingGms: 200 },
    { name: 'Butter Chicken', slot: 'dinner', servingGms: 280 },
  ],
  // Day 11
  [
    { name: 'Idli Sambar', slot: 'breakfast', servingGms: 300 },
    { name: 'Chow Mein', slot: 'lunch', servingGms: 250 },
    { name: 'Edamame', slot: 'snack', servingGms: 150 },
    { name: 'Sweet and Sour Chicken', slot: 'dinner', servingGms: 250 },
  ],
  // Day 12
  [
    { name: 'Scrambled Eggs', slot: 'breakfast', servingGms: 200 },
    { name: 'Rajma Chawal', slot: 'lunch', servingGms: 300 },
    { name: 'Hot and Sour Soup', slot: 'snack', servingGms: 250 },
    { name: 'Grilled Chicken Breast', slot: 'dinner', servingGms: 250 },
  ],
  // Day 13 - yesterday
  [
    { name: 'Masala Dosa', slot: 'breakfast', servingGms: 260 },
    { name: 'Chicken Shawarma Wrap', slot: 'lunch', servingGms: 300 },
    { name: 'Tom Yum Soup', slot: 'snack', servingGms: 300 },
    { name: 'Grilled Salmon', slot: 'dinner', servingGms: 220 },
  ],
];

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'test@nutriai.com' } });
  if (!user) { console.log('No test user found'); return; }

  // Get all meals for lookup
  const allMeals = await prisma.meal.findMany({ include: { nutrition: true } });
  const mealMap = new Map(allMeals.map(m => [m.name, m]));

  // Get target nutrition for reference
  const todayNut = await prisma.dailyNutrition.findFirst({ where: { userId: user.id } });
  const targetCal = todayNut?.targetCalories || 2149;
  const targetProtein = todayNut?.targetProtein || 215;
  const targetCarbs = todayNut?.targetCarbs || 161;
  const targetFat = todayNut?.targetFat || 72;

  let totalDaysSeeded = 0;

  for (let i = 0; i < DAILY_PLANS.length; i++) {
    const dayOffset = DAILY_PLANS.length - i; // 14, 13, 12, ... 2
    const dateStr = format(subDays(new Date(), dayOffset), 'yyyy-MM-dd');

    // Check if already has data
    const existing = await prisma.dailyNutrition.findUnique({ where: { userId_date: { userId: user.id, date: dateStr } } });
    if (existing) {
      console.log(`Skipping ${dateStr} - already has data`);
      continue;
    }

    const plan = DAILY_PLANS[i];
    let totalCal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;

    // Create food log for this day
    const foodLog = await prisma.foodLog.create({
      data: { userId: user.id, logDate: dateStr },
    });

    for (const item of plan) {
      const meal = mealMap.get(item.name);
      if (!meal) {
        console.log(`  Warning: meal "${item.name}" not found`);
        continue;
      }
      const nut = meal.nutrition;
      const scale = item.servingGms / 100;
      const cal = Math.round(nut.calories * scale);
      const pro = Math.round(nut.proteinG * scale * 10) / 10;
      const carb = Math.round(nut.carbsG * scale * 10) / 10;
      const fat = Math.round(nut.fatG * scale * 10) / 10;

      await prisma.foodLogItem.create({
        data: {
          foodLogId: foodLog.id,
          mealId: meal.id,
          servingGms: item.servingGms,
          calories: cal,
          proteinG: pro,
          carbsG: carb,
          fatG: fat,
          mealSlot: item.slot,
        },
      });

      totalCal += cal;
      totalProtein += pro;
      totalCarbs += carb;
      totalFat += fat;
    }

    // Create daily nutrition record
    await prisma.dailyNutrition.create({
      data: {
        userId: user.id,
        date: dateStr,
        targetCalories: targetCal,
        consumedCalories: totalCal,
        targetProtein: targetProtein,
        consumedProtein: Math.round(totalProtein),
        targetCarbs: targetCarbs,
        consumedCarbs: Math.round(totalCarbs),
        targetFat: targetFat,
        consumedFat: Math.round(totalFat),
      },
    });

    // Seed water logs (3-8 glasses per day)
    const glasses = 3 + Math.floor(Math.random() * 6);
    await prisma.waterLog.create({
      data: { userId: user.id, logDate: dateStr, glassesConsumed: glasses },
    });

    // Seed weight logs (fluctuating around 74.5)
    const weight = 74 + Math.random() * 1.5;
    await prisma.weightLog.create({
      data: { userId: user.id, logDate: dateStr, weightKg: Math.round(weight * 10) / 10 },
    });

    console.log(`Seeded ${dateStr}: ${Math.round(totalCal)} kcal, P:${Math.round(totalProtein)}g, C:${Math.round(totalCarbs)}g, F:${Math.round(totalFat)}g, Water:${glasses}g, Wt:${Math.round(weight * 10) / 10}kg`);
    totalDaysSeeded++;
  }

  console.log(`\nDone! Seeded ${totalDaysSeeded} days of history.`);
}

main().then(() => prisma.$disconnect());
