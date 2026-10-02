"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DISCIPLINES, PROFESSIONS, SPECIALTIES_BY_DISCIPLINE, US_STATES } from "@/lib/bts/catalog";
import { VaultMark } from "../brand";
import type { CatalogSet } from "./ChecklistFill";
import { AtSign, CalendarDays, Check, Hash, Lock, Save, UserRound } from "lucide-react";

// ── Candidate onboarding / profile form ──────────────────────────
// One form for both paths: invited by a recruiter (details pre-filled from
// the invite — editable so the candidate can correct anything wrong) and
// self-signup. Experience accepts EITHER a manual year count OR a calendar
// start date — with a start date the platform keeps recalculating the years
// automatically. Saved into the account → superadmin Data Center.

export interface ProfileData {
  name: string; email: string; title: string;
  phone: string; city: string; state: string; zip: string;
  profession: string; discipline: string; specialty: string;
  yrsOverall: number; yrsSpecialty: number;
  yrsOverallStart: string; yrsSpecialtyStart: string;
}

type ExpMode = "years" | "calendar";

function ExperienceInput({ id, label, mode, setMode, years, setYears, date, setDate }: {
  id: string; label: string; mode: ExpMode; setMode: (m: ExpMode) => void;
  years: string; setYears: (v: string) => void; date: string; setDate: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-jade-ink/80">{label}</Label>
      <div className="mt-1.5 flex gap-1.5">
        {([["years", "Enter years", Hash], ["calendar", "Start date", CalendarDays]] as const).map(([m, lb, Icon]) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
              mode === m ? "border-verify-green bg-verify-green/15 text-verify-ink" : "border-vault-border text-jade-muted hover:text-jade-ink")}>
            <Icon className="h-3.5 w-3.5" /> {lb}
          </button>
        ))}
      </div>
      {mode === "years" ? (
        <Input id={id} type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} placeholder="e.g. 6"
          className="mt-2 border-vault-border bg-white text-jade-ink placeholder:text-[#8aa29c]" />
      ) : (
        <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="mt-2 border-vault-border bg-white text-jade-ink" />
      )}
      <p className="mt-1 text-[11px] text-[#8aa29c]">
        {mode === "years" ? "Rounded years — you can switch to a start date later for auto-calculation." : "The platform keeps calculating your years of experience from this date automatically."}
      </p>
    </div>
  );
}

