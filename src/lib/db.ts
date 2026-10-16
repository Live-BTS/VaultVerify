import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logs include bound parameters (hashes, tokens) — never print them in
    // production. Enable explicitly with LOG_PRISMA_QUERIES=1 when debugging.
    log: process.env.NODE_ENV !== "production" || process.env.LOG_PRISMA_QUERIES === "1" ? ["query"] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db