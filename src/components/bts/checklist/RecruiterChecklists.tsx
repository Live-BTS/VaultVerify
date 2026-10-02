"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DISCIPLINES, PROFESSIONS } from "@/lib/bts/catalog";
import { specialtyLabel } from "@/lib/bts/checklistShared";
import { Spinner } from "../brand";
import { ArrowLeft, ArrowRight, Check, ClipboardList, Download, Eye, Send, UserRoundCheck, UserRoundX, Wand2 } from "lucide-react";

// ── Recruiter "Checklists" panel — two-step send flow ────────────
// Step 1: pick the checklist from cascading dropdowns
//         Profession (Nursing / Allied / Pharmacy / Locums)
//         → Discipline (RN, LPN, PT, …) → Specialty (Med-Surg, ICU, …)
// Step 2: candidate details — Name*, Phone*, Email* are required; anything
//         else the candidate completes (auto-fetched if they already have
//         an account). Completed checklists are reusable for 1 year.

interface InviteRow {
  id: string; candidateName: string; candidateEmail: string; candidatePhone: string;
  profession: string; jobTitle: string; specialty: string; specialtyLabel: string;
  recruiterName: string; facilityName: string; status: string;
  createdAt: string; completedAt: string | null; claimUrl: string | null;
  completion: { candidateName: string; candidateTitle: string; jobTitle: string; specialtyLabel: string; yearsExperience: number; completedAt: string; expiresAt: string } | null;
}

interface CatalogSet { key: string; profession: string; jobTitle: string; specialty: string; label: string; skills: { name: string }[] }

const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const selectCls = "mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/30";

