-- CreateTable
CREATE TABLE "BirthChart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "birthDate" TEXT NOT NULL,
    "birthTime" TEXT NOT NULL,
    "placeLabel" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "timezone" TEXT NOT NULL,
    "utcDateTime" TEXT NOT NULL,
    "chartData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
