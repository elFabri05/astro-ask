-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Interpretation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chartId" TEXT NOT NULL,
    "transitChartId" TEXT,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Interpretation_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "BirthChart" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Interpretation_transitChartId_fkey" FOREIGN KEY ("transitChartId") REFERENCES "TransitChart" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Interpretation" ("chartId", "content", "createdAt", "id", "model", "transitChartId", "type") SELECT "chartId", "content", "createdAt", "id", "model", "transitChartId", "type" FROM "Interpretation";
DROP TABLE "Interpretation";
ALTER TABLE "new_Interpretation" RENAME TO "Interpretation";
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("content", "createdAt", "id", "role", "sessionId") SELECT "content", "createdAt", "id", "role", "sessionId" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chartId" TEXT NOT NULL,
    "transitChartId" TEXT,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "BirthChart" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_transitChartId_fkey" FOREIGN KEY ("transitChartId") REFERENCES "TransitChart" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("chartId", "createdAt", "id", "title", "transitChartId") SELECT "chartId", "createdAt", "id", "title", "transitChartId" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE TABLE "new_TransitChart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chartId" TEXT NOT NULL,
    "targetDate" TEXT NOT NULL,
    "transitData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransitChart_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "BirthChart" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TransitChart" ("chartId", "createdAt", "id", "targetDate", "transitData") SELECT "chartId", "createdAt", "id", "targetDate", "transitData" FROM "TransitChart";
DROP TABLE "TransitChart";
ALTER TABLE "new_TransitChart" RENAME TO "TransitChart";
CREATE UNIQUE INDEX "TransitChart_chartId_targetDate_key" ON "TransitChart"("chartId", "targetDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
