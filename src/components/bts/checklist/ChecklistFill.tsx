"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { RATING_4, specialtyLabel } from "@/lib/bts/checklistShared";
import { VaultMark, Spinner } from "../brand";
import { ArrowLeft, ArrowRight, Check, ClipboardList, Info } from "lucide-react";

// ── Skills Checklist self-assessment form (one-time completion) ──
// Rating 1-4 per the MyZipVault template, with N/A where the template allows.

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

type AnswerMap = Record<string, { value: number | string | null; na: boolean }>;

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
  const keyOf = (cat: string, skill: string) => `${cat}::${skill}`;
  const answeredCount = set ? set.skills.filter((sk) => answers[keyOf(sk.category, sk.name)]?.na || answers[keyOf(sk.category, sk.name)]?.value != null).length : 0;
  const pct = total ? Math.round((answeredCount / total) * 100) : 0;

  const setValue = (cat: string, skill: string, value: number | string | null, na = false) =>
    setAnswers((a) => ({ ...a, [keyOf(cat, skill)]: { value: na ? null : value, na } }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payloadAnswers = (set?.skills ?? []).map((sk) => {
        const a = answers[keyOf(sk.category, sk.name)];
        return { category: sk.category, skill: sk.name, questionType: sk.questionType, value: a?.value ?? null, na: !!a?.na };
      });
      const res = await fetch("/api/checklist/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...effSpec, yearsExperience: Number(years) || 0, answers: payloadAnswers }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        const detail = d.problems?.length ? ` — ${d.problems[0]}${d.problems.length > 1 ? ` (+${d.problems.length - 1} more)` : ""}` : "";
        throw new Error((d.error ?? "Could not save") + detail);
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
      <div className="vv-dark flex min-h-screen items-center justify-center px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-lg rounded-2xl border border-vault-border bg-vault-teal/20 p-8 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <VaultMark size={40} />
            <div>
              <p className="text-sm font-semibold text-verify-light">Skills Checklist</p>
              <p className="text-xs text-[#8fb0ab]">Self-assessment · completed once · valid for 1 year</p>
            </div>
          </div>
          <h1 className="mt-6 text-xl font-semibold text-verify-light">
            {set?.label ?? (specialtyLabel(effSpec.specialty) || "Pick your checklist")} <span className="text-[#8fb0ab]">· {effSpec.jobTitle || "RN"}</span>
          </h1>
          {!set && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8fb0ab]">The recruiter left it open — which checklist?</p>
              <div className="mt-2 grid gap-2">
                {sets.map((s) => (
                  <button key={s.key} type="button" onClick={() => setChosen({ specialty: s.specialty, jobTitle: s.jobTitle, profession: s.profession })}
                    className={cn("rounded-xl border px-4 py-3 text-left transition",
                      chosen?.specialty === s.specialty ? "border-verify-green bg-verify-green/15 text-verify-green" : "border-vault-border text-verify-light hover:border-verify-green/40")}>
                    <span className="block text-sm font-semibold">{s.label} <span className="text-xs font-normal text-[#8fb0ab]">· {s.jobTitle} · {s.profession}</span></span>
                    <span className="mt-0.5 block text-[11px] text-[#8fb0ab]">{s.skills.length} skill(s)</span>
                  </button>
                ))}
                {sets.length === 0 && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-300">No checklists published yet — ask the recruiter or admin.</p>}
              </div>
            </div>
          )}
          {spec.recruiterName ? (
            <div className="mt-3 rounded-xl border border-vault-border bg-vault-dark/50 p-4">
              <p className="text-sm text-verify-light">
                Requested by <span className="font-semibold text-verify-green">{spec.recruiterName}</span>
                {spec.facilityName ? ` · ${spec.facilityName}` : ""}
              </p>
              {spec.message && <p className="mt-1 text-xs italic text-[#8fb0ab]">“{spec.message}”</p>}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-vault-border bg-vault-dark/50 p-4">
              <p className="text-sm text-[#8fb0ab]">Your approved request — complete it once and it stays in your account.</p>
            </div>
          )}
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-verify-green/25 bg-verify-green/10 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-verify-green" />
            <p className="text-xs leading-relaxed text-[#c9ded9]">
              Rate yourself honestly on the MyZipVault 1-4 scale: 1 = No theory and/or experience · 2 = Limited experience ·
              3 = Experienced / minimal support needed · 4 = Proficient. Recruiters see exactly what you report.
            </p>
          </div>
          <div className="mt-5">
            <Label htmlFor="years" className="text-verify-light/80">Years of experience in this specialty</Label>
            <Input id="years" type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)}
              className="mt-1.5 border-vault-border bg-vault-dark/60 text-verify-light" />
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="ghost" onClick={onExit} className="border border-vault-border text-[#8fb0ab] hover:text-verify-light">
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

  // ── Form ──
  return (
    <div className="vv-dark min-h-screen">
      <header className="sticky top-0 z-40 border-b border-vault-border/70 bg-vault-dark/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <VaultMark size={30} />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-verify-light">{set?.label ?? specialtyLabel(spec.specialty)}</p>
              <p className="text-[11px] text-[#8fb0ab]">{answeredCount}/{total} completed</p>
            </div>
          </div>
          <div className="flex w-40 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-vault-border">
              <div className="h-full rounded-full bg-verify-green transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-semibold text-verify-green">{pct}%</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-32 pt-8 sm:px-6">
        {categories.map((cat, ci) => (
          <motion.section key={cat.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-verify-green/90">
              <ClipboardList className="h-3.5 w-3.5" /> {cat.name}
            </h2>
            <div className="overflow-hidden rounded-xl border border-vault-border bg-vault-teal/20 backdrop-blur-md">
              {cat.items.map((sk, si) => {
                const k = keyOf(sk.category, sk.name);
                const a = answers[k];
                return (
                  <div key={sk.name} className={cn("px-4 py-4 sm:px-5", si > 0 && "border-t border-vault-border/50")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-verify-light">
                        {sk.highRisk && <span className="mr-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-400">High-risk</span>}
                        {sk.name}
                      </p>
                      {sk.hasNA && (
                        <button type="button" onClick={() => setValue(sk.category, sk.name, null, !a?.na)}
                          className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition",
                            a?.na ? "border-verify-green bg-verify-green/20 text-verify-green" : "border-vault-border text-[#8fb0ab] hover:text-verify-light")}>
                          N/A
                        </button>
                      )}
                    </div>
                    {sk.questionType === "rating_1_4" && (
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {RATING_4.map((r) => {
                          const active = !a?.na && a?.value === r.value;
                          return (
                            <button key={r.value} type="button" onClick={() => setValue(sk.category, sk.name, r.value)}
                              className={cn("rounded-lg border px-2 py-2 text-center transition",
                                active ? "border-verify-green bg-verify-green/15 text-verify-green" : "border-vault-border text-[#8fb0ab] hover:border-verify-green/40 hover:text-verify-light")}>
                              <span className="block text-lg font-bold">{r.value}</span>
                              <span className="mt-0.5 block text-[10px] leading-tight opacity-80">{r.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {sk.questionType === "yes_no" && !a?.na && (
                      <div className="mt-3 flex gap-2">
                        {[["yes", "Yes"], ["no", "No"]].map(([v, label]) => (
                          <button key={v} type="button" onClick={() => setValue(sk.category, sk.name, v)}
                            className={cn("rounded-lg border px-5 py-1.5 text-sm font-medium transition",
                              a?.value === v ? "border-verify-green bg-verify-green/15 text-verify-green" : "border-vault-border text-[#8fb0ab] hover:text-verify-light")}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    {sk.questionType === "text" && !a?.na && (
                      <Input value={String(a?.value ?? "")} onChange={(e) => setValue(sk.category, sk.name, e.target.value)}
                        placeholder="Your answer…"
                        className="mt-3 border-vault-border bg-vault-dark/60 text-sm text-verify-light placeholder:text-[#5c7a76]" />
                    )}
                  </div>
                );
              })}
            </div>
          </motion.section>
        ))}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-vault-border/70 bg-vault-dark/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="text-xs text-[#8fb0ab]">
            {error ? <span className="font-medium text-rose-400">{error}</span> : answeredCount === total ? "All set — ready to submit." : `${total - answeredCount} item(s) left`}
          </div>
          <Button onClick={submit} disabled={saving || answeredCount < total} className="bg-verify-green text-vault-dark hover:bg-verify-green/90 disabled:opacity-40">
            {saving ? "Saving…" : "Submit checklist"} <Check className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </footer>
      {saving && <div className="fixed inset-0 z-50 flex items-center justify-center bg-vault-dark/60"><Spinner label="Saving your checklist…" /></div>}
    </div>
  );
}
