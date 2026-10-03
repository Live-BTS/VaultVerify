"use client";

// ── Skills Checklist fill — report-style, matching the VaultVerify PDF report ──
// Category rows with color-coded rating rings (1 red · 2 amber · 3 blue · 4 green),
// required "Last performed" recency pills, the superadmin-managed Additional questions,
// a signed candidate attestation (Draw / Type / Upload) and a live sticky summary panel.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { RATING_4, RATING_META, ATTESTATION_STATEMENTS, LAST_PERFORMED, specialtyLabel, summarizeAnswers, SIGNATURE_MODES, type SignatureMode, type SkillAnswer } from "@/lib/bts/checklistShared";
import { VaultMark, Spinner } from "../brand";
import {
  AvgRing, RecentDonut, RecencyStrip, CategoryBars, RatingLegend, RecencyLegend,
  RecencyPill, RatingRing, SectionHeading, SignaturePad, fileToScaledDataUrl, avgColor,
} from "./ReportBits";
import { ArrowLeft, ArrowRight, Check, ClipboardList, FileUp, Info, Keyboard, PenLine, ShieldCheck, X } from "lucide-react";

export interface CatalogSkill { name: string; category: string; questionType: string; hasNA: boolean; highRisk: boolean }
export interface CatalogSet { key: string; profession: string; jobTitle: string; specialty: string; label: string; skills: CatalogSkill[] }

export interface FillSpec {
  inviteId?: string;
  requestId?: string;
  profession: string;
  jobTitle: string;
  specialty: string;
  recruiterName?: string;
  facilityName?: string;
  message?: string;
}

interface RowState { value: number | string | null; na: boolean; lastPerformed?: string }
type AnswerMap = Record<string, RowState>;

interface ExtraQ { id: string; kind: string; prompt: string; placeholder: string }

const keyOf = (cat: string, skill: string) => `${cat}::${skill}`;

function rowComplete(sk: CatalogSkill, a?: RowState): boolean {
  if (!a) return false;
  if (sk.questionType === "rating_1_4") {
    if (a.na) return !!a.lastPerformed; // N/A rows still record the (N/A) recency pill
    const v = Number(a.value);
    return v >= 1 && v <= 4 && !!a.lastPerformed;
  }
  if (sk.questionType === "yes_no") return a.na || a.value === "yes" || a.value === "no";
  return a.na || !!String(a.value ?? "").trim();
}