export function ChecklistOnboarding({ account, sets, onSaved, embedded, onExit, banner }: {
  account: ProfileData;
  sets: CatalogSet[];
  onSaved: () => void | Promise<void>;
  embedded?: boolean;
  onExit?: () => void;
  banner?: string;
}) {
  const [form, setForm] = useState({
    name: account.name, phone: account.phone, city: account.city, state: account.state, zip: account.zip,
    profession: account.profession, discipline: account.discipline || account.title, specialty: account.specialty,
  });
  const [overallMode, setOverallMode] = useState<ExpMode>(account.yrsOverallStart ? "calendar" : "years");
  const [specialtyMode, setSpecialtyMode] = useState<ExpMode>(account.yrsSpecialtyStart ? "calendar" : "years");
  const [overallYears, setOverallYears] = useState(account.yrsOverall ? String(account.yrsOverall) : "");
  const [overallDate, setOverallDate] = useState(account.yrsOverallStart ?? "");
  const [specialtyYears, setSpecialtyYears] = useState(account.yrsSpecialty ? String(account.yrsSpecialty) : "");
  const [specialtyDate, setSpecialtyDate] = useState(account.yrsSpecialtyStart ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const disciplineOptions = DISCIPLINES[form.profession] ?? [];
  // specialty options = suggested universe for the discipline, enriched with
  // published library sets (shown first with their skill counts)
  const specialtyOptions = useMemo(() => {
    const suggested = SPECIALTIES_BY_DISCIPLINE[form.discipline] ?? [];
    const published = sets.filter((s) => s.profession === form.profession && s.jobTitle === form.discipline);
    const out: { key: string; label: string; published: boolean; count?: number }[] = [];
    for (const p of published) out.push({ key: p.specialty, label: p.label, published: true, count: p.skills.length });
    for (const s of suggested) if (!out.some((o) => o.key === s.key)) out.push({ key: s.key, label: s.label, published: false });
    // keep the candidate's current specialty visible even when it's outside the suggested list
    if (form.specialty && !out.some((o) => o.key === form.specialty)) {
      const match = published.find((p) => p.specialty === form.specialty);
      out.push(match ? { key: match.specialty, label: match.label, published: true, count: match.skills.length } : { key: form.specialty, label: form.specialty.replace(/_/g, " "), published: false });
    }
    return out;
  }, [sets, form.profession, form.discipline, form.specialty]);

  const set = (patch: Partial<typeof form>) => {
    setForm((f) => {
      const next = { ...f, ...patch };
      // reset dependent cascade fields
      if (patch.profession !== undefined && patch.profession !== f.profession) {
        const discs = DISCIPLINES[patch.profession] ?? [];
        if (!discs.some((d) => d.key === next.discipline)) next.discipline = discs[0]?.key ?? "";
        next.specialty = "";
      }
      if (patch.discipline !== undefined && patch.discipline !== f.discipline) next.specialty = "";
      return next;
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/checklist/account", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "profile",
          name: form.name,
          phone: form.phone,
          city: form.city, state: form.state, zip: form.zip,
          profession: form.profession, discipline: form.discipline, specialty: form.specialty,
          yrsOverall: overallMode === "years" ? Number(overallYears) || 0 : 0,
          yrsOverallStart: overallMode === "calendar" ? overallDate : "",
          yrsSpecialty: specialtyMode === "years" ? Number(specialtyYears) || 0 : 0,
          yrsSpecialtyStart: specialtyMode === "calendar" ? specialtyDate : "",
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Could not save your profile");
      setSaved(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile");
    } finally { setSaving(false); }
  };

  const selectCls = "mt-1.5 w-full rounded-md border border-vault-border bg-white px-3 py-2 text-sm text-jade-ink focus:outline-none focus:ring-2 focus:ring-verify-green/40";

  const inner = (
    <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      onSubmit={save} className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-6 sm:p-8">
      {!embedded && (
        <div className="flex items-center gap-3">
          <VaultMark size={40} />
          <div>
            <p className="text-sm font-semibold text-jade-ink">Candidate onboarding</p>
            <p className="text-xs text-jade-muted">One profile, reused by every checklist and share.</p>
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex items-center gap-3">
          <UserRound className="h-5 w-5 text-verify-ink" />
          <div>
            <p className="text-sm font-semibold text-jade-ink">Your profile</p>
            <p className="text-xs text-jade-muted">Keep this current — recruiters and the PDF report use these details.</p>
          </div>
        </div>
      )}
      {banner && (
        <div className="mt-4 rounded-xl border border-verify-green/30 bg-verify-green/10 px-4 py-3 text-xs font-medium text-verify-ink">{banner}</div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ob-name" className="text-jade-ink/80">Full name *</Label>
          <Input id="ob-name" required value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Emma Chen"
            className="mt-1.5 border-vault-border bg-white text-jade-ink placeholder:text-[#8aa29c]" />
        </div>
        <div>
          <Label htmlFor="ob-email" className="flex items-center gap-1 text-jade-ink/80"><AtSign className="h-3 w-3" /> Email — your username</Label>
          <div className="relative">
            <Input id="ob-email" value={account.email} readOnly
              className="mt-1.5 border-vault-border bg-[#f0f6f2] pr-9 text-jade-muted" />
            <Lock className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8aa29c]" />
          </div>
        </div>
        <div>
          <Label htmlFor="ob-phone" className="text-jade-ink/80">Phone number *</Label>
          <Input id="ob-phone" required type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(555) 214-8890"
            className="mt-1.5 border-vault-border bg-white text-jade-ink placeholder:text-[#8aa29c]" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3 sm:col-span-3">
            <Label className="text-jade-ink/80">Location (city / state / ZIP)</Label>
          </div>
          <Input aria-label="City" value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="Denver"
            className="border-vault-border bg-white text-jade-ink placeholder:text-[#8aa29c]" />
          <select aria-label="State" value={form.state} onChange={(e) => set({ state: e.target.value })} className={cn(selectCls, "mt-0")}>
            <option value="">State</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Input aria-label="ZIP" value={form.zip} onChange={(e) => set({ zip: e.target.value })} placeholder="80203"
            className="border-vault-border bg-white text-jade-ink placeholder:text-[#8aa29c]" />
        </div>
      </div>

      <div className="mt-6 border-t border-vault-border/70 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-muted">Profession & specialty</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="ob-prof" className="text-jade-ink/80">Profession</Label>
            <select id="ob-prof" value={form.profession} onChange={(e) => set({ profession: e.target.value })} className={selectCls}>
              <option value="">Select…</option>
              {PROFESSIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="ob-disc" className="text-jade-ink/80">Discipline</Label>
            <select id="ob-disc" value={form.discipline} onChange={(e) => set({ discipline: e.target.value })} className={selectCls} disabled={!form.profession}>
              <option value="">{form.profession ? "Select…" : "Pick profession first"}</option>
              {disciplineOptions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="ob-spec" className="text-jade-ink/80">Specialty</Label>
            <select id="ob-spec" value={form.specialty} onChange={(e) => set({ specialty: e.target.value })} className={selectCls} disabled={!form.discipline}>
              <option value="">{form.discipline ? "Select…" : "Pick discipline first"}</option>
              {specialtyOptions.map((s) => (
                <option key={s.key} value={s.key}>{s.label}{s.published ? ` · ${s.count} skills` : ""}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-vault-border/70 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-muted">Experience — enter once, we keep it current</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <ExperienceInput id="ob-yrs-all" label="Overall years of experience" mode={overallMode} setMode={setOverallMode}
            years={overallYears} setYears={setOverallYears} date={overallDate} setDate={setOverallDate} />
          <ExperienceInput id="ob-yrs-spec" label="Experience in current specialty" mode={specialtyMode} setMode={setSpecialtyMode}
            years={specialtyYears} setYears={setSpecialtyYears} date={specialtyDate} setDate={setSpecialtyDate} />
        </div>
      </div>

      {error && <p className="mt-4 text-xs font-medium text-rose-600">{error}</p>}
      {saved && !error && <p className="mt-4 text-xs font-medium text-verify-ink">Saved — your profile is up to date.</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="submit" disabled={saving} className="bg-verify-green text-vault-dark hover:bg-verify-green/90">
          {saving ? "Saving…" : embedded ? "Save profile" : "Save & continue"} {!saving && <Save className="ml-2 h-4 w-4" />}
        </Button>
        {!embedded && onExit && (
          <Button type="button" variant="ghost" onClick={onExit} className="border border-vault-border text-jade-muted hover:text-jade-ink">
            Sign out
          </Button>
        )}
        {saved && !embedded && <span className="flex items-center gap-1.5 self-center text-xs font-medium text-verify-ink"><Check className="h-4 w-4" /> Profile saved — opening your dashboard…</span>}
      </div>
    </motion.form>
  );

  if (embedded) return inner;

  return (
    <div className="vv-page min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">{inner}</div>
    </div>
  );
}
