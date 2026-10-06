/**
 * The one Prisma client for the whole app — the object every database query
 * goes through (`prisma.card.findMany(...)` and so on).
 *
 * Prisma is an ORM: prisma/schema.prisma describes the tables, and
 * `npx prisma generate` turns that into a typed client in node_modules.
 * Never create a second PrismaClient anywhere: import this one.
 */

import { PrismaClient } from "@prisma/client";

/**
 * Next.js hot-reloads modules in development, which would otherwise open a
 * new connection on every save until the pool is exhausted.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