export function ChecklistFill({ spec, sets, onDone, onExit }: {
  spec: FillSpec;
  sets: CatalogSet[];
  onDone: (completionId: string, expiresAt: string) => void;
  onExit: () => void;
}) {
  const [stage, setStage] = useState<"intro" | "form">("intro");
  const [years, setYears] = useState("3");
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  // recruiter may leave the specialty blank — the candidate fills it here
  const [chosen, setChosen] = useState<{ specialty: string; jobTitle: string; profession: string } | null>(null);
  const effSpec = chosen ? { ...spec, ...chosen } : spec;

  const set = useMemo(
    () => sets.find((s) => s.specialty === effSpec.specialty && s.jobTitle === (effSpec.jobTitle || s.jobTitle)) ?? sets.find((s) => s.specialty === effSpec.specialty),
    [sets, effSpec.specialty, effSpec.jobTitle]
  );

  const categories = useMemo(() => {
    if (!set) return [] as { name: string; items: CatalogSkill[] }[];
    const map = new Map<string, CatalogSkill[]>();
    for (const sk of set.skills) {
      if (!map.has(sk.category)) map.set(sk.category, []);
      map.get(sk.category)!.push(sk);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  }, [set]);

  const total = set?.skills.length ?? 0;
  const answeredCount = set ? set.skills.filter((sk) => rowComplete(sk, answers[keyOf(sk.category, sk.name)])).length : 0;
  const pct = total ? Math.round((answeredCount / total) * 100) : 0;

  // ── live summary (same engine the report uses) ──
  const summary = useMemo(() => {
    const rows: SkillAnswer[] = (set?.skills ?? []).map((sk) => {
      const a = answers[keyOf(sk.category, sk.name)];
      return {
        category: sk.category, skill: sk.name, questionType: sk.questionType,
        value: a?.na ? null : a?.value ?? null, na: !!a?.na, highRisk: sk.highRisk,
        lastPerformed: a?.lastPerformed ?? (a?.na ? "na" : null),
      };
    });
    return summarizeAnswers(rows);
  }, [answers, set]);

  // ── Additional questions (superadmin-managed, seeded with the PDF defaults) ──
  const [extras, setExtras] = useState<ExtraQ[]>([]);
  const [extraVals, setExtraVals] = useState<Record<string, string>>({});
  useEffect(() => {
    if (stage !== "form") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/checklist/extra-questions");
        const d = await res.json();
        if (!cancelled && d.ok) setExtras(d.questions ?? []);
      } catch { /* non-fatal — the section hides if the fetch fails */ }
    })();
    return () => { cancelled = true; };
  }, [stage]);

  // ── Attestation state ──
  const [attAgreed, setAttAgreed] = useState(false);
  const [attMode, setAttMode] = useState<SignatureMode>("draw");
  const [attSignature, setAttSignature] = useState<string | null>(null);
  const [attPrinted, setAttPrinted] = useState("");
  const [typedPreview, setTypedPreview] = useState("");
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [extraDone, setExtraDone] = useState(0);
  const dim = useReducedMotion();

  const extraAnswered = (q: ExtraQ) => (q.kind === "YES_NO" ? extraVals[q.id] === "yes" || extraVals[q.id] === "no" : !!String(extraVals[q.id] ?? "").trim());
  useEffect(() => { setExtraDone(extras.filter(extraAnswered).length); }, [extraVals, extras]);

  const setValue = (cat: string, skill: string, value: number | string | null, na = false) =>
    setAnswers((m) => ({ ...m, [keyOf(cat, skill)]: { value: na ? null : value, na, lastPerformed: na ? "na" : m[keyOf(cat, skill)]?.lastPerformed } }));

  const setRecency = (cat: string, skill: string, k: string) =>
    setAnswers((m) => ({ ...m, [keyOf(cat, skill)]: { value: m[keyOf(cat, skill)]?.value ?? null, na: false, lastPerformed: k } }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    setProblems([]);
    try {
      const payloadAnswers = (set?.skills ?? []).map((sk) => {
        const a = answers[keyOf(sk.category, sk.name)];
        return {
          category: sk.category, skill: sk.name, questionType: sk.questionType,
          value: a?.na ? null : a?.value ?? null, na: !!a?.na,
          lastPerformed: sk.questionType === "rating_1_4" ? a?.lastPerformed ?? (a?.na ? "na" : null) : null,
        };
      });
      const res = await fetch("/api/checklist/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...effSpec, yearsExperience: Number(years) || 0, answers: payloadAnswers,
          additional: extras.map((q) => ({ id: q.id, value: extraVals[q.id] ?? null })),
          attestation: { agreed: attAgreed, mode: attMode, signature: attSignature ?? "", printedName: attPrinted },
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setProblems(d.problems ?? []);
        throw new Error(d.error ?? "Could not save");
      }
      onDone(d.completionId, d.expiresAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  // ── Intro ──
  if (stage === "intro") {
    return (
      <div className="vv-page flex min-h-screen items-center justify-center px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-lg rounded-2xl border border-vault-border bg-white vv-card-shadow p-8">
          <div className="flex items-center gap-3">
            <VaultMark size={40} />
            <div>
              <p className="text-sm font-semibold text-jade-ink">Skills Checklist</p>
              <p className="text-xs text-jade-muted">Self-assessment · completed once · valid for 1 year</p>
            </div>
          </div>
          <h1 className="mt-6 text-xl font-semibold text-jade-ink">
            {set?.label ?? (specialtyLabel(effSpec.specialty) || "Pick your checklist")} <span className="text-jade-muted">· {effSpec.jobTitle || "RN"}</span>
          </h1>
          {!set && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-jade-muted">The recruiter left it open — which checklist?</p>
              <div className="mt-2 grid gap-2">
                {sets.map((s) => (
                  <button key={s.key} type="button" onClick={() => setChosen({ specialty: s.specialty, jobTitle: s.jobTitle, profession: s.profession })}
                    className={cn("rounded-xl border px-4 py-3 text-left transition",
                      chosen?.specialty === s.specialty ? "border-verify-green bg-verify-green/15 text-verify-ink" : "border-vault-border text-jade-ink hover:border-verify-green/40")}>
                    <span className="block text-sm font-semibold">{s.label} <span className="text-xs font-normal text-jade-muted">· {s.jobTitle} · {s.profession}</span></span>
                    <span className="mt-0.5 block text-[11px] text-jade-muted">{s.skills.length} skill(s)</span>
                  </button>
                ))}
                {sets.length === 0 && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-300">No checklists published yet — ask the recruiter or admin.</p>}
              </div>
            </div>
          )}
          {spec.recruiterName ? (
            <div className="mt-3 rounded-xl border border-vault-border bg-[#f0f6f2] p-4">
              <p className="text-sm text-jade-ink">
                Requested by <span className="font-semibold text-verify-ink">{spec.recruiterName}</span>
                {spec.facilityName ? ` · ${spec.facilityName}` : ""}
              </p>
              {spec.message && <p className="mt-1 text-xs italic text-jade-muted">“{spec.message}”</p>}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-vault-border bg-[#f0f6f2] p-4">
              <p className="text-sm text-jade-muted">Your approved request — complete it once and it stays in your account.</p>
            </div>
          )}
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-verify-green/25 bg-verify-green/10 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-verify-ink" />
            <div className="text-xs leading-relaxed text-jade-muted">
              <p>For each skill, pick your rating and when you last performed it — the report computes your summary automatically.</p>
              <div className="mt-2"><RatingLegend /></div>
            </div>
          </div>
          <div className="mt-5">
            <Label htmlFor="years" className="text-jade-ink/80">Years of experience in this specialty</Label>
            <Input id="years" type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)}
              className="mt-1.5 border-vault-border bg-white text-jade-ink" />
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="ghost" onClick={onExit} className="border border-vault-border text-jade-muted hover:text-jade-ink">
              <ArrowLeft className="mr-1 h-4 w-4" /> Later
            </Button>
            <Button onClick={() => setStage("form")} disabled={!set} className="flex-1 bg-verify-green text-vault-dark hover:bg-verify-green/90 disabled:opacity-40">
              Start the checklist <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Form — report-style flow with live summary panel ──
  const yesNoMissing = extras.filter((q) => q.kind === "YES_NO" && !extraAnswered(q)).length;
  const attReady = attAgreed && !!attSignature;
  const canSubmit = answeredCount >= total && yesNoMissing === 0 && attReady;
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="vv-page min-h-screen">
      <header className="sticky top-0 z-40 border-b border-vault-border/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <VaultMark size={30} />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-jade-ink">{set?.label ?? specialtyLabel(spec.specialty)}</p>
              <p className="text-[11px] text-jade-muted">{answeredCount}/{total} complete{pct === 100 ? " — ready to sign" : ""}</p>
            </div>
          </div>
          <div className="flex w-40 shrink-0 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-vault-border">
              <div className="h-full rounded-full bg-verify-green transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-semibold text-verify-ink">{pct}%</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-40 pt-6 sm:px-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── left — the report flow ── */}
          <div className="min-w-0">
            {/* candidate strip */}
            <div className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-jade-ink">Your skills report</p>
                  <p className="mt-0.5 text-sm text-jade-muted">
                    {effSpec.jobTitle || "RN"} · {set?.label ?? specialtyLabel(effSpec.specialty)} · {Number(years) || 0} yr in specialty
                  </p>
                </div>
                <span className="rounded-full bg-verify-green/10 px-3 py-1 text-[11px] font-semibold text-verify-ink">Valid 1 year once submitted</span>
              </div>
              <div className="mt-4 space-y-2 border-t border-vault-border/60 pt-4">
                <RatingLegend />
                <RecencyLegend />
              </div>
            </div>

            {/* category sections — one card per category, rows like the PDF skill table */}
            {categories.map((cat, ci) => {
              const catSum = summary.categories.find((c) => c.name === cat.name);
              return (
                <motion.section key={cat.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={dim ? { duration: 0.2 } : { delay: Math.min(ci * 0.05, 0.3), duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="mt-6">
                  <div className="flex items-center justify-between gap-3 rounded-t-xl border border-vault-border/60 border-b-0 bg-[#f6faf8] px-4 py-2.5 sm:px-5">
                    <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-verify-ink/90">
                      <ClipboardList className="h-3.5 w-3.5" /> {cat.name}
                    </h2>
                    <span className="font-mono text-xs font-bold" style={{ color: avgColor(catSum?.avg ?? null) }}>
                      avg {catSum?.avg?.toFixed(1) ?? "—"}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-vault-border bg-white vv-card-shadow">
                    {cat.items.map((sk, si) => {
                      const k = keyOf(sk.category, sk.name);
                      const a = answers[k];
                      return (
                        <div key={sk.name} className={cn("px-4 py-4 sm:px-5", si > 0 && "border-t border-vault-border/50")}>
                          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                            <p className="min-w-0 flex-1 pt-1.5 text-sm font-medium text-jade-ink">
                              {sk.highRisk && <span className="mr-2 rounded bg-amber-500/15 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-amber-600">High-risk</span>}
                              {sk.name}
                            </p>
                            <div className="flex flex-col items-end gap-2">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {RATING_4.map((r) => (
                                  <RatingRing key={r.value} value={r.value} size={34}
                                    state={a?.na ? "off" : Number(a?.value) === r.value ? "on" : "off"}
                                    onClick={() => setValue(sk.category, sk.name, r.value)} />
                                ))}
                                {sk.hasNA && (
                                  <button type="button" aria-pressed={!!a?.na} onClick={() => setValue(sk.category, sk.name, null, !a?.na)}
                                    className={cn("ml-1 h-[34px] w-[46px] rounded-full border-2 text-[10px] font-bold transition-colors",
                                      a?.na ? "border-vault-border bg-[#eef4f1] text-jade-muted" : "border-dashed border-vault-border text-jade-muted hover:border-verify-green/50 hover:text-jade-ink")}>
                                    N/A
                                  </button>
                                )}
                              </div>
                              {sk.questionType === "rating_1_4" && !a?.na && (
                                <div className="flex flex-wrap justify-end gap-1.5">
                                  {LAST_PERFORMED.map((r) => (
                                    <RecencyPill key={r.key} k={r.key}
                                      state={a?.lastPerformed === r.key ? "on" : "off"}
                                      onClick={() => setRecency(sk.category, sk.name, r.key)} />
                                  ))}
                                </div>
                              )}
                              {sk.questionType === "rating_1_4" && a?.na && <RecencyPill k="na" />}
                              {sk.questionType === "yes_no" && !a?.na && (
                                <div className="flex gap-2">
                                  {[["yes", "Yes"], ["no", "No"]].map(([v, label]) => (
                                    <button key={v} type="button" onClick={() => setValue(sk.category, sk.name, v)}
                                      className={cn("rounded-lg border px-5 py-1.5 text-sm font-medium transition",
                                        a?.value === v ? "border-verify-green bg-verify-green/15 text-verify-ink" : "border-vault-border text-jade-muted hover:text-jade-ink")}>
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {sk.questionType === "text" && !a?.na && (
                                <Input value={String(a?.value ?? "")} onChange={(e) => setValue(sk.category, sk.name, e.target.value)}
                                  placeholder="Your answer…" className="w-full border-vault-border bg-white text-sm text-jade-ink placeholder:text-[#8aa29c] sm:w-72" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.section>
              );
            })}

            {/* additional questions */}
            {extras.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-6">
                <SectionHeading className="mb-3" right={<span className="text-[11px] text-jade-muted">{extraDone}/{extras.length} answered</span>}>
                  Additional questions
                </SectionHeading>
                <div className="overflow-hidden rounded-xl border border-vault-border bg-white vv-card-shadow">
                  {extras.map((q, qi) => (
                    <div key={q.id} className={cn("px-4 py-4 sm:px-5", qi > 0 && "border-t border-vault-border/50")}>
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <p className="min-w-0 flex-1 text-sm text-jade-ink">
                          {q.prompt}
                          {q.kind === "TEXT" && <span className="ml-2 rounded-full bg-jade-mist px-2 py-0.5 text-[10px] font-semibold text-jade-muted">optional</span>}
                        </p>
                        {q.kind === "YES_NO" && (
                          <div className="flex gap-2">
                            {[["yes", "Yes"], ["no", "No"]].map(([v, label]) => (
                              <button key={v} type="button" onClick={() => setExtraVals((m) => ({ ...m, [q.id]: v }))}
                                className={cn("rounded-lg border px-5 py-1.5 text-sm font-medium transition",
                                  extraVals[q.id] === v ? "border-verify-green bg-verify-green/15 text-verify-ink" : "border-vault-border text-jade-muted hover:text-jade-ink")}>
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {q.kind === "TEXT" && (
                        <Input value={extraVals[q.id] ?? ""} onChange={(e) => setExtraVals((m) => ({ ...m, [q.id]: e.target.value }))}
                          placeholder={q.placeholder || "Your answer…"} className="mt-2.5 border-vault-border bg-white text-sm text-jade-ink placeholder:text-[#8aa29c]" />
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-jade-muted">Yes/No answers are required — the note fields are optional, but they help recruiters place you faster.</p>
              </motion.section>
            )}

            {/* attestation + signature */}
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-6">
              <div className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-verify-ink" />
                  <SectionHeading className="flex-1">Candidate attestation</SectionHeading>
                </div>
                <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                  <input type="checkbox" checked={attAgreed} onChange={(e) => setAttAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-vault-border accent-[#7cc118]" />
                  <span className="text-xs font-semibold text-jade-ink">I confirm the statements below and sign this checklist electronically.</span>
                </label>
                <ul className="mt-2.5 space-y-1.5">
                  {ATTESTATION_STATEMENTS.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-jade-muted">
                      <span className={cn("mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full", attAgreed ? "bg-verify-green" : "bg-vault-border")} />
                      {s}
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex gap-1.5 rounded-xl bg-[#f0f6f2] p-1">
                  {SIGNATURE_MODES.map((m) => {
                    const Icon = m.key === "draw" ? PenLine : m.key === "type" ? Keyboard : FileUp;
                    return (
                      <button key={m.key} type="button" onClick={() => setAttMode(m.key)}
                        className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                          attMode === m.key ? "bg-white text-jade-ink shadow-sm" : "text-jade-muted hover:text-jade-ink")}>
                        <Icon className="h-3.5 w-3.5" /> {m.label}
                      </button>
                    );
                  })}
                </div>

                {attMode === "draw" && (
                  <div className="mt-3">
                    <SignaturePad value={attSignature} onChange={setAttSignature} />
                    <p className="mt-1.5 text-[11px] text-jade-muted">Draw your signature with a mouse, trackpad or finger.</p>
                  </div>
                )}
                {attMode === "type" && (
                  <div className="mt-3">
                    <Input value={typedPreview} onChange={(e) => { setTypedPreview(e.target.value); setAttSignature(e.target.value.trim() || null); }}
                      placeholder="Type your full name — it becomes your signature"
                      className="border-vault-border bg-white text-sm text-jade-ink" />
                    {typedPreview.trim() && (
                      <p className="mt-2 min-h-[44px] rounded-xl border border-vault-border bg-white px-4 text-2xl italic leading-[44px] text-[#03363d]"
                        style={{ fontFamily: "'Segoe Script', 'Bradley Hand', 'Brush Script MT', cursive" }}>
                        {typedPreview}
                      </p>
                    )}
                  </div>
                )}
                {attMode === "upload" && (
                  <div className="mt-3">
                    <input ref={fileRef} type="file" accept="image/*" hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setUploadErr(null);
                        try { setAttSignature(await fileToScaledDataUrl(f)); }
                        catch (err) { setUploadErr(err instanceof Error ? err.message : "Could not read that image"); }
                        finally { if (fileRef.current) fileRef.current.value = ""; }
                      }} />
                    {attSignature && attMode === "upload" ? (
                      <div className="flex items-center gap-3 rounded-xl border border-vault-border bg-white p-3">
                        <img src={attSignature} alt="Uploaded signature" className="max-h-16 rounded-lg border border-vault-border/60" />
                        <button type="button" onClick={() => setAttSignature(null)}
                          className="inline-flex items-center gap-1 rounded-full border border-vault-border px-2.5 py-1 text-[11px] font-semibold text-jade-muted hover:text-jade-ink">
                          <X className="h-3 w-3" /> Remove
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => fileRef.current?.click()}
                        className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-vault-border bg-white text-jade-muted transition hover:border-verify-green/50 hover:text-jade-ink">
                        <FileUp className="h-5 w-5" />
                        <span className="text-xs font-semibold">Upload a photo or scan of your signature</span>
                        <span className="text-[11px]">PNG or JPG — it is scaled down automatically</span>
                      </button>
                    )}
                    {uploadErr && <p className="mt-1.5 text-[11px] font-medium text-rose-600">{uploadErr}</p>}
                  </div>
                )}

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Label htmlFor="printed" className="text-jade-ink/80">Printed name</Label>
                    <Input id="printed" value={attPrinted} onChange={(e) => setAttPrinted(e.target.value)}
                      placeholder="Your full legal name (optional)" className="mt-1.5 border-vault-border bg-white text-jade-ink" />
                  </div>
                  <div>
                    <Label className="text-jade-ink/80">Date</Label>
                    <div className="mt-1.5 rounded-md border border-vault-border bg-[#f6faf8] px-3 py-2 text-sm text-jade-ink">{today}</div>
                  </div>
                </div>
              </div>

              {(error || problems.length > 0) && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-semibold text-rose-700">{error ?? "Some items need attention"}</p>
                  {problems.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-rose-600">
                      {problems.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </motion.section>
          </div>

          {/* ── right — live sticky summary panel ── */}
          <aside className="hidden xl:block">
            <div className="sticky top-24 rounded-2xl border border-vault-border bg-white vv-card-shadow p-5">
              <SectionHeading>Summary at a glance</SectionHeading>
              <div className="mt-4 flex items-center justify-center gap-6">
                <AvgRing avg={summary.avg} />
                <RecentDonut summary={summary} size={84} thickness={11} />
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-[#f6faf8] px-3.5 py-2">
                {([1, 2, 3, 4] as const).map((n) => (
                  <span key={n} className="inline-flex items-center gap-1 text-[11px] text-jade-muted">
                    <span className="h-2 w-2 rounded-full" style={{ background: RATING_META[n].dot }} />
                    <b className="text-jade-ink">{summary.mix[n]}</b>
                  </span>
                ))}
              </div>
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-verify-ink/90">Category overview</p>
                <div className="mt-3"><CategoryBars summary={summary} /></div>
              </div>
              <div className="mt-4 border-t border-vault-border/60 pt-3">
                <RecencyStrip summary={summary} />
              </div>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-jade-muted">
                <Check className={cn("h-3.5 w-3.5", pct === 100 ? "text-verify-ink" : "text-jade-muted/50")} />
                {answeredCount} of {total} complete
              </div>
            </div>
          </aside>
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-vault-border/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 text-xs text-jade-muted">
            {error ? (
              <span className="font-medium text-rose-600">{error}</span>
            ) : !canSubmit ? (
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {answeredCount < total && <span>{total - answeredCount} skill item(s) left</span>}
                {yesNoMissing > 0 && <span>{yesNoMissing} Yes/No question(s) left</span>}
                {!attAgreed && <span>confirm the attestation</span>}
                {!attSignature && <span>add your signature</span>}
              </span>
            ) : (
              "All set — ready to submit."
            )}
          </div>
          <Button onClick={submit} disabled={saving || !canSubmit} className="shrink-0 bg-verify-green text-vault-dark hover:bg-verify-green/90 disabled:opacity-40">
            {saving ? "Saving…" : "Submit checklist"} <Check className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </footer>
      {saving && <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70"><Spinner label="Saving your checklist…" /></div>}
    </div>
  );
}
