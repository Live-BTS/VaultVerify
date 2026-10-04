"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Spinner, VaultMark } from "../brand";
import { BadgeCheck, CalendarDays, Clock, Eye, FileBadge, ShieldCheck, XCircle } from "lucide-react";

// ── Public reference share view (/?rs=<token>) ──────────────────────────
// What a recruiter, hiring manager, or anyone the candidate shared with sees:
// the signed, verified reference report — read-only and audit-trailed.

interface ReportPayload {
  ok: true;
  link: { accessType: string; durationDays: number | null; expiresAt: string | null; createdAt: string; label: string; justConsumed: boolean };
  report: {
    agency: { name: string; logoText: string; primaryColor: string; accentColor: string };
    candidate: { fullName: string; role: string; specialtyLabel: string; city: string; state: string };
    referrer: { refName: string; refTitle: string; facilityName: string; facilityCity: string; facilityState: string; relationship: string; dates: string };
    response: {
      identityMethod: string;
      verifiedDomain: string | null;
      overallRating: number | null;
      answers: { key: string; question: string; value: string }[];
      remarks: string;
      q8Discipline: boolean;
      signatureName: string;
      signedAt: string;
      durationSeconds: number;
    };
    completedAt: string | null;
  };
}

type FailReason = "invalid" | "used" | "expired";

