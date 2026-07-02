-- CreateTable
CREATE TABLE "TransitChart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chartId" TEXT NOT NULL,
    "targetDate" TEXT NOT NULL,
    "transitData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransitChart_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "BirthChart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TransitChart_chartId_targetDate_key" ON "TransitChart"("chartId", "targetDate");
