-- CreateTable
CREATE TABLE "Interpretation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chartId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Interpretation_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "BirthChart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
