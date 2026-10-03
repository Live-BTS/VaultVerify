"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { validateRows, type ImportRow, type ValidatedRow } from "@/lib/bts/importValidate";
import { specialtyLabel } from "@/lib/bts/checklistShared";
import { professionLabel, disciplineLabel } from "@/lib/bts/catalog";
import { AgencyLogo, VaultMark, Spinner } from "./brand";
import {
  ShieldCheck, Upload, FileDown, Database, Building2, Trash2, ChevronDown, RefreshCw, Hourglass,
  Check, X, Users, BookUser, Wallet, LayoutDashboard, PlusCircle, MessagesSquare, ToggleLeft, Pencil,
} from "lucide-react";
import * as XLSX from "xlsx";

// ── Super Admin — platform console with sidebar navigation ─────────
// Sections: Requests (approval queue) · User management · Company management ·
// Candidate management (Data Center) · Credit management · Skills & imports.

interface TemplateRow {
  id: string; category: string; skillName: string; questionType: string; hasNA: boolean; highRisk: boolean; active: boolean; source: string;
}
interface TemplateSet {
  profession: string; jobTitle: string; specialty: string; count: number; sources: string[]; rows: TemplateRow[];
}
interface UserRow {
  id: string; name: string; email: string; title: string; onboardingComplete: boolean;
  completions: number; requests: number; invites: number; joinedAt: string;
}
interface CandidateProfileRow {
  id: string; name: string; phone: string; email: string;
  city: string; state: string; zip: string;
  profession: string; discipline: string; specialty: string;
  yrsOverall: number; yrsSpecialty: number; yrsOverallStart: string; yrsSpecialtyStart: string;
}
interface CompanyRow {
  id: string; name: string; slug: string; logoText: string; candidates: number;
  primaryColor: string; accentColor: string; creditsGranted: number; creditsUsed: number; creditsRemaining: number;
}
interface Overview {
  stats: { agencies: number; candidates: number; requests: number; completed: number; responses: number; templates: number; openFlags: number; notifications: number; pendingChecklistRequests: number };
  agencies: { id: string; name: string; slug: string; logoText: string; candidates: number; primaryColor: string; accentColor: string }[];
  sets: TemplateSet[];
  users: UserRow[];
  candidateProfiles: CandidateProfileRow[];
  companies: CompanyRow[];
  extras: ExtraQ[];
}

interface ChecklistRequestRow {
  id: string;
  account: { name: string; email: string; title: string };
  profession: string; jobTitle: string; specialty: string;
  status: string; requestedAt: string; decidedAt: string | null;
}

interface ExtraQ {
  id: string; kind: string; prompt: string; placeholder: string; specialty: string; active: boolean; sortOrder: number;
}

type Section = "requests" | "users" | "companies" | "candidates" | "credits" | "skills";

const REQUIRED_COLS = ["Profession", "Job Title", "Specialty", "Category", "Skill Name", "Question Type", "Has N/A Option"];

