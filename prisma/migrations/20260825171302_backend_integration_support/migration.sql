/*
  Warnings:

  - A unique constraint covering the columns `[swappUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `meal` ADD COLUMN `externalId` VARCHAR(191) NULL,
    ADD COLUMN `imageSearchName` VARCHAR(191) NULL,
    ADD COLUMN `nutritionStatus` VARCHAR(191) NOT NULL DEFAULT 'verified';

-- AlterTable
ALTER TABLE `mealplanitem` ADD COLUMN `rankPosition` INTEGER NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `swappUserId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `userpreference` ADD COLUMN `allergies` VARCHAR(191) NULL,
    ADD COLUMN `avoidedFoods` VARCHAR(191) NULL,
    ADD COLUMN `cuisines` VARCHAR(191) NULL,
    ADD COLUMN `meals` VARCHAR(191) NULL,
    ADD COLUMN `otherInfo` VARCHAR(191) NULL,
    ADD COLUMN `skipDays` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `AiConversation` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AiConversation_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiMessage` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AiMessage_conversationId_idx`(`conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `User_swappUserId_key` ON `User`(`swappUserId`);

-- AddForeignKey
ALTER TABLE `AiConversation` ADD CONSTRAINT `AiConversation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiMessage` ADD CONSTRAINT `AiMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `AiConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
