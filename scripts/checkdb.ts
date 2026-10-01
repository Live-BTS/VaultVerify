import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const main = async () => {
  const [agencies, candidates, requests, responses, skillVerifs, flags] = await Promise.all([
    db.agency.count(),
    db.candidate.count(),
    db.referenceRequest.count(),
    db.referenceResponse.count(),
    db.skillVerification.count(),
    db.fraudFlag.count(),
  ]);
  console.log({ agencies, candidates, requests, responses, skillVerifs, flags });
  const responses2 = await db.referenceResponse.findMany({ select: { id: true, requestId: true } });
  console.log("responses:", responses2);
};
main().finally(() => process.exit(0));
