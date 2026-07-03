-- DropIndex
DROP INDEX "TransitChart_chartId_targetDate_key";

-- AlterTable
ALTER TABLE "TransitChart" ADD COLUMN "latitude" REAL;
ALTER TABLE "TransitChart" ADD COLUMN "localTime" TEXT;
ALTER TABLE "TransitChart" ADD COLUMN "longitude" REAL;
ALTER TABLE "TransitChart" ADD COLUMN "placeLabel" TEXT;
ALTER TABLE "TransitChart" ADD COLUMN "timezone" TEXT;
ALTER TABLE "TransitChart" ADD COLUMN "transitInstantUtc" TEXT;
