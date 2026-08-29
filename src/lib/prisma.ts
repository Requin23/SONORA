import { PrismaClient } from "@prisma/client";

// Pattern standard Next.js : en dev, le hot-reload recree le module a chaque
// changement de fichier, ce qui ouvrirait une nouvelle connexion DB a chaque
// fois sans ce cache sur `globalThis`.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
