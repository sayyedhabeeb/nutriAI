# nutriAI Bug Fixes, System Edge-Case Protections & Database Architecture

This document summarizes all identified bugs, edge-case protections, database migration and seeding workflows, and core stability improvements across the nutriAI codebase.

---

## 1. Resolved Bugs & Edge-Case Protections

### A. Streak Calculation Grace Period (`src/lib/achievements.ts`)
*   **Issue:** Previously, opening the application in the morning before logging breakfast evaluated `getDateString(0)` (today) as unlogged, resetting active consecutive streaks back to 0.
*   **Fix:** `computeLogStreak` now checks if today is logged (`logDates.has(getDateString(0))`). If not logged yet today, the streak evaluation starts at yesterday (`getDateString(1)`), applying a 1-day grace period to preserve active user streaks.

### B. Type Narrowing in Achievement Calculations (`src/lib/achievements.ts`)
*   **Issue:** Cuisine filter arrays could cause TypeScript type assignment mismatches when processing nullable cuisine properties on `Meal` records.
*   **Fix:** Added explicit type guard narrowing:
    ```typescript
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    ```

### C. Idempotent Allergy Management (`src/app/api/onboarding/complete/route.ts`)
*   **Issue:** Submitting onboarding updates multiple times generated duplicate `UserAllergy` rows for the same user.
*   **Fix:** The route handler now executes:
    ```typescript
    await db.userAllergy.deleteMany({
      where: { userId: session.userId },
    });
    ```
    before invoking `createMany`, guaranteeing non-duplicating, idempotent allergy synchronization.

### D. Safe Aggregation on Food Log Deletion (`src/app/api/food-logs/route.ts`)
*   **Issue:** Deleting food items previously used naive decrements (`consumedCalories: { decrement: item.calories }`), which produced negative nutrient totals due to floating-point rounding errors.
*   **Fix:** The `DELETE` route handler aggregates total calories and macros directly from remaining `FoodLogItem` records and updates `DailyNutrition` using clamped non-negative values (`Math.max(0, ...)`):
    ```typescript
    const totals = await db.foodLogItem.aggregate({
      where: { foodLogId },
      _sum: { calories: true, proteinG: true, carbsG: true, fatG: true },
    });
    const remainingCalories = Math.max(0, totals._sum.calories || 0);
    ```

---

## 2. Environment Configuration & Database Sync

### Environment File (`.env`)
The local environment is configured with:
*   `DATABASE_URL`: `mysql://root:root@localhost:3306/nutriai`
*   `NEXTAUTH_SECRET` and `NEXTAUTH_URL` for authentication.
*   `FOOD_AI_*` and `RECO_AI_*` endpoints for LLM and vision model integrations.

### Schema Sync & Seeding Procedures
1.  **Prisma Client Generation**: `npx prisma generate`
2.  **Database Push**: `npx prisma db push` synchronizes schema definitions to local MySQL.
3.  **Ingredient Dataset Seeding**: `npm run db:seed:opennutrition:ingredients`
    - Parses `food-dataset/opennutrition_foods.tsv` (~326k raw rows).
    - Filters `grocery` / `everyday` items into ~218,700 unique, normalized raw ingredients.
    - Upserts rows with classification flags (`isVeg`, `isVegan`, `containsAllergen`) and backfills `MealIngredient` foreign key relationships.
4.  **Prepared Dish Seeding**: `npm run db:seed:opennutrition:meals`
    - Parses `prepared` / `restaurant` dishes into ~6,500 structured meal records.
    - Creates corresponding `MealNutrition`, default `MealServing` (100g), and `MealIngredient` relations.

---

## 3. System Verification

- **Type Safety**: `npx -p typescript tsc --noEmit` verifies strict TypeScript compilation with 0 errors across the codebase.
- **Database Consistency**: Relations between `UserGoal`, `UserPreference`, `UserAllergy`, `FoodLog`, `FoodLogItem`, `DailyNutrition`, `Meal`, and `Ingredient` tables operate idempotently with strict relational integrity.
