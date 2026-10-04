"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SHARE_PRESETS, shareAccessLabel } from "@/lib/bts/constants";
import { RATING_META, specialtyLabel, summarizeAnswers, type SkillAnswer } from "@/lib/bts/checklistShared";
import { VaultMark, Spinner } from "../brand";
import { ReferencesPanel } from "./ReferencesPanel";
import { SharingPanel, type RefShareRow } from "./SharingPanel";
import { PortalShell } from "../shell/PortalShell";
import { ChecklistFill, type CatalogSet, type FillSpec } from "./ChecklistFill";
import { ChecklistOnboarding, type ProfileData } from "./ChecklistOnboarding";
import {
  AdditionalQuestionsView, AttestationView, AvgRing, CategoryBars, MixDonut, RecentDonut,
  RatingLegend, RecencyLegend, RecencyStrip, SectionHeading, SkillReportRow,
  type AdditionalAnswer, type AttestationData,
} from "./ReportBits";
import {
  BadgeCheck, CalendarClock, Check, ChevronDown, ClipboardList, Copy, Download, ExternalLink, Hourglass,
  Inbox, LayoutDashboard, Link2, Plus, Settings2, Share2, ShieldCheck, Users, X,
} from "lucide-react";

// ── Skills Checklist candidate portal — accounts, onboarding, requests, invites, shares ──

interface ShareLinkDto { id: string; token: string; accessType: string; durationDays: number | null; label: string; createdAt: string; expiresAt: string | null; viewedAt: string | null; viewCount: number; revoked: boolean }
interface CompletionDto { id: string; profession: string; jobTitle: string; specialty: string; specialtyLabel: string; source: string; completedAt: string; expiresAt: string; yearsExperience: number; shareLinks: ShareLinkDto[]; answers: SkillAnswer[]; additional: AdditionalAnswer[]; attestation: AttestationData | null }
interface RequestDto { id: string; profession: string; jobTitle: string; specialty: string; status: string; requestedAt: string; decidedAt: string | null; completionId: string | null }
interface InviteDto { id: string; recruiterName: string; facilityName: string; agencyName: string; profession: string; jobTitle: string; specialty: string; status: string; createdAt: string; completedAt: string | null; completionId: string | null; message: string; specialtyLabel?: string }
interface AccountDto extends ProfileData { onboardingComplete: boolean }
interface MeData { account: AccountDto | null; invites?: InviteDto[]; requests?: RequestDto[]; completions?: CompletionDto[] }

const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const monthsLeft = (d: string) => Math.max(0, Math.round((new Date(d).getTime() - Date.now()) / (30.4 * 24 * 3600 * 1000)));

