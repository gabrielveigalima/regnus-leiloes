-- AlterTable
ALTER TABLE `Listing` ADD COLUMN `detailAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Listing_sourceId_detailAt_idx` ON `Listing`(`sourceId`, `detailAt`);


-- Frazão e Biasi sempre leem a página do lote: já contam como detalhados.
UPDATE `Listing` SET `detailAt` = `lastSeenAt` WHERE `sourceId` IN ('frazao', 'biasi') AND `detailAt` IS NULL;