export function RecruiterChecklists({ code, recruiterName }: { code: string; recruiterName: string }) {
  const [rows, setRows] = useState<InviteRow[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogSet[]>([]);
  // step 1: cascade
  const [step, setStep] = useState<1 | 2>(1);
  const [profession, setProfession] = useState("Nursing");
  const [jobTitle, setJobTitle] = useState("RN");
  const [specialty, setSpecialty] = useState("");
  // step 2: candidate details
  const [form, setForm] = useState({ candidateName: "", candidatePhone: "", candidateEmail: "", facilityName: "", message: "" });
  const [autoFetched, setAutoFetched] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ claimUrl: string | null; claimedByAccount: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checklist/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, action: "list" }) });
      const d = await res.json();
      if (d.ok) setRows(d.invites);
    } catch { /* keep old rows */ }
  }, [code]);

  useEffect(() => {
    load();
    fetch("/api/checklists").then((r) => r.json()).then((d) => { if (d.ok) setCatalog(d.checklists); }).catch(() => undefined);
  }, [load]);

  // published specialties for the chosen profession + discipline
  const published = useMemo(
    () => catalog.filter((s) => s.profession === profession && s.jobTitle === jobTitle),
    [catalog, profession, jobTitle]
  );
  const disciplineOptions = DISCIPLINES[profession] ?? [];

  const pickProfession = (p: string) => {
    setProfession(p);
    const discs = DISCIPLINES[p] ?? [];
    setJobTitle(discs[0]?.key ?? "");
    setSpecialty("");
  };

  const resetAll = () => {
    setStep(1); setSpecialty(""); setForm({ candidateName: "", candidatePhone: "", candidateEmail: "", facilityName: "", message: "" });
    setAutoFetched(false); setSent(null); setError(null);
  };

  // auto-fetch candidate details if they already have an account
  const lookupAccount = async (email: string) => {
    if (!email.includes("@")) return;
    try {
      const res = await fetch("/api/checklist/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, action: "lookup", email }) });
      const d = await res.json();
      if (d.ok && d.exists) {
        setForm((f) => ({
          ...f,
          candidateName: f.candidateName || d.profile.name || "",
          candidatePhone: f.candidatePhone || d.profile.phone || "",
        }));
        setAutoFetched(true);
      } else {
        setAutoFetched(false);
      }
    } catch { /* silent */ }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/checklist/invite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action: "send", ...form, profession, jobTitle, specialty, recruiterName }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Send failed");
      setSent({ claimUrl: d.invite?.claimUrl ?? null, claimedByAccount: !!d.claimedByAccount });
      setForm({ candidateName: "", candidatePhone: "", candidateEmail: "", facilityName: "", message: "" });
      setAutoFetched(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally { setSending(false); }
  };

  const selectedSet = published.find((s) => s.specialty === specialty);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[400px_1fr]">
      {/* ── Send flow ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {step === 1 ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Wand2 className="h-4 w-4 text-teal-700" /> Select the skill checklist</h2>
              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold text-teal-800">Step 1 of 2</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Drill down to the exact checklist — profession, discipline, then specialty.</p>
            <div className="mt-4 space-y-3.5">
              <div>
                <Label htmlFor="cs-prof">Profession</Label>
                <select id="cs-prof" value={profession} onChange={(e) => pickProfession(e.target.value)} className={selectCls}>
                  {PROFESSIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="cs-disc">Discipline</Label>
                <select id="cs-disc" value={jobTitle} onChange={(e) => { setJobTitle(e.target.value); setSpecialty(""); }} className={selectCls} disabled={!profession}>
                  {disciplineOptions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="cs-spec">Specialty</Label>
                <select id="cs-spec" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={selectCls} disabled={!jobTitle}>
                  <option value="">{published.length ? "Select specialty…" : "No published checklists yet"}</option>
                  {published.map((s) => (
                    <option key={s.key} value={s.specialty}>{specialtyLabel(s.specialty)} · {s.skills.length} skills</option>
                  ))}
                </select>
                {profession && jobTitle && published.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-amber-600">No checklist published for this combination yet — a superadmin can import one via the MyZipVault template.</p>
                )}
              </div>
            </div>
            <Button onClick={() => setStep(2)} disabled={!specialty} className="mt-5 w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-40">
              Next: candidate details <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Send className="h-4 w-4 text-teal-700" /> Candidate details</h2>
              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold text-teal-800">Step 2 of 2</span>
            </div>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">{specialtyLabel(specialty)} · {jobTitle} · {profession}</p>
              <p className="mt-0.5">{selectedSet?.skills.length ?? 0} skill(s) — the candidate completes it once; it stays valid for 1 year.</p>
              <button type="button" onClick={() => { setStep(1); setSent(null); }} className="mt-1.5 flex items-center gap-1 font-medium text-teal-700 underline"><ArrowLeft className="h-3 w-3" /> Change checklist</button>
            </div>
            {sent ? (
              <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
                {sent.claimedByAccount || !sent.claimUrl ? (
                  <p className="flex items-center gap-1.5 font-medium"><Check className="h-3.5 w-3.5" /> Delivered — the candidate already has an account, it's in their Invites tab.</p>
                ) : (
                  <>
                    <p className="font-medium">Invite created. Share the claim link with the candidate:</p>
                    <p className="mt-1 break-all rounded bg-white/70 p-2 font-mono text-[11px]">{sent.claimUrl}</p>
                  </>
                )}
                <button type="button" onClick={resetAll} className="mt-2 flex items-center gap-1 font-semibold text-teal-800 underline">Send another checklist</button>
              </div>
            ) : (
              <form onSubmit={send} className="mt-4 space-y-3">
                <div>
                  <Label htmlFor="ci-name">Candidate name *</Label>
                  <Input id="ci-name" required value={form.candidateName} onChange={(e) => setForm({ ...form, candidateName: e.target.value })} placeholder="Emma Chen" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ci-phone">Phone number *</Label>
                    <Input id="ci-phone" required type="tel" value={form.candidatePhone} onChange={(e) => setForm({ ...form, candidatePhone: e.target.value })} placeholder="(555) 214-8890" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="ci-email">Email *</Label>
                    <Input id="ci-email" required type="email" value={form.candidateEmail} onChange={(e) => setForm({ ...form, candidateEmail: e.target.value })} onBlur={(e) => lookupAccount(e.target.value)} placeholder="emma@example.com" className="mt-1" />
                  </div>
                </div>
                {autoFetched && (
                  <p className="flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-[11px] font-medium text-teal-800">
                    <UserRoundCheck className="h-3.5 w-3.5" /> Details auto-fetched from the candidate's account — editable below.
                  </p>
                )}
                <p className="text-[11px] text-slate-400">Name, phone and email are must-fill. The candidate confirms/corrects everything else during their onboarding.</p>
                <div>
                  <Label htmlFor="ci-fac">Facility (optional)</Label>
                  <Input id="ci-fac" value={form.facilityName} onChange={(e) => setForm({ ...form, facilityName: e.target.value })} placeholder="St. Mary Medical Center" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="ci-msg">Note to the candidate (optional)</Label>
                  <Input id="ci-msg" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Needed before the ICU placement on the 14th" className="mt-1" />
                </div>
                {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
                <Button type="submit" disabled={sending} className="w-full bg-teal-700 hover:bg-teal-800">
                  {sending ? "Sending…" : "Send checklist request"} <Send className="ml-2 h-4 w-4" />
                </Button>
              </form>
            )}
          </>
        )}
      </motion.div>

      {/* ── Invites list ── */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><ClipboardList className="h-4 w-4 text-teal-700" /> Sent checklists</h2>
        {!rows && <div className="flex justify-center rounded-2xl border border-slate-200 bg-white p-10"><Spinner /></div>}
        {rows?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No checklists sent yet. Pick a checklist on the left — the candidate completes it once and it's reusable for a year.
          </div>
        )}
        {rows?.map((r) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {r.candidateName} <span className="ml-1 text-xs font-normal text-slate-500">{r.candidateEmail}{r.candidatePhone ? ` · ${r.candidatePhone}` : ""}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {r.status === "COMPLETED" && r.completion
                    ? `${r.completion.specialtyLabel} · ${r.completion.yearsExperience} yr · completed ${fmt(r.completion.completedAt)} · valid until ${fmt(r.completion.expiresAt)}`
                    : `${r.specialty ? `${specialtyLabel(r.specialty)} · ${r.jobTitle} · ${r.profession}` : "Checklist pending selection"} · sent ${fmt(r.createdAt)}`}
                </p>
              </div>
              {r.status === "COMPLETED" && r.completion ? (
                <div className="flex gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800"><Check className="h-3 w-3" /> Completed</span>
                  <a href={`/api/checklist/pdf?invite=${r.id}&code=${encodeURIComponent(code)}`} download>
                    <Button size="sm" variant="outline" className="border-teal-200 text-teal-800 hover:bg-teal-50"><Download className="mr-1.5 h-3.5 w-3.5" /> PDF</Button>
                  </a>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  <UserRoundX className="h-3 w-3" /> Waiting for candidate
                </span>
              )}
            </div>
            {r.status !== "COMPLETED" && r.claimUrl && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500">
                <Eye className="h-3 w-3 shrink-0" /> Candidate hasn't claimed it yet —
                <a href={r.claimUrl} className="font-mono text-teal-700 underline">{r.claimUrl}</a>
              </p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