// ── Share dialog ──
function ShareDialog({ completion, onClose, onCreated }: { completion: CompletionDto; onClose: () => void; onCreated: () => void }) {
  const [preset, setPreset] = useState<string>("ONE_TIME");
  const [customDays, setCustomDays] = useState("30");
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<{ token: string; accessType: string; durationDays: number | null; expiresAt: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const chosen = SHARE_PRESETS.find((p) => p.key === preset)!;
      const accessType = chosen.key === "ONE_TIME" ? "ONE_TIME" : "DURATION";
      const durationDays = chosen.key === "ONE_TIME" ? null : chosen.key === "custom" ? Number(customDays) : chosen.days;
      const res = await fetch("/api/checklist/share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completionId: completion.id, accessType, durationDays, label }),
      });
      const d = await res.json();
      if (d.ok) { setCreated(d.link); onCreated(); } else throw new Error(d.error);
    } catch { /* inline: button re-enables */ } finally { setBusy(false); }
  };

  const link = created ? `${window.location.origin}/?s=${created.token}` : "";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b2b30]/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="w-full max-w-md rounded-2xl border border-vault-border bg-white vv-card-shadow p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-jade-ink"><Link2 className="h-4 w-4 text-verify-ink" /> Share checklist</h3>
            <p className="mt-0.5 text-xs text-jade-muted">{completion.specialtyLabel} · {completion.jobTitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-jade-muted hover:bg-jade-ink/5 hover:text-jade-ink"><X className="h-4 w-4" /></button>
        </div>

        {!created ? (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-jade-muted">Who can open it & for how long</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SHARE_PRESETS.map((p) => (
                <button key={p.key} type="button" onClick={() => setPreset(p.key)}
                  className={cn("rounded-xl border px-3 py-2.5 text-left text-sm transition",
                    preset === p.key ? "border-verify-green bg-verify-green/15 text-verify-ink" : "border-vault-border text-jade-muted hover:text-jade-ink")}>
                  <span className="block font-semibold">{p.label}</span>
                  <span className="mt-0.5 block text-[10px] opacity-75">
                    {p.key === "ONE_TIME" ? "Viewed once, then dead" : p.key === "custom" ? "You pick the days" : p.days === 1 ? "24 hours" : `${p.days} days from now`}
                  </span>
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <div className="mt-3">
                <Label className="text-jade-ink/80">Days the link stays open</Label>
                <Input type="number" min={1} max={365} value={customDays} onChange={(e) => setCustomDays(e.target.value)}
                  className="mt-1 border-vault-border bg-white text-jade-ink" />
              </div>
            )}
            <div className="mt-3">
              <Label className="text-jade-ink/80">Note for the recipient (optional)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. For the SNF recruiter"
                className="mt-1 border-vault-border bg-white text-jade-ink placeholder:text-[#8aa29c]" />
            </div>
            <Button onClick={create} disabled={busy} className="mt-5 w-full bg-verify-green text-vault-dark hover:bg-verify-green/90">
              {busy ? "Creating…" : "Create share link"}
            </Button>
          </>
        ) : (
          <>
            <div className="mt-4 rounded-xl border border-verify-green/30 bg-verify-green/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-verify-ink"><BadgeCheck className="h-4 w-4" /> Link ready</p>
              <p className="mt-1 text-xs text-[#33565b]">
                Access: <span className="font-semibold">{shareAccessLabel(created)}</span>
                {created.expiresAt && created.accessType === "DURATION" ? ` — expires ${fmt(created.expiresAt)}` : created.accessType === "ONE_TIME" ? " — first view burns the link" : ""}
              </p>
            </div>
            <div className="mt-3 break-all rounded-xl border border-vault-border bg-[#eef4f1] p-3 font-mono text-xs text-jade-ink">{link}</div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => { navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); }}
                className="flex-1 bg-verify-green text-vault-dark hover:bg-verify-green/90">
                {copied ? <><Check className="mr-1.5 h-4 w-4" /> Copied</> : <><Copy className="mr-1.5 h-4 w-4" /> Copy link</>}
              </Button>
              <Button variant="ghost" onClick={onClose} className="border border-vault-border text-jade-muted hover:text-jade-ink">Done</Button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#8aa29c]">
              Send this to any recruiter. They’ll see the access type and deadline on the page, and can download the PDF.
            </p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Main portal ──
