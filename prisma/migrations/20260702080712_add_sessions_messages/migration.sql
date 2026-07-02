-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chartId" TEXT NOT NULL,
    "transitChartId" TEXT,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "BirthChart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Session_transitChartId_fkey" FOREIGN KEY ("transitChartId") REFERENCES "TransitChart" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
    CONSTRAINT "Interpretation_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "BirthChart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Interpretation_transitChartId_fkey" FOREIGN KEY ("transitChartId") REFERENCES "TransitChart" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Interpretation" ("chartId", "content", "createdAt", "id", "model", "type") SELECT "chartId", "content", "createdAt", "id", "model", "type" FROM "Interpretation";
DROP TABLE "Interpretation";
ALTER TABLE "new_Interpretation" RENAME TO "Interpretation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
