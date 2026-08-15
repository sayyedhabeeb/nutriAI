# Implementation Plan - Image Storage and Dynamic Recommendation System Updates

This plan outlines changes to implement conditional and preference-aligned backend image storage for food scans, prevent overwriting existing meal images, and dynamically recalculate recommended slot macro targets as the user logs meals.

---

## User Review Required

### Doubts and System Clarifications

> [!NOTE]
> **Doubt 1: How are nutrients calculated for new uploaded foods not in the database?**
> * **Backend-Driven Calculation:** The AI model (Gemma-3 Vision) does **not** calculate raw calories or macros directly (to avoid hallucinated metrics). Instead, the AI model identifies the food dish name and estimates its ingredients and weights (e.g., "Basmati Rice: 180g", "Chicken: 80g").
> * **Ingredient Mapping & Composition:** The backend matches these ingredient names against the database `Ingredient` master table using Jaro-Winkler string similarity and normalization in `IngredientMatcher`. 
> * **Macro Aggregation:** If all ingredients are matched, the backend sums their raw macros based on their weight ratios to compose the overall nutrition metrics (Tier 2).
> * **AI Text Fallback:** If some ingredients are missing, the backend triggers a secondary text-based AI request to extract standard recipe ingredients. If ingredients still cannot be resolved, the system prompts the user to enter calories manually.
> * **Persisting to Database:** The calculated macro/calorie values are stored as a new row in the `Meal` table (associated with `MealNutrition`) and recorded in the `UnknownFoodSubmission` table.

> [!NOTE]
> **Doubt 2: Is the new food submission stored in a new table or the meal table?**
> * **Both tables are used:**
>   1. **`Meal` table:** A new row is created with `source: 'user'` and a `MealNutrition` entry so that the food is immediately searchable and reusable for future scans, logs, and recommendations.
>   2. **`UnknownFoodSubmission` table:** A record is created with `status: 'submitted'` to track user history and allow admins to audit/approve user-submitted foods.

---

## Proposed Changes

### 1. Image Upload & Preference-Aligned Storage

We will store uploaded images in a temporary directory during the recognition phase. Once the user confirms and logs the food, we will move the image to a permanent folder structured by the user's dietary preferences (e.g., `public/uploads/<dietType>/`), and store the URL in the database under the `Meal` record's `imageUrl` field. We will verify that we do not overwrite existing images.

#### [MODIFY] [route.ts (food-recognize)](file:///c:/Users/SAYYED%20HABEEB/Downloads/SwapFit/Z%20ai%20swapp/src/app/api/food-recognize/route.ts)
* Receive the image upload and write it temporarily to `public/uploads/temp/` with a unique ID format: `temp-<userId>-<timestamp>.<ext>`.
* Return the relative `tempImagePath` (e.g., `/uploads/temp/temp-userId-timestamp.jpg`) in the response so the frontend can reference it.

#### [MODIFY] [route.ts (confirm)](file:///c:/Users/SAYYED%20HABEEB/Downloads/SwapFit/Z%20ai%20swapp/src/app/api/food-recognize/confirm/route.ts)
* Accept `tempImagePath` in the `ConfirmBody` request payload.
* Fetch the user's `UserPreference` (specifically `dietType`, e.g., `veg`, `vegan`, `non-veg`) to determine the target subfolder. Fallback to `'general'` if no preference is set.
* For the matched or newly created meal:
  * Check if the `Meal.imageUrl` is already set in the database.
  * If `imageUrl` is empty or null, move the file from the temporary directory to `public/uploads/<dietType>/<mealName>-<timestamp>.<ext>` and update the `Meal` database record with the new URL.
  * If `imageUrl` already exists, do **not** replace it; keep the existing image and delete the temporary uploaded file to clean up disk space.
* Also update `imageFilePath` in `UnknownFoodSubmission` if applicable.

#### [MODIFY] [UploadView.tsx](file:///c:/Users/SAYYED%20HABEEB/Downloads/SwapFit/Z%20ai%20swapp/src/components/nutriai/UploadView.tsx)
* Update `handleRecognize` state to store `tempImagePath` returned by `/api/food-recognize`.
* Update `handleConfirmAndLog` to pass `tempImagePath` to `/api/food-recognize/confirm`.

---

### 2. UI Updates: Recommending Meals with Food Images

We will update the frontend views to correctly fetch and display the `imageUrl` for recommendations, search results, and logs.

#### [MODIFY] [DashboardView.tsx](file:///c:/Users/SAYYED%20HABEEB/Downloads/SwapFit/Z%20ai%20swapp/src/components/nutriai/DashboardView.tsx)
* Map `imageUrl: meal.imageUrl` instead of `imageUrl: null` in the `handleLogFromSearch` (line 201) and logged items list mapping (line 621).
* Update recommendation card render (`recs.map((rec) => ...)`):
  * If `rec.meal.imageUrl` is set, render a small rounded image preview on the left of the meal details.
* Update meal detail sheet render:
  * If `detailSheet.rec.meal.imageUrl` is set, render a large, high-quality image header at the top of the details panel.

---

### 3. Dynamic Slot Targets Based on Remaining Macro Budget

We will adjust the slot target calculation to subtract already consumed macros, distributing the *remaining* target daily protein, carbs, and fat dynamically.

#### [MODIFY] [nutrition-engine.ts](file:///c:/Users/SAYYED%20HABEEB/Downloads/SwapFit/Z%20ai%20swapp/src/lib/nutrition-engine.ts)
* Modify `getSlotTargets` signature to accept a `consumed` object:
  ```typescript
  export interface ConsumedTargets {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }
  ```
* Compute remaining macros dynamically (e.g. `remainingProtein = Math.max(0, dailyTargets.proteinG - consumed.proteinG)`) and distribute them among the remaining slots.

#### [MODIFY] [route.ts (recommendations)](file:///c:/Users/SAYYED%20HABEEB/Downloads/SwapFit/Z%20ai%20swapp/src/app/api/recommendations/route.ts)
* Pass `consumed` macros from `dailyNutrition` (calories, protein, carbs, fat) to `getSlotTargets` instead of just a number of calories.

#### [MODIFY] [route.ts (meal-plan generate)](file:///c:/Users/SAYYED%20HABEEB/Downloads/SwapFit/Z%20ai%20swapp/src/app/api/meal-plan/generate/route.ts)
* Pass the consumed calorie and macro object to `getSlotTargets` in both plan generation and single slot generation logic blocks.

---

## Verification Plan

### Automated & Manual Verification
* **Image Storage & Display Checks:**
  * Upload a food photo, confirm, and verify it moves to the permanent folder.
  * Verify the image displays on the dashboard cards and in the detail sheets.
  * Ensure user-submitted meals show up in search results and recommendations with their saved images.
* **Macro Recommendation Update Checks:**
  * Log a food item. Check the recommendations view and confirm that the recommended targets for remaining slots have updated dynamically based on remaining macros.
