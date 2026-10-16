import { describe, it, expect } from "vitest";
import { evaluateChecklistShare, isChecklistExpired } from "@/lib/bts/sharePolicy";
import { newToken } from "@/lib/bts/tokens";

const NOW = new Date("2026-10-16T12:00:00.000Z");

const baseLink = {
  revoked: false,
  accessType: "DURATION",
  viewedAt: null as Date | null,
  expiresAt: new Date(NOW.getTime() + 7 * 24 * 3600 * 1000) as Date | null,
};

const baseCompletion = { expiresAt: new Date(NOW.getTime() + 30 * 24 * 3600 * 1000) };

describe("isChecklistExpired — exact 30-day boundary", () => {
  it("is valid strictly before the boundary", () => {
    const c = { expiresAt: new Date(NOW.getTime() + 1) };
    expect(isChecklistExpired(c, NOW)).toBe(false);
  });

  it("is expired AT the boundary instant", () => {
    const c = { expiresAt: new Date(NOW.getTime()) };
    expect(isChecklistExpired(c, NOW)).toBe(true);
  });

  it("is expired after the boundary", () => {
    const c = { expiresAt: new Date(NOW.getTime() - 1) };
    expect(isChecklistExpired(c, NOW)).toBe(true);
  });

  it("a fresh completion is valid for exactly 30 days", () => {
    const completedAt = NOW;
    const expiresAt = new Date(completedAt.getTime() + 30 * 24 * 3600 * 1000);
    expect(isChecklistExpired({ expiresAt }, new Date(expiresAt.getTime() - 1))).toBe(false);
    expect(isChecklistExpired({ expiresAt }, expiresAt)).toBe(true);
  });
});

describe("evaluateChecklistShare — public share policy", () => {
  it("allows a live link to a live report", () => {
    const d = evaluateChecklistShare(baseLink, baseCompletion, NOW);
    expect(d.ok).toBe(true);
  });

  it("rejects a revoked link with 404 invalid", () => {
    const d = evaluateChecklistShare({ ...baseLink, revoked: true }, baseCompletion, NOW);
    expect(d.ok).toBe(false);
    expect(d.status).toBe(404);
    expect(d.reason).toBe("invalid");
  });

  it("rejects a missing link with 404 invalid", () => {
    const d = evaluateChecklistShare(null, baseCompletion, NOW);
    expect(d.ok).toBe(false);
    expect(d.status).toBe(404);
    expect(d.reason).toBe("invalid");
  });

  it("rejects a consumed one-time link with 403 used", () => {
    const d = evaluateChecklistShare({ ...baseLink, accessType: "ONE_TIME", viewedAt: new Date(NOW.getTime() - 1000) }, baseCompletion, NOW);
    expect(d.ok).toBe(false);
    expect(d.status).toBe(403);
    expect(d.reason).toBe("used");
  });

  it("allows an unconsumed one-time link", () => {
    const d = evaluateChecklistShare({ ...baseLink, accessType: "ONE_TIME", viewedAt: null }, baseCompletion, NOW);
    expect(d.ok).toBe(true);
  });

  it("rejects an expired link with 403 expired", () => {
    const d = evaluateChecklistShare({ ...baseLink, expiresAt: new Date(NOW.getTime() - 1) }, baseCompletion, NOW);
    expect(d.ok).toBe(false);
    expect(d.status).toBe(403);
    expect(d.reason).toBe("expired");
  });

  it("rejects when the LINK is valid but the REPORT expired — 403 checklist_expired", () => {
    const d = evaluateChecklistShare(baseLink, { expiresAt: new Date(NOW.getTime() - 1) }, NOW);
    expect(d.ok).toBe(false);
    expect(d.status).toBe(403);
    expect(d.reason).toBe("checklist_expired");
  });

  it("report-expiry wins even for a one-time link that was never consumed", () => {
    const d = evaluateChecklistShare({ ...baseLink, accessType: "ONE_TIME" }, { expiresAt: new Date(NOW.getTime()) }, NOW);
    expect(d.ok).toBe(false);
    expect(d.reason).toBe("checklist_expired");
  });
});

describe("newToken — capability-token entropy", () => {
  it("is 32 URL-safe characters", () => {
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("does not repeat across generations", () => {
    const set = new Set(Array.from({ length: 200 }, () => newToken()));
    expect(set.size).toBe(200);
  });
});
