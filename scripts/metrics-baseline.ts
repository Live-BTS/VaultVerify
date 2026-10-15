// READ-ONLY baseline metrics for VAULTVERIFY_PRODUCT_UX_PLAN.md (Option 2, Rev 2).
// SELECT-only Prisma queries against the sandbox SQLite DB. No writes anywhere.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const now = new Date();
  const completions = await db.checklistCompletion.count();
  const expiredChecklists = await db.checklistCompletion.count({ where: { expiresAt: { lt: now } } });
  const accounts = await db.checklistAccount.count();
  const invites = await db.checklistInvite.count();
  const shareLinks = await db.checklistShareLink.count();
  const oneTimeLinks = await db.checklistShareLink.count({ where: { accessType: "ONE_TIME" } });
  const revokedLinks = await db.checklistShareLink.count({ where: { revoked: true } });
  const liveLinks = await db.checklistShareLink.count({
    where: { revoked: false, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  });
  const views = await db.checklistShareLink.aggregate({ _sum: { viewCount: true } });
  const refRequests = await db.referenceRequest.count();
  const refByStatus = await db.referenceRequest.groupBy({ by: ["status"], _count: { _all: true } });
  const refResponses = await db.referenceResponse.count();
  const refShareLinks = await db.referenceShareLink.count();
  const notifications = await db.notificationLog.count();
  const auditEvents = await db.auditEvent.count();
  const activeSkillTemplates = await db.skillTemplate.count({ where: { active: true } });
  const recruiters = await db.recruiterAccount.count();

  console.log(
    JSON.stringify(
      {
        capturedAt: now.toISOString(),
        note: "sandbox demo data - illustrative baselines only",
        checklist: { completions, expiredChecklists, accounts, invites },
        sharing: { shareLinks, oneTimeLinks, revokedLinks, liveLinks, totalViews: views._sum.viewCount ?? 0 },
        references: { refRequests, refByStatus: refByStatus.map((g) => ({ status: g.status, n: g._count._all })), refResponses, refShareLinks },
        platform: { notifications, auditEvents, activeSkillTemplates, recruiters },
      },
      null,
      2
    )
  );
  await db.$disconnect();
}

main();
