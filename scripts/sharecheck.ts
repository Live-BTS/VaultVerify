// Check share links state
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const links = await db.checklistShareLink.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, token: true, accessType: true, revoked: true, viewedAt: true, expiresAt: true, createdAt: true, completionId: true },
  });
  console.log(JSON.stringify(links, null, 1));
}
main().finally(() => db.$disconnect());
