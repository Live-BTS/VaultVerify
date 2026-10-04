"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { QUESTIONS, Q8_EXPLANATION_PROMPT } from "@/lib/bts/questions";
import { RATING_SCALE } from "@/lib/bts/constants";
import { VaultMark } from "./brand";
import { ArrowRight, Lock, PartyPopper, ShieldCheck } from "lucide-react";

interface FlowContext {
  agency: { name: string; logoText: string; tagline: string; primaryColor: string; accentColor: string };
  candidate: { fullName: string; role: string; specialtyLabel: string; city: string; state: string };
  request: {
    id: string; refName: string; refTitle: string; refEmail: string; relationship: string;
    facilityName: string; facilityCity: string; facilityState: string;
    workStartDate: string; workEndDate: string; status: string; expired: boolean; expiresAt: string;
  };
  nurseSkills: { skillName: string; highRisk: boolean; proficiency: string; recencyMonths: number }[];
  response: { id: string } | null;
  flags: { type: string; severity: string; detail: string }[];
  accountExists?: boolean;
}

type AnswerMap = Record<string, { type: string; value: string | number | null; unableToObserve?: boolean }>;

const OTHER_OPTION = "Other working relationship";

// ── Reference form, redesigned ──────────────────────────────────────────
// One scrollable page. The candidate already supplied the referrer's details,
// so there is nothing to re-verify and nothing to re-type: section 1 shows the
// pre-filled employment facts, section 2 is the same onboarding every candidate
// gets (create your account), section 3 renders ALL questions on one screen,
// and section 4 collects remarks + the e-signature. On submit the referrer
// becomes a VaultVerify candidate account holder.

