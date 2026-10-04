"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Check, X, Users, BookUser, Wallet, LayoutDashboard, PlusCircle, MessagesSquare, ToggleLeft, Pencil, Server, Mail,
  ScrollText, Activity, Link2, Eye, KeyRound, LogOut, Ban,
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
  status: string;
  failedLogins: number; lastFailedLogin: string | null; liveSessions: number;
  completions: number; requests: number; invites: number; joinedAt: string;
}
interface RecruiterRow {
  id: string; name: string; email: string; company: string; jobTitle: string;
  emailVerified: boolean; onboardingComplete: boolean; status: string;
  failedLogins: number; lastFailedLogin: string | null; liveSessions: number;
  joinedAt: string;
}
interface ImpersonationView {
  kind: string; id: string; name: string; email: string; status: string; emailVerified: boolean;
  onboardingComplete: boolean; liveSessions: number; createdAt: string;
  profile: Record<string, string | number>;
  invites: { id: string; candidate: string; specialty: string; status: string; createdAt: string }[];
  requests: { id: string; jobTitle: string; specialty: string; status: string; requestedAt: string }[];
  completions: { id: string; specialtyLabel: string; source: string; completedAt: string; expiresAt: string; shareLinks: number }[];
  shareLinks: { id: string; accessType: string; revoked: boolean; expiresAt: string | null; viewCount: number }[];
}
interface ShareLinkRow {
  kind: "reference" | "checklist"; id: string; token: string; accessType: string;
  label: string; revoked: boolean; viewCount: number; expiresAt: string | null; createdAt: string;
  owner: string; ownerEmail: string; what: string;
}
interface NotificationRow {
  id: string; at: string; channel: string; kind: string; to: string; subject: string; status: string; provider: string;
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
  status: string; allowOverage: boolean;
}
interface ThreatFlagRow {
  id: string; type: string; detail: string; severity: string; status: string; resolution: string; createdAt: string;
  requestId: string; candidate: string; candidateEmail: string; referee: string; refEmail: string;
}
interface AuditEventRow {
  id: string; at: string; actorType: string; actorId: string; action: string;
  entity: string; entityId: string; detail: string; ip: string;
}
interface LedgerRow {
  id: string; at: string; agency: string; delta: number; reason: string; actorType: string; actorId: string; balanceAfter: number;
}
interface Overview {
  stats: { agencies: number; candidates: number; requests: number; completed: number; responses: number; templates: number; openFlags: number; notifications: number; pendingChecklistRequests: number };
  agencies: { id: string; name: string; slug: string; logoText: string; candidates: number; primaryColor: string; accentColor: string }[];
  sets: TemplateSet[];
  users: UserRow[];
  recruiters: RecruiterRow[];
  candidateProfiles: CandidateProfileRow[];
  companies: CompanyRow[];
  threatFlags: ThreatFlagRow[];
  platform: { maintenance: boolean };
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

type Section = "requests" | "users" | "companies" | "candidates" | "credits" | "audit" | "shares" | "skills" | "system";

interface SystemItemView { key: string; label: string; envVar: string; provider: string; purpose: string; critical: boolean; configured: boolean }
interface SystemStatus { items: SystemItemView[]; protections: { label: string; detail: string }[]; runtime: { databaseProvider: string; emailProvider: string; smsProvider: string; environment: string } }

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
  ["shares", "Shared links", Link2],
  ["audit", "Audit log", ScrollText],
  ["skills", "Skills & imports", Database],
  ["system", "System & APIs", Server],
];

const th = "px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-jade-muted";
const td = "px-3 py-2.5 text-sm text-jade-ink border-t border-vault-border/60";

