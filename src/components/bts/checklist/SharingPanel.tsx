"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { specialtyLabel } from "@/lib/bts/constants";
import { Spinner } from "../brand";
import { CalendarClock, Check, Copy, Eye, Infinity as InfinityIcon, Link2, ShieldOff, Users } from "lucide-react";

// ── Controlled Sharing — the candidate's share ledger ──
// Every checklist share link they've ever created (revoke / extend / copy)
// plus the recruiters who can see their verified references.

export interface ShareCompletion {
  id: string;
  specialtyLabel: string;
  jobTitle: string;
  expired: boolean;
  shareLinks: {
    id: string;
    token: string;
    accessType: string;
    durationDays: number | null;
    label: string;
    createdAt: string;
    expiresAt: string | null;
    viewedAt: string | null;
    viewCount: number;
    revoked: boolean;
  }[];
}

export interface RecruiterAccess {
  id: string;
  recruiterName: string;
  facilityName: string;
  status: string;
  createdAt: string;
}

export interface RefShareRow {
  id: string;
  token: string;
  requestId: string;
  refName: string;
  refTitle: string;
  facilityName: string;
  completed: boolean;
  status: string;
  accessType: string;
  durationDays: number | null;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  viewedAt: string | null;
  viewCount: number;
  revoked: boolean;
}

const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

type LinkState = "active" | "used" | "expired" | "revoked";

function linkState(l: { revoked: boolean; accessType: string; viewedAt: string | null; expiresAt: string | null }): LinkState {
  if (l.revoked) return "revoked";
  if (l.accessType === "ONE_TIME" && l.viewedAt) return "used";
  if (l.expiresAt && new Date(l.expiresAt) < new Date()) return "expired";
  return "active";
}

const STATE_META: Record<LinkState, { label: string; cls: string }> = {
  active: { label: "Active", cls: "border-verify-green/40 bg-verify-green/10 text-verify-ink" },
  used: { label: "Viewed (one-time)", cls: "border-[#5f87ae]/40 bg-[#5f87ae]/10 text-[#123c54]" },
  expired: { label: "Expired", cls: "border-vault-border bg-jade-ink/5 text-jade-muted" },
  revoked: { label: "Revoked", cls: "border-rose-300 bg-rose-50 text-rose-600" },
};

