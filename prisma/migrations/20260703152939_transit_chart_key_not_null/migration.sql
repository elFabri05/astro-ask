/*
  Warnings:

  - Made the column `latitude` on table `TransitChart` required. This step will fail if there are existing NULL values in that column.
  - Made the column `longitude` on table `TransitChart` required. This step will fail if there are existing NULL values in that column.
  - Made the column `transitInstantUtc` on table `TransitChart` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TransitChart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chartId" TEXT NOT NULL,
    "transitInstantUtc" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "targetDate" TEXT NOT NULL,
    "localTime" TEXT,
    "timezone" TEXT,
    "placeLabel" TEXT,
    "transitData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransitChart_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "BirthChart" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TransitChart" ("chartId", "createdAt", "id", "latitude", "localTime", "longitude", "placeLabel", "targetDate", "timezone", "transitData", "transitInstantUtc") SELECT "chartId", "createdAt", "id", "latitude", "localTime", "longitude", "placeLabel", "targetDate", "timezone", "transitData", "transitInstantUtc" FROM "TransitChart";
DROP TABLE "TransitChart";
ALTER TABLE "new_TransitChart" RENAME TO "TransitChart";
CREATE UNIQUE INDEX "TransitChart_chartId_transitInstantUtc_latitude_longitude_key" ON "TransitChart"("chartId", "transitInstantUtc", "latitude", "longitude");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
