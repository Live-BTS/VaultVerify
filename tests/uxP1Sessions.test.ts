import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { sha256 } from "@/lib/bts/auth";
import { db } from "@/lib/db";
import { POST as superadminPost } from "@/app/api/superadmin/route";

// UX P1 #11 behavioral pin: the console's sessions_status action returns
// counts-only live session numbers and reflects a created session.

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: async () => undefined, set: async () => {}, delete: async () => {} }),
}));

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const RUN = Date.now();

beforeAll(async () => {
  // one live candidate session so the live-count assertion is >= 1
  const acct = await db.checklistAccount.create({
    data: { email: `p1-sess-${RUN}@p1.local`, name: "P1 Sessions", passwordHash: sha256("x"), emailVerified: true },
  });
  const raw = `p1-sess-${RUN}-raw-session-id`;
  await db.checklistSession.create({
    data: { id: sha256(raw), accountId: acct.id, expiresAt: new Date(Date.now() + 86400_000) },
  });
});

describe("superadmin sessions_status (UX P1)", () => {
  it("refuses unauthenticated calls", async () => {
    const res = await superadminPost(jsonReq("/api/superadmin", { action: "sessions_status" }));
    expect([401, 403]).toContain(res.status);
  });

  it("returns counts-only live numbers per audience", async () => {
    const res = await superadminPost(jsonReq("/api/superadmin", {
      code: process.env.SUPERADMIN_CODE ?? "test-superadmin-code",
      action: "sessions_status",
    }));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(typeof d.live.candidate).toBe("number");
    expect(typeof d.live.recruiter).toBe("number");
    expect(typeof d.live.superadmin).toBe("number");
    expect(d.live.candidate).toBeGreaterThanOrEqual(1); // the session created above
  });
});
