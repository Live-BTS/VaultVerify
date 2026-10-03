"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { specialtyLabel, summarizeAnswers, type SkillAnswer } from "@/lib/bts/checklistShared";
import { VaultMark, Spinner } from "../brand";
import {
  AdditionalQuestionsView, AttestationView, AvgRing, CategoryBars, MixDonut, RecentDonut,
  RatingLegend, RecencyLegend, SectionHeading, SkillReportRow, type AdditionalAnswer, type AttestationData,
} from "./ReportBits";
import { CalendarClock, Download, Eye, ShieldCheck, Timer, XCircle } from "lucide-react";

// ── Public share view — what a recruiter (or anyone with the link) sees ──
// Shows the access rule (one-time / duration) and the completed checklist.

interface ResolveOk {
  ok: true;
  link: { accessType: string; durationDays: number | null; expiresAt: string | null; createdAt: string; label: string; justConsumed: boolean };
  completion: {
    candidateName: string; candidateTitle: string; email: string;
    profession: string; jobTitle: string; specialty: string; specialtyLabel: string;
    yearsExperience: number; completedAt: string; expiresAt: string;
  };
}
interface RefResolveOk {
  ok: true;
  link: ResolveOk["link"];
  reference: {
    candidateName: string; candidateTitle: string;
    refName: string; refTitle: string; facility: string;
    relationship: string; yearsKnown: number | null; wouldRehire: string;
    overallRating: number | null; signatureName: string; completedAt: string | null;
    ratings: Record<string, number>; strengths: string; comments: string;
  };
}
type ResolveFail = { ok: false; reason: "invalid" | "used" | "expired" | "checklist_expired" };

type Answer = SkillAnswer;

const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const REHIRE_LABEL: Record<string, string> = {
  YES: "Would rehire — without hesitation",
  WITH_RESERVATION: "Would rehire — with reservation",
  NO: "Would not rehire",
};

