-- AlterTable
ALTER TABLE `MealIngredient` ADD COLUMN `amountGrams` DOUBLE NULL,
    ADD COLUMN `ingredientId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `unknownfoodsubmission` ADD COLUMN `baseServingGms` INTEGER NULL,
    ADD COLUMN `computedNutritionJson` VARCHAR(191) NULL,
    ADD COLUMN `ingredientsJson` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Ingredient` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isVeg` BOOLEAN NOT NULL DEFAULT true,
    `isVegan` BOOLEAN NOT NULL DEFAULT true,
    `containsAllergen` BOOLEAN NOT NULL DEFAULT false,
    `caloriesPer100g` DOUBLE NOT NULL,
    `proteinPer100g` DOUBLE NOT NULL,
    `carbsPer100g` DOUBLE NOT NULL,
    `fatPer100g` DOUBLE NOT NULL,
    `fiberPer100g` DOUBLE NULL,
    `sugarPer100g` DOUBLE NULL,
    `sodiumMgPer100g` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Ingredient_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MealIngredient` ADD CONSTRAINT `MealIngredient_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