export function ChecklistPortal({ inviteToken, onExit, onLaunchReferences }: { inviteToken?: string | null; onExit: () => void; onLaunchReferences?: (prefill: { name: string; email: string; role: string }) => void }) {
  const [me, setMe] = useState<MeData | null>(null);
  const [sets, setSets] = useState<CatalogSet[]>([]);
  const [booting, setBooting] = useState(true);
  // auth form — arriving via a recruiter invite means the candidate is new:
  // default to signup so they set a password (email is already pre-filled)
  const [mode, setMode] = useState<"login" | "signup">(inviteToken ? "signup" : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "", title: "RN" });
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // dashboard
  const [section, setSection] = useState<"dashboard" | "checklists" | "references" | "sharing" | "settings">("dashboard");
  const [checkTab, setCheckTab] = useState<"mine" | "requests" | "invites">("mine");
  const [refStats, setRefStats] = useState<{ total: number; completed: number } | null>(null);
  const [refShares, setRefShares] = useState<RefShareRow[]>([]);
  const [showRequest, setShowRequest] = useState(false);
  const [fillSpec, setFillSpec] = useState<FillSpec | null>(null);
  const [shareFor, setShareFor] = useState<CompletionDto | null>(null);
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [claimedInvite, setClaimedInvite] = useState<string | null>(null);
  const [inviteCtx, setInviteCtx] = useState<{ recruiterName: string; facilityName: string; agencyName: string; message: string; candidateEmail: string } | null>(null);

  const handleRefStats = useCallback((s: { total: number; completed: number } | null) => setRefStats(s), []);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/checklist/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "me" }) });
    const d: MeData & { ok: boolean } = await res.json();
    setMe({ account: d.account ?? null, invites: d.invites, requests: d.requests, completions: d.completions });
    return d.account;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/checklists");
        const d = await res.json();
        if (d.ok) setSets(d.checklists);
        await loadMe();
      } catch { /* portal still renders */ } finally { setBooting(false); }
    })();
  }, [loadMe]);

  // prefetch reference stats (dashboard card + sidebar badge) — the References
  // panel refreshes the same state whenever it loads
  const loadRefShares = useCallback(async (email: string) => {
    try {
      const res = await fetch(`/api/reference/share?email=${encodeURIComponent(email)}`);
      const d = await res.json();
      setRefShares(d.ok ? (d.links as RefShareRow[]) : []);
    } catch { setRefShares([]); }
  }, []);

  useEffect(() => {
    const email = me?.account?.email;
    if (!email) return;
    loadRefShares(email);
    fetch(`/api/candidate?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.candidate) {
          const reqs = d.candidate.requests as { status: string }[];
          setRefStats({ total: reqs.length, completed: reqs.filter((r) => r.status === "COMPLETED" || r.status === "FLAGGED").length });
        } else setRefStats(null);
      })
      .catch(() => setRefStats(null));
  }, [me?.account?.email, loadRefShares]);

  // claim an invite link after sign-in
  useEffect(() => {
    if (!me?.account || !inviteToken || claimedInvite === inviteToken) return;
    setClaimedInvite(inviteToken);
    fetch("/api/checklist/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "claim", token: inviteToken }) })
      .then(() => loadMe())
      .catch(() => undefined);
  }, [me?.account, inviteToken, claimedInvite, loadMe]);

  // pre-fill the signup form from the invite (email is pre-set by the recruiter;
  // the candidate only sets a password, then confirms the onboarding form)
  useEffect(() => {
    if (!inviteToken || me?.account) return;
    fetch("/api/checklist/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", token: inviteToken }) })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setInviteCtx(d.invite);
          setForm((f) => ({ ...f, name: d.invite.candidateName || f.name, email: d.invite.candidateEmail || f.email, title: d.invite.jobTitle || f.title }));
        }
      })
      .catch(() => undefined);
  }, [inviteToken, me?.account]);

  const auth = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/checklist/account", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, ...form }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Something went wrong");
      await loadMe();
      if (window.history?.replaceState) window.history.replaceState({}, "", "/");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setBusy(false); }
  };

  const signOut = async () => {
    await fetch("/api/checklist/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    setMe({ account: null });
  };

  // ── Fill flow takes over ──
  if (fillSpec) {
    return (
      <ChecklistFill
        spec={fillSpec}
        sets={sets}
        onExit={async () => { setFillSpec(null); await loadMe(); }}
        onDone={async () => { setFillSpec(null); setSection("checklists"); setCheckTab("mine"); await loadMe(); }}
      />
    );
  }

  // ── Onboarding gate: every candidate confirms their profile once ──
  if (me?.account && !me.account.onboardingComplete) {
    return (
      <ChecklistOnboarding
        account={me.account}
        sets={sets}
        onSaved={async () => { await loadMe(); }}
        onExit={signOut}
        banner={
          (me.invites ?? []).some((i) => i.status !== "COMPLETED")
            ? "A recruiter is waiting on your checklist — confirm your details below, then complete it."
            : undefined
        }
      />
    );
  }

  // ── Auth gate ──
  if (booting) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f9f5]"><Spinner label="Opening your vault…" /></div>;
  }
  if (!me?.account) {
    return (
      <div className="vv-page flex min-h-screen items-center justify-center px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md">
          <div className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-8">
            <div className="flex flex-col items-center text-center">
              <VaultMark size={44} />
              <h1 className="mt-4 text-xl font-semibold text-jade-ink">Nurse portal</h1>
              <p className="mt-1 text-sm text-jade-muted">
                {mode === "login" ? "Verified references and skills checklists — one secure vault." : "Create your account — verified references and skill checklists in one vault."}
              </p>
            </div>
            {inviteCtx && (
              <div className="mt-4 rounded-xl border border-verify-green/30 bg-verify-green/10 p-3 text-xs text-jade-ink">
                <p className="font-semibold text-verify-ink">{inviteCtx.recruiterName}{inviteCtx.facilityName ? ` · ${inviteCtx.facilityName}` : ""} sent you a checklist request</p>
                {inviteCtx.message && <p className="mt-0.5 italic text-jade-muted">“{inviteCtx.message}”</p>}
                <p className="mt-1 text-jade-muted">Sign up with <span className="font-semibold">{inviteCtx.candidateEmail}</span> — your email is already set; you'll pick a password next.</p>
              </div>
            )}
            {!inviteCtx && inviteToken && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-verify-green/30 bg-verify-green/10 p-3 text-xs text-verify-ink">
                <Inbox className="h-4 w-4 shrink-0" /> A recruiter sent you a checklist — sign in or create an account with the same email to claim it.
              </div>
            )}
            <form onSubmit={auth} className="mt-6 space-y-3.5">
              {mode === "signup" && (
                <div>
                  <Label htmlFor="cp-name" className="text-jade-ink/80">Full name</Label>
                  <Input id="cp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Emma Chen"
                    className="mt-1 border-vault-border bg-white text-jade-ink placeholder:text-[#8aa29c]" />
                </div>
              )}
              <div>
                <Label htmlFor="cp-email" className="text-jade-ink/80">Email</Label>
                <Input id="cp-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com"
                  className="mt-1 border-vault-border bg-white text-jade-ink placeholder:text-[#8aa29c]" />
              </div>
              <div>
                <Label htmlFor="cp-pass" className="text-jade-ink/80">Password</Label>
                <Input id="cp-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                  className="mt-1 border-vault-border bg-white text-jade-ink placeholder:text-[#8aa29c]" />
              </div>
              {authError && <p className="text-xs font-medium text-rose-600">{authError}</p>}
              <Button type="submit" disabled={busy} className="w-full bg-verify-green text-vault-dark hover:bg-verify-green/90">
                {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"} <ShieldCheck className="ml-2 h-4 w-4" />
              </Button>
            </form>
            <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setAuthError(null); }}
              className="mt-4 w-full text-center text-xs text-jade-muted hover:text-jade-ink">
              {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
            <div className="mt-4 rounded-xl bg-[#f0f6f2] p-3 text-center text-[11px] text-jade-muted">
              Demo account: <button type="button" className="font-mono font-semibold text-verify-ink underline" onClick={() => { setMode("login"); setForm({ ...form, email: "emma.chen@example.com", password: "demo1234" }); }}>emma.chen@example.com / demo1234</button>
            </div>
            <button type="button" onClick={onExit} className="mt-4 w-full text-center text-xs text-[#8aa29c] hover:text-jade-muted">← Back to site</button>
          </div>
        </motion.div>
      </div>
    );
  }

  const acc = me.account;
  const completions = me.completions ?? [];
  const requests = me.requests ?? [];
  const invites = me.invites ?? [];
  const openInvites = invites.filter((i) => i.status !== "COMPLETED");
  const pendingRequests = requests.filter((r) => r.status === "PENDING");
  const approvedRequests = requests.filter((r) => r.status === "APPROVED" && !r.completionId);

  const startFill = (spec: FillSpec) => setFillSpec(spec);

  const activeShares = completions.reduce((n, c) => n + c.shareLinks.filter((l) => !l.revoked && !(l.accessType === "ONE_TIME" && l.viewedAt) && !(l.expiresAt && new Date(l.expiresAt) < new Date())).length, 0)
    + refShares.filter((l) => !l.revoked && !(l.accessType === "ONE_TIME" && l.viewedAt) && !(l.expiresAt && new Date(l.expiresAt) < new Date())).length;
  const checklistActions = approvedRequests.length + openInvites.length;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <PortalShell
      badge="Nurse portal"
      userName={acc.name}
      userEmail={acc.email}
      active={section}
      onNavigate={(k) => setSection(k as "dashboard" | "references" | "checklists" | "sharing" | "settings")}
      onSignOut={signOut}
      headerActions={
        <Button size="sm" onClick={() => setShowRequest(true)} className="bg-verify-green text-vault-dark hover:bg-verify-green/90">
          <Plus className="mr-1 h-3.5 w-3.5" /> Request checklist
        </Button>
      }
      nav={[
        { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { key: "references", label: "References", icon: Users, badge: refStats ? `${refStats.completed}/${refStats.total}` : undefined },
        { key: "checklists", label: "Skill checklists", icon: ClipboardList, badge: checklistActions || undefined },
        { key: "sharing", label: "Controlled sharing", icon: Share2, badge: activeShares || undefined },
        { key: "settings", label: "Settings", icon: Settings2 },
      ]}
    >
        {/* ── Dashboard ── */}
        {section === "dashboard" && (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-verify-ink/80">{greeting}</p>
              <h2 className="mt-1 text-2xl font-bold text-jade-ink">Welcome back, {acc.name.split(" ")[0]}</h2>
              <p className="mt-1 text-sm text-jade-muted">Verified references and self-assessed skill checklists — one secure vault.</p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {([
                ["References", refStats ? `${refStats.completed}/${refStats.total}` : "—", "done", "references", Users],
                ["Checklists", String(completions.filter((c) => new Date(c.expiresAt) >= new Date()).length), "valid now", "checklists", ClipboardList],
                ["Share links", String(activeShares), "active", "sharing", Share2],
                ["Open requests", String(openInvites.length + pendingRequests.length), "need action", "checklists", Inbox],
              ] as const).map(([label, value, sub, target, Icon]) => (
                <button key={label} type="button" onClick={() => setSection(target)}
                  className="rounded-xl border border-vault-border bg-white vv-card-shadow p-4 text-left transition hover:border-verify-green/50">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-jade-muted"><Icon className="h-3.5 w-3.5" /> {label}</p>
                  <p className="mt-1 text-2xl font-bold text-jade-ink">{value}</p>
                  <p className="text-[11px] text-jade-muted">{sub}</p>
                </button>
              ))}
            </div>

            {/* quick actions */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-verify-ink/90">Quick actions</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <button type="button" onClick={() => setSection("references")} className="rounded-xl border border-vault-border bg-white p-4 text-left vv-card-shadow transition hover:border-verify-green/50">
                  <Users className="h-4 w-4 text-verify-ink" />
                  <p className="mt-2 text-sm font-semibold text-jade-ink">{refStats ? "Manage references" : "Set up references"}</p>
                  <p className="mt-0.5 text-xs text-jade-muted">{refStats ? "Nudge, swap, or add a reference" : "Verify your employment with 2 referees"}</p>
                </button>
                <button type="button" onClick={() => setSection("checklists")} className="rounded-xl border border-vault-border bg-white p-4 text-left vv-card-shadow transition hover:border-verify-green/50">
                  <ClipboardList className="h-4 w-4 text-verify-ink" />
                  <p className="mt-2 text-sm font-semibold text-jade-ink">{checklistActions ? "Complete a checklist" : "Browse checklists"}</p>
                  <p className="mt-0.5 text-xs text-jade-muted">{checklistActions ? `${checklistActions} checklist request(s) waiting` : "Self-assess your specialty skills"}</p>
                </button>
                <button type="button" onClick={() => setSection("sharing")} className="rounded-xl border border-vault-border bg-white p-4 text-left vv-card-shadow transition hover:border-verify-green/50">
                  <Share2 className="h-4 w-4 text-verify-ink" />
                  <p className="mt-2 text-sm font-semibold text-jade-ink">Controlled sharing</p>
                  <p className="mt-0.5 text-xs text-jade-muted">See who has access — revoke or extend anytime</p>
                </button>
              </div>
            </div>

            {/* recent activity */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-verify-ink/90">Recent activity</p>
              <div className="mt-2 space-y-2">
                {completions.slice(0, 3).map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-vault-border bg-white px-4 py-3 vv-card-shadow">
                    <p className="flex items-center gap-2 text-sm text-jade-ink"><BadgeCheck className="h-4 w-4 text-verify-ink" /> {c.specialtyLabel} checklist completed</p>
                    <p className="text-xs text-jade-muted">{fmt(c.completedAt)} · valid until {fmt(c.expiresAt)}</p>
                  </div>
                ))}
                {openInvites.slice(0, 2).map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-verify-green/30 bg-verify-green/10 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm text-verify-ink"><Inbox className="h-4 w-4" /> {i.recruiterName} requested your {i.specialty ? specialtyLabel(i.specialty) : "specialty"} checklist</p>
                    <Button size="sm" variant="ghost" onClick={() => { setSection("checklists"); setCheckTab("invites"); }} className="text-verify-ink hover:bg-verify-green/20">Review</Button>
                  </div>
                ))}
                {completions.length === 0 && openInvites.length === 0 && (
                  <div className="rounded-xl border border-dashed border-vault-border bg-white/60 px-4 py-6 text-center text-sm text-jade-muted">
                    Nothing yet — set up your references or request your first checklist to get started.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── References — the verified-reference half of the vault ── */}
        {section === "references" && acc.email && (
          <ReferencesPanel email={acc.email} fallbackName={acc.name} onStats={handleRefStats}
            onShared={() => { loadRefShares(acc.email); }}
            onLaunchSetup={() => onLaunchReferences?.({ name: acc.name, email: acc.email, role: acc.title })} />
        )}

        {/* ── Controlled sharing ── */}
        {section === "sharing" && (
          <SharingPanel
            completions={completions.map((c) => ({ id: c.id, specialtyLabel: c.specialtyLabel, jobTitle: c.jobTitle, expired: new Date(c.expiresAt) < new Date(), shareLinks: c.shareLinks }))}
            refShares={refShares}
            recruiterAccess={invites.map((i) => ({ id: i.id, recruiterName: i.recruiterName, facilityName: i.facilityName, status: i.status, createdAt: i.createdAt }))}
            onChanged={() => { loadMe(); if (acc.email) loadRefShares(acc.email); }}
          />
        )}

        {/* ── Settings ── */}
        {section === "settings" && (
          <div className="mt-2">
            <ChecklistOnboarding account={acc} sets={sets} onSaved={async () => { await loadMe(); }} embedded />
          </div>
        )}

        {/* ── Skill checklists (self-assessments — independent from references) ── */}
        {section === "checklists" && (
          <>
            <div className="flex flex-wrap gap-2">
              {([["mine", "My checklists"], ["requests", "Requests"], ["invites", `Invites${openInvites.length ? ` (${openInvites.length})` : ""}`]] as const).map(([k, lb]) => (
                <button key={k} type="button" onClick={() => setCheckTab(k)}
                  className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition",
                    checkTab === k ? "border-verify-green bg-verify-green/15 text-verify-ink" : "border-vault-border text-jade-muted hover:text-jade-ink")}>
                  {lb}
                </button>
              ))}
            </div>

        {/* My checklists */}
        {checkTab === "mine" && (
          <div className="mt-6 space-y-4">
            {completions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-vault-border bg-white/60 p-10 text-center">
                <ClipboardList className="mx-auto h-8 w-8 text-verify-ink/60" />
                <p className="mt-3 text-sm text-jade-muted">No completed checklists yet. Request one from the library, or wait for a recruiter invite.</p>
                <Button size="sm" onClick={() => setShowRequest(true)} className="mt-4 bg-verify-green text-vault-dark hover:bg-verify-green/90"><Plus className="mr-1 h-3.5 w-3.5" /> Request checklist</Button>
              </div>
            )}
            {completions.map((c) => {
              const expired = new Date(c.expiresAt) < new Date();
              const summary = summarizeAnswers(c.answers ?? []);
              const grouped = (c.answers ?? []).reduce<Record<string, SkillAnswer[]>>((acc, a) => { (acc[a.category] ??= []).push(a); return acc; }, {});
              const expanded = openReport === c.id;
              return (
                <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
                  className="rounded-2xl border border-vault-border bg-white vv-card-shadow p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-base font-semibold text-jade-ink">
                        {c.specialtyLabel} <span className="rounded bg-[#eef4f1] px-2 py-0.5 text-[11px] font-normal text-jade-muted">{c.jobTitle} · {c.profession}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-jade-muted">
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold",
                          expired ? "border-rose-300 text-rose-600" : "border-verify-green/40 text-verify-ink")}>
                          <CalendarClock className="h-3 w-3" />
                          {expired ? "Expired — retake to share again" : `Valid for ${monthsLeft(c.expiresAt)} more month(s) · until ${fmt(c.expiresAt)}`}
                        </span>
                        <span>Completed {fmt(c.completedAt)}</span>
                        <span>· {c.yearsExperience} yr experience · {c.source === "RECRUITER" ? "via recruiter request" : "self-requested"}</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <a href={`/api/checklist/pdf?completion=${c.id}`} download>
                        <Button size="sm" variant="ghost" className="border border-vault-border text-jade-muted hover:text-jade-ink"><Download className="mr-1.5 h-3.5 w-3.5" /> PDF</Button>
                      </a>
                      <Button size="sm" disabled={expired} onClick={() => setShareFor(c)} className="bg-verify-green text-vault-dark hover:bg-verify-green/90">
                        <Link2 className="mr-1.5 h-3.5 w-3.5" /> Share
                      </Button>
                    </div>
                  </div>

                  {/* summary at a glance — same language as the PDF report */}
                  <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-vault-border/60 pt-4">
                    <div className="flex items-center gap-4">
                      <AvgRing avg={summary.avg} size={68} thickness={7} />
                      <RecentDonut summary={summary} size={68} thickness={7} />
                      <div className="hidden flex-col gap-1 sm:flex">
                        {([1, 2, 3, 4] as const).map((n) => (
                          <span key={n} className="inline-flex items-center gap-1.5 text-[11px] text-jade-muted">
                            <span className="h-2 w-2 rounded-full" style={{ background: RATING_META[n].dot }} />
                            <b className="text-jade-ink">{summary.mix[n]}</b> · {RATING_META[n].short}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="min-w-[220px] flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-verify-ink/90">Category overview</p>
                      <div className="mt-2"><CategoryBars summary={summary} max={4} /></div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setOpenReport(expanded ? null : c.id)}
                      className="border border-vault-border text-jade-muted hover:text-jade-ink">
                      <ChevronDown className={cn("mr-1 h-3.5 w-3.5 transition-transform", !expanded && "-rotate-90")} />
                      {expanded ? "Hide report" : "View report"}
                    </Button>
                  </div>

                  {expanded && (
                    <div className="mt-4 space-y-5 border-t border-vault-border/60 pt-4">
                      <div className="flex flex-wrap items-center justify-around gap-5">
                        <div className="text-center">
                          <MixDonut summary={summary} size={96} />
                          <p className="mt-1.5 text-[11px] font-semibold text-jade-muted">Rating mix</p>
                        </div>
                        <div className="w-56"><RecencyStrip summary={summary} /></div>
                      </div>
                      <div className="space-y-2">
                        <RatingLegend />
                        <RecencyLegend />
                      </div>
                      {Object.entries(grouped).map(([cat, items]) => (
                        <div key={cat}>
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-verify-ink/90">{cat}</p>
                          <div className="overflow-hidden rounded-xl border border-vault-border">
                            {items.map((a, i) => <SkillReportRow key={a.skill} a={a} first={i === 0} />)}
                          </div>
                        </div>
                      ))}
                      {(c.additional ?? []).length > 0 && (
                        <div>
                          <SectionHeading className="mb-2">Additional questions</SectionHeading>
                          <AdditionalQuestionsView items={c.additional} />
                        </div>
                      )}
                      {c.attestation && <AttestationView att={c.attestation} fallbackName={acc.name} />}
                    </div>
                  )}

                  {c.shareLinks.length > 0 && (
                    <div className="mt-4 border-t border-vault-border/60 pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-jade-muted">Shared links</p>
                      <div className="mt-2 space-y-1.5">
                        {c.shareLinks.map((s) => {
                          const dead = s.revoked || (s.accessType === "ONE_TIME" && s.viewedAt) || (s.expiresAt && new Date(s.expiresAt) < new Date());
                          return (
                            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f0f6f2] px-3 py-2">
                              <p className="text-xs text-[#33565b]">
                                <span className="font-mono text-verify-ink">/?s={s.token.slice(0, 10)}…</span>
                                {s.label && <span className="ml-2 italic text-jade-muted">“{s.label}”</span>}
                              </p>
                              <p className="flex items-center gap-2 text-[11px]">
                                <span className={cn("rounded-full border px-2 py-0.5 font-semibold", dead ? "border-vault-border text-[#8aa29c] line-through" : "border-verify-green/40 text-verify-ink")}>
                                  {shareAccessLabel(s)}
                                </span>
                                {s.accessType === "ONE_TIME" ? (s.viewedAt ? "viewed" : "unopened") : s.expiresAt ? `until ${fmt(s.expiresAt)}` : ""}
                                <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?s=${s.token}`)}
                                  className="rounded p-1 text-jade-muted hover:text-jade-ink" aria-label="Copy link"><Copy className="h-3 w-3" /></button>
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Requests */}
        {checkTab === "requests" && (
          <div className="mt-6 space-y-4">
            {approvedRequests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-verify-green/30 bg-verify-green/10 p-5">
                <div>
                  <p className="text-sm font-semibold text-jade-ink">{specialtyLabel(r.specialty)} · {r.jobTitle}</p>
                  <p className="text-xs text-verify-ink">Approved — ready to complete</p>
                </div>
                <Button size="sm" onClick={() => startFill({ requestId: r.id, profession: r.profession, jobTitle: r.jobTitle, specialty: r.specialty })}
                  className="bg-verify-green text-vault-dark hover:bg-verify-green/90">Complete now</Button>
              </div>
            ))}
            {requests.map((r) => (
              <div key={r.id + r.status} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-vault-border bg-white vv-card-shadow p-5">
                <div>
                  <p className="text-sm font-semibold text-jade-ink">{specialtyLabel(r.specialty)} · {r.jobTitle} <span className="ml-1 text-xs font-normal text-jade-muted">{r.profession}</span></p>
                  <p className="mt-0.5 text-xs text-jade-muted">Requested {fmt(r.requestedAt)}{r.decidedAt ? ` · decided ${fmt(r.decidedAt)}` : ""}</p>
                </div>
                <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold",
                  r.status === "PENDING" ? "border-amber-300 text-amber-600" : r.status === "APPROVED" ? "border-verify-green/40 text-verify-ink" : "border-rose-300 text-rose-600")}>
                  {r.status === "PENDING" ? "Awaiting superadmin approval" : r.status === "APPROVED" ? "Approved" : "Declined"}
                </span>
              </div>
            ))}
            {requests.length === 0 && (
              <div className="rounded-2xl border border-dashed border-vault-border bg-white/60 p-10 text-center">
                <p className="text-sm text-jade-muted">No requests yet. Browse the library and request the checklist you need — a superadmin approves it, then it lands here.</p>
                <Button size="sm" onClick={() => setShowRequest(true)} className="mt-4 bg-verify-green text-vault-dark hover:bg-verify-green/90"><Plus className="mr-1 h-3.5 w-3.5" /> Request checklist</Button>
              </div>
            )}
          </div>
        )}

        {/* Invites */}
        {checkTab === "invites" && (
          <div className="mt-6 space-y-4">
            {openInvites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-verify-green/30 bg-verify-green/10 p-5">
                <div>
                  <p className="text-sm font-semibold text-jade-ink">
                    {i.specialty ? specialtyLabel(i.specialty) : "Specialty: your choice"} <span className="text-xs font-normal text-jade-muted">· {i.jobTitle || "job title TBD"}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-jade-muted">From {i.recruiterName}{i.facilityName ? ` · ${i.facilityName}` : ""} · {fmt(i.createdAt)}</p>
                  {i.message && <p className="mt-1 text-xs italic text-jade-muted">“{i.message}”</p>}
                </div>
                <Button size="sm" onClick={() => startFill({ inviteId: i.id, profession: i.profession || "Nursing", jobTitle: i.jobTitle || "RN", specialty: i.specialty, recruiterName: i.recruiterName, facilityName: i.facilityName, message: i.message })}
                  className="bg-verify-green text-vault-dark hover:bg-verify-green/90">Complete now</Button>
              </div>
            ))}
            {invites.filter((i) => i.status === "COMPLETED").map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-vault-border bg-white vv-card-shadow p-5 opacity-80">
                <div>
                  <p className="text-sm font-semibold text-jade-ink">{i.specialtyLabel || i.specialty.replace(/_/g, " ")}</p>
                  <p className="mt-0.5 text-xs text-jade-muted">For {i.recruiterName} · completed {i.completedAt ? fmt(i.completedAt) : ""}</p>
                </div>
                <span className="flex items-center gap-1 rounded-full border border-verify-green/40 px-3 py-1 text-xs font-semibold text-verify-ink"><Check className="h-3 w-3" /> Done</span>
              </div>
            ))}
            {invites.length === 0 && (
              <div className="rounded-2xl border border-dashed border-vault-border bg-white/60 p-10 text-center">
                <Inbox className="mx-auto h-8 w-8 text-verify-ink/60" />
                <p className="mt-3 text-sm text-jade-muted">No recruiter invites yet. When a recruiter sends you a checklist request, it shows up here.</p>
              </div>
            )}
          </div>
        )}
          </>
        )}

      {/* Request-new panel */}
      <AnimatePresence>
        {showRequest && (
          <RequestPanel sets={sets} onClose={() => setShowRequest(false)} onRequested={async () => { setShowRequest(false); setSection("checklists"); setCheckTab("requests"); await loadMe(); }} />
        )}
      </AnimatePresence>

      {/* Share dialog */}
      <AnimatePresence>
        {shareFor && <ShareDialog completion={shareFor} onClose={() => setShareFor(null)} onCreated={loadMe} />}
      </AnimatePresence>
    </PortalShell>
  );
}