export function ReferenceFlow({ token, onExit }: { token: string; onExit: () => void }) {
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const [ctx, setCtx] = useState<FlowContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  const [skipAccount, setSkipAccount] = useState(false);
  const [accountPassword, setAccountPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [corrections, setCorrections] = useState("");
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [q1Other, setQ1Other] = useState("");
  const [q8Explanation, setQ8Explanation] = useState("");
  const [remarks, setRemarks] = useState("");
  const [signature, setSignature] = useState("");
  const [finalConsent, setFinalConsent] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const [accountCreated, setAccountCreated] = useState(false);
  const [finalStatus, setFinalStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/reference/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "This link is not valid");
        setCtx(data);
        if (data.response) setFinalStatus(data.request.status);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [token]);

  const start = useMemo(() => Date.now(), []);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/reference/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  };

  const answerValue = (key: string) => answers[key];
  const setAnswer = (key: string, type: string, value: string | number | null, unableToObserve = false) => {
    setAnswers((a) => ({ ...a, [key]: { type, value, unableToObserve } }));
    if (!started) {
      setStarted(true);
      post({ action: "start" }).catch(() => undefined);
    }
  };

  const accountExists = !!ctx?.accountExists;
  const creatingAccount = !accountExists && !skipAccount;

  const q8Yes = answers["q8_discipline"]?.value === "YES";

  const answered = (q: (typeof QUESTIONS)[number]): boolean => {
    const a = answerValue(q.key);
    if (!a) return false;
    if (q.type === "rating") return a.unableToObserve === true || (typeof a.value === "number" && a.value >= 1 && a.value <= 5);
    if (q.type === "select") {
      if (!a.value) return false;
      if (q.key === "q1_relationship" && a.value === OTHER_OPTION) return q1Other.trim().length >= 2;
      return true;
    }
    if (q.type === "boolean") return a.value === "YES" || a.value === "NO" || a.value === "PREFER_NOT";
    return true;
  };

  const answeredCount = QUESTIONS.filter(answered).length;
  const progressPct = Math.round((answeredCount / QUESTIONS.length) * 100);

  const firstMissingKey = useMemo(() => {
    for (const q of QUESTIONS) if (!answered(q)) return q.key;
    return null;
  }, [answers, q1Other]);

  const submitAll = async () => {
    setAttempted(true);
    if (firstMissingKey) {
      toast({ title: `${answeredCount} of ${QUESTIONS.length} answered — finish the highlighted question(s).`, variant: "destructive" });
      document.getElementById(`q-${firstMissingKey}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      return;
    }
    if (creatingAccount) {
      if (accountPassword.length < 8) {
        toast({ title: "Choose a password of at least 8 characters for your new account.", variant: "destructive" });
        document.getElementById("sec-account")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
        return;
      }
      if (accountPassword !== confirmPassword) {
        toast({ title: "The two passwords don't match.", variant: "destructive" });
        document.getElementById("sec-account")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
        return;
      }
    }
    if (q8Yes && q8Explanation.trim().length < 10) {
      toast({ title: Q8_EXPLANATION_PROMPT, variant: "destructive" });
      document.getElementById("q-q8_discipline")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      return;
    }
    if (q8Yes && remarks.trim().length < 5) {
      toast({ title: "Remarks are required because you reported a disciplinary action or complaint.", variant: "destructive" });
      document.getElementById("sec-sign")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      return;
    }
    if (signature.trim().length < 3) return toast({ title: "Type your full name to sign.", variant: "destructive" });
    if (!finalConsent) return toast({ title: "Please confirm the attestation checkbox.", variant: "destructive" });

    setBusy(true);
    try {
      // merge the free-text "Other" relationship into the q1 answer so every
      // downstream artifact (recruiter report, PDF) shows the actual relation
      const merged = Object.entries(answers).map(([key, a]) => {
        if (key === "q1_relationship" && a.value === OTHER_OPTION && q1Other.trim()) {
          return { key, type: a.type, value: `Other — ${q1Other.trim()}`, unableToObserve: a.unableToObserve };
        }
        return { key, type: a.type, value: a.value, unableToObserve: a.unableToObserve };
      });
      const data = await post({
        action: "submit",
        identityMethodClient: creatingAccount || accountExists ? "ACCOUNT" : "SKIPPED",
        mismatchNotes: corrections,
        answers: merged,
        q8Explanation: q8Yes ? q8Explanation : "",
        remarks,
        signatureName: signature.trim(),
        durationSeconds: Math.round((Date.now() - start) / 1000),
        accountPassword: creatingAccount ? accountPassword : undefined,
      });
      setFinalStatus(data.status);
      setAccountCreated(!!data.accountCreated);
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      setAttempted(false);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Submission failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ── Loading / error / expired states ──
  if (loadError) {
    return (
      <CenteredCard>
        <CircleAlert />
        <h1 className="mt-3 text-center text-lg font-semibold">Link not valid</h1>
        <p className="mt-2 text-center text-sm text-slate-600">{loadError}</p>
        <Button variant="outline" className="mt-6 w-full" onClick={onExit}>Back to home</Button>
      </CenteredCard>
    );
  }
  if (!ctx) return <CenteredCard><div className="py-6 text-center text-sm text-slate-500">Loading your secure form…</div></CenteredCard>;

  const alreadyDone = ctx.response != null;
  if (ctx.request.expired && !alreadyDone) {
    return (
      <CenteredCard>
        <CircleAlert amber />
        <h1 className="mt-3 text-center text-lg font-semibold">This link has expired</h1>
        <p className="mt-2 text-center text-sm text-slate-600">Secure links last 14 days. Ask {ctx.candidate.fullName} to send a fresh request.</p>
        <Button variant="outline" className="mt-6 w-full" onClick={onExit}>Back to home</Button>
      </CenteredCard>
    );
  }

  // ── Done ──
  if (alreadyDone || finalStatus) {
    const flagged = finalStatus === "FLAGGED";
    return (
      <div className="flex min-h-screen flex-col bg-slate-100">
        <AgencyBanner ctx={ctx} />
        <main className="mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-8">
          <Card className="border-slate-200">
            <CardContent className="p-8">
              <PartyPopper className="mx-auto h-10 w-10 text-teal-600" />
              <h1 className="mt-3 text-center text-lg font-semibold">Thank you, {ctx.request.refName.split(" ")[0]}!</h1>
              <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
                Your reference for {ctx.candidate.fullName} has been signed and submitted{flagged ? " — it has been routed for a standard recruiter review" : ""}.
                A branded verification packet is now available to the {ctx.agency.name} recruiting team and to {ctx.candidate.fullName}.
              </p>
              {(accountCreated || accountExists) && (
                <div className="mt-5 rounded-xl border border-verify-green/40 bg-[#eef7ee] p-4 text-left">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[#1e4d33]">
                    <ShieldCheck className="h-4 w-4" /> {accountCreated ? "Your VaultVerify account is ready" : "Your VaultVerify account"}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#3a5f4b]">
                    {accountCreated
                      ? `We created your account with ${ctx.request.refEmail} and the password you just set. Sign in anytime to build your own vault — collect verified references and skill checklists of your own.`
                      : `You already have a VaultVerify account with ${ctx.request.refEmail}. Sign in anytime — your vault is waiting.`}
                  </p>
                  <Button className="mt-3 w-full bg-teal-700 hover:bg-teal-800" onClick={() => { window.location.href = "/?view=checklist"; }}>
                    Open your vault <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                  <p className="mt-2 text-center text-[11px] text-[#5c7a68]">First sign-in walks you through a 1-minute profile confirmation.</p>
                </div>
              )}
              <Button variant="outline" className="mt-5 w-full" onClick={onExit}>Done</Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const rel = ctx.request;
  const dates = `${rel.workStartDate || "?"} – ${rel.workEndDate || "present"}`;
  const facilityLine = `${rel.facilityName}${rel.facilityCity ? `, ${rel.facilityCity}` : ""}${rel.facilityState ? `, ${rel.facilityState}` : ""}`;

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <AgencyBanner ctx={ctx} />

      {/* sticky progress — answered count follows the scroll */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2.5 sm:px-0">
          <p className="text-xs font-semibold text-slate-700">
            {answeredCount} of {QUESTIONS.length} answered
            {q8Yes && remarks.trim().length < 5 ? " · remarks required" : ""}
          </p>
          <span className="flex items-center gap-1 text-[11px] font-medium text-teal-700"><Lock className="h-3 w-3" /> Autosaved audit trail</span>
        </div>
        <div className="h-1 w-full bg-slate-200">
          <div className="h-full transition-all duration-300" style={{ width: `${progressPct}%`, backgroundColor: ctx.agency.primaryColor }} />
        </div>
      </div>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6 sm:px-6">
        {/* candidate intro strip */}
        <motion.div {...fade(reduce)} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Reference for <strong>{ctx.candidate.fullName}</strong>, {ctx.candidate.role}</p>
              <p className="text-xs text-slate-500">{ctx.candidate.specialtyLabel} · {ctx.candidate.city}, {ctx.candidate.state} · via {ctx.agency.name}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">3–5 minutes · one page</span>
          </div>
        </motion.div>

        {/* ── Section 1 — pre-filled details (candidate supplied; nothing required) ── */}
        <SectionCard id="sec-details" n={1} title="Your details — pre-filled for you"
          help={`${ctx.candidate.fullName} provided these with the request. Nothing to re-enter — note any corrections below and they'll be flagged for the recruiter.`}>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Pref label="Your name" value={rel.refName} />
            <Pref label="Your title" value={rel.refTitle} />
            <Pref label="Your email" value={rel.refEmail} />
            <Pref label="Working relationship (as stated)" value={rel.relationship} />
            <Pref label="Facility" value={facilityLine} />
            <Pref label="Dates worked together" value={dates} />
          </div>
          <div className="mt-4">
            <Label htmlFor="corrections" className="text-xs text-slate-500">Anything to correct or add? (optional)</Label>
            <Textarea id="corrections" value={corrections} onChange={(e) => setCorrections(e.target.value)}
              placeholder="e.g. different unit, title changed in March, dates were seasonal contract…" className="mt-1.5 min-h-16" />
          </div>
        </SectionCard>

        {/* ── Section 2 — onboarding: create the account (like every candidate) ── */}
        <SectionCard id="sec-account" n={2} title="Create your VaultVerify account"
          help="Submitting this reference creates your account — the same onboarding every candidate gets. Use it later to collect verified references and skill checklists for yourself.">
          {accountExists ? (
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
              <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> You already have a VaultVerify account</p>
              <p className="mt-1 text-xs leading-relaxed text-teal-800">
                <strong>{rel.refEmail}</strong> is already registered. Submit below with this link — nothing changes on your account, and you can sign in as usual afterwards.
              </p>
            </div>
          ) : skipAccount ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No problem — your reference will still be signed and delivered. A low-priority review note is added because the account step was skipped.
              <button type="button" className="ml-1 font-semibold text-teal-700 underline" onClick={() => setSkipAccount(false)}>Create an account instead</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="acc-email">Your email — this becomes your sign-in</Label>
                <Input id="acc-email" value={rel.refEmail} readOnly className="mt-1.5 bg-slate-50 font-medium text-slate-700" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="acc-pass">Choose a password *</Label>
                  <Input id="acc-pass" type="password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)}
                    placeholder="At least 8 characters" className={cn("mt-1.5", attempted && accountPassword.length < 8 && "border-rose-300")} />
                </div>
                <div>
                  <Label htmlFor="acc-pass2">Confirm password *</Label>
                  <Input id="acc-pass2" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat it" className={cn("mt-1.5", attempted && confirmPassword !== accountPassword && "border-rose-300")} />
                </div>
              </div>
              <button type="button" disabled={busy}
                className="text-xs text-slate-400 underline hover:text-slate-600"
                onClick={() => setSkipAccount(true)}>
                No thanks — just submit the reference
              </button>
            </div>
          )}
        </SectionCard>

        {/* ── Section 3 — ALL questions on one screen ── */}
        <SectionCard id="sec-questions" n={3} title="The questions"
          help="All ten on one page — answer top to bottom. Your answers are confidential to the hiring team.">
          <div className="space-y-7">
            {QUESTIONS.map((q, qi) => {
              const a = answerValue(q.key);
              const missing = attempted && !answered(q);
              return (
                <div key={q.key} id={`q-${q.key}`}
                  className={cn("rounded-xl border p-4 transition", missing ? "border-rose-300 bg-rose-50/40" : "border-slate-200 bg-white")}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold leading-snug text-slate-900">
                      <span className="mr-1.5 text-slate-400">{qi + 1}.</span>{q.title}
                    </p>
                    {q.type === "rating" && <span className="shrink-0 text-[10px] text-slate-400">1 worst · 5 best</span>}
                  </div>
                  {q.help && <p className="mt-1 pl-5 text-xs leading-relaxed text-slate-500">{q.help}</p>}

                  {/* rating — compact 5-point row */}
                  {q.type === "rating" && (
                    <>
                      <div className="mt-3 grid grid-cols-5 gap-1.5 sm:gap-2">
                        {RATING_SCALE.map((opt) => {
                          const selected = !a?.unableToObserve && a?.value === opt.value;
                          return (
                            <button key={opt.value} type="button" aria-pressed={selected}
                              className={cn("rounded-lg border px-1 py-2.5 text-center transition hover:border-teal-400",
                                selected ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white")}
                              onClick={() => setAnswer(q.key, "rating", opt.value)}>
                              <span className={cn("mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                                selected ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500")}>{opt.value}</span>
                              <span className={cn("mt-1 block text-[10px] font-medium leading-tight sm:text-[11px]", selected ? "text-teal-900" : "text-slate-500")}>
                                {opt.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {typeof a?.value === "number" && !a.unableToObserve && (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <strong className="text-slate-800">{RATING_SCALE.find((r) => r.value === a.value)?.label}:</strong> {RATING_SCALE.find((r) => r.value === a.value)?.anchor}
                        </p>
                      )}
                      <button type="button"
                        className={cn("mt-2 w-full rounded-lg border border-dashed p-2 text-xs font-medium transition",
                          a?.unableToObserve ? "border-slate-400 bg-slate-50 text-slate-700" : "border-slate-300 text-slate-400 hover:text-slate-600")}
                        onClick={() => setAnswer(q.key, "rating", null, !a?.unableToObserve)}>
                        {a?.unableToObserve ? "✓ Marked: unable to observe" : "I wasn't in a position to observe this"}
                      </button>
                    </>
                  )}

                  {/* select — pills; "Other" reveals a text box */}
                  {q.type === "select" && (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {q.options?.map((opt) => {
                          const selected = a?.value === opt;
                          return (
                            <button key={opt} type="button" aria-pressed={selected}
                              className={cn("rounded-full border px-3.5 py-1.5 text-xs font-medium transition sm:text-sm",
                                selected ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300")}
                              onClick={() => setAnswer(q.key, "select", opt)}>
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      {q.key === "q1_relationship" && a?.value === OTHER_OPTION && (
                        <div className="mt-3">
                          <Label htmlFor="q1-other" className="text-xs text-slate-600">Describe your working relationship *</Label>
                          <Input id="q1-other" value={q1Other} onChange={(e) => setQ1Other(e.target.value)}
                            placeholder="e.g. HR director overseeing their contract, clinical coordinator…"
                            className={cn("mt-1.5", attempted && q1Other.trim().length < 2 && "border-rose-300")} />
                        </div>
                      )}
                    </>
                  )}

                  {/* boolean — yes/no (+ prefer-not for discipline) */}
                  {q.type === "boolean" && (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(q.key === "q8_discipline"
                          ? [["YES", "Yes"], ["NO", "No"], ["PREFER_NOT", "Prefer not to say"]]
                          : [["YES", "Yes"], ["NO", "No"]]
                        ).map(([v, label]) => {
                          const selected = a?.value === v;
                          return (
                            <button key={v} type="button" aria-pressed={selected}
                              className={cn("rounded-full border px-5 py-1.5 text-sm font-medium transition",
                                selected ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300")}
                              onClick={() => setAnswer(q.key, "boolean", v)}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      {q.key === "q8_discipline" && q8Yes && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <p className="text-xs font-medium text-amber-800">{Q8_EXPLANATION_PROMPT}</p>
                          <Textarea value={q8Explanation} onChange={(e) => setQ8Explanation(e.target.value)} className="mt-2 min-h-20 border-amber-200 bg-white" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* ── Section 4 — remarks + e-signature ── */}
        <SectionCard id="sec-sign" n={4} title="Final remarks & e-signature"
          help="Close out the reference in your own words, then sign.">
          <div>
            <Label htmlFor="remarks">
              Anything else a hiring manager should know? {!q8Yes && <span className="font-normal text-slate-400">(optional)</span>}
            </Label>
            {q8Yes && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                Remarks are required because you reported a disciplinary action or complaint.
              </p>
            )}
            <Textarea id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-2 min-h-28"
              placeholder="Describe their practice, strengths, growth areas, or anything a hiring manager should know…" />
          </div>
          <div className="mt-5 rounded-lg border bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-900">Attestation</p>
            <p className="mt-2 leading-relaxed text-slate-600">
              I attest that I am {rel.refName}, {rel.refTitle}, and that my answers reflect my honest, first-hand professional experience working with {ctx.candidate.fullName}. I understand this submission
              carries a typed electronic signature, a timestamp, and an IP/device record, and that it will be shared with {ctx.agency.name} and the candidate.
            </p>
          </div>
          <div className="mt-4 flex items-start gap-2">
            <Checkbox id="attest" checked={finalConsent} onCheckedChange={(v) => setFinalConsent(v === true)} />
            <Label htmlFor="attest" className="text-sm font-normal leading-snug text-slate-700">I agree to the attestation above.</Label>
          </div>
          <div className="mt-4">
            <Label htmlFor="sig">Type your full name to sign *</Label>
            <Input id="sig" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Your full name" className="mt-1.5 max-w-sm font-serif text-lg italic" />
          </div>
          <Button disabled={busy} className="mt-6 w-full bg-teal-700 hover:bg-teal-800 sm:w-auto" onClick={submitAll}>
            {busy ? "Submitting…" : "Sign & submit reference"}
          </Button>
          <p className="mt-2 text-[11px] text-slate-400">
            Single-use secure link · expires {new Date(ctx.request.expiresAt).toLocaleDateString("en-US")} · audit-trailed
          </p>
        </SectionCard>
      </main>

      <footer className="bg-white py-3">
        <p className="text-center text-[11px] text-slate-400">
          Secured by VaultVerify · your answers carry a typed e-signature and audit trail
        </p>
      </footer>
    </div>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────

function AgencyBanner({ ctx }: { ctx: FlowContext }) {
  return (
    <div style={{ backgroundColor: ctx.agency.primaryColor }}>
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-0">
        <div className="flex items-center gap-2.5">
          {ctx.agency.logoText === "VV" ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90">
              <VaultMark size={26} />
            </div>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-xs font-bold text-white">{ctx.agency.logoText.slice(0, 4)}</div>
          )}
          <div className="leading-tight text-white">
            <p className="text-sm font-semibold">{ctx.agency.name}</p>
            <p className="text-[11px] text-white/80">Reference request</p>
          </div>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white">
          <Lock className="h-3 w-3" /> Secure
        </span>
      </div>
    </div>
  );
}

function SectionCard({ id, n, title, help, children }: {
  id: string; n: number; title: string; help: string; children: React.ReactNode;
}) {
  return (
    <Card id={id} className="mt-5 scroll-mt-24 border-slate-200">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white">{n}</span>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900 sm:text-lg">{title}</h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">{help}</p>
          </div>
        </div>
        <div className="mt-4">{children}</div>
      </CardContent>
    </Card>
  );
}

function Pref({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-slate-800" title={value}>{value || "—"}</p>
    </div>
  );
}

function CircleAlert({ amber }: { amber?: boolean }) {
  return (
    <span className={cn("mx-auto flex h-10 w-10 items-center justify-center rounded-full", amber ? "bg-amber-100" : "bg-rose-100")}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={cn("h-5 w-5", amber ? "text-amber-600" : "text-rose-500")} aria-hidden>
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </span>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md border-slate-200">
        <CardContent className="p-8">{children}</CardContent>
      </Card>
    </div>
  );
}

function fade(reduce: boolean | null) {
  return reduce
    ? {}
    : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } };
}