async function parseWorkbook(file: File): Promise<{ rows: ImportRow[]; sheetName: string; headerFound: boolean }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.find((n) => /skill/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  // locate header row within the first 12 rows
  let headerIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 12); i++) {
    const cells = (aoa[i] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
    if (cells.includes("skill name") && cells.includes("profession")) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return { rows: [], sheetName, headerFound: false };
  const headers = (aoa[headerIdx] ?? []).map((c) => String(c ?? "").trim());
  const idx = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const colMap = { profession: idx("Profession"), jobTitle: idx("Job Title"), specialty: idx("Specialty"), category: idx("Category"), skillName: idx("Skill Name"), questionType: idx("Question Type"), hasNA: idx("Has N/A Option") };
  const rows: ImportRow[] = [];
  for (const cells of aoa.slice(headerIdx + 1)) {
    const get = (i: number) => (i >= 0 ? String(cells[i] ?? "").trim() : "");
    const r = { profession: get(colMap.profession), jobTitle: get(colMap.jobTitle), specialty: get(colMap.specialty), category: get(colMap.category), skillName: get(colMap.skillName), questionType: get(colMap.questionType), hasNA: get(colMap.hasNA).toLowerCase() === "yes" };
    if (!r.profession && !r.jobTitle && !r.specialty && !r.category && !r.skillName) continue; // skip fully blank rows
    rows.push(r);
  }
  return { rows, sheetName, headerFound: true };
}

const NAV: [Section, string, typeof Users][] = [
  ["requests", "Requests", Hourglass],
  ["users", "User management", Users],
  ["companies", "Company management", Building2],
  ["candidates", "Candidate management", BookUser],
  ["credits", "Credit management", Wallet],
  ["skills", "Skills & imports", Database],
];

const th = "px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-jade-muted";
const td = "px-3 py-2.5 text-sm text-jade-ink border-t border-vault-border/60";

export function SuperAdmin({ onExit }: { onExit: () => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<Section>("requests");
  const [cqRequests, setCqRequests] = useState<ChecklistRequestRow[] | null>(null);
  const [openSet, setOpenSet] = useState<string | null>(null);
  const [pending, setPending] = useState<{ rows: ImportRow[]; clean: ValidatedRow[]; errors: string[]; fileName: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/superadmin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, ...payload }) });
    const d = await res.json();
    if (!res.ok || !d.ok) throw new Error(d.error ?? "Request failed");
    return d;
  }, [code]);

  const auth = async (c?: string) => {
    const useCode = c ?? code;
    if (!useCode.trim()) return toast({ title: "Enter the superadmin code.", variant: "destructive" });
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auth", code: useCode }) });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Invalid code");
      setCode(useCode);
      setData(d);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Sign-in failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    try { setData(await call({ action: "auth" })); } catch { /* keep old data */ }
  };

  const loadRequests = async () => {
    try { const d = await call({ action: "requests" }); setCqRequests(d.requests); } catch { /* keep old */ }
  };

  const decide = async (id: string, approve: boolean) => {
    try {
      await call({ action: "decide", id, approve });
      toast({ title: approve ? "Request approved" : "Request declined", description: approve ? "The candidate can now complete the checklist." : "The candidate will see the decision in their portal." });
      await Promise.all([refresh(), loadRequests()]);
    } catch { toast({ title: "Decision failed", variant: "destructive" }); }
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    try {
      const { rows, sheetName, headerFound } = await parseWorkbook(f);
      if (!headerFound) {
        setPending(null);
        return toast({ title: "Headers not found", description: `Sheet "${sheetName}" must contain the 7 MyZipVault columns (Profession … Has N/A Option).`, variant: "destructive" });
      }
      const { errors, clean } = validateRows(rows);
      setPending({ rows, clean, errors, fileName: f.name });
    } catch {
      toast({ title: "Could not read that file", description: "Save the workbook as .xlsx and try again.", variant: "destructive" });
    }
  };

  const runImport = async () => {
    if (!pending) return;
    setImporting(true);
    try {
      const d = await call({ action: "import", rows: pending.rows });
      toast({ title: `Imported ${d.created} new · updated ${d.updated}`, description: d.errors?.length ? `${d.errors.length} row(s) rejected — see report.` : "All rows passed validation." });
      setPending(null);
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Import failed", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const toggleRow = async (row: TemplateRow) => {
    try { await call({ action: "toggle", id: row.id, active: !row.active }); await refresh(); } catch { toast({ title: "Update failed", variant: "destructive" }); }
  };

  const deleteSet = async (s: TemplateSet) => {
    try {
      const d = await call({ action: "deleteSet", profession: s.profession, jobTitle: s.jobTitle, specialty: s.specialty });
      toast({ title: `Deleted ${d.deleted} template rows`, description: `${s.specialty} for ${s.jobTitle}` });
      await refresh();
    } catch { toast({ title: "Delete failed", variant: "destructive" }); }
  };

  // ── Additional questions (the PDF's extra section, shown on every checklist) ──
  const [editQ, setEditQ] = useState<{ id?: string; kind: string; prompt: string; placeholder: string; specialty: string } | null>(null);
  const saveExtra = async () => {
    if (!editQ) return;
    try {
      await call(editQ.id
        ? { action: "extra.update", id: editQ.id, prompt: editQ.prompt, placeholder: editQ.placeholder, specialty: editQ.specialty }
        : { action: "extra.create", kind: editQ.kind, prompt: editQ.prompt, placeholder: editQ.placeholder, specialty: editQ.specialty });
      toast({ title: editQ.id ? "Question updated" : "Question added", description: "It now appears on every checklist fill form and report." });
      setEditQ(null);
      await refresh();
    } catch { toast({ title: "Save failed", variant: "destructive" }); }
  };
  const toggleExtra = async (q: ExtraQ) => {
    try { await call({ action: "extra.toggle", id: q.id, active: !q.active }); await refresh(); } catch { toast({ title: "Update failed", variant: "destructive" }); }
  };
  const deleteExtra = async (q: ExtraQ) => {
    if (!confirm(`Delete "${q.prompt.slice(0, 60)}"? New checklists will no longer ask it.`)) return;
    try { await call({ action: "extra.delete", id: q.id }); toast({ title: "Question deleted" }); await refresh(); } catch { toast({ title: "Delete failed", variant: "destructive" }); }
  };

  // ── Gate ──
  if (!data) {
    return (
      <div className="vv-page flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-vault-border bg-white vv-card-shadow p-8">
          <div className="flex flex-col items-center text-center">
            <VaultMark size={44} />
            <h1 className="mt-4 text-xl font-semibold text-jade-ink">Super Admin</h1>
            <p className="mt-1 text-sm text-jade-muted">Platform control: users, companies, candidate data, credits, skills.</p>
          </div>
          <div className="mt-6">
            <Label htmlFor="sa-code" className="text-jade-ink/80">Access code</Label>
            <Input
              id="sa-code"
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && auth()}
              placeholder="Superadmin code"
              className="mt-1.5 border-vault-border bg-white text-jade-ink placeholder:text-[#8aa29c]"
            />
            <p className="mt-2 text-xs text-jade-muted">
              Sandbox demo code:{" "}
              <button type="button" className="font-mono font-semibold text-verify-ink underline" onClick={() => auth("zipvault2026")}>
                zipvault2026
              </button>
            </p>
          </div>
          <Button onClick={() => auth()} disabled={loading} className="mt-5 w-full bg-verify-green text-vault-dark hover:bg-verify-green/90">
            {loading ? "Checking…" : "Unlock console"} <ShieldCheck className="ml-2 h-4 w-4" />
          </Button>
          <button type="button" onClick={onExit} className="mt-4 w-full text-center text-xs text-jade-muted hover:text-jade-ink">
            ← Back to site
          </button>
        </div>
      </div>
    );
  }

  const s = data.stats;
  const stats: [string, string | number, string?][] = [
    ["Companies", s.agencies],
    ["Users", data.users.length],
    ["Ref requests", s.requests],
    ["Completed refs", s.completed],
    ["Skill templates", s.templates],
    ["Open flags", s.openFlags, s.openFlags > 0 ? "text-rose-600" : undefined],
    ["Notifications", s.notifications],
  ];

  const badgeFor = (sec: Section): number =>
    sec === "requests" ? s.pendingChecklistRequests : 0;

  const navList = (
    <nav className="space-y-1">
      {NAV.map(([sec, label, Icon]) => {
        const active = section === sec;
        const badge = badgeFor(sec);
        return (
          <button key={sec} type="button"
            onClick={() => { setSection(sec); if (sec === "requests" && !cqRequests) loadRequests(); }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-verify-green/15 text-verify-ink" : "text-jade-muted hover:bg-jade-ink/5 hover:text-jade-ink"
            )}>
            <Icon className={cn("h-4 w-4 shrink-0", active && "text-verify-ink")} />
            <span className="flex-1 text-left">{label}</span>
            {badge > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">{badge}</span>}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="vv-page min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-vault-border/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <VaultMark size={32} />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-jade-ink">
                Vault<span className="text-verify-ink">Verify</span> <span className="ml-1 rounded bg-verify-green/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-verify-ink">Super Admin</span>
              </p>
              <p className="text-[11px] text-jade-muted">Zipvault skills platform console</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={refresh} className="px-3 text-[13px] text-jade-muted hover:text-jade-ink">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button variant="ghost" onClick={onExit} className="px-3 text-[13px] text-jade-muted hover:text-jade-ink">Sign out</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 pb-16 pt-8 sm:px-6">
        {/* Sidebar (desktop) */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24 rounded-2xl border border-vault-border bg-white vv-card-shadow p-3">
            <p className="flex items-center gap-1.5 px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-[#8aa29c]">
              <LayoutDashboard className="h-3 w-3" /> Console
            </p>
            {navList}
          </div>
        </aside>

        {/* Main column */}
        <main className="min-w-0 flex-1">
          {/* Section switcher (mobile) */}
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">{navList}</div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {stats.map(([label, value, tone]) => (
              <div key={label} className="rounded-xl border border-vault-border bg-white vv-card-shadow p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-jade-muted">{label}</p>
                <p className={cn("mt-1 text-2xl font-bold text-jade-ink", tone)}>{value}</p>
              </div>
            ))}
          </div>

          {/* ── Requests ── */}
          {section === "requests" && (
            <div className="mt-8 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-jade-ink">Candidate checklist requests</h2>
                <p className="mt-1 text-sm text-jade-muted">
                  Candidates sign up and ask for a checklist from the library. Approve it and the checklist opens in their portal — completed once, valid for a year.
                </p>
              </div>
              {!cqRequests && <div className="flex justify-center rounded-xl border border-vault-border bg-white vv-card-shadow p-10"><Spinner /></div>}
              {cqRequests?.length === 0 && (
                <div className="rounded-xl border border-dashed border-vault-border bg-white/60 p-10 text-center text-sm text-jade-muted">No requests yet.</div>
              )}
              {cqRequests?.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-vault-border bg-white vv-card-shadow p-5">
                  <div>
                    <p className="text-sm font-semibold text-jade-ink">
                      {specialtyLabel(r.specialty)} <span className="text-xs font-normal text-jade-muted">· {r.jobTitle} · {r.profession}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-jade-muted">
                      {r.account.name} · {r.account.email} · requested {new Date(r.requestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  {r.status === "PENDING" ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => decide(r.id, true)} className="bg-verify-green text-vault-dark hover:bg-verify-green/90">
                        <Check className="mr-1.5 h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => decide(r.id, false)} className="border border-rose-300 text-rose-600 hover:bg-rose-50">
                        <X className="mr-1.5 h-3.5 w-3.5" /> Decline
                      </Button>
                    </div>
                  ) : (
                    <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold",
                      r.status === "APPROVED" ? "border-verify-green/40 text-verify-ink" : "border-rose-300 text-rose-600")}>
                      {r.status === "APPROVED" ? "Approved" : "Declined"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── User management ── */}
          {section === "users" && (
            <div className="mt-8 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-jade-ink">User management</h2>
                <p className="mt-1 text-sm text-jade-muted">Everyone with a platform login — candidate accounts, onboarding status and activity.</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-vault-border bg-white vv-card-shadow">
                <table className="min-w-full text-left">
                  <thead>
                    <tr>
                      {["Name", "Email", "Discipline", "Onboarding", "Checklists", "Requests", "Invites", "Joined"].map((h) => (
                        <th key={h} className={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.id}>
                        <td className={cn(td, "font-medium")}>{u.name}</td>
                        <td className={cn(td, "text-jade-muted")}>{u.email}</td>
                        <td className={td}>{u.title}</td>
                        <td className={td}>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            u.onboardingComplete ? "border-verify-green/40 text-verify-ink" : "border-amber-300 text-amber-600")}>
                            {u.onboardingComplete ? "Complete" : "Pending"}
                          </span>
                        </td>
                        <td className={td}>{u.completions}</td>
                        <td className={td}>{u.requests}</td>
                        <td className={td}>{u.invites}</td>
                        <td className={cn(td, "text-jade-muted")}>{new Date(u.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                      </tr>
                    ))}
                    {data.users.length === 0 && (
                      <tr><td className={cn(td, "py-8 text-center text-jade-muted")} colSpan={8}>No users yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Company management ── */}
          {section === "companies" && (
            <div className="mt-8 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-jade-ink">Company management</h2>
                <p className="mt-1 text-sm text-jade-muted">Agencies on the platform. Creation & white-label editing ship with the multi-tenant admin phase.</p>
              </div>
              {data.companies.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-vault-border bg-white vv-card-shadow p-5">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ background: a.accentColor }} />
                    <div>
                      <p className="text-sm font-medium text-jade-ink">{a.name}</p>
                      <p className="text-xs text-jade-muted">slug: {a.slug} · {a.candidates} candidate(s)</p>
                    </div>
                  </div>
                  <p className="text-xs text-jade-muted">{a.creditsRemaining} of {a.creditsGranted} credits remaining</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Candidate management — Data Center ── */}
          {section === "candidates" && (
            <div className="mt-8 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-jade-ink">Candidate management — Data Center</h2>
                <p className="mt-1 text-sm text-jade-muted">
                  Every candidate detail collected at onboarding, in one uniform table. Experience fields are entered once (years or calendar start date) and the platform keeps the years-of-experience columns current automatically.
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-vault-border bg-white vv-card-shadow">
                <table className="min-w-full text-left">
                  <thead>
                    <tr>
                      {["Name", "Number", "Email", "City", "State", "ZIP", "Profession", "Discipline", "Specialty", "Overall YOE", "Specialty YOE"].map((h) => (
                        <th key={h} className={cn(th, "whitespace-nowrap")}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.candidateProfiles.map((c) => (
                      <tr key={c.id}>
                        <td className={cn(td, "whitespace-nowrap font-medium")}>{c.name}</td>
                        <td className={cn(td, "whitespace-nowrap text-jade-muted")}>{c.phone || "—"}</td>
                        <td className={cn(td, "whitespace-nowrap text-jade-muted")}>{c.email}</td>
                        <td className={td}>{c.city || "—"}</td>
                        <td className={td}>{c.state || "—"}</td>
                        <td className={td}>{c.zip || "—"}</td>
                        <td className={cn(td, "whitespace-nowrap")}>{c.profession ? professionLabel(c.profession) : "—"}</td>
                        <td className={cn(td, "whitespace-nowrap")}>{c.discipline ? disciplineLabel(c.discipline) : "—"}</td>
                        <td className={cn(td, "whitespace-nowrap")}>{c.specialty ? specialtyLabel(c.specialty) : "—"}</td>
                        <td className={cn(td, "whitespace-nowrap")}>
                          {c.yrsOverall} yr{c.yrsOverallStart && <span className="ml-1 text-[10px] text-[#8aa29c]">auto</span>}
                        </td>
                        <td className={cn(td, "whitespace-nowrap")}>
                          {c.yrsSpecialty} yr{c.yrsSpecialtyStart && <span className="ml-1 text-[10px] text-[#8aa29c]">auto</span>}
                        </td>
                      </tr>
                    ))}
                    {data.candidateProfiles.length === 0 && (
                      <tr><td className={cn(td, "py-8 text-center text-jade-muted")} colSpan={11}>No candidate profiles yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Credit management ── */}
          {section === "credits" && (
            <div className="mt-8 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-jade-ink">Credit management</h2>
                <p className="mt-1 text-sm text-jade-muted">
                  Sandbox metering: 1 credit per outbound verification (reference requests + checklist invites). Swap in the billing provider of choice at launch.
                </p>
              </div>
              {data.companies.map((a) => {
                const pct = a.creditsGranted ? Math.min(100, Math.round((a.creditsUsed / a.creditsGranted) * 100)) : 0;
                return (
                  <div key={a.id} className="rounded-xl border border-vault-border bg-white vv-card-shadow p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-jade-ink">{a.name}</p>
                        <p className="text-xs text-jade-muted">{a.creditsUsed} used of {a.creditsGranted} granted</p>
                      </div>
                      <p className={cn("text-sm font-bold", a.creditsRemaining <= 0 ? "text-rose-600" : "text-verify-ink")}>
                        {a.creditsRemaining} remaining
                      </p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eef4f1]">
                      <div className={cn("h-full rounded-full transition-all", pct > 85 ? "bg-rose-500" : "bg-verify-green")} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {data.companies.length === 0 && (
                <div className="rounded-xl border border-dashed border-vault-border bg-white/60 p-10 text-center text-sm text-jade-muted">No companies yet.</div>
              )}
            </div>
          )}

          {/* ── Skills & imports ── */}
          {section === "skills" && (
            <div className="mt-8 space-y-6">
              {/* Additional questions — the PDF's extra section, shown on every checklist */}
              <div className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-jade-ink">Additional questions</h2>
                    <p className="mt-1 text-sm text-jade-muted">
                      Asked on every checklist, under the skill ratings — Yes/No answers are required by the candidate, note fields are optional. Edits apply to new completions; saved reports keep their original answers.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setEditQ({ kind: "YES_NO", prompt: "", placeholder: "", specialty: "" })}
                    className="bg-verify-green text-vault-dark hover:bg-verify-green/90">
                    <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Add question
                  </Button>
                </div>

                {editQ && (
                  <div className="mt-4 rounded-xl border border-verify-green/30 bg-[#f2f7f4] p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-jade-ink/80">Answer type</Label>
                        <div className="mt-1.5 flex gap-2">
                          {[["YES_NO", "Yes / No"], ["TEXT", "Text note"]].map(([k, lb]) => (
                            <button key={k} type="button" disabled={!!editQ.id}
                              onClick={() => setEditQ({ ...editQ, kind: k })}
                              className={cn("rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50",
                                editQ.kind === k ? "border-verify-green bg-verify-green/15 text-verify-ink" : "border-vault-border text-jade-muted hover:text-jade-ink")}>
                              {lb}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-jade-ink/80">Applies to (optional)</Label>
                        <Input value={editQ.specialty} onChange={(e) => setEditQ({ ...editQ, specialty: e.target.value.toUpperCase() })}
                          placeholder="Empty = every checklist · e.g. ICU" className="mt-1.5 border-vault-border bg-white text-jade-ink" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label className="text-jade-ink/80">Question</Label>
                      <Input value={editQ.prompt} onChange={(e) => setEditQ({ ...editQ, prompt: e.target.value })}
                        placeholder="e.g. Are you willing to float to other units when needed?" className="mt-1.5 border-vault-border bg-white text-jade-ink" />
                    </div>
                    {editQ.kind === "TEXT" && (
                      <div className="mt-3">
                        <Label className="text-jade-ink/80">Placeholder hint</Label>
                        <Input value={editQ.placeholder} onChange={(e) => setEditQ({ ...editQ, placeholder: e.target.value })}
                          placeholder="Shown inside the empty answer box" className="mt-1.5 border-vault-border bg-white text-jade-ink" />
                      </div>
                    )}
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" onClick={saveExtra} disabled={editQ.prompt.trim().length < 4} className="bg-verify-green text-vault-dark hover:bg-verify-green/90 disabled:opacity-40">
                        <Check className="mr-1.5 h-3.5 w-3.5" /> {editQ.id ? "Save changes" : "Add question"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditQ(null)} className="border border-vault-border text-jade-muted hover:text-jade-ink">Cancel</Button>
                    </div>
                  </div>
                )}

                <div className="mt-4 overflow-hidden rounded-xl border border-vault-border">
                  {data.extras.map((q) => (
                    <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-vault-border/60 bg-white px-4 py-3 first:border-t-0">
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm", q.active ? "text-jade-ink" : "text-[#8aa29c] line-through")}>
                          <MessagesSquare className="mr-2 inline h-3.5 w-3.5 text-verify-ink/70" />
                          {q.prompt}
                        </p>
                        <p className="mt-0.5 text-[11px] text-jade-muted">
                          <span className="rounded bg-[#f0f6f2] px-1.5 py-0.5 font-mono">{q.kind === "TEXT" ? "text note (optional)" : "yes / no (required)"}</span>
                          {q.specialty && <span className="ml-2">· only for {specialtyLabel(q.specialty)}</span>}
                          {q.placeholder && <span className="ml-2 italic">· “{q.placeholder}”</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => setEditQ({ id: q.id, kind: q.kind, prompt: q.prompt, placeholder: q.placeholder, specialty: q.specialty })}
                          className="rounded-lg p-2 text-jade-muted transition hover:bg-jade-ink/5 hover:text-jade-ink" aria-label="Edit question">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => toggleExtra(q)}
                          className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                            q.active ? "border-verify-green/50 text-verify-ink hover:bg-verify-green/10" : "border-vault-border text-jade-muted hover:bg-jade-ink/5")}>
                          <ToggleLeft className="mr-1 inline h-3 w-3" /> {q.active ? "Active" : "Off"}
                        </button>
                        <button type="button" onClick={() => deleteExtra(q)}
                          className="rounded-lg border border-transparent p-2 text-jade-muted transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete question">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {data.extras.length === 0 && (
                    <div className="border-t border-vault-border/60 bg-white px-4 py-6 text-center text-sm text-jade-muted">
                      No additional questions yet — add one, or they seed automatically with the report defaults on the next fill.
                    </div>
                  )}
                </div>
              </div>

              {/* Import panel */}
              <div className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-jade-ink">Import skills checklist</h2>
                    <p className="mt-1 text-sm text-jade-muted">Upload a MyZipVault import workbook (.xlsx). Rows upsert by Profession + Job Title + Specialty + Skill Name — re-uploading is safe.</p>
                  </div>
                  <a href="/MyZipVault-Skills-Checklist-Import-Template.xlsx" download>
                    <Button variant="ghost" className="border border-vault-border text-verify-ink hover:bg-verify-green/10">
                      <FileDown className="h-4 w-4" /> Download template
                    </Button>
                  </a>
                </div>

                <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-vault-border bg-[#f2f7f4] px-6 py-8 text-center transition hover:border-verify-green/60">
                  <Upload className="h-6 w-6 text-verify-ink" />
                  <p className="mt-2 text-sm font-medium text-jade-ink">{pending ? pending.fileName : "Choose .xlsx workbook"}</p>
                  <p className="mt-0.5 text-xs text-jade-muted">Sheets scanned automatically for the 7-column Skills Data header</p>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
                </label>

                {pending && (
                  <div className="mt-4 rounded-xl border border-vault-border bg-[#f2f7f4] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-jade-ink">
                        <span className="font-semibold text-verify-ink">{pending.clean.length}</span> valid row(s)
                        {pending.errors.length > 0 && <span className="ml-2 font-semibold text-rose-600">{pending.errors.length} problem(s)</span>}
                      </p>
                      <Button onClick={runImport} disabled={importing || !pending.clean.length} className="bg-verify-green text-vault-dark hover:bg-verify-green/90">
                        {importing ? "Importing…" : `Import ${pending.clean.length} rows`} <Database className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                    {pending.errors.length > 0 && (
                      <ul className="mt-3 max-h-40 space-y-1 overflow-auto rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
                        {pending.errors.slice(0, 50).map((e, i) => <li key={i}>• {e}</li>)}
                      </ul>
                    )}
                    <div className="mt-3 max-h-40 overflow-auto rounded-lg bg-white">
                      <table className="w-full text-left text-xs text-jade-muted">
                        <thead className="text-jade-ink/70">
                          <tr>{REQUIRED_COLS.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {pending.clean.slice(0, 12).map((r, i) => (
                            <tr key={i} className="border-t border-vault-border/50">
                              <td className="py-1 pr-3">{r.profession}</td>
                              <td className="py-1 pr-3">{r.jobTitle}</td>
                              <td className="py-1 pr-3">{r.specialty}</td>
                              <td className="py-1 pr-3">{r.category}</td>
                              <td className="py-1 pr-3 text-jade-ink">{r.skillName}</td>
                              <td className="py-1 pr-3">{r.questionType}</td>
                              <td className="py-1 pr-3">{r.hasNA ? "Yes" : "No"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {pending.clean.length > 12 && <p className="py-1 text-xs text-[#8aa29c]">+ {pending.clean.length - 12} more…</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* Template sets */}
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-jade-ink">Checklist library ({data.sets.length} sets)</h2>
                {data.sets.map((set) => {
                  const k = `${set.profession}|${set.jobTitle}|${set.specialty}`;
                  const open = openSet === k;
                  return (
                    <div key={k} className="overflow-hidden rounded-xl border border-vault-border bg-white vv-card-shadow">
                      <button type="button" onClick={() => setOpenSet(open ? null : k)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
                        <div className="flex items-center gap-3">
                          <ChevronDown className={cn("h-4 w-4 text-verify-ink transition-transform", !open && "-rotate-90")} />
                          <div>
                            <p className="text-sm font-semibold text-jade-ink">
                              {specialtyLabel(set.specialty)} <span className="ml-1 text-xs font-normal text-jade-muted">· {set.jobTitle} · {set.profession}</span>
                            </p>
                            <p className="text-xs text-jade-muted">
                              {set.count} active skill(s) · {set.sources.map((src) => (src === "BUILTIN" ? "built-in" : "imported")).join(" + ")}
                            </p>
                          </div>
                        </div>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete the entire ${set.specialty} set (${set.rows.length} rows)?`)) deleteSet(set); }}
                          onKeyDown={(e) => e.key === "Enter" && confirm(`Delete the entire ${set.specialty} set (${set.rows.length} rows)?`) && deleteSet(set)}
                          className="rounded-lg border border-transparent p-2 text-jade-muted transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`Delete ${set.specialty} set`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </span>
                      </button>
                      {open && (
                        <div className="border-t border-vault-border/60 px-5 py-3">
                          {Object.entries(set.rows.reduce<Record<string, TemplateRow[]>>((acc, r) => { (acc[r.category] ??= []).push(r); return acc; }, {})).map(([cat, rows]) => (
                            <div key={cat} className="py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-verify-ink/80">{cat}</p>
                              <div className="mt-1 divide-y divide-vault-border/40">
                                {rows.map((r) => (
                                  <div key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                                    <p className={cn("text-sm", r.active ? "text-jade-ink" : "text-[#8aa29c] line-through")}>
                                      {r.skillName}
                                      {r.highRisk && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">High-risk</span>}
                                    </p>
                                    <div className="flex items-center gap-2 text-[11px] text-jade-muted">
                                      <span className="rounded bg-[#f0f6f2] px-1.5 py-0.5 font-mono">{r.questionType}</span>
                                      <span>N/A: {r.hasNA ? "Y" : "N"}</span>
                                      <button
                                        type="button"
                                        onClick={() => toggleRow(r)}
                                        className={cn("rounded-full border px-2 py-0.5 font-semibold transition", r.active ? "border-verify-green/50 text-verify-ink hover:bg-verify-green/10" : "border-vault-border text-jade-muted hover:bg-jade-ink/5")}
                                      >
                                        {r.active ? "Active" : "Off"}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-10 flex items-center gap-2 text-xs text-[#8aa29c]">
            <AgencyLogo logoText="VV" name="VaultVerify" size="sm" light />
          </div>
        </main>
      </div>
    </div>
  );
}