const fmt = (d: string | Date | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export function ReferenceShareView({ token, onExit }: { token: string; onExit: () => void }) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<"loading" | "ok" | FailReason>("loading");
  const [payload, setPayload] = useState<ReportPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/reference/share", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve", token }),
        });
        const d = await res.json();
        if (cancelled) return;
        if (d.ok) { setPayload(d); setState("ok"); } else setState(d.reason ?? "invalid");
      } catch { if (!cancelled) setState("invalid"); }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (state === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f9f5]"><Spinner label="Opening the shared reference…" /></div>;
  }

  if (state !== "ok" || !payload) {
    const meta = {
      invalid: { title: "This link isn't valid", body: "The share link was revoked or never existed. Ask the candidate for a fresh one." },
      used: { title: "This one-time link was already viewed", body: "One-time links open exactly once. Ask the candidate to share a new link." },
      expired: { title: "This link has expired", body: "The access window closed. Ask the candidate to extend it or send a fresh link." },
    }[state as FailReason];
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f9f5] px-4">
        <div className="w-full max-w-md rounded-2xl border border-vault-border bg-white vv-card-shadow p-8 text-center">
          <XCircle className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-3 text-lg font-semibold text-jade-ink">{meta.title}</h1>
          <p className="mt-2 text-sm text-jade-muted">{meta.body}</p>
          <Button variant="outline" className="mt-6 w-full" onClick={onExit}>Back to home</Button>
        </div>
      </div>
    );
  }

  const { report, link } = payload;
  const banner = report.agency.primaryColor || "#03363d";
  const rating = report.response.overallRating;

  return (
    <div className="vv-page min-h-screen">
      {/* banner */}
      <div style={{ backgroundColor: banner }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90"><VaultMark size={26} /></div>
            <div className="leading-tight text-white">
              <p className="text-sm font-semibold">{report.agency.name}</p>
              <p className="text-[11px] text-white/80">Verified reference report</p>
            </div>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white">
            <ShieldCheck className="h-3 w-3" /> Signed & audit-trailed
          </span>
        </div>
      </div>

      <motion.main {...(reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } })}
        className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">

        {link.justConsumed && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#5f87ae]/40 bg-[#eef4fa] p-3 text-xs font-medium text-[#123c54]">
            <Eye className="h-4 w-4" /> One-time link consumed — this view is the single opening of this share.
          </div>
        )}

        {/* candidate + rating hero */}
        <div className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-lg font-bold text-jade-ink">
                {report.candidate.fullName}, {report.candidate.role}
                <BadgeCheck className="h-5 w-5 text-verify-green" />
              </p>
              <p className="mt-0.5 text-sm text-jade-muted">
                {report.candidate.specialtyLabel} · {report.candidate.city}, {report.candidate.state}
              </p>
              <p className="mt-1 text-xs text-jade-muted">
                Reference from <strong className="text-jade-ink">{report.referrer.refName}</strong>, {report.referrer.refTitle} · {report.referrer.facilityName}
              </p>
            </div>
            <div className="text-center">
              <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 border-verify-green/70 bg-verify-green/10">
                <span className="text-2xl font-bold text-verify-ink">{rating != null ? rating.toFixed(1) : "—"}</span>
                <span className="text-[10px] font-semibold text-jade-muted">out of 5</span>
              </div>
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-jade-muted">Overall rating</p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 border-t border-vault-border/60 pt-4 text-xs sm:grid-cols-2">
            <Fact icon={FileBadge} label="Working relationship" value={report.referrer.relationship || "—"} />
            <Fact icon={CalendarDays} label="Dates worked together" value={report.referrer.dates || "—"} />
            <Fact icon={ShieldCheck} label="Identity anchor"
              value={report.response.identityMethod === "ACCOUNT" ? "VaultVerify account created with the candidate-provided email"
                : report.response.identityMethod === "EMAIL_DOMAIN" ? `Employer email domain (${report.response.verifiedDomain ?? ""})`
                : report.response.identityMethod === "CALLBACK_CODE" ? "Phone callback code" : "Signed single-use link"} />
            <Fact icon={Clock} label="Signed on" value={`${fmt(report.response.signedAt)} · ${Math.round(report.response.durationSeconds / 60)} min to complete`} />
          </div>
        </div>

        {/* the verified answers */}
        <div className="mt-5 rounded-2xl border border-vault-border bg-white vv-card-shadow p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-verify-ink/90">Verification answers</p>
          <div className="mt-3 divide-y divide-vault-border/60">
            {report.response.answers.map((a, i) => (
              <div key={a.key} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5">
                <p className="min-w-0 flex-1 text-sm text-jade-ink"><span className="mr-1.5 text-jade-muted">{i + 1}.</span>{a.question}</p>
                <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold",
                  a.value.startsWith("5") || a.value === "Yes" ? "border-verify-green/40 bg-verify-green/10 text-verify-ink"
                  : a.value.startsWith("1") || a.value.startsWith("2") ? "border-rose-200 bg-rose-50 text-rose-600"
                  : a.value.startsWith("3") || a.value.startsWith("4") ? "border-[#5f87ae]/40 bg-[#5f87ae]/10 text-[#123c54]"
                  : "border-vault-border bg-jade-ink/5 text-jade-muted")}>
                  {a.value}
                </span>
              </div>
            ))}
          </div>

          {report.response.remarks && (
            <div className="mt-4 rounded-xl border border-vault-border bg-[#f4f9f5] p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-verify-ink/90">Reference remarks</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-jade-ink">{report.response.remarks}</p>
            </div>
          )}
        </div>

        {/* signature */}
        <div className="mt-5 rounded-2xl border border-vault-border bg-white vv-card-shadow p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-verify-ink/90">E-signature</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-serif text-2xl italic text-jade-ink">{report.response.signatureName}</p>
              <p className="mt-1 text-xs text-jade-muted">
                {report.referrer.refName}, {report.referrer.refTitle} · signed {fmt(report.response.signedAt)}
              </p>
            </div>
            <p className="rounded-lg bg-[#f0f6f2] px-3 py-1.5 text-[11px] font-medium text-[#33565b]">
              Typed e-signature · IP & device recorded · tamper-evident audit trail
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-[#8aa29c]">
          Shared by {report.candidate.fullName} via VaultVerify{link.label ? ` — “${link.label}”` : ""}
          {link.accessType === "DURATION" && link.expiresAt ? ` · access until ${fmt(link.expiresAt)}` : " · one-time access"} · report belongs to the verification record
        </p>
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={onExit} className="border-vault-border text-jade-ink">Back to home</Button>
        </div>
      </motion.main>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-vault-border/70 bg-[#f7fbf8] px-3 py-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verify-ink" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-jade-muted">{label}</p>
        <p className="truncate text-xs font-medium text-jade-ink" title={value}>{value}</p>
      </div>
    </div>
  );
}
