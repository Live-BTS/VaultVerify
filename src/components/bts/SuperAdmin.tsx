"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { validateRows, type ImportRow, type ValidatedRow } from "@/lib/bts/importValidate";
import { AgencyLogo, VaultMark, Spinner } from "./brand";
import { ShieldCheck, Upload, FileDown, Database, Building2, Trash2, ChevronDown, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";

// ── Super Admin — platform-level console (Zipvault skills import lives here) ──

interface TemplateRow {
  id: string; category: string; skillName: string; questionType: string; hasNA: boolean; highRisk: boolean; active: boolean; source: string;
}
interface TemplateSet {
  profession: string; jobTitle: string; specialty: string; count: number; sources: string[]; rows: TemplateRow[];
}
interface Overview {
  stats: { agencies: number; candidates: number; requests: number; completed: number; responses: number; templates: number; openFlags: number; notifications: number };
  agencies: { id: string; name: string; slug: string; logoText: string; candidates: number; primaryColor: string; accentColor: string }[];
  sets: TemplateSet[];
}

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

export function SuperAdmin({ onExit }: { onExit: () => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"overview" | "skills">("skills");
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

  // ── Gate ──
  if (!data) {
    return (
      <div className="vv-dark flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md border-vault-border bg-vault-teal/20 backdrop-blur-md">
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center">
              <VaultMark size={44} />
              <h1 className="mt-4 text-xl font-semibold text-verify-light">Super Admin</h1>
              <p className="mt-1 text-sm text-[#8fb0ab]">Platform-level control: agencies, Zipvault skill templates, imports.</p>
            </div>
            <div className="mt-6">
              <Label htmlFor="sa-code" className="text-verify-light/80">Access code</Label>
              <Input
                id="sa-code"
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && auth()}
                placeholder="Superadmin code"
                className="mt-1.5 border-vault-border bg-vault-dark/60 text-verify-light placeholder:text-[#5c7a76]"
              />
              <p className="mt-2 text-xs text-[#8fb0ab]">
                Sandbox demo code:{" "}
                <button type="button" className="font-mono font-semibold text-verify-green underline" onClick={() => auth("zipvault2026")}>
                  zipvault2026
                </button>
              </p>
            </div>
            <Button onClick={() => auth()} disabled={loading} className="mt-5 w-full bg-verify-green text-vault-dark hover:bg-verify-green/90">
              {loading ? "Checking…" : "Unlock console"} <ShieldCheck className="ml-2 h-4 w-4" />
            </Button>
            <button type="button" onClick={onExit} className="mt-4 w-full text-center text-xs text-[#8fb0ab] hover:text-verify-light">
              ← Back to site
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = data.stats;
  const stats: [string, string | number, string?][] = [
    ["Agencies", s.agencies],
    ["Candidates", s.candidates],
    ["Requests", s.requests],
    ["Completed", s.completed],
    ["Skill templates", s.templates],
    ["Open flags", s.openFlags, s.openFlags > 0 ? "text-rose-400" : undefined],
    ["Notifications", s.notifications],
  ];

  return (
    <div className="vv-dark min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-vault-border/70 bg-vault-dark/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <VaultMark size={32} />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-verify-light">
                Vault<span className="text-verify-green">Verify</span> <span className="ml-1 rounded bg-verify-green/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-verify-green">Super Admin</span>
              </p>
              <p className="text-[11px] text-[#8fb0ab]">Zipvault skills platform console</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={refresh} className="px-3 text-[13px] text-[#8fb0ab] hover:text-verify-light">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button variant="ghost" onClick={onExit} className="px-3 text-[13px] text-[#8fb0ab] hover:text-verify-light">Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {stats.map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-vault-border bg-vault-teal/20 p-4 backdrop-blur-md">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#8fb0ab]">{label}</p>
              <p className={cn("mt-1 text-2xl font-bold text-verify-light", tone)}>{value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mt-8 flex gap-2">
          {([["skills", "Skills & imports", Database], ["overview", "Agencies", Building2]] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition",
                tab === k ? "border-verify-green bg-verify-green/15 text-verify-green" : "border-vault-border text-[#8fb0ab] hover:text-verify-light"
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === "skills" && (
          <div className="mt-6 space-y-6">
            {/* Import panel */}
            <Card className="border-vault-border bg-vault-teal/20 backdrop-blur-md">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-verify-light">Import skills checklist</h2>
                    <p className="mt-1 text-sm text-[#8fb0ab]">Upload a MyZipVault import workbook (.xlsx). Rows upsert by Profession + Job Title + Specialty + Skill Name — re-uploading is safe.</p>
                  </div>
                  <a href="/MyZipVault-Skills-Checklist-Import-Template.xlsx" download>
                    <Button variant="ghost" className="border border-vault-border text-verify-green hover:bg-verify-green/10 hover:text-verify-green">
                      <FileDown className="h-4 w-4" /> Download template
                    </Button>
                  </a>
                </div>

                <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-vault-border bg-vault-dark/40 px-6 py-8 text-center transition hover:border-verify-green/50">
                  <Upload className="h-6 w-6 text-verify-green" />
                  <p className="mt-2 text-sm font-medium text-verify-light">{pending ? pending.fileName : "Choose .xlsx workbook"}</p>
                  <p className="mt-0.5 text-xs text-[#8fb0ab]">Sheets scanned automatically for the 7-column Skills Data header</p>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
                </label>

                {pending && (
                  <div className="mt-4 rounded-xl border border-vault-border bg-vault-dark/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-verify-light">
                        <span className="font-semibold text-verify-green">{pending.clean.length}</span> valid row(s)
                        {pending.errors.length > 0 && <span className="ml-2 font-semibold text-rose-400">{pending.errors.length} problem(s)</span>}
                      </p>
                      <Button onClick={runImport} disabled={importing || !pending.clean.length} className="bg-verify-green text-vault-dark hover:bg-verify-green/90">
                        {importing ? "Importing…" : `Import ${pending.clean.length} rows`} <Database className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                    {pending.errors.length > 0 && (
                      <ul className="mt-3 max-h-40 space-y-1 overflow-auto rounded-lg bg-rose-950/30 p-3 text-xs text-rose-300">
                        {pending.errors.slice(0, 50).map((e, i) => <li key={i}>• {e}</li>)}
                      </ul>
                    )}
                    <div className="mt-3 max-h-40 overflow-auto rounded-lg">
                      <table className="w-full text-left text-xs text-[#8fb0ab]">
                        <thead className="text-verify-light/70">
                          <tr>{REQUIRED_COLS.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {pending.clean.slice(0, 12).map((r, i) => (
                            <tr key={i} className="border-t border-vault-border/50">
                              <td className="py-1 pr-3">{r.profession}</td>
                              <td className="py-1 pr-3">{r.jobTitle}</td>
                              <td className="py-1 pr-3">{r.specialty}</td>
                              <td className="py-1 pr-3">{r.category}</td>
                              <td className="py-1 pr-3 text-verify-light">{r.skillName}</td>
                              <td className="py-1 pr-3">{r.questionType}</td>
                              <td className="py-1 pr-3">{r.hasNA ? "Yes" : "No"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {pending.clean.length > 12 && <p className="py-1 text-xs text-[#5c7a76]">+ {pending.clean.length - 12} more…</p>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Template sets */}
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-verify-light">Checklist library ({data.sets.length} sets)</h2>
              {data.sets.map((set) => {
                const k = `${set.profession}|${set.jobTitle}|${set.specialty}`;
                const open = openSet === k;
                return (
                  <div key={k} className="overflow-hidden rounded-xl border border-vault-border bg-vault-teal/20 backdrop-blur-md">
                    <button type="button" onClick={() => setOpenSet(open ? null : k)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
                      <div className="flex items-center gap-3">
                        <ChevronDown className={cn("h-4 w-4 text-verify-green transition-transform", !open && "-rotate-90")} />
                        <div>
                          <p className="text-sm font-semibold text-verify-light">
                            {set.specialty.replace(/_/g, " ")} <span className="ml-1 text-xs font-normal text-[#8fb0ab]">· {set.jobTitle} · {set.profession}</span>
                          </p>
                          <p className="text-xs text-[#8fb0ab]">
                            {set.count} active skill(s) · {set.sources.map((src) => (src === "BUILTIN" ? "built-in" : "imported")).join(" + ")}
                          </p>
                        </div>
                      </div>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); if (confirm(`Delete the entire ${set.specialty} set (${set.rows.length} rows)?`)) deleteSet(set); }}
                        onKeyDown={(e) => e.key === "Enter" && confirm(`Delete the entire ${set.specialty} set (${set.rows.length} rows)?`) && deleteSet(set)}
                        className="rounded-lg border border-transparent p-2 text-[#8fb0ab] transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-400"
                        aria-label={`Delete ${set.specialty} set`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-vault-border/60 px-5 py-3">
                        {Object.entries(set.rows.reduce<Record<string, TemplateRow[]>>((acc, r) => { (acc[r.category] ??= []).push(r); return acc; }, {})).map(([cat, rows]) => (
                          <div key={cat} className="py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-verify-green/80">{cat}</p>
                            <div className="mt-1 divide-y divide-vault-border/40">
                              {rows.map((r) => (
                                <div key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                                  <p className={cn("text-sm", r.active ? "text-verify-light" : "text-[#5c7a76] line-through")}>
                                    {r.skillName}
                                    {r.highRisk && <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-400">High-risk</span>}
                                  </p>
                                  <div className="flex items-center gap-2 text-[11px] text-[#8fb0ab]">
                                    <span className="rounded bg-vault-dark/60 px-1.5 py-0.5 font-mono">{r.questionType}</span>
                                    <span>N/A: {r.hasNA ? "Y" : "N"}</span>
                                    <button
                                      type="button"
                                      onClick={() => toggleRow(r)}
                                      className={cn("rounded-full border px-2 py-0.5 font-semibold transition", r.active ? "border-verify-green/50 text-verify-green hover:bg-verify-green/10" : "border-vault-border text-[#8fb0ab] hover:bg-white/5")}
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

        {tab === "overview" && (
          <Card className="mt-6 border-vault-border bg-vault-teal/20 backdrop-blur-md">
            <CardContent className="p-6">
              <h2 className="text-base font-semibold text-verify-light">Agencies on platform</h2>
              <div className="mt-4 divide-y divide-vault-border/50">
                {data.agencies.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ background: a.accentColor }} />
                      <div>
                        <p className="text-sm font-medium text-verify-light">{a.name}</p>
                        <p className="text-xs text-[#8fb0ab]">slug: {a.slug}</p>
                      </div>
                    </div>
                    <p className="text-sm text-[#8fb0ab]">{a.candidates} candidate(s)</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-[#5c7a76]">Agency creation & white-label editing ship with the multi-tenant admin phase.</p>
            </CardContent>
          </Card>
        )}

        <p className="mt-10 flex items-center gap-2 text-xs text-[#5c7a76]">
          <AgencyLogo logoText="VV" name="VaultVerify" size="sm" light />
        </p>
      </main>
    </div>
  );
}
