"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { QUESTIONS, Q8_EXPLANATION_PROMPT, RECENCY_OPTIONS } from "@/lib/bts/questions";
import { RATING_SCALE, UNABLE_TO_OBSERVE, PROFICIENCY_META } from "@/lib/bts/constants";
import { AgencyLogo } from "./brand";
import { Lock, ShieldCheck, ArrowRight, ArrowLeft, CheckCircle2, PhoneCall, MailCheck, CircleAlert, PartyPopper } from "lucide-react";

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
}

interface SkillCheck {
  skillName: string;
  nurseProficiency: string;
  confirmed: boolean;
  refProficiency?: string;
  comment?: string;
}

type AnswerMap = Record<string, { type: string; value: string | number | null; unableToObserve?: boolean }>;

export function ReferenceFlow({ token, onExit }: { token: string; onExit: () => void }) {
  const { toast } = useToast();
  const [ctx, setCtx] = useState<FlowContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0 welcome, 1 identity, 2 employment, 3 questions, 4 skills, 5 remarks, 6 sign, 7 done
  const [qIndex, setQIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const [identityMethod, setIdentityMethod] = useState<"EMAIL_DOMAIN" | "CALLBACK_CODE" | "SKIPPED" | null>(null);
  const [verifiedDomain, setVerifiedDomain] = useState<string | null>(null);
  const [workEmail, setWorkEmail] = useState("");
  const [callbackCode, setCallbackCode] = useState("");

  const [confirm, setConfirm] = useState({ relationship: "", facility: "", dates: "", mismatchNotes: "" });

  const [answers, setAnswers] = useState<AnswerMap>({});
  const [q8Explanation, setQ8Explanation] = useState("");
  const [remarks, setRemarks] = useState("");
  const [skillsVerified, setSkillsVerified] = useState(false);
  const [skillChecks, setSkillChecks] = useState<Record<string, SkillCheck>>({});
  const [signature, setSignature] = useState("");
  const [finalConsent, setFinalConsent] = useState(false);
  const [finalStatus, setFinalStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/reference/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "This link is not valid");
        setCtx(data);
        if (data.response) {
          // already submitted
          setStep(7);
          setFinalStatus(data.request.status);
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!ctx) return;
    setConfirm({
      relationship: ctx.request.relationship || "",
      facility: `${ctx.request.facilityName}, ${ctx.request.facilityCity}${ctx.request.facilityState ? ", " + ctx.request.facilityState : ""}`,
      dates: `${ctx.request.workStartDate || "?"} – ${ctx.request.workEndDate || "present"}`,
      mismatchNotes: "",
    });
  }, [ctx]);

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

  const verifyIdentity = async (method: "EMAIL_DOMAIN" | "CALLBACK_CODE" | "SKIPPED") => {
    setBusy(true);
    try {
      const data = await post({ action: "verify_identity", method, workEmail, callbackCode });
      setIdentityMethod(method);
      if (data.verifiedDomain) setVerifiedDomain(data.verifiedDomain);
      setStep(2);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Verification failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const enterQuestions = async () => {
    setBusy(true);
    try {
      await post({ action: "start" });
    } catch {
      /* non-blocking */
    }
    setBusy(false);
    setStep(3);
  };

  const question = QUESTIONS[qIndex];
  const q8Yes = answers["q8_discipline"]?.value === "YES";

  const answerValue = (key: string) => answers[key];

  const setAnswer = (key: string, type: string, value: string | number | null, unableToObserve = false) =>
    setAnswers((a) => ({ ...a, [key]: { type, value, unableToObserve } }));

  const qAnswered = () => {
    const a = answerValue(question.key);
    if (!a) return false;
    if (question.type === "rating") return a.unableToObserve === true || (typeof a.value === "number" && a.value >= 1 && a.value <= 5);
    if (question.type === "select") return !!a.value;
    if (question.type === "boolean") return a.value === "YES" || a.value === "NO" || a.value === "PREFER_NOT";
    return true;
  };

  const submitAll = async () => {
    if (signature.trim().length < 3) return toast({ title: "Type your full name to sign.", variant: "destructive" });
    if (!finalConsent) return toast({ title: "Please confirm the attestation checkbox.", variant: "destructive" });
    setBusy(true);
    try {
      const payload = {
        action: "submit",
        identityMethodClient: identityMethod ?? "SKIPPED",
        verifiedDomain,
        confirmedRelationship: confirm.relationship,
        confirmedFacility: confirm.facility,
        confirmedDates: confirm.dates,
        mismatchNotes: confirm.mismatchNotes,
        answers: Object.entries(answers).map(([key, a]) => ({ key, type: a.type, value: a.value, unableToObserve: a.unableToObserve })),
        q8Explanation: q8Yes ? q8Explanation : "",
        remarks,
        signatureName: signature.trim(),
        durationSeconds: Math.round((Date.now() - start) / 1000),
        skillsVerified,
        skillChecks: Object.values(skillChecks),
      };
      const data = await post(payload);
      setFinalStatus(data.status);
      setStep(7);
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
        <CircleAlert className="mx-auto h-10 w-10 text-rose-500" />
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
        <CircleAlert className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-3 text-center text-lg font-semibold">This link has expired</h1>
        <p className="mt-2 text-center text-sm text-slate-600">Secure links last 14 days. Ask {ctx.candidate.fullName} to send a fresh request.</p>
        <Button variant="outline" className="mt-6 w-full" onClick={onExit}>Back to home</Button>
      </CenteredCard>
    );
  }

  // ── Done ──
  if (step === 7) {
    const flagged = finalStatus === "FLAGGED";
    return (
      <CenteredCard>
        <PartyPopper className="mx-auto h-10 w-10 text-teal-600" />
        <h1 className="mt-3 text-center text-lg font-semibold">Thank you, {ctx.request.refName.split(" ")[0]}!</h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
          Your reference for {ctx.candidate.fullName} has been signed and submitted{flagged ? " — it has been routed for a standard recruiter review" : ""}.
          A branded verification packet is now available to the {ctx.agency.name} recruiting team.
        </p>
        {identityMethod === "EMAIL_DOMAIN" && verifiedDomain && (
          <p className="mt-3 text-center text-xs text-teal-700">Identity verified via employer domain: <strong>{verifiedDomain}</strong></p>
        )}
        <Button variant="outline" className="mt-6 w-full" onClick={onExit}>Done</Button>
      </CenteredCard>
    );
  }

  const totalSteps = 6;
  const progressPct = step <= 2 ? (step / totalSteps) * 100 : step === 3 ? ((2 + (qIndex + 1) / QUESTIONS.length) / totalSteps) * 100 : ((step + 1) / totalSteps) * 100;

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      {/* Branded banner */}
      <div className="bg-teal-700" style={{ backgroundColor: ctx.agency.primaryColor }}>
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-4 sm:px-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-xs font-bold text-white">{ctx.agency.logoText.slice(0, 4)}</div>
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

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-6">
        {/* Candidate intro strip */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-slate-900">{ctx.candidate.fullName}, {ctx.candidate.role}</p>
            <p className="text-xs text-slate-500">{ctx.candidate.specialtyLabel} · {ctx.candidate.city}, {ctx.candidate.state}</p>
            <Progress value={progressPct} className="mt-3 h-1.5" />
            <p className="mt-1.5 text-[11px] text-slate-400">Takes 3–5 minutes · answers are confidential to the hiring team</p>
          </CardContent>
        </Card>

        {/* ── Step 0: Welcome ── */}
        {step === 0 && (
          <Card className="mt-4 border-slate-200">
            <CardContent className="p-6">
              <h1 className="text-lg font-bold text-slate-900">You&apos;ve been listed as a reference</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Hi {ctx.request.refName.split(" ")[0]} — {ctx.candidate.fullName} listed you as their <strong>{ctx.request.refTitle}</strong> at <strong>{ctx.request.facilityName}</strong> for a {ctx.candidate.specialtyLabel} placement through {ctx.agency.name}.
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
                <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" /> Identity check first — your answers carry weight because they&apos;re provably yours</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" /> 10 quick questions, one per screen, with simple anchored scales</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" /> Optionally verify their self-reported skills (high-risk ones highlighted)</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" /> Typed e-signature at the end — no account needed</li>
              </ul>
              <Button className="mt-6 w-full bg-teal-700 hover:bg-teal-800" onClick={() => setStep(1)}>
                Begin <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 1: Identity ── */}
        {step === 1 && (
          <Card className="mt-4 border-slate-200">
            <CardContent className="p-6">
              <h1 className="text-lg font-bold text-slate-900">Verify it&apos;s really you</h1>
              <p className="mt-1.5 text-sm text-slate-600">Pick whichever is fastest — this is what makes your reference verifiable to recruiters.</p>

              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MailCheck className="h-4 w-4 text-teal-600" /> Employer email</p>
                  <p className="mt-1 text-xs text-slate-500">Your hospital/facility email domain is matched and recorded.</p>
                  <Input type="email" value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} placeholder="you@stmaryschicago.org" className="mt-2.5" />
                  <Button size="sm" disabled={busy} className="mt-3 w-full bg-teal-700 hover:bg-teal-800" onClick={() => verifyIdentity("EMAIL_DOMAIN")}>
                    Verify with work email
                  </Button>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><PhoneCall className="h-4 w-4 text-teal-600" /> Phone callback code</p>
                  <p className="mt-1 text-xs text-slate-500">The nurse has a 6-digit code on their dashboard — they can read it to you over the phone.</p>
                  <Input value={callbackCode} onChange={(e) => setCallbackCode(e.target.value)} placeholder="123456" inputMode="numeric" maxLength={6} className="mt-2.5 font-mono tracking-[0.3em]" />
                  <Button size="sm" disabled={busy} variant="outline" className="mt-3 w-full" onClick={() => verifyIdentity("CALLBACK_CODE")}>
                    Verify with code
                  </Button>
                </div>

                <button
                  className="w-full text-center text-xs text-slate-400 underline"
                  disabled={busy}
                  onClick={() => verifyIdentity("SKIPPED")}
                >
                  Skip verification (a low-severity review flag will be added)
                </button>
              </div>
              <Button variant="ghost" className="mt-4 w-full" onClick={() => setStep(0)}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Employment confirm ── */}
        {step === 2 && (
          <Card className="mt-4 border-slate-200">
            <CardContent className="p-6">
              {identityMethod === "EMAIL_DOMAIN" && verifiedDomain && (
                <div className="mb-4 rounded-lg bg-teal-50 p-3 text-xs text-teal-800">
                  <ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> Verified via employer domain <strong>{verifiedDomain}</strong>
                </div>
              )}
              {identityMethod === "CALLBACK_CODE" && (
                <div className="mb-4 rounded-lg bg-teal-50 p-3 text-xs text-teal-800">
                  <ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> Verified via phone callback code
                </div>
              )}
              <h1 className="text-lg font-bold text-slate-900">Confirm how you worked together</h1>
              <p className="mt-1.5 text-sm text-slate-600">{ctx.candidate.fullName} pre-filled this from their profile — correct anything that&apos;s off.</p>

              <div className="mt-5 space-y-4">
                <div>
                  <Label>Working relationship</Label>
                  <select
                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    value={confirm.relationship}
                    onChange={(e) => setConfirm((c) => ({ ...c, relationship: e.target.value }))}
                  >
                    {["Direct supervisor", "Charge nurse / team lead", "Peer colleague on same unit", "Educator / preceptor", "Other working relationship"].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Facility</Label>
                  <Input value={confirm.facility} onChange={(e) => setConfirm((c) => ({ ...c, facility: e.target.value }))} className="mt-1.5" />
                </div>
                <div>
                  <Label>Dates they worked with you</Label>
                  <Input value={confirm.dates} onChange={(e) => setConfirm((c) => ({ ...c, dates: e.target.value }))} className="mt-1.5" />
                </div>
                <div>
                  <Label>Anything to correct or note?</Label>
                  <Textarea value={confirm.mismatchNotes} onChange={(e) => setConfirm((c) => ({ ...c, mismatchNotes: e.target.value }))} placeholder="Optional — e.g. different unit, title differences…" className="mt-1.5 min-h-16" />
                </div>
              </div>
              <Button disabled={busy} className="mt-6 w-full bg-teal-700 hover:bg-teal-800" onClick={enterQuestions}>
                Looks right — start questions <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
              <Button variant="ghost" className="mt-2 w-full" onClick={() => setStep(1)}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Questions (one per screen) ── */}
        {step === 3 && (
          <Card className="mt-4 border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Question {qIndex + 1} of {QUESTIONS.length}</p>
                {question.type === "rating" && <span className="text-[11px] text-slate-400">1 worst · 5 best</span>}
              </div>
              <h1 className="mt-2 text-lg font-bold leading-snug text-slate-900">{question.title}</h1>
              {question.help && <p className="mt-1.5 text-sm text-slate-500">{question.help}</p>}

              <div className="mt-5 space-y-2.5">
                {question.type === "rating" &&
                  RATING_SCALE.map((opt) => {
                    const a = answerValue(question.key);
                    const selected = !a?.unableToObserve && a?.value === opt.value;
                    return (
                      <button
                        key={opt.value}
                        className={cn("w-full rounded-lg border p-3 text-left transition", selected ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300")}
                        onClick={() => setAnswer(question.key, "rating", opt.value)}
                      >
                        <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", selected ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500")}>{opt.value}</span>
                        <span className="ml-2 text-sm font-semibold text-slate-900">{opt.label}</span>
                        <p className="mt-1 pl-8 text-xs leading-snug text-slate-500">{opt.anchor}</p>
                      </button>
                    );
                  })}

                {question.type === "select" &&
                  question.options?.map((opt) => {
                    const selected = answerValue(question.key)?.value === opt;
                    return (
                      <button
                        key={opt}
                        className={cn("w-full rounded-lg border p-3 text-left text-sm font-medium transition", selected ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300")}
                        onClick={() => setAnswer(question.key, "select", opt)}
                      >
                        {opt}
                      </button>
                    );
                  })}

                {question.type === "boolean" && (
                  <>
                    {(question.key === "q8_discipline" ? [["YES", "Yes"], ["NO", "No"], ["PREFER_NOT", "Prefer not to say"]] : [["YES", "Yes"], ["NO", "No"]]).map(([v, label]) => {
                      const selected = answerValue(question.key)?.value === v;
                      return (
                        <button
                          key={v}
                          className={cn("w-full rounded-lg border p-3 text-left text-sm font-medium transition", selected ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300")}
                          onClick={() => setAnswer(question.key, "boolean", v)}
                        >
                          {label}
                        </button>
                      );
                    })}
                    {question.key === "q8_discipline" && q8Yes && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-medium text-amber-800">{Q8_EXPLANATION_PROMPT}</p>
                        <Textarea value={q8Explanation} onChange={(e) => setQ8Explanation(e.target.value)} className="mt-2 min-h-20 border-amber-200 bg-white" />
                      </div>
                    )}
                  </>
                )}

                {question.type === "rating" && (
                  <button
                    className={cn("w-full rounded-lg border border-dashed p-2.5 text-xs font-medium transition", answerValue(question.key)?.unableToObserve ? "border-slate-400 bg-slate-50 text-slate-700" : "border-slate-300 text-slate-400 hover:text-slate-600")}
                    onClick={() => setAnswer(question.key, "rating", null, !answerValue(question.key)?.unableToObserve)}
                  >
                    {answerValue(question.key)?.unableToObserve ? "✓ Marked: unable to observe" : "I wasn't in a position to observe this"}
                  </button>
                )}
              </div>

              <div className="mt-6 flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => (qIndex === 0 ? setStep(2) : setQIndex((i) => i - 1))}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  className="flex-1 bg-teal-700 hover:bg-teal-800"
                  disabled={!qAnswered() || (question.key === "q8_discipline" && q8Yes && q8Explanation.trim().length < 10)}
                  onClick={() => (qIndex < QUESTIONS.length - 1 ? setQIndex((i) => i + 1) : nextAfterQuestions())}
                >
                  {qIndex < QUESTIONS.length - 1 ? "Next question" : "Continue to skills"}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: Skills verification (optional) ── */}
        {step === 4 && (
          <Card className="mt-4 border-slate-200">
            <CardContent className="p-6">
              <h1 className="text-lg font-bold text-slate-900">Verify their skills <span className="text-sm font-normal text-slate-500">(optional)</span></h1>
              <p className="mt-1.5 text-sm text-slate-600">
                {ctx.candidate.fullName} self-rated their {ctx.candidate.specialtyLabel} skills. Confirm the ones you directly observed — high-risk skills matter most. Skip freely if you can&apos;t speak to them.
              </p>
              <div className="mt-4 max-h-96 space-y-2.5 overflow-y-auto pr-1">
                {[...ctx.nurseSkills].sort((a, b) => (a.highRisk === b.highRisk ? 0 : a.highRisk ? -1 : 1)).map((s) => {
                  const check = skillChecks[s.skillName];
                  return (
                    <div key={s.skillName} className={cn("rounded-lg border p-3", s.highRisk ? "border-amber-200 bg-amber-50/60" : "border-slate-200")}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {s.skillName}
                            {s.highRisk && <span className="ml-2 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">High-risk</span>}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Self-reported: <strong>{PROFICIENCY_META[s.proficiency]?.short ?? s.proficiency}</strong> · {recencyLabel(s.recencyMonths)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", check?.confirmed ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-teal-400")}
                          onClick={() =>
                            setSkillChecks((sc) => {
                              const cur = sc[s.skillName];
                              if (cur?.confirmed) {
                                const next = { ...sc };
                                delete next[s.skillName];
                                return next;
                              }
                              return { ...sc, [s.skillName]: { skillName: s.skillName, nurseProficiency: s.proficiency, confirmed: true, comment: cur?.comment ?? "" } };
                            })
                          }
                        >
                          {check?.confirmed ? "✓ Confirmed" : "✓ Confirm"}
                        </button>
                        <select
                          aria-label={`Adjust ${s.skillName}`}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
                          value={check && check.confirmed === false ? (check.refProficiency ?? "") : ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSkillChecks((sc) => {
                              const next = { ...sc };
                              if (v === "") {
                                delete next[s.skillName];
                                return next;
                              }
                              const isNotObserved = v === "__NOT_OBSERVED";
                              next[s.skillName] = {
                                skillName: s.skillName,
                                nurseProficiency: s.proficiency,
                                confirmed: false,
                                refProficiency: isNotObserved ? undefined : v,
                                comment: isNotObserved ? "Did not directly observe" : sc[s.skillName]?.comment ?? "",
                              };
                              return next;
                            });
                          }}
                        >
                          <option value="">Adjust level…</option>
                          {Object.entries(PROFICIENCY_META).map(([k, m]) => (
                            <option key={k} value={k}>{m.short}</option>
                          ))}
                          <option value="__NOT_OBSERVED">Didn&apos;t observe</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-start gap-2">
                <Checkbox id="skv" checked={skillsVerified} onCheckedChange={(v) => setSkillsVerified(v === true)} />
                <Label htmlFor="skv" className="text-xs leading-snug text-slate-600">
                  I verified the skills marked &ldquo;Confirm&rdquo; above (badges become <strong>Manager-verified</strong>; unmarked stay <strong>Self-reported</strong>).
                </Label>
              </div>
              <Button className="mt-5 w-full bg-teal-700 hover:bg-teal-800" onClick={() => setStep(5)}>
                Continue <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
              <button className="mt-2 w-full text-center text-xs text-slate-400 underline" onClick={() => { setSkillsVerified(false); setStep(5); }}>
                Skip — leave all skills as self-reported
              </button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 5: Remarks ── */}
        {step === 5 && (
          <Card className="mt-4 border-slate-200">
            <CardContent className="p-6">
              <h1 className="text-lg font-bold text-slate-900">
                Anything else to add? {!q8Yes && <span className="text-sm font-normal text-slate-500">(optional)</span>}
              </h1>
              {q8Yes && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                  Remarks are required because you reported a disciplinary action or complaint.
                </p>
              )}
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="mt-4 min-h-32"
                placeholder="Describe their practice, strengths, growth areas, or anything a hiring manager should know…"
              />
              <Button
                className="mt-5 w-full bg-teal-700 hover:bg-teal-800"
                disabled={q8Yes && remarks.trim().length < 5}
                onClick={() => setStep(6)}
              >
                Continue to signature <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
              <Button variant="ghost" className="mt-2 w-full" onClick={() => setStep(4)}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 6: Signature ── */}
        {step === 6 && (
          <Card className="mt-4 border-slate-200">
            <CardContent className="p-6">
              <h1 className="text-lg font-bold text-slate-900">Review & e-sign</h1>
              <div className="mt-4 rounded-lg border bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-900">Attestation</p>
                <p className="mt-2 leading-relaxed text-slate-600">
                  I attest that I am {ctx.request.refName}, {ctx.request.refTitle}, and that my answers reflect my honest, first-hand professional experience working with {ctx.candidate.fullName}. I understand this submission
                  carries a typed electronic signature, a timestamp, and an IP/device record, and that it will be shared with {ctx.agency.name} and the candidate.
                </p>
              </div>
              <div className="mt-4 flex items-start gap-2">
                <Checkbox id="attest" checked={finalConsent} onCheckedChange={(v) => setFinalConsent(v === true)} />
                <Label htmlFor="attest" className="text-sm font-normal leading-snug text-slate-700">I agree to the attestation above.</Label>
              </div>
              <div className="mt-4">
                <Label htmlFor="sig">Type your full name to sign *</Label>
                <Input id="sig" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Your full name" className="mt-1.5 font-serif text-lg italic" />
              </div>
              <Button disabled={busy} className="mt-5 w-full bg-teal-700 hover:bg-teal-800" onClick={submitAll}>
                {busy ? "Submitting…" : "Sign & submit reference"}
              </Button>
              <Button variant="ghost" className="mt-2 w-full" onClick={() => setStep(5)}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="bg-white py-3">
        <p className="text-center text-[11px] text-slate-400">Single-use secure link · expires {new Date(ctx.request.expiresAt).toLocaleDateString("en-US")} · audit-trailed</p>
      </footer>
    </div>
  );

  function nextAfterQuestions() {
    if (ctx && ctx.nurseSkills.length > 0) setStep(4);
    else setStep(5);
  }
}

function recencyLabel(months: number): string {
  const opt = RECENCY_OPTIONS.find((r) => r.value === months) ?? RECENCY_OPTIONS[RECENCY_OPTIONS.length - 1];
  return opt.label.toLowerCase();
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
