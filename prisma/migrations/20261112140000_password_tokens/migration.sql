-- AlterTable
ALTER TABLE `User` ADD COLUMN `passwordSetAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `PasswordToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `purpose` ENUM('RESET', 'INVITE') NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordToken_userId_purpose_idx`(`userId`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PasswordToken` ADD CONSTRAINT `PasswordToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Contas existentes já têm senha definida (só convites novos ficam com passwordSetAt nulo)
UPDATE `User` SET `passwordSetAt` = `createdAt` WHERE `passwordSetAt` IS NULL;
