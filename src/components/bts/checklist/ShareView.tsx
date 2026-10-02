"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { shareAccessLabel } from "@/lib/bts/constants";
import { RATING_4, specialtyLabel } from "@/lib/bts/checklistShared";
import { VaultMark, Spinner } from "../brand";
import { CalendarClock, Download, Eye, Flame, ShieldCheck, Timer, XCircle } from "lucide-react";

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
type ResolveFail = { ok: false; reason: "invalid" | "used" | "expired" | "checklist_expired" };

interface Answer { category: string; skill: string; questionType: string; value: number | string | null; na: boolean; highRisk: boolean }

const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function ShareView({ token, onExit }: { token: string; onExit: () => void }) {
  const [state, setState] = useState<"loading" | "ok" | ResolveFail["reason"]>("loading");
  const [payload, setPayload] = useState<ResolveOk | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/checklist/share", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve", token }),
        });
        const d = (await res.json()) as ResolveOk | ResolveFail;
        if (d.ok) {
          setPayload(d);
          // answers come embedded in the completion? No — fetch via the same link for the PDF data:
          // simplest: derive from a second call is wasteful; instead the resolve could return answers.
          // We fetch the checklist JSON through the share endpoint variant below.
          const ares = await fetch(`/api/checklist/share/answers?token=${encodeURIComponent(token)}`);
          if (ares.ok) { const ad = await ares.json(); if (ad.ok) setAnswers(ad.answers); }
          setState("ok");
        } else {
          setState((d as ResolveFail).reason ?? "invalid");
        }
      } catch { setState("invalid"); }
    })();
  }, [token]);

  if (state === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-vault-dark"><Spinner label="Opening the shared checklist…" /></div>;
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
      <div className="vv-dark flex min-h-screen items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-2xl border border-vault-border bg-vault-teal/20 p-8 text-center backdrop-blur-md">
          <VaultMark size={44} />
          <XCircle className="mx-auto mt-4 h-8 w-8 text-rose-400" />
          <h1 className="mt-3 text-lg font-semibold text-verify-light">{m.title}</h1>
          <p className="mt-2 text-sm text-[#8fb0ab]">{m.body}</p>
          <Button variant="ghost" onClick={onExit} className="mt-6 border border-vault-border text-[#8fb0ab] hover:text-verify-light">← Back to site</Button>
        </motion.div>
      </div>
    );
  }

  const { link, completion } = payload;
  const categories = answers.reduce<Record<string, Answer[]>>((acc, a) => { (acc[a.category] ??= []).push(a); return acc; }, {});

  return (
    <div className="vv-dark min-h-screen">
      <header className="sticky top-0 z-40 border-b border-vault-border/70 bg-vault-dark/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <VaultMark size={30} />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-verify-light">Vault<span className="text-verify-green">Verify</span> <span className="ml-1 rounded bg-verify-green/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-verify-green">Shared checklist</span></p>
              <p className="text-[11px] text-[#8fb0ab]">Self-assessment · completed by the candidate</p>
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
              ? <Eye className="h-5 w-5 text-amber-400" />
              : <Timer className="h-5 w-5 text-verify-green" />}
            <div>
              <p className="text-sm font-semibold text-verify-light">
                {link.accessType === "ONE_TIME" ? "One-time access — this view is the only one" : `${link.durationDays}-day access`}
              </p>
              <p className="text-xs text-[#8fb0ab]">
                {link.accessType === "ONE_TIME"
                  ? (link.justConsumed ? "This link is now burned — save the PDF if you need it." : "Opening this page consumes the link. Download the PDF to keep a copy.")
                  : `Valid until ${link.expiresAt ? fmt(link.expiresAt) : "—"}`}
                {link.label ? ` · ${link.label}` : ""}
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-vault-border px-3 py-1 text-[11px] text-[#8fb0ab]">
            <CalendarClock className="h-3 w-3" /> Checklist valid until {fmt(completion.expiresAt)}
          </span>
        </motion.div>

        {/* candidate card */}
        <div className="mt-6 rounded-2xl border border-vault-border bg-vault-teal/20 p-6 backdrop-blur-md">
          <p className="text-xl font-semibold text-verify-light">{completion.candidateName}</p>
          <p className="mt-1 text-sm text-[#8fb0ab]">
            {completion.candidateTitle} · {completion.specialtyLabel || specialtyLabel(completion.specialty)} · {completion.profession} · {completion.yearsExperience} yr experience
          </p>
          <p className="mt-1 text-xs text-[#5c7a76]">Completed {fmt(completion.completedAt)} · Self-reported assessment verified against the {completion.jobTitle} skill template</p>
        </div>

        {/* answers */}
        {Object.entries(categories).map(([cat, items], ci) => (
          <motion.section key={cat} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * ci, duration: 0.4 }}
            className="mt-6">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-verify-green/90">{cat}</h2>
            <div className="overflow-hidden rounded-xl border border-vault-border bg-vault-teal/20 backdrop-blur-md">
              {items.map((a, i) => (
                <div key={a.skill} className={cn("flex items-center justify-between gap-4 px-4 py-3 sm:px-5", i > 0 && "border-t border-vault-border/50")}>
                  <p className="text-sm text-verify-light">
                    {a.highRisk && <Flame className="mr-1.5 inline h-3.5 w-3.5 text-amber-400" />}
                    {a.skill}
                  </p>
                  {a.na ? (
                    <span className="rounded-full border border-vault-border px-2.5 py-0.5 text-xs font-semibold text-[#8fb0ab]">N/A</span>
                  ) : a.questionType === "rating_1_4" ? (
                    <span className="flex items-center gap-2">
                      <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
                        Number(a.value) >= 4 ? "bg-verify-green/20 text-verify-green" : Number(a.value) === 3 ? "bg-teal-500/20 text-teal-300" : "bg-amber-500/15 text-amber-400")}>
                        {String(a.value)}
                      </span>
                      <span className="hidden max-w-40 text-right text-[11px] text-[#8fb0ab] sm:block">{RATING_4.find((r) => r.value === Number(a.value))?.label}</span>
                    </span>
                  ) : (
                    <span className="text-sm font-semibold capitalize text-verify-light">{String(a.value ?? "-")}</span>
                  )}
                </div>
              ))}
            </div>
          </motion.section>
        ))}

        <p className="mt-8 flex items-center justify-center gap-2 text-[11px] text-[#5c7a76]">
          <ShieldCheck className="h-3.5 w-3.5" /> Shared through VaultVerify — access rules and views are logged for the candidate.
        </p>
      </main>
    </div>
  );
}
