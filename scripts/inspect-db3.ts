import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const requests = await db.checklistRequest.findMany({
  where: { accountId: "cmuraz1v50000pdovl2d6f1e0" },
  select: { id: true, specialty: true, status: true, completion: { select: { id: true, specialty: true } } },
});
console.log("EMMA REQUESTS:", JSON.stringify(requests, null, 1));

// newest new-style completion for share testing
const c = await db.checklistCompletion.findFirst({
  orderBy: { completedAt: "desc" },
  where: { attestation: { not: "" } },
  select: { id: true, specialty: true, accountId: true, shareLinks: { select: { token: true, accessType: true, revoked: true, expiresAt: true, viewCount: true } } },
});
console.log("NEWEST ATTESTED COMPLETION:", c?.id, c?.specialty, "account:", c?.accountId);
console.log("SHARE LINKS:", JSON.stringify(c?.shareLinks?.map((s) => ({ token: s.token.slice(0, 8) + "...", type: s.accessType, revoked: s.revoked, views: s.viewCount }))));

await db.$disconnect();