export function ShareView({ token, onExit }: { token: string; onExit: () => void }) {
  const [state, setState] = useState<"loading" | "ok" | "ref" | ResolveFail["reason"]>("loading");
  const [payload, setPayload] = useState<ResolveOk | null>(null);
  const [refPayload, setRefPayload] = useState<RefResolveOk | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [additional, setAdditional] = useState<AdditionalAnswer[]>([]);
  const [attestation, setAttestation] = useState<AttestationData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // try a skills-checklist share first, then a collected-reference share
        const res = await fetch("/api/checklist/share", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve", token }),
        });
        const d = (await res.json()) as ResolveOk | ResolveFail;
        if (cancelled) return;
        if (d.ok) {
          setPayload(d);
          const ares = await fetch(`/api/checklist/share/answers?token=${encodeURIComponent(token)}`);
          if (ares.ok) {
            const ad = await ares.json();
            if (ad.ok && !cancelled) {
              setAnswers(ad.answers ?? []);
              setAdditional(ad.additional ?? []);
              setAttestation(ad.attestation ?? null);
            }
          }
          setState("ok");
          return;
        }
        const firstReason = (d as ResolveFail).reason ?? "invalid";
        if (firstReason !== "invalid") { setState(firstReason); return; }
        // not a checklist link — try a reference share
        const rres = await fetch("/api/checklist/share", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolveRef", token }),
        });
        const rd = (await rres.json()) as RefResolveOk | ResolveFail;
        if (cancelled) return;
        if (rd.ok) { setRefPayload(rd); setState("ref"); return; }
        setState((rd as ResolveFail).reason ?? "invalid");
      } catch { if (!cancelled) setState("invalid"); }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // hooks must run unconditionally — compute the summary regardless of view state
  const summary = useMemo(() => summarizeAnswers(answers as SkillAnswer[]), [answers]);

  if (state === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f9f5]"><Spinner label="Opening the shared item…" /></div>;
  }

  // ── reference share mode ──
  if (state === "ref" && refPayload) {
    const { link, reference: rf } = refPayload;
    return (
      <div className="vv-page min-h-screen">
        <header className="sticky top-0 z-40 border-b border-vault-border/70 bg-white/85 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <VaultMark size={30} />
              <div className="leading-tight">
                <p className="text-sm font-semibold text-jade-ink">Vault<span className="text-verify-ink">Verify</span> <span className="ml-1 rounded bg-verify-green/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-verify-ink">Shared reference</span></p>
                <p className="text-[11px] text-jade-muted">Professional reference · collected & e-signed by the referee</p>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={cn("flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
              link.accessType === "ONE_TIME" ? "border-amber-400/40 bg-amber-400/10" : "border-verify-green/30 bg-verify-green/10")}>
            <div className="flex items-center gap-3">
              {link.accessType === "ONE_TIME" ? <Eye className="h-5 w-5 text-amber-600" /> : <Timer className="h-5 w-5 text-verify-ink" />}
              <div>
                <p className="text-sm font-semibold text-jade-ink">
                  {link.accessType === "ONE_TIME" ? "One-time access — this view is the only one" : `${link.durationDays}-day access`}
                </p>
                <p className="text-xs text-jade-muted">
                  {link.accessType === "ONE_TIME"
                    ? (link.justConsumed ? "This link is now burned — screenshot or print this page." : "Opening this page consumes the link.")
                    : `Valid until ${link.expiresAt ? fmt(link.expiresAt) : "—"}`}
                  {link.label ? ` · ${link.label}` : ""}
                </p>
              </div>
            </div>
          </motion.div>

          <div className="mt-6 rounded-2xl border border-vault-border bg-white vv-card-shadow p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-verify-ink/90">Candidate</p>
            <p className="mt-1 text-xl font-semibold text-jade-ink">{rf.candidateName}</p>
            <p className="mt-0.5 text-sm text-jade-muted">{rf.candidateTitle}</p>
            <div className="mt-4 border-t border-vault-border/60 pt-4">
              <p className="text-xs font-bold uppercase tracking-widest text-verify-ink/90">Referee</p>
              <p className="mt-1 text-lg font-semibold text-jade-ink">{rf.refName} <span className="text-sm font-normal text-jade-muted">· {rf.refTitle}</span></p>
              <p className="mt-0.5 text-sm text-jade-muted">
                {rf.facility ? `${rf.facility} · ` : ""}Relationship: {rf.relationship || "—"} · worked together {rf.yearsKnown ?? "—"} yr(s)
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-vault-border bg-white vv-card-shadow p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-widest text-verify-ink/90">Competency ratings</p>
              {rf.overallRating != null && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-verify-green/50 bg-verify-green/10 px-3 py-1 font-mono text-xs font-bold text-verify-ink">
                  Overall {rf.overallRating.toFixed(1)}/5
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(rf.ratings).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full border border-vault-border bg-white px-3 py-1.5 text-xs text-jade-muted">
                  {k} <strong className="text-jade-ink">{v}/5</strong>
                </span>
              ))}
            </div>
            <p className={cn("mt-4 rounded-xl border px-3.5 py-2.5 text-sm font-medium",
              rf.wouldRehire === "NO" ? "border-rose-200 bg-rose-50 text-rose-700" : rf.wouldRehire === "WITH_RESERVATION" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-verify-green/40 bg-verify-green/[0.08] text-verify-ink")}>
              {REHIRE_LABEL[rf.wouldRehire] ?? "Rehire intent not stated"}
            </p>
            {rf.strengths && <p className="mt-3 text-sm text-jade-muted"><span className="font-medium text-jade-ink">Strengths:</span> {rf.strengths}</p>}
            {rf.comments && <p className="mt-1.5 text-sm text-jade-muted"><span className="font-medium text-jade-ink">Comments:</span> {rf.comments}</p>}
            <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-jade-muted/80">
              E-signed: {rf.signatureName || "—"}{rf.completedAt ? ` · ${fmt(rf.completedAt)}` : ""} · immutable audit trail
            </p>
          </div>

          <p className="mt-8 flex items-center justify-center gap-2 text-[11px] text-[#8aa29c]">
            <ShieldCheck className="h-3.5 w-3.5" /> Shared through VaultVerify — access rules and views are logged for the candidate.
          </p>
        </main>
      </div>
    );
  }

  if (state !== "ok" || !payload) {
    const msg: Record<string, { title: string; body: string }> = {
      used: { title: "This one-time link was already viewed", body: "One-time links burn after the first open. Ask the candidate for a fresh link." },
      expired: { title: "This link has expired", body: "The access window the candidate set has closed. Ask them to share a new one." },
      checklist_expired: { title: "This checklist has expired", body: "The self-assessment passed its 1-year validity. The candidate needs to retake it." },
      invalid: { title: "Link not found", body: "This share link doesn't exist or was revoked by the candidate." },
    };
    const m = msg[state] ?? msg.invalid;
    return (
      <div className="vv-page flex min-h-screen items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-2xl border border-vault-border bg-white vv-card-shadow p-8 text-center">
          <VaultMark size={44} />
          <XCircle className="mx-auto mt-4 h-8 w-8 text-rose-600" />
          <h1 className="mt-3 text-lg font-semibold text-jade-ink">{m.title}</h1>
          <p className="mt-2 text-sm text-jade-muted">{m.body}</p>
          <Button variant="ghost" onClick={onExit} className="mt-6 border border-vault-border text-jade-muted hover:text-jade-ink">← Back to site</Button>
        </motion.div>
      </div>
    );
  }

  const { link, completion } = payload;
  const categories = answers.reduce<Record<string, Answer[]>>((acc, a) => { (acc[a.category] ??= []).push(a); return acc; }, {});

  return (
    <div className="vv-page min-h-screen">
      <header className="sticky top-0 z-40 border-b border-vault-border/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <VaultMark size={30} />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-jade-ink">Vault<span className="text-verify-ink">Verify</span> <span className="ml-1 rounded bg-verify-green/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-verify-ink">Shared checklist</span></p>
              <p className="text-[11px] text-jade-muted">Skills self-assessment · completed & e-signed by the candidate</p>
            </div>
          </div>
          <a href={`/api/checklist/pdf?share=${encodeURIComponent(token)}`} download>
            <Button size="sm" className="bg-verify-green text-vault-dark hover:bg-verify-green/90"><Download className="mr-1.5 h-3.5 w-3.5" /> Download PDF</Button>
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        {/* access banner — the recruiter can see how long they can access */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className={cn("flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
            link.accessType === "ONE_TIME" ? "border-amber-400/40 bg-amber-400/10" : "border-verify-green/30 bg-verify-green/10")}>
          <div className="flex items-center gap-3">
            {link.accessType === "ONE_TIME"
              ? <Eye className="h-5 w-5 text-amber-600" />
              : <Timer className="h-5 w-5 text-verify-ink" />}
            <div>
              <p className="text-sm font-semibold text-jade-ink">
                {link.accessType === "ONE_TIME" ? "One-time access — this view is the only one" : `${link.durationDays}-day access`}
              </p>
              <p className="text-xs text-jade-muted">
                {link.accessType === "ONE_TIME"
                  ? (link.justConsumed ? "This link is now burned — save the PDF if you need it." : "Opening this page consumes the link. Download the PDF to keep a copy.")
                  : `Valid until ${link.expiresAt ? fmt(link.expiresAt) : "—"}`}
                {link.label ? ` · ${link.label}` : ""}
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-vault-border px-3 py-1 text-[11px] text-jade-muted">
            <CalendarClock className="h-3 w-3" /> Checklist valid until {fmt(completion.expiresAt)}
          </span>
        </motion.div>

        {/* candidate card — matches the PDF report header */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-vault-border bg-white vv-card-shadow p-6">
          <div>
            <p className="text-xl font-semibold text-jade-ink">{completion.candidateName}</p>
            <p className="mt-1 text-sm text-jade-muted">
              {completion.candidateTitle} · {completion.specialtyLabel || specialtyLabel(completion.specialty)} · {completion.profession} · {completion.yearsExperience} yr experience
            </p>
            <p className="mt-1 text-xs text-[#8aa29c]">Completed {fmt(completion.completedAt)} · Self-reported assessment verified against the {completion.jobTitle} skill template</p>
          </div>
          <span className="rounded-full bg-verify-green/10 px-3 py-1 text-[11px] font-semibold text-verify-ink">{summary.total} skill(s) assessed</span>
        </div>

        {/* summary at a glance — donuts like the PDF */}
        <div className="mt-6 rounded-2xl border border-vault-border bg-white vv-card-shadow p-6">
          <SectionHeading right={<span className="text-[11px] text-jade-muted">Recent = performed within 3 months</span>}>Summary at a glance</SectionHeading>
          <div className="mt-4 flex flex-wrap items-center justify-around gap-6">
            <div className="text-center">
              <AvgRing avg={summary.avg} size={104} />
              <p className="mt-1.5 text-[11px] font-semibold text-jade-muted">Overall average</p>
            </div>
            <div className="text-center">
              <MixDonut summary={summary} size={104} />
              <p className="mt-1.5 text-[11px] font-semibold text-jade-muted">Rating mix</p>
            </div>
            <div className="text-center">
              <RecentDonut summary={summary} size={104} />
              <p className="mt-1.5 text-[11px] font-semibold text-jade-muted">Performed recently</p>
            </div>
          </div>
          <div className="mt-5 space-y-2 border-t border-vault-border/60 pt-4">
            <RatingLegend />
            <RecencyLegend />
          </div>
        </div>

        {/* category overview bars */}
        <div className="mt-6 rounded-2xl border border-vault-border bg-white vv-card-shadow p-6">
          <SectionHeading>Category overview</SectionHeading>
          <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <CategoryBars summary={summary} />
          </div>
        </div>

        {/* per-category skill tables — rating ring + recency pill per row */}
        {Object.entries(categories).map(([cat, items], ci) => (
          <motion.section key={cat} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * ci, duration: 0.4 }}
            className="mt-6">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-verify-ink/90">{cat}</h2>
            <div className="overflow-hidden rounded-xl border border-vault-border bg-white vv-card-shadow">
              {items.map((a, i) => <SkillReportRow key={a.skill} a={a as SkillAnswer} first={i === 0} />)}
            </div>
          </motion.section>
        ))}

        {/* additional questions */}
        {additional.length > 0 && (
          <div className="mt-6">
            <SectionHeading className="mb-3">Additional questions</SectionHeading>
            <AdditionalQuestionsView items={additional} />
          </div>
        )}

        {/* candidate attestation + signature */}
        {attestation && (
          <div className="mt-6">
            <AttestationView att={attestation} fallbackName={completion.candidateName} />
          </div>
        )}

        <p className="mt-8 flex items-center justify-center gap-2 text-[11px] text-[#8aa29c]">
          <ShieldCheck className="h-3.5 w-3.5" /> Shared through VaultVerify — access rules and views are logged for the candidate.
        </p>
      </main>
    </div>
  );
}