export function SharingPanel({ completions, refShares, recruiterAccess, onChanged }: {
  completions: ShareCompletion[];
  refShares: RefShareRow[];
  recruiterAccess: RecruiterAccess[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      completions.flatMap((c) =>
        c.shareLinks.map((l) => ({ ...l, completion: c, state: linkState(l) })),
      ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [completions],
  );
  const refRows = useMemo(
    () => refShares.map((l) => ({ ...l, state: linkState(l) })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [refShares],
  );
  const activeCount = rows.filter((r) => r.state === "active").length;
  const activeTotal = activeCount + refRows.filter((r) => r.state === "active").length;

  const act = async (endpoint: "checklist" | "reference", token: string, action: "revoke" | "extend", days?: number) => {
    setBusy(token + action);
    try {
      const res = await fetch(`/api/${endpoint}/share`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, token, days }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Action failed");
      toast({ title: action === "revoke" ? "Link revoked — nobody can open it now" : `Access extended by ${days} day(s)` });
      onChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Action failed", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      {/* reference share ledger — the verified references the candidate controls */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-verify-ink/90"><Users className="h-4 w-4" /> Reference share links</h2>
            <p className="mt-1 text-xs text-jade-muted">Your completed references, shared on your terms — revoke kills access instantly, extend pushes the expiry out.</p>
          </div>
          <span className="rounded-full border border-verify-green/40 bg-verify-green/10 px-3 py-1 text-xs font-semibold text-verify-ink">
            {refRows.filter((r) => r.state === "active").length} active
          </span>
        </div>
        <div className="mt-3 space-y-3">
          {refRows.map((l) => {
            const meta = STATE_META[l.state];
            const actionable = l.state === "active";
            return (
              <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-jade-ink">
                      Reference — {l.refName} <span className="font-normal text-jade-muted">· {l.refTitle}{l.facilityName ? `, ${l.facilityName}` : ""}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-jade-muted">
                      <span className="font-mono text-verify-ink">/?rs={l.token.slice(0, 10)}…</span>
                      {l.label && <span className="italic">“{l.label}”</span>}
                      <span>created {fmt(l.createdAt)}</span>
                      {l.accessType === "ONE_TIME"
                        ? <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> one-time · {l.viewedAt ? `viewed ${fmt(l.viewedAt)}` : "unopened"}</span>
                        : <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {l.expiresAt && new Date(l.expiresAt) > new Date() ? `until ${fmt(l.expiresAt)}` : "expired"}</span>}
                      {l.viewCount > 0 && <span>{l.viewCount} view{l.viewCount > 1 ? "s" : ""}</span>}
                    </p>
                  </div>
                  <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", meta.cls)}>{meta.label}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" className="text-jade-muted hover:text-jade-ink"
                    disabled={l.state === "revoked"}
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?rs=${l.token}`).then(() => toast({ title: "Link copied" }))}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button size="sm" variant="ghost" className="text-jade-muted hover:text-jade-ink"
                    onClick={() => window.open(`/?rs=${l.token}`, "_blank")}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                  </Button>
                  {l.accessType === "DURATION" && actionable && (
                    <>
                      <Button size="sm" variant="outline" disabled={busy === l.token + "extend"} onClick={() => act("reference", l.token, "extend", 7)}
                        className="border-vault-border text-jade-ink hover:bg-verify-green/10">+ 7 days</Button>
                      <Button size="sm" variant="outline" disabled={busy === l.token + "extend"} onClick={() => act("reference", l.token, "extend", 30)}
                        className="border-vault-border text-jade-ink hover:bg-verify-green/10">+ 30 days</Button>
                    </>
                  )}
                  {l.state !== "revoked" && (
                    <Button size="sm" variant="outline" disabled={busy === l.token + "revoke"}
                      onClick={() => act("reference", l.token, "revoke")}
                      className="ml-auto border-rose-200 text-rose-600 hover:bg-rose-50">
                      {busy === l.token + "revoke" ? <span className="mr-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" /> : <ShieldOff className="mr-1.5 h-3.5 w-3.5" />} Revoke access
                    </Button>
                  )}
                  {l.state === "revoked" && <span className="ml-auto text-[11px] text-jade-muted">Revoked links can't be restored — create a new one from the reference.</span>}
                </div>
              </motion.div>
            );
          })}

          {refRows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-vault-border bg-white/60 p-10 text-center">
              <Users className="mx-auto h-8 w-8 text-verify-ink/60" />
              <p className="mt-3 text-sm text-jade-muted">No reference shares yet. Open a completed reference in the References tab and press “Share” — every link you create shows up here.</p>
            </div>
          )}
        </div>
      </section>

      {/* checklist share ledger */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-verify-ink/90"><Link2 className="h-4 w-4" /> Skill checklist links</h2>
            <p className="mt-1 text-xs text-jade-muted">Every link you've created. Revoke kills access instantly; extend pushes the expiry out.</p>
          </div>
          <span className="rounded-full border border-verify-green/40 bg-verify-green/10 px-3 py-1 text-xs font-semibold text-verify-ink">{activeTotal} active</span>
        </div>

        <div className="mt-3 space-y-3">
          {rows.map((l) => {
            const meta = STATE_META[l.state];
            const actionable = l.state === "active";
            return (
              <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-jade-ink">
                      {l.completion.specialtyLabel} <span className="font-normal text-jade-muted">· {l.completion.jobTitle}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-jade-muted">
                      <span className="font-mono text-verify-ink">/?s={l.token.slice(0, 10)}…</span>
                      {l.label && <span className="italic">“{l.label}”</span>}
                      <span>created {fmt(l.createdAt)}</span>
                      {l.accessType === "ONE_TIME"
                        ? <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> one-time · {l.viewedAt ? `viewed ${fmt(l.viewedAt)}` : "unopened"}</span>
                        : <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {l.expiresAt && new Date(l.expiresAt) > new Date() ? `until ${fmt(l.expiresAt)}` : "expired"}</span>}
                      {l.viewCount > 0 && <span>{l.viewCount} view{l.viewCount > 1 ? "s" : ""}</span>}
                    </p>
                  </div>
                  <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", meta.cls)}>{meta.label}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" className="text-jade-muted hover:text-jade-ink"
                    disabled={l.state === "revoked"}
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?s=${l.token}`).then(() => toast({ title: "Link copied" }))}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                  </Button>
                  {l.accessType === "DURATION" && actionable && (
                    <>
                      <Button size="sm" variant="outline" disabled={busy === l.token + "extend"} onClick={() => act("checklist", l.token, "extend", 7)}
                        className="border-vault-border text-jade-ink hover:bg-verify-green/10">+ 7 days</Button>
                      <Button size="sm" variant="outline" disabled={busy === l.token + "extend"} onClick={() => act("checklist", l.token, "extend", 30)}
                        className="border-vault-border text-jade-ink hover:bg-verify-green/10">+ 30 days</Button>
                    </>
                  )}
                  {l.state !== "revoked" && (
                    <Button size="sm" variant="outline" disabled={busy === l.token + "revoke"}
                      onClick={() => act("checklist", l.token, "revoke")}
                      className="ml-auto border-rose-200 text-rose-600 hover:bg-rose-50">
                      {busy === l.token + "revoke" ? <span className="mr-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" /> : <ShieldOff className="mr-1.5 h-3.5 w-3.5" />} Revoke access
                    </Button>
                  )}
                  {l.state === "revoked" && <span className="ml-auto text-[11px] text-jade-muted">Revoked links can't be restored — create a new one from the checklist.</span>}
                </div>
              </motion.div>
            );
          })}

          {rows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-vault-border bg-white/60 p-10 text-center">
              <Link2 className="mx-auto h-8 w-8 text-verify-ink/60" />
              <p className="mt-3 text-sm text-jade-muted">No share links yet. Open one of your checklists and press “Share” — every link you create shows up here so you stay in control.</p>
            </div>
          )}
        </div>
      </section>

      {/* who requests their materials */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-verify-ink/90"><Users className="h-4 w-4" /> Recruiter requests</h2>
            <p className="mt-1 text-xs text-jade-muted">Recruiters who requested your materials — delivered directly, never public.</p>
          </div>
          <span className="rounded-full border border-vault-border px-3 py-1 text-xs font-semibold text-jade-muted">{recruiterAccess.length} recruiter request{recruiterAccess.length === 1 ? "" : "s"}</span>
        </div>
        <div className="mt-3 space-y-2">
          {recruiterAccess.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-vault-border bg-white vv-card-shadow px-4 py-3">
              <div>
                <p className="text-sm font-medium text-jade-ink">{r.recruiterName}{r.facilityName ? <span className="text-jade-muted"> · {r.facilityName}</span> : null}</p>
                <p className="text-xs text-jade-muted">Requested {fmt(r.createdAt)}</p>
              </div>
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                r.status === "COMPLETED" ? "border-verify-green/40 text-verify-ink" : "border-vault-border text-jade-muted")}>
                {r.status === "COMPLETED" && <Check className="h-3 w-3" />}
                {r.status === "COMPLETED" ? "Verified & delivered" : "Checklist requested"}
              </span>
            </div>
          ))}
          {recruiterAccess.length === 0 && (
            <div className="rounded-xl border border-dashed border-vault-border bg-white/60 p-6 text-center text-sm text-jade-muted">
              No recruiter requests yet — when a recruiter requests your checklist, their access to your verified references shows up here.
            </div>
          )}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[#8aa29c]">
          <InfinityIcon className="h-3 w-3" /> The signed reference itself is permanent — share links above are what you can revoke or extend at any time.
        </p>
      </section>
    </div>
  );
}
