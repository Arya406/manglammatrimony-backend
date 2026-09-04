import { PrismaClient } from "@prisma/client";
import { config } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  global.prismaGlobal ||
  new PrismaClient({
    log: config.nodeEnv === "development" ? ["warn", "error"] : ["error"],
  });

if (config.nodeEnv !== "production") {
  global.prismaGlobal = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("[DATABASE] Successfully connected to PostgreSQL via Prisma Client");
  } catch (error) {
    console.error("[DATABASE ERROR] Failed to connect to PostgreSQL database:", error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log("[DATABASE] Disconnected from PostgreSQL database");
}