export function SuperAdmin({ onExit }: { onExit: () => void }) {
  const { toast } = useToast();
  const [token, setToken] = useState("");              // OTP session token (sas_…)
  const [code, setCode] = useState("");                // backup static access code
  const [gateMode, setGateMode] = useState<"otp" | "backup">("otp");
  const [otp, setOtp] = useState("");
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otpSimulated, setOtpSimulated] = useState(false);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<Section>("requests");
  const [cqRequests, setCqRequests] = useState<ChecklistRequestRow[] | null>(null);
  const [sys, setSys] = useState<SystemStatus | null>(null);
  const [openSet, setOpenSet] = useState<string | null>(null);
  const [pending, setPending] = useState<{ rows: ImportRow[]; clean: ValidatedRow[]; errors: string[]; fileName: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/superadmin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token || undefined, code: code || undefined, ...payload }) });
    const d = await res.json();
    if (res.status === 401) {
      // Session expired or revoked — drop back to the gate.
      sessionStorage.removeItem("bts_sa_token");
      sessionStorage.removeItem("bts_sa_code");
      setToken(""); setCode(""); setData(null);
    }
    if (!res.ok || !d.ok) throw new Error(d.error ?? "Request failed");
    return d;
  }, [token, code]);

  // Restore an unexpired session (token first, backup code second) on mount.
  useEffect(() => {
    const t = sessionStorage.getItem("bts_sa_token") ?? "";
    const c = sessionStorage.getItem("bts_sa_code") ?? "";
    if (!t && !c) return;
    (async () => {
      try {
        const res = await fetch("/api/superadmin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auth", token: t || undefined, code: c || undefined }) });
        const d = await res.json();
        if (res.ok && d.ok) { setToken(t); setCode(c); setData(d); }
        else { sessionStorage.removeItem("bts_sa_token"); sessionStorage.removeItem("bts_sa_code"); }
      } catch { /* stay on gate */ }
    })();
  }, []);

  const requestOtp = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request_otp" }) });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Could not send the code");
      setOtpSentTo(d.sentTo ?? "your email");
      setOtpSimulated(!!d.simulated);
      toast({ title: d.simulated ? "Sandbox mode — code written to NotificationLog" : `Login code sent to ${d.sentTo}` });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not send the code", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp.trim())) return toast({ title: "Enter the 6-digit code from your email.", variant: "destructive" });
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify_otp", otp: otp.trim() }) });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Verification failed");
      sessionStorage.setItem("bts_sa_token", d.token);
      setToken(d.token); setOtp(""); setData(d);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Verification failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const backupAuth = async () => {
    const useCode = code.trim();
    if (!useCode) return toast({ title: "Enter the backup access code.", variant: "destructive" });
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auth", code: useCode }) });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Invalid code");
      sessionStorage.setItem("bts_sa_code", useCode);
      setCode(useCode); setToken(""); setData(d);
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

  const loadSystem = async () => {
    try { const d = await call({ action: "system_config" }); setSys({ items: d.items, protections: d.protections, runtime: d.runtime }); } catch { /* keep old */ }
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

  // ── Phase 1 command layer: state ──
  const [audit, setAudit] = useState<AuditEventRow[] | null>(null);
  const [auditQ, setAuditQ] = useState("");
  const [auditType, setAuditType] = useState("");
  const [auditDays, setAuditDays] = useState(30);
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [userQ, setUserQ] = useState("");
  const [userStatus, setUserStatus] = useState("ALL");
  const [creditForm, setCreditForm] = useState<{ id: string; delta: string; reason: string } | null>(null);
  const [ping, setPing] = useState<{ db?: { ok: boolean; detail: string }; brevo?: { ok: boolean; detail: string } } | null>(null);

  // ── Phase 1 command layer: actions ──
  const loadAudit = async (q = auditQ, type = auditType, days = auditDays) => {
    try { const d = await call({ action: "audit_query", q, actorType: type, days }); setAudit(d.events); } catch { /* keep old */ }
  };
  const loadLedger = async () => {
    try { const d = await call({ action: "ledger_query" }); setLedger(d.ledger); } catch { /* keep old */ }
  };
  const cmd = async (payload: Record<string, unknown>, title: string, description?: string) => {
    try {
      await call(payload);
      toast({ title, description });
      await refresh();
    } catch (e) {
      toast({ title: "Command failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };
  const changeUserStatus = (u: UserRow, status: "ACTIVE" | "SUSPENDED") => {
    if (status === "SUSPENDED" && !confirm(`Suspend ${u.name} (${u.email})?\nTheir live sessions are killed immediately and sign-in is blocked.`)) return;
    cmd({ action: "set_user_status", kind: "CANDIDATE", id: u.id, status },
      status === "SUSPENDED" ? "Account suspended" : "Account reactivated",
      status === "SUSPENDED" ? "Sessions killed — sign-in is now blocked." : "The user can sign in again.");
  };
  const setCompanyStatus = (a: CompanyRow, status: "ACTIVE" | "SUSPENDED" | "READ_ONLY") => {
    if (status === "SUSPENDED" && !confirm(`Suspend ${a.name}?\nEvery outbound verification for this company is blocked until reactivated.`)) return;
    cmd({ action: "set_company_status", id: a.id, status },
      status === "ACTIVE" ? "Company active" : status === "SUSPENDED" ? "Company suspended" : "Company set to read-only");
  };
  const toggleOverage = (a: CompanyRow) =>
    cmd({ action: "set_company_overage", id: a.id, allow: !a.allowOverage },
      a.allowOverage ? "Post-paid overage off" : "Post-paid overage on",
      a.allowOverage ? "Outbound stops again at 0 credits." : "Outbound verifications continue below 0 credits (billed later).");
  const applyCredit = () => {
    if (!creditForm) return;
    const delta = Number(creditForm.delta);
    if (!Number.isFinite(delta) || delta === 0) { toast({ title: "Enter a non-zero amount", variant: "destructive" }); return; }
    cmd({ action: "credit_adjust", id: creditForm.id, delta, reason: creditForm.reason },
      "Credits adjusted",
      `${delta > 0 ? "+" : ""}${delta} credits written to the immutable ledger.`);
    setCreditForm(null);
  };
  const revokeReq = async (r: ChecklistRequestRow) => {
    const reason = prompt(`Revoke ${r.account.name}'s checklist?\nAny completed report becomes invalid immediately.\nReason (recorded in the audit log):`);
    if (reason === null) return;
    await cmd({ action: "revoke_request", id: r.id, reason }, "Request revoked", "The checklist is locked and any completed report is invalid.");
    await loadRequests();
  };
  const flagDecide = async (f: ThreatFlagRow, decision: "RESOLVED" | "ESCALATED" | "DISMISSED") => {
    let note = "";
    if (decision !== "ESCALATED") {
      const input = prompt(decision === "RESOLVED" ? "Resolution note (recorded in the audit log):" : "Why dismiss this flag?");
      if (input === null) return;
      note = input;
    }
    try {
      await call({ action: "flag_decide", id: f.id, decision, note });
      toast({ title: `Flag ${decision.toLowerCase()}`, description: "The decision is in the audit log." });
      await refresh();
    } catch { toast({ title: "Decision failed", variant: "destructive" }); }
  };
  const toggleMaintenance = () => {
    const on = !data?.platform.maintenance;
    if (on && !confirm("Put the platform in maintenance mode?\nCandidates and recruiters can read, but every write is rejected until you switch it off.")) return;
    cmd({ action: "set_platform", key: "MAINTENANCE_MODE", value: on }, on ? "Maintenance mode ON" : "Maintenance mode OFF");
  };
  const runPing = async () => {
    try {
      const d = await call({ action: "ping" });
      setPing({ db: d.db, brevo: d.brevo });
      toast({ title: "Connectivity checked", description: `DB ${d.db.ok ? "ok" : "down"} · Brevo ${d.brevo.ok ? "ok" : "down"}` });
    } catch { toast({ title: "Ping failed", variant: "destructive" }); }
  };

  const statusPill = (s: string) =>
    cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold",
      s === "ACTIVE" ? "border-verify-green/40 text-verify-ink"
        : s === "SUSPENDED" ? "border-rose-300 bg-rose-50 text-rose-600"
        : "border-amber-300 bg-amber-50 text-amber-700");

  // ── Phase 2: security center, view-as, share oversight, exports ──
  const [userKind, setUserKind] = useState<"CANDIDATES" | "RECRUITERS">("CANDIDATES");
  const [impView, setImpView] = useState<ImpersonationView | null>(null);
  const [shares, setShares] = useState<ShareLinkRow[] | null>(null);
  const [notifHealth, setNotifHealth] = useState<{ stats: { sent: number; simulated: number; failed: number }; notifications: NotificationRow[] } | null>(null);
  const [tempPwShown, setTempPwShown] = useState<{ email: string; temp: string } | null>(null);

  const openImpersonation = async (kind: "CANDIDATE" | "RECRUITER", id: string) => {
    try {
      const d = await call({ action: "impersonate_view", kind, id });
      setImpView(d.view);
    } catch (e) {
      toast({ title: "Could not load the account view", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };
  const sendReset = async (kind: "CANDIDATE" | "RECRUITER", id: string, email: string) => {
    if (!confirm(`Email a password-reset link to ${email}?\nAll their live sessions are signed out.`)) return;
    try {
      const d = await call({ action: "security_reset", kind, id });
      toast({ title: d.simulated ? "Reset link simulated (sandbox)" : `Reset link sent to ${d.sentTo}`, description: "The link expires in 60 minutes." });
      await refresh();
    } catch (e) {
      toast({ title: "Could not send reset", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };
  const issueTempPw = async (kind: "CANDIDATE" | "RECRUITER", id: string, email: string) => {
    if (!confirm(`Issue a temporary password for ${email}?\nIt replaces their current password, signs out all sessions, and is emailed to them.`)) return;
    try {
      const d = await call({ action: "security_temp_password", kind, id });
      setTempPwShown({ email: d.sentTo ?? email, temp: d.tempPassword });
      await refresh();
    } catch (e) {
      toast({ title: "Could not issue a temp password", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };
  const killUserSessions = async (kind: "CANDIDATE" | "RECRUITER", id: string, email: string) => {
    try {
      const d = await call({ action: "revoke_user_sessions", kind, id });
      toast({ title: "Sessions revoked", description: `${d.killed} live session(s) signed out for ${email}.` });
      await refresh();
    } catch { toast({ title: "Could not revoke sessions", variant: "destructive" }); }
  };
  const killAllSessions = async () => {
    if (!confirm("Sign out EVERY candidate and recruiter on the platform?\nUse for a suspected platform-wide breach. The superadmin console stays signed in.")) return;
    if (!confirm("Final confirmation — every user will be forced to sign in again.")) return;
    try {
      const d = await call({ action: "revoke_all_sessions" });
      toast({ title: "All sessions revoked", description: `${d.candidates} candidate + ${d.recruiters} recruiter sessions destroyed.` });
      await refresh();
    } catch { toast({ title: "Could not revoke sessions", variant: "destructive" }); }
  };
  const loadShares = async () => {
    try { const d = await call({ action: "shares_list" }); setShares(d.links); } catch { /* keep old */ }
  };
  const revokeShare = async (l: ShareLinkRow) => {
    if (!confirm(`Revoke this ${l.kind} share link?\n${l.owner} → "${l.label || "unlabeled"}"\nAnyone holding the link loses access immediately.`)) return;
    try {
      await call({ action: "share_revoke", kind: l.kind, id: l.id });
      toast({ title: "Link revoked", description: "The decision is in the audit log." });
      await loadShares();
    } catch { toast({ title: "Revoke failed", variant: "destructive" }); }
  };
  const loadNotifications = async () => {
    try { const d = await call({ action: "notifications_list" }); setNotifHealth({ stats: d.stats, notifications: d.notifications }); } catch { /* keep old */ }
  };
  const exportCsv = async (what: "users" | "companies" | "audit") => {
    try {
      const d = await call({ action: "export_csv", what });
      const blob = new Blob([d.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vaultverify-${what}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${d.count} row(s)`, description: "The export is recorded in the audit log." });
    } catch (e) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const securityChip = (row: { failedLogins: number; lastFailedLogin: string | null; liveSessions: number }) =>
    row.failedLogins >= 3 ? (
      <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600" title={`Last failure ${row.lastFailedLogin ? new Date(row.lastFailedLogin).toLocaleString() : "—"}`}>
        {row.failedLogins} fails · {row.liveSessions} live
      </span>
    ) : (
      <span className="text-xs text-jade-muted" title={`Last failure ${row.lastFailedLogin ? new Date(row.lastFailedLogin).toLocaleString() : "never"}`}>
        {row.failedLogins} fails · {row.liveSessions} live
      </span>
    );

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

          {gateMode === "otp" ? (
            otpSentTo ? (
              <div className="mt-6">
                <Label htmlFor="sa-otp" className="text-jade-ink/80">Login code</Label>
                <Input
                  id="sa-otp"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  placeholder="6-digit code"
                  className="mt-1.5 border-vault-border bg-white text-center font-mono text-lg tracking-[0.4em] text-jade-ink placeholder:text-[#8aa29c] placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
                />
                <p className="mt-2 text-xs text-jade-muted">
                  Sent to <span className="font-semibold text-jade-ink">{otpSentTo}</span> — it expires in 5 minutes.
                  Always use the code from the <span className="font-semibold text-jade-ink">most recent</span> email; requesting a new code voids the old one.
                  {otpSimulated && " (Sandbox: the code is in Superadmin → System → Notification log.)"}
                </p>
                <Button onClick={verifyOtp} disabled={loading} className="mt-5 w-full bg-verify-green text-vault-dark hover:bg-verify-green/90">
                  {loading ? "Checking…" : "Verify & unlock console"} <ShieldCheck className="ml-2 h-4 w-4" />
                </Button>
                <button type="button" onClick={requestOtp} disabled={loading} className="mt-3 w-full text-center text-xs text-jade-muted underline hover:text-jade-ink">
                  Resend code
                </button>
              </div>
            ) : (
              <div className="mt-6">
                <p className="text-sm leading-relaxed text-jade-muted">
                  We&apos;ll email a one-time login code to the admin address saved in the platform configuration. The code expires in 5 minutes.
                </p>
                <Button onClick={requestOtp} disabled={loading} className="mt-5 w-full bg-verify-green text-vault-dark hover:bg-verify-green/90">
                  {loading ? "Sending…" : "Email me a login code"} <Mail className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )
          ) : (
            <div className="mt-6">
              <Label htmlFor="sa-code" className="text-jade-ink/80">Backup access code</Label>
              <Input
                id="sa-code"
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && backupAuth()}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                placeholder="Backup code"
                className="mt-1.5 border-vault-border bg-white text-jade-ink placeholder:text-[#8aa29c]"
              />
              {process.env.NODE_ENV === "development" && (
                <p className="mt-2 text-xs text-jade-muted">
                  Sandbox demo code:{" "}
                  <button type="button" className="font-mono font-semibold text-verify-ink underline" onClick={() => { setCode("zipvault2026"); }}>
                    zipvault2026
                  </button>
                </p>
              )}
              <Button onClick={backupAuth} disabled={loading} className="mt-5 w-full bg-verify-green text-vault-dark hover:bg-verify-green/90">
                {loading ? "Checking…" : "Unlock console"} <ShieldCheck className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          <button type="button" onClick={() => { setGateMode(gateMode === "otp" ? "backup" : "otp"); setOtpSentTo(null); setOtp(""); }} className="mt-4 w-full text-center text-xs text-jade-muted underline hover:text-jade-ink">
            {gateMode === "otp" ? "Use backup access code instead" : "Email me a login code instead"}
          </button>
          <button type="button" onClick={onExit} className="mt-3 w-full text-center text-xs text-jade-muted hover:text-jade-ink">
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
            onClick={() => { setSection(sec); if (sec === "requests" && !cqRequests) loadRequests(); if (sec === "system" && !sys) loadSystem(); if (sec === "audit" && !audit) loadAudit(); if (sec === "credits" && !ledger) loadLedger(); if (sec === "shares" && !shares) loadShares(); if (sec === "system") loadNotifications(); }}
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
                  Candidates sign up and ask for a checklist from the library. Approve it and the checklist opens in their portal — completed once, valid for a year. Approved requests can be revoked; any completed report becomes invalid immediately.
                </p>
              </div>

              {/* Threat console — fraud flags with decisions */}
              {(data.threatFlags?.length ?? 0) > 0 && (
                <div className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-jade-ink">Threat console</h3>
                      <p className="mt-0.5 text-xs text-jade-muted">Anomalies raised by the fraud engine — resolve, escalate, or dismiss. Every decision is audit-logged.</p>
                    </div>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600">{data.stats.openFlags} open</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {data.threatFlags.map((f) => {
                      const open = f.status === "OPEN" || f.status === "ESCALATED";
                      return (
                        <div key={f.id} className={cn("rounded-xl border p-4", open ? "border-vault-border" : "border-vault-border/50 opacity-70")}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                                f.severity === "HIGH" ? "bg-rose-100 text-rose-700" : f.severity === "MEDIUM" ? "bg-amber-100 text-amber-700" : "bg-[#f0f6f2] text-verify-ink")}>
                                {f.severity}
                              </span>
                              <span className="text-sm font-semibold text-jade-ink">{f.type.replaceAll("_", " ").toLowerCase()}</span>
                              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                f.status === "ESCALATED" ? "border-rose-300 text-rose-600" : f.status === "OPEN" ? "border-amber-300 text-amber-700" : "border-vault-border text-jade-muted")}>
                                {f.status}
                              </span>
                            </div>
                            <span className="text-[11px] text-jade-muted">{new Date(f.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-jade-muted">{f.detail}</p>
                          <p className="mt-1 text-xs text-jade-ink">{f.candidate} · {f.candidateEmail} · referee {f.referee} ({f.refEmail})</p>
                          {f.resolution && <p className="mt-1 rounded-lg bg-[#f2f7f4] px-3 py-1.5 text-xs text-verify-ink">{f.status}: {f.resolution}</p>}
                          {open && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button size="sm" onClick={() => flagDecide(f, "RESOLVED")} className="bg-verify-green text-vault-dark hover:bg-verify-green/90">
                                <Check className="mr-1.5 h-3.5 w-3.5" /> Resolve
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => flagDecide(f, "ESCALATED")} className="border border-amber-300 text-amber-700 hover:bg-amber-50">
                                Escalate
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => flagDecide(f, "DISMISSED")} className="border border-vault-border text-jade-muted hover:text-jade-ink">
                                Dismiss
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  ) : r.status === "APPROVED" ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-verify-green/40 px-3 py-1 text-xs font-semibold text-verify-ink">Approved</span>
                      <button type="button" onClick={() => revokeReq(r)} className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50">
                        Revoke
                      </button>
                    </div>
                  ) : (
                    <span className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600">
                      {r.status === "REVOKED" ? "Revoked" : "Declined"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── User management ── */}
          {section === "users" && (() => {
            const rows = userKind === "CANDIDATES"
              ? data.users.map((u) => ({ kind: "CANDIDATE" as const, id: u.id, name: u.name, email: u.email, sub: u.title || "—", status: u.status, verified: true, onboardingComplete: u.onboardingComplete, security: u, joinedAt: u.joinedAt }))
              : data.recruiters.map((r) => ({ kind: "RECRUITER" as const, id: r.id, name: r.name, email: r.email, sub: `${r.jobTitle || "Recruiter"}${r.company ? ` · ${r.company}` : ""}`, status: r.status, verified: r.emailVerified, onboardingComplete: r.onboardingComplete, security: r, joinedAt: r.joinedAt }));
            const visible = rows.filter((u) =>
              (userStatus === "ALL" || (userStatus === "SUSPENDED" ? u.status === "SUSPENDED" : u.status === "ACTIVE")) &&
              (!userQ || `${u.name} ${u.email} ${u.sub}`.toLowerCase().includes(userQ.toLowerCase())));
            return (
            <div className="mt-8 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-jade-ink">User management</h2>
                  <p className="mt-1 text-sm text-jade-muted">Suspend accounts, force password resets, view-as read-only, or kill sessions — every action lands in the audit log.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex overflow-hidden rounded-lg border border-vault-border text-xs font-semibold">
                    <button type="button" onClick={() => setUserKind("CANDIDATES")}
                      className={cn("px-3 py-2 transition", userKind === "CANDIDATES" ? "bg-verify-green/15 text-verify-ink" : "text-jade-muted hover:text-jade-ink")}>
                      Candidates ({data.users.length})
                    </button>
                    <button type="button" onClick={() => setUserKind("RECRUITERS")}
                      className={cn("px-3 py-2 transition", userKind === "RECRUITERS" ? "bg-verify-green/15 text-verify-ink" : "text-jade-muted hover:text-jade-ink")}>
                      Recruiters ({data.recruiters.length})
                    </button>
                  </div>
                  <Input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder="Search name, email…"
                    className="h-9 w-48 border-vault-border bg-white text-sm text-jade-ink placeholder:text-[#8aa29c]" />
                  <select value={userStatus} onChange={(e) => setUserStatus(e.target.value)}
                    className="h-9 rounded-md border border-vault-border bg-white px-2 text-sm text-jade-ink">
                    <option value="ALL">All statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => exportCsv(userKind === "CANDIDATES" ? "users" : "users")}
                    className="h-9 border border-vault-border text-verify-ink hover:bg-verify-green/10" title="Export CSV (candidates)">
                    <FileDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-vault-border bg-white vv-card-shadow">
                <table className="min-w-full text-left">
                  <thead>
                    <tr>
                      {["Name", "Email", userKind === "CANDIDATES" ? "Discipline" : "Company", "Status", "Onboarding", "Security", "Joined", "Actions"].map((h) => (
                        <th key={h} className={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((u) => (
                      <tr key={u.id} className="transition hover:bg-[#f7fbf8]">
                        <td className={cn(td, "font-medium")}>{u.name}</td>
                        <td className={cn(td, "text-jade-muted")}>{u.email}</td>
                        <td className={td}>{u.sub}</td>
                        <td className={td}><span className={statusPill(u.status)}>{u.status === "SUSPENDED" ? "Suspended" : "Active"}</span></td>
                        <td className={td}>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            u.onboardingComplete ? "border-verify-green/40 text-verify-ink" : "border-amber-300 text-amber-600")}>
                            {u.onboardingComplete ? "Complete" : "Pending"}
                          </span>
                          {!u.verified && <span className="ml-1.5 text-[10px] text-[#8aa29c]">unverified</span>}
                        </td>
                        <td className={td}>{securityChip(u.security)}</td>
                        <td className={cn(td, "text-jade-muted")}>{new Date(u.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                        <td className={td}>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => openImpersonation(u.kind, u.id)} title="View as (read-only)"
                              className="rounded-lg p-2 text-jade-muted transition hover:bg-jade-ink/5 hover:text-jade-ink" aria-label="View as">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => sendReset(u.kind, u.id, u.email)} title="Email password-reset link"
                              className="rounded-lg p-2 text-jade-muted transition hover:bg-jade-ink/5 hover:text-jade-ink" aria-label="Send password reset">
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                            {u.status === "SUSPENDED" ? (
                              <button type="button" onClick={() => cmd({ action: "set_user_status", kind: u.kind, id: u.id, status: "ACTIVE" }, "Account reactivated", "The user can sign in again.")}
                                className="rounded-full border border-verify-green/50 px-2.5 py-1 text-[11px] font-semibold text-verify-ink transition hover:bg-verify-green/10">
                                Reactivate
                              </button>
                            ) : (
                              <button type="button" onClick={() => changeUserStatus({ ...u, completions: 0, requests: 0, invites: 0 } as UserRow, "SUSPENDED")}
                                className="rounded-full border border-rose-300 px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50">
                                Suspend
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {visible.length === 0 && (
                      <tr><td className={cn(td, "py-8 text-center text-jade-muted")} colSpan={8}>No users match this filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })()}

          {/* ── Company management ── */}
          {section === "companies" && (
            <div className="mt-8 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-jade-ink">Company management</h2>
                <p className="mt-1 text-sm text-jade-muted">
                  Total command over every tenant: suspend or read-only a company and every outbound verification blocks instantly. Creation & white-label editing ship with the multi-tenant admin phase.
                </p>
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => exportCsv("companies")} className="h-9 border border-vault-border text-verify-ink hover:bg-verify-green/10" title="Export CSV">
                  <FileDown className="mr-1.5 h-3.5 w-3.5" /> Export CSV
                </Button>
              </div>
              {data.companies.map((a) => (
                <div key={a.id} className="rounded-xl border border-vault-border bg-white vv-card-shadow p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ background: a.accentColor }} />
                      <div>
                        <p className="flex items-center gap-2 text-sm font-medium text-jade-ink">
                          {a.name} <span className={statusPill(a.status)}>{a.status === "READ_ONLY" ? "Read-only" : a.status.charAt(0) + a.status.slice(1).toLowerCase()}</span>
                          {a.allowOverage && <span className="rounded-full border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Post-paid</span>}
                        </p>
                        <p className="text-xs text-jade-muted">slug: {a.slug} · {a.candidates} candidate(s) · {a.creditsRemaining} of {a.creditsGranted} credits remaining</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setCompanyStatus(a, "ACTIVE")} disabled={a.status === "ACTIVE"}
                        className="border border-verify-green/50 text-verify-ink hover:bg-verify-green/10 disabled:opacity-40">
                        <Check className="mr-1 h-3.5 w-3.5" /> Active
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCompanyStatus(a, "READ_ONLY")} disabled={a.status === "READ_ONLY"}
                        className="border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40">
                        Read-only
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCompanyStatus(a, "SUSPENDED")} disabled={a.status === "SUSPENDED"}
                        className="border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-40">
                        <X className="mr-1 h-3.5 w-3.5" /> Suspend
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleOverage(a)}
                        className="border border-vault-border text-jade-muted hover:text-jade-ink">
                        <ToggleLeft className="mr-1 h-3.5 w-3.5" /> {a.allowOverage ? "Overage on" : "Overage off"}
                      </Button>
                    </div>
                  </div>
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
                  Immutable ledger: 1 credit per outbound verification (reference requests + checklist invites). At zero credits outbound stops — unless post-paid overage is on. Grant or deduct below; every entry is permanent.
                </p>
              </div>
              {data.companies.map((a) => {
                const pct = a.creditsGranted ? Math.min(100, Math.round((Math.max(0, a.creditsGranted - a.creditsRemaining) / a.creditsGranted) * 100)) : 0;
                return (
                  <div key={a.id} className="rounded-xl border border-vault-border bg-white vv-card-shadow p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-jade-ink">{a.name}</p>
                        <p className="text-xs text-jade-muted">{a.creditsUsed} spent · {a.creditsGranted} plan grant · {a.status === "ACTIVE" ? "outbound live" : "outbound " + a.status.toLowerCase()}</p>
                      </div>
                      <p className={cn("text-sm font-bold", a.creditsRemaining <= 0 && !a.allowOverage ? "text-rose-600" : "text-verify-ink")}>
                        {a.creditsRemaining} remaining{a.allowOverage && a.creditsRemaining <= 0 ? " (post-paid)" : ""}
                      </p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eef4f1]">
                      <div className={cn("h-full rounded-full transition-all", pct > 85 ? "bg-rose-500" : "bg-verify-green")} style={{ width: `${pct}%` }} />
                    </div>
                    {creditForm?.id === a.id ? (
                      <div className="mt-4 rounded-xl border border-verify-green/30 bg-[#f2f7f4] p-4">
                        <div className="grid gap-3 sm:grid-cols-[140px_1fr_auto]">
                          <div>
                            <Label className="text-jade-ink/80">Credits (+/−)</Label>
                            <Input value={creditForm.delta} onChange={(e) => setCreditForm({ ...creditForm, delta: e.target.value.replace(/[^\-\d]/g, "") })}
                              placeholder="e.g. 100 or -25" className="mt-1.5 border-vault-border bg-white text-jade-ink" />
                          </div>
                          <div>
                            <Label className="text-jade-ink/80">Reason (required)</Label>
                            <Input value={creditForm.reason} onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })}
                              placeholder="e.g. March prepaid bundle" className="mt-1.5 border-vault-border bg-white text-jade-ink" />
                          </div>
                          <div className="flex items-end gap-2">
                            <Button size="sm" onClick={applyCredit} disabled={!creditForm.delta || creditForm.reason.trim().length < 3}
                              className="bg-verify-green text-vault-dark hover:bg-verify-green/90 disabled:opacity-40">
                              <Check className="mr-1.5 h-3.5 w-3.5" /> Apply
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setCreditForm(null)} className="border border-vault-border text-jade-muted hover:text-jade-ink">Cancel</Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setCreditForm({ id: a.id, delta: "", reason: "" })}
                        className="mt-3 border border-vault-border text-verify-ink hover:bg-verify-green/10">
                        <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Grant / adjust credits
                      </Button>
                    )}
                  </div>
                );
              })}
              {data.companies.length === 0 && (
                <div className="rounded-xl border border-dashed border-vault-border bg-white/60 p-10 text-center text-sm text-jade-muted">No companies yet.</div>
              )}

              {/* Ledger — the immutable money trail */}
              <div className="overflow-hidden rounded-xl border border-vault-border bg-white vv-card-shadow">
                <div className="flex items-center justify-between px-5 py-4">
                  <div>
                    <h3 className="text-sm font-semibold text-jade-ink">Credit ledger</h3>
                    <p className="text-xs text-jade-muted">Last 50 entries, newest first — grants, spends, adjustments. Write-once, never editable.</p>
                  </div>
                  <button type="button" onClick={loadLedger} className="rounded-lg p-2 text-jade-muted transition hover:bg-jade-ink/5 hover:text-jade-ink" aria-label="Refresh ledger">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
                <table className="min-w-full text-left">
                  <thead className="bg-[#f7fbf8]">
                    <tr>{["When", "Company", "Change", "Reason", "By", "Balance"].map((h) => <th key={h} className={cn(th, "text-left")}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(ledger ?? []).map((l) => (
                      <tr key={l.id}>
                        <td className={cn(td, "whitespace-nowrap text-jade-muted")}>{new Date(l.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                        <td className={td}>{l.agency}</td>
                        <td className={cn(td, "font-mono font-semibold", l.delta >= 0 ? "text-verify-ink" : "text-rose-600")}>{l.delta >= 0 ? `+${l.delta}` : l.delta}</td>
                        <td className={cn(td, "text-xs text-jade-muted")}>{l.reason}</td>
                        <td className={cn(td, "text-xs")}>{l.actorType.toLowerCase()}{l.actorId ? ` · ${l.actorId.slice(0, 18)}` : ""}</td>
                        <td className={cn(td, "font-mono")}>{l.balanceAfter}</td>
                      </tr>
                    ))}
                    {ledger?.length === 0 && <tr><td className={cn(td, "py-8 text-center text-jade-muted")} colSpan={6}>No ledger entries yet.</td></tr>}
                    {!ledger && <tr><td className={cn(td, "py-8 text-center text-jade-muted")} colSpan={6}><Spinner /></td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Shared links — global kill-switch over Controlled Sharing ── */}
          {section === "shares" && (
            <div className="mt-8 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-jade-ink">Shared links</h2>
                  <p className="mt-1 text-sm text-jade-muted">Every controlled-sharing link on the platform — reference reports and checklist completions. Revoke any link instantly if it's abused.</p>
                </div>
                <Button size="sm" variant="ghost" onClick={loadShares} className="h-9 border border-vault-border text-verify-ink hover:bg-verify-green/10">
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
              <div className="overflow-hidden rounded-xl border border-vault-border bg-white vv-card-shadow">
                <table className="min-w-full text-left">
                  <thead className="bg-[#f7fbf8]">
                    <tr>{["What", "Owner", "Access", "Views", "Expires", "Status", ""].map((h, i) => <th key={i} className={cn(th, "text-left")}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(shares ?? []).map((l) => {
                      const expired = l.expiresAt ? new Date(l.expiresAt) < new Date() : false;
                      const state = l.revoked ? "Revoked" : expired ? "Expired" : l.accessType === "ONE_TIME" && l.viewCount > 0 ? "Used" : "Live";
                      return (
                        <tr key={l.id} className={cn("transition hover:bg-[#f7fbf8]", l.revoked && "opacity-60")}>
                          <td className={cn(td, "font-medium")}>{l.what}{l.label && <span className="ml-1.5 text-xs font-normal text-jade-muted">· “{l.label}”</span>}</td>
                          <td className={cn(td, "text-jade-muted")}>{l.owner} · {l.ownerEmail}</td>
                          <td className={td}>{l.accessType === "ONE_TIME" ? "One-time" : "Duration"}</td>
                          <td className={td}>{l.viewCount}</td>
                          <td className={cn(td, "whitespace-nowrap text-jade-muted")}>{l.expiresAt ? new Date(l.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</td>
                          <td className={td}>
                            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              state === "Live" ? "border-verify-green/40 text-verify-ink" : state === "Revoked" ? "border-rose-300 text-rose-600" : "border-vault-border text-jade-muted")}>
                              {state}
                            </span>
                          </td>
                          <td className={cn(td, "text-right")}>
                            {!l.revoked && !expired && (
                              <button type="button" onClick={() => revokeShare(l)}
                                className="rounded-full border border-rose-300 px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50">
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {shares?.length === 0 && <tr><td className={cn(td, "py-8 text-center text-jade-muted")} colSpan={7}>No share links yet.</td></tr>}
                    {!shares && <tr><td className={cn(td, "py-8 text-center text-jade-muted")} colSpan={7}><Spinner /></td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Audit log — the platform's permanent record ── */}
          {section === "audit" && (
            <div className="mt-8 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-jade-ink">Audit log</h2>
                  <p className="mt-1 text-sm text-jade-muted">Write-once record of every action on the platform — including your own. Search by action, actor, or entity.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input value={auditQ} onChange={(e) => setAuditQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadAudit()}
                    placeholder="Search action / actor / entity…" className="h-9 w-56 border-vault-border bg-white text-sm text-jade-ink placeholder:text-[#8aa29c]" />
                  <select value={auditType} onChange={(e) => setAuditType(e.target.value)}
                    className="h-9 rounded-md border border-vault-border bg-white px-2 text-sm text-jade-ink">
                    <option value="">All actors</option>
                    <option value="CANDIDATE">Candidates</option>
                    <option value="RECRUITER">Recruiters</option>
                    <option value="REFERENCE">Referees</option>
                    <option value="SYSTEM">System / Superadmin</option>
                  </select>
                  <select value={auditDays} onChange={(e) => setAuditDays(Number(e.target.value))}
                    className="h-9 rounded-md border border-vault-border bg-white px-2 text-sm text-jade-ink">
                    <option value={1}>24 hours</option>
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={365}>1 year</option>
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => exportCsv("audit")} className="h-9 border border-vault-border text-verify-ink hover:bg-verify-green/10" title="Export CSV">
                    <FileDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => loadAudit()} className="h-9 border border-vault-border text-verify-ink hover:bg-verify-green/10">
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Search
                  </Button>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-vault-border bg-white vv-card-shadow">
                <table className="min-w-full text-left">
                  <thead className="bg-[#f7fbf8]">
                    <tr>{["When", "Actor", "Action", "Entity", "IP", "Detail"].map((h) => <th key={h} className={cn(th, "text-left")}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(audit ?? []).map((ev) => (
                      <tr key={ev.id} className="transition hover:bg-[#f7fbf8]">
                        <td className={cn(td, "whitespace-nowrap text-jade-muted")}>{new Date(ev.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })}</td>
                        <td className={cn(td, "max-w-48 truncate")}>
                          <span className="rounded bg-[#f0f6f2] px-1.5 py-0.5 text-[10px] font-bold uppercase text-verify-ink">{ev.actorType}</span>
                          {ev.actorId && <span className="ml-1.5 text-xs text-jade-muted">{ev.actorId.slice(0, 26)}</span>}
                        </td>
                        <td className={cn(td, "whitespace-nowrap font-mono text-xs font-semibold text-jade-ink")}>{ev.action}</td>
                        <td className={cn(td, "text-xs text-jade-muted")}>{ev.entity}{ev.entityId ? ` · ${ev.entityId.slice(0, 14)}` : ""}</td>
                        <td className={cn(td, "font-mono text-xs text-jade-muted")}>{ev.ip || "—"}</td>
                        <td className={cn(td, "max-w-72 truncate text-xs text-jade-muted")} title={ev.detail}>{ev.detail !== "{}" ? ev.detail : "—"}</td>
                      </tr>
                    ))}
                    {audit?.length === 0 && <tr><td className={cn(td, "py-8 text-center text-jade-muted")} colSpan={6}>No events match this filter.</td></tr>}
                    {!audit && <tr><td className={cn(td, "py-8 text-center text-jade-muted")} colSpan={6}><Spinner /></td></tr>}
                  </tbody>
                </table>
              </div>
              {audit && audit.length >= 200 && <p className="text-center text-[11px] text-[#8aa29c]">Showing the 200 most recent events — narrow the filter to see more.</p>}
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

          {/* ── System & APIs — where every integration lives (flags only, never values) ── */}
          {section === "system" && (
            <div className="mt-8 space-y-6">
              <div>
                <h2 className="text-base font-semibold text-jade-ink">System & APIs</h2>
                <p className="mt-1 text-sm text-jade-muted">
                  The deployment map for this platform. Secret <strong>values</strong> live only in environment variables
                  (Vercel encrypted store) — this page shows configured flags, never the values themselves.
                </p>
              </div>

              {/* Platform controls — the command switches */}
              <div className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-jade-ink">Platform controls</h3>
                    <p className="mt-0.5 text-xs text-jade-muted">Maintenance mode pauses every write across the platform. Connectivity pings verify the live integrations.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={toggleMaintenance}
                      className={cn("rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                        data.platform.maintenance ? "border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100" : "border-vault-border text-jade-muted hover:text-jade-ink")}>
                      {data.platform.maintenance ? "Maintenance ON — click to resume" : "Maintenance mode"}
                    </button>
                    <Button size="sm" variant="ghost" onClick={runPing} className="border border-vault-border text-verify-ink hover:bg-verify-green/10">
                      <Activity className="mr-1.5 h-3.5 w-3.5" /> Ping integrations
                    </Button>
                  </div>
                </div>
                {ping && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {[ping.db && ["Database", ping.db], ping.brevo && ["Brevo email", ping.brevo]].filter(Boolean).map(([label, v]) => {
                      const item = v as { ok: boolean; detail: string };
                      return (
                        <div key={label as string} className={cn("rounded-xl border px-4 py-3 text-sm", item.ok ? "border-verify-green/30 bg-verify-green/5" : "border-rose-200 bg-rose-50")}>
                          <p className="flex items-center gap-2 font-semibold text-jade-ink">
                            {item.ok ? <Check className="h-4 w-4 text-verify-green" /> : <X className="h-4 w-4 text-rose-500" />}
                            {label as string}
                          </p>
                          <p className={cn("mt-0.5 text-xs", item.ok ? "text-jade-muted" : "text-rose-600")}>{item.detail}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Notification delivery health */}
                <div className="mt-6 border-t border-vault-border/60 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-jade-ink">Email delivery health</h4>
                      <p className="mt-0.5 text-xs text-jade-muted">Last 7 days across all notification kinds (invites, reminders, OTP, security).</p>
                    </div>
                    {notifHealth && (
                      <div className="flex gap-2 text-xs font-semibold">
                        <span className="rounded-full border border-verify-green/40 px-2.5 py-1 text-verify-ink">{notifHealth.stats.sent} sent</span>
                        <span className="rounded-full border border-amber-300 px-2.5 py-1 text-amber-700">{notifHealth.stats.simulated} simulated</span>
                        <span className={cn("rounded-full border px-2.5 py-1", notifHealth.stats.failed > 0 ? "border-rose-300 bg-rose-50 text-rose-600" : "border-vault-border text-jade-muted")}>{notifHealth.stats.failed} failed</span>
                      </div>
                    )}
                  </div>
                  {notifHealth && notifHealth.notifications.length > 0 && (
                    <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-vault-border">
                      <table className="min-w-full text-left text-xs">
                        <thead className="sticky top-0 bg-[#f7fbf8]">
                          <tr>{["When", "Channel", "Kind", "To", "Status"].map((h) => <th key={h} className="px-3 py-2 font-semibold uppercase tracking-wider text-jade-muted">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {notifHealth.notifications.map((n) => (
                            <tr key={n.id} className="border-t border-vault-border/50">
                              <td className="whitespace-nowrap px-3 py-2 text-jade-muted">{new Date(n.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                              <td className="px-3 py-2">{n.channel}</td>
                              <td className="px-3 py-2 font-mono">{n.kind}</td>
                              <td className="max-w-56 truncate px-3 py-2 text-jade-muted" title={n.to}>{n.to}</td>
                              <td className="px-3 py-2">
                                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                                  n.status === "SENT" ? "bg-verify-green/15 text-verify-ink" : n.status === "FAILED" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>
                                  {n.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Breach response */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-vault-border/60 pt-5">
                  <div>
                    <h4 className="text-sm font-semibold text-jade-ink">Breach response</h4>
                    <p className="mt-0.5 text-xs text-jade-muted">Sign out every candidate and recruiter on the platform. The superadmin console stays signed in.</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={killAllSessions} className="border border-rose-300 text-rose-600 hover:bg-rose-50">
                    <LogOut className="mr-1.5 h-3.5 w-3.5" /> Revoke all user sessions
                  </Button>
                </div>
              </div>

              {!sys ? (
                <div className="flex justify-center py-12"><Spinner label="Reading system status…" /></div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-verify-ink/90">Runtime</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <p className="flex justify-between gap-3"><span className="text-jade-muted">Database</span><span className="text-right font-medium text-jade-ink">{sys.runtime.databaseProvider}</span></p>
                        <p className="flex justify-between gap-3"><span className="text-jade-muted">Email</span><span className="text-right font-medium text-jade-ink">{sys.runtime.emailProvider}</span></p>
                        <p className="flex justify-between gap-3"><span className="text-jade-muted">SMS</span><span className="text-right font-medium text-jade-ink">{sys.runtime.smsProvider}</span></p>
                        <p className="flex justify-between gap-3"><span className="text-jade-muted">Environment</span><span className="text-right font-medium text-jade-ink">{sys.runtime.environment}</span></p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-verify-ink/90">Frontend protection</p>
                      <div className="mt-3 space-y-1.5">
                        {sys.protections.map((p) => (
                          <p key={p.label} className="flex items-start gap-2 text-sm text-jade-ink" title={p.detail}>
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verify-green" />
                            {p.label}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-vault-border bg-white vv-card-shadow">
                    <table className="w-full">
                      <thead className="bg-[#f7fbf8]">
                        <tr>
                          <th className={cn(th, "text-left")}>Integration</th>
                          <th className={cn(th, "text-left")}>Env variable</th>
                          <th className={cn(th, "text-left")}>Provider</th>
                          <th className={cn(th, "text-left")}>Purpose</th>
                          <th className={cn(th, "text-right")}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sys.items.map((i) => (
                          <tr key={i.key}>
                            <td className={cn(td, "font-medium")}>{i.label}{i.critical && <span className="ml-1.5 text-[10px] font-semibold text-[#b3591c]">critical</span>}</td>
                            <td className={cn(td, "font-mono text-xs")}>{i.envVar}</td>
                            <td className={td}>{i.provider}</td>
                            <td className={cn(td, "text-xs text-jade-muted")}>{i.purpose}</td>
                            <td className={cn(td, "text-right")}>
                              {i.configured ? (
                                <span className="rounded-full border border-verify-green/40 bg-verify-green/10 px-2.5 py-0.5 text-[11px] font-semibold text-verify-ink">Configured</span>
                              ) : (
                                <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", i.critical ? "border-rose-200 bg-rose-50 text-rose-600" : "border-amber-200 bg-amber-50 text-amber-700")}>{i.critical ? "Not set" : "Optional"}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-center text-[11px] text-[#8aa29c]">
                    Manage values in Vercel → Settings → Environment Variables (or local <span className="font-mono">.env</span> for dev). See DEPLOY.md for the full guide.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="mt-10 flex items-center gap-2 text-xs text-[#8aa29c]">
            <AgencyLogo logoText="VV" name="VaultVerify" size="sm" light />
          </div>
        </main>
      </div>

      {/* ── View-as drawer (read-only proxy dossier) ── */}
      {impView && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[2px]" onClick={() => setImpView(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto border-l border-vault-border bg-white p-6 vv-card-shadow" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-verify-ink/90">View as · read-only</p>
                <h3 className="mt-1 text-lg font-semibold text-jade-ink">{impView.name}</h3>
                <p className="text-sm text-jade-muted">{impView.email} · {impView.kind.toLowerCase()}</p>
              </div>
              <button type="button" onClick={() => setImpView(null)} className="rounded-lg p-2 text-jade-muted transition hover:bg-jade-ink/5 hover:text-jade-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              You are viewing this account's data as platform admin. Nothing can be written from here, and this access is stamped in the audit log.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className={statusPill(impView.status)}>{impView.status === "SUSPENDED" ? "Suspended" : "Active"}</span>
              <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", impView.emailVerified ? "border-verify-green/40 text-verify-ink" : "border-amber-300 text-amber-700")}>
                {impView.emailVerified ? "Email verified" : "Unverified"}
              </span>
              <span className="rounded-full border border-vault-border px-2 py-0.5 text-[11px] font-semibold text-jade-muted">{impView.liveSessions} live session(s)</span>
            </div>

            <h4 className="mt-5 text-xs font-bold uppercase tracking-wider text-jade-muted">Security actions</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => sendReset(impView.kind, impView.id, impView.email)} className="border border-vault-border text-verify-ink hover:bg-verify-green/10">
                <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Send password reset
              </Button>
              <Button size="sm" variant="ghost" onClick={() => issueTempPw(impView.kind, impView.id, impView.email)} className="border border-vault-border text-verify-ink hover:bg-verify-green/10">
                Issue temp password
              </Button>
              <Button size="sm" variant="ghost" onClick={() => killUserSessions(impView.kind, impView.id, impView.email)} className="border border-rose-300 text-rose-600 hover:bg-rose-50">
                <Ban className="mr-1.5 h-3.5 w-3.5" /> Kill sessions
              </Button>
            </div>

            <h4 className="mt-5 text-xs font-bold uppercase tracking-wider text-jade-muted">Profile</h4>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {Object.entries(impView.profile).map(([k, v]) => (
                <div key={k}>
                  <p className="text-[10px] uppercase tracking-wider text-jade-muted">{k.replace(/([A-Z])/g, " $1").trim()}</p>
                  <p className="text-jade-ink">{String(v) || "—"}</p>
                </div>
              ))}
            </div>

            {impView.invites.length > 0 && (
              <>
                <h4 className="mt-5 text-xs font-bold uppercase tracking-wider text-jade-muted">Checklist invites</h4>
                <div className="mt-2 space-y-1.5">
                  {impView.invites.map((i) => (
                    <div key={i.id} className="flex items-center justify-between rounded-lg border border-vault-border/60 px-3 py-2 text-xs">
                      <span className="text-jade-ink">{i.candidate} · {specialtyLabel(i.specialty)}</span>
                      <span className="text-jade-muted">{i.status}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {impView.requests.length > 0 && (
              <>
                <h4 className="mt-5 text-xs font-bold uppercase tracking-wider text-jade-muted">Checklist requests</h4>
                <div className="mt-2 space-y-1.5">
                  {impView.requests.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg border border-vault-border/60 px-3 py-2 text-xs">
                      <span className="text-jade-ink">{specialtyLabel(r.specialty)} · {r.jobTitle}</span>
                      <span className="text-jade-muted">{r.status}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {impView.completions.length > 0 && (
              <>
                <h4 className="mt-5 text-xs font-bold uppercase tracking-wider text-jade-muted">Completed checklists</h4>
                <div className="mt-2 space-y-1.5">
                  {impView.completions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-vault-border/60 px-3 py-2 text-xs">
                      <span className="text-jade-ink">{c.specialtyLabel} · {new Date(c.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      <span className="text-jade-muted">{c.shareLinks} share link(s)</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Temp password reveal (shown once) ── */}
      {tempPwShown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-[2px]" onClick={() => setTempPwShown(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-vault-border bg-white p-6 vv-card-shadow" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-jade-ink">Temporary password issued</h3>
            <p className="mt-1 text-sm text-jade-muted">Emailed to {tempPwShown.email}. It is shown once here — copy it now if you want to hand it over directly.</p>
            <p className="mt-3 rounded-lg border border-vault-border bg-[#f7fbf8] px-4 py-3 text-center font-mono text-lg font-semibold tracking-wide text-jade-ink">{tempPwShown.temp}</p>
            <Button className="mt-4 w-full bg-verify-green text-vault-dark hover:bg-verify-green/90" onClick={() => setTempPwShown(null)}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}