// ── Catalog picker (candidate requests a checklist → superadmin approves) ──
function RequestPanel({ sets, onClose, onRequested }: { sets: CatalogSet[]; onClose: () => void; onRequested: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = async (s: CatalogSet) => {
    setBusyId(s.key);
    setError(null);
    try {
      const res = await fetch("/api/checklist/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profession: s.profession, jobTitle: s.jobTitle, specialty: s.specialty }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? "Request failed");
      onRequested();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally { setBusyId(null); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b2b30]/45 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <motion.div initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl border border-vault-border bg-white vv-card-shadow p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-jade-ink"><Plus className="h-4 w-4 text-verify-ink" /> Request a checklist</h3>
            <p className="mt-1 text-xs text-jade-muted">Pick from the library. A superadmin approves your request, then you complete it once — it stays valid for a year.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-jade-muted hover:bg-jade-ink/5 hover:text-jade-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 space-y-2">
          {sets.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3 rounded-xl border border-vault-border bg-[#f2f7f4] p-4">
              <div>
                <p className="text-sm font-semibold text-jade-ink">{s.label} <span className="text-xs font-normal text-jade-muted">· {s.jobTitle} · {s.profession}</span></p>
                <p className="mt-0.5 text-xs text-jade-muted">{s.skills.length} skill(s) · {new Set(s.skills.map((k) => k.category)).size} categor{s.skills.length === 1 ? "y" : "ies"}</p>
              </div>
              <Button size="sm" disabled={busyId === s.key} onClick={() => request(s)} className="bg-verify-green text-vault-dark hover:bg-verify-green/90">
                {busyId === s.key ? <span className="mr-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" /> : <><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Request</>}
              </Button>
            </div>
          ))}
          {sets.length === 0 && <p className="py-6 text-center text-sm text-jade-muted">The library is empty — a superadmin needs to publish checklists first.</p>}
        </div>
        {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}
      </motion.div>
    </motion.div>
  );
}
